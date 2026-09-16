// POST /api/bridge/checkout
//
// RECEPTOR generates a payment link.
// Flow:
//   1. Receptor provides name, email, country, bank account details, amount
//   2. Server creates/finds customer in Bridge (KYC)
//   3. If KYC incomplete → return KYC link (202). Receptor must complete, then call again.
//   4. Server creates a liquidation address (where USDC will flow into their bank)
//   5. Server encrypts metadata into a token
//   6. Returns shareable link: ${APP_URL}/pagar?t={token}&type=p2p
//
// The link has NO expiry — amount is always recalculated live when sender opens it.

import { NextRequest, NextResponse }       from "next/server";
import { getOrCreateCustomer, getCustomer, createKycLink, getKycLink, patchCustomerAddress, ensureEndorsements, simulateKycApproval, getTosAcceptanceLink, appendRedirectUri, RAIL_ENDORSEMENT } from "@/providers/bridge/customers";
import { createLiquidationAddress, ensureExternalAccount, NATIVE_RAILS } from "@/providers/bridge/liquidation";
import type { CreateLiquidationParams } from "@/providers/bridge/liquidation";
import { encryptPayload }                  from "@/lib/accountcrypto";
import { getTargetCurrency }               from "@/lib/routing";

export const runtime = "edge";

interface CheckoutBody {
  nombre:           string;
  email:            string;
  country:          string;
  receive_method:   "bank";
  clabe?:           string;
  iban?:            string;
  bic?:             string;  // SEPA BIC/SWIFT code
  pix_key?:         string;
  routing_number?:  string;
  account_number?:  string;
  sort_code?:       string;
  bank_name?:        string;  // ACH: bank name if Bridge can't resolve from routing number
  bank_code?:        string;  // Colombia Bre-B
  document_number?:  string;  // Brazil: CPF (11 digits) or CNPJ (14 digits) for PIX
  amount_target:     number;
  recipient_phone?:  string;
  existing_customer_id?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: CheckoutBody;
  try { body = await req.json() as CheckoutBody; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const {
    nombre, email, country, receive_method,
    clabe, iban, bic, pix_key, routing_number, account_number,
    sort_code, bank_name, bank_code, document_number,
    amount_target, recipient_phone, existing_customer_id,
  } = body;
  const from_tos = !!(body as unknown as { from_tos?: boolean }).from_tos;

  if (!nombre || !email || !country || !receive_method || !amount_target) {
    return NextResponse.json(
      { error: "nombre, email, country, receive_method, and amount_target are required" },
      { status: 400 },
    );
  }
  // Minimum $20 USD equivalent — table updated quarterly, conservative (slightly above mid-market)
  const MIN_LOCAL: Record<string, number> = {
    USD: 20, MXN: 380, BRL: 110, EUR: 19, GBP: 16,
    COP: 85_000, ARS: 20_000, CLP: 19_000, PEN: 75,
  };
  const targetCurrency = getTargetCurrency(country.toUpperCase());
  const minLocal = MIN_LOCAL[targetCurrency] ?? 20;
  if (amount_target < minLocal) {
    return NextResponse.json(
      { error: `El monto mínimo de envío es el equivalente a $20 USD (mín. ${minLocal} ${targetCurrency}).` },
      { status: 400 },
    );
  }
  if (!NATIVE_RAILS[country.toUpperCase()]) {
    return NextResponse.json(
      { error: `País no soportado por Bridge en este momento. Países disponibles: MX, US, BR, CO, GB y zona SEPA.` },
      { status: 400 },
    );
  }

  const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.solutions";
  const country_upper = country.toUpperCase();

  try {
    // ISO alpha-2 → alpha-3 for Bridge customer address defaults
    const ISO3: Record<string, string> = {
      MX:"MEX", US:"USA", BR:"BRA", CO:"COL", GB:"GBR", CA:"CAN",
      DE:"DEU", FR:"FRA", ES:"ESP", IT:"ITA", NL:"NLD", PT:"PRT",
      BE:"BEL", AT:"AUT", IE:"IRL", FI:"FIN", GR:"GRC", SE:"SWE",
      DK:"DNK", NO:"NOR", PL:"POL", CZ:"CZE", HU:"HUN", RO:"ROU",
    };
    const country_iso3 = ISO3[country_upper] ?? "USA";

    // Calculate endorsements — always include base + sepa minimum.
    // Request all rail endorsements at once — user does KYC one time for all countries.
    // sepa also activates payout_fiat (required even for non-SEPA rails like ACH/SPEI).
    const endorsements = ["base", "sepa", "spei", "pix", "faster_payments", "cop"];

    // 1. Get or create Bridge customer (KYC).
    //    On retry, use existing_customer_id to bypass Bridge list-endpoint eventual consistency.
    let customer: Awaited<ReturnType<typeof getOrCreateCustomer>>["customer"];
    let needsKyc: boolean;
    let isNew: boolean;
    let depositsRestricted: boolean | undefined;
    let accountBlocked: boolean | undefined;
    if (existing_customer_id) {
      try {
        const c  = await getCustomer(existing_customer_id);
        const c2 = c as unknown as Record<string, unknown>;
        const isOk = (s?: unknown) => s === "active" || s === "approved" || s === "granted" || s === "deposits_restricted";
        const kycApproved = isOk(c.status) || isOk(c2.kyc_status);
        customer           = c;
        needsKyc           = !kycApproved;
        isNew              = false;
        depositsRestricted = c.status === "deposits_restricted";
        accountBlocked     = c.status === "paused" || c.status === "offboarded";
      } catch {
        // Fallback: ID lookup failed — use email lookup
        const result = await getOrCreateCustomer({
          type:         "individual",
          email:        email.toLowerCase(),
          first_name:   nombre.split(" ")[0],
          last_name:    nombre.split(" ").slice(1).join(" ") || "-",
          country:      country_iso3,
          endorsements,
        });
        customer           = result.customer;
        needsKyc           = result.needsKyc;
        isNew              = false;
        depositsRestricted = result.depositsRestricted;
        accountBlocked     = result.accountBlocked;
      }
    } else {
      const result = await getOrCreateCustomer({
        type:         "individual",
        email:        email.toLowerCase(),
        first_name:   nombre.split(" ")[0],
        last_name:    nombre.split(" ").slice(1).join(" ") || "-",
        country:      country_iso3,
        endorsements,
      });
      customer           = result.customer;
      needsKyc           = result.needsKyc;
      isNew              = result.isNew;
      depositsRestricted = result.depositsRestricted;
      accountBlocked     = result.accountBlocked;
    }

    // deposits_restricted: Bridge has blocked inbound deposits for this customer (RFI pending).
    // The recipient cannot receive new payments until Bridge resolves the restriction.
    if (depositsRestricted) {
      return NextResponse.json({
        error: "Tu cuenta en Bridge tiene restricciones de depósito temporales. Contacta a Bridge para resolver el RFI pendiente.",
        bridge_type: "deposits_restricted",
        customer_id: customer.id,
      }, { status: 422 });
    }

    // offboarded/paused: account is fully blocked — cannot receive payments or do KYC.
    if (accountBlocked) {
      return NextResponse.json({
        error: "Esta cuenta Bridge está desactivada (offboarded o pausada). Contacta a soporte o usa otro email para continuar.",
        bridge_type: "account_blocked",
        customer_id: customer.id,
      }, { status: 422 });
    }

    const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");


    // Always update customer — sets residential_address (required by Bridge for liquidation).
    // In sandbox: ALSO sets compliance fields (account_purpose, source_of_funds, place_of_birth, etc.)
    // so that base+sepa+spei+pix+fps+cop endorsements reach "pending" state.
    // Applies to both NEW and EXISTING customers — idempotent, safe to call repeatedly.
    try { await patchCustomerAddress(customer.id, country_upper, true); } catch { /* best-effort */ }

    // Build liquidation params early — needed to create external account BEFORE simulate_kyc_approval.
    // Some rails (SPEI, PIX, FPS, COP) require account_processing which is only satisfied
    // once the customer has a registered external account. SEPA does NOT require this.
    const liqParams: CreateLiquidationParams = {
      customerId:    customer.id,
      country:       country_upper,
      receiveMethod: receive_method,
      ownerName:     nombre,
      ownerType:     "individual",
      clabe, iban, bic, pixKey: pix_key,
      routingNumber: routing_number, accountNumber: account_number,
      bankName: bank_name, sortCode: sort_code, bankCode: bank_code,
      documentNumber: document_number,
    };

    // Sandbox endorsement flow:
    // 1. Create KYC link with endorsements array — puts endorsements in "pending" state.
    //    One KYC link per email max — duplicate_record just means it's already pending.
    // 2. simulate_kyc_approval approves all pending endorsements.
    if (isSandbox) {
      try { await ensureEndorsements(customer.id, endorsements); } catch { /* ignore */ }
      try {
        await createKycLink({
          full_name:    nombre,
          email:        email.toLowerCase(),
          type:         "individual",
          endorsements,
        });
      } catch { /* duplicate_record = already pending, fine */ }
      try {
        await simulateKycApproval(customer.id);
      } catch (simErr) {
        console.warn(`[bridge/checkout] simulateKycApproval failed (may already be approved): ${(simErr as Error).message}`);
      }

      // 1000ms pause — gives Bridge time to register endorsements before createLiquidationAddress
      await new Promise(r => setTimeout(r, 1000));

      try {
        const verified = await getCustomer(customer.id);
        console.log(`[bridge/checkout] sandbox after simulate: id=${customer.id} status=${verified.status} kyc_status=${verified.kyc_status}`);
      } catch { /* best-effort */ }
    }

    // ToS gate — check has_accepted_terms_of_service from Bridge customer record.
    // Bridge docs: use GET /customers/{id}/tos_acceptance_link for existing customers.
    // redirect_uri is appended as a query param on the returned URL (not in the body).
    // from_tos=true means user just accepted ToS and was redirected back — skip the gate to
    // avoid the race condition where Bridge hasn't updated has_accepted_terms_of_service yet.
    const needsTos = !isSandbox && !customer.has_accepted_terms_of_service && !from_tos;
    console.log(`[bridge/checkout] tos check: customer=${customer.id} has_accepted=${customer.has_accepted_terms_of_service} from_tos=${from_tos} needsTos=${needsTos}`);
    if (needsTos) {
      try {
        const { url: tosUrl } = await getTosAcceptanceLink({
          customer_id:  customer.id,
          redirect_uri: `${appUrl}/p2p?tos_done=1`,
        });
        console.log(`[bridge/checkout] getTosAcceptanceLink ok: url=${tosUrl}`);
        return NextResponse.json({
          needs_tos:   true,
          tos_url:     tosUrl,
          customer_id: customer.id,
          message:     "El receptor debe aceptar los Términos de Bridge antes de continuar.",
        }, { status: 202 });
      } catch (tosErr) {
        const e = tosErr as Error & { type?: string };
        console.error(`[bridge/checkout] getTosAcceptanceLink error: ${e.message}`);
        return NextResponse.json({
          error: "No se pudo generar el link de Términos de Servicio. Por favor intenta de nuevo.",
          bridge_type: "tos_error",
          customer_id: customer.id,
        }, { status: 502 });
      }
    }

    // After simulate, create the external account so payout_fiat becomes active.
    // This is required before createLiquidationAddress — Bridge blocks liq addr creation
    // when payout_fiat:pending. Uses a separate idempotency key prefix ("pre-ext-")
    // so createLiquidationAddress can still find/reuse it via duplicate_external_account.
    if (receive_method === "bank") {
      try { await ensureExternalAccount(liqParams); } catch (extErr) {
        const e2 = extErr as Error & { message?: string; type?: string };
        // "not active" here means the same endorsement issue — will be caught at createLiquidationAddress
        if (!e2.type?.includes("duplicate") && !e2.message?.toLowerCase().includes("not active")) {
          console.warn("[bridge/checkout] ensureExternalAccount:", e2.message);
        }
      }
    }

    // 2. KYC gate (production only — sandbox uses simulate_kyc_approval above)
    const skipKyc = process.env.BRIDGE_SKIP_KYC === "true";
    if (needsKyc && !skipKyc && !isSandbox) {
      const kycRedirectUri = `${appUrl}/p2p?kyc_done=1`;
      let kycUrl: string | null = null;
      try {
        const kycLink = await getKycLink(customer.id, { redirect_uri: kycRedirectUri });
        // GET /customers/{id}/kyc_link returns { "url": "..." } — no kyc_link field
        kycUrl = kycLink.url ?? (kycLink as unknown as Record<string, string>).kyc_link ?? null;
        console.log(`[bridge/checkout] getKycLink ok: url=${kycUrl}`);
      } catch (e1) {
        console.error(`[bridge/checkout] getKycLink error: ${(e1 as Error).message}`);
      }
      // POST /kyc_links is for NEW customer creation only — not for existing customers.
      // For existing customers, GET /customers/{id}/kyc_link is the only correct endpoint.
      console.log(`[bridge/checkout] KYC gate: needsKyc=${needsKyc} kycUrl=${kycUrl}`);
      if (!kycUrl) {
        return NextResponse.json({
          error: `[KYC] GET /customers/${customer.id}/kyc_link returned no URL. Bridge may still be processing the customer. Please try again.`,
          bridge_type: "kyc_url_unavailable",
          customer_id: customer.id,
        }, { status: 502 });
      }
      return NextResponse.json({
        needs_kyc:   true,
        kyc_url:     kycUrl,
        customer_id: customer.id,
        message:     "Complete KYC verification first, then generate your payment link again.",
      }, { status: 202 });
    }

    // 3. Create liquidation address (Bridge converts USDC → local fiat → bank/card)
    // External account was already created above — createLiquidationAddress reuses it via
    // duplicate_external_account handling.
    let liqAddr: Awaited<ReturnType<typeof createLiquidationAddress>>;
    try {
      liqAddr = await createLiquidationAddress(liqParams);
    } catch (liqErr) {
      // Bridge returns "not active" when the customer's rail-specific endorsement isn't approved yet.
      // Even if base KYC is done, SPEI/PIX/FPS/COP each need their own endorsement approval.
      // Redirect the customer to complete KYC for the missing endorsement.
      const e2 = liqErr as Error & { message?: string };
      const isNotActive = e2.message?.toLowerCase().includes("not active")
        || e2.message?.toLowerCase().includes("account_not_active")
        || e2.message?.toLowerCase().includes("endorsement");
      if (isNotActive && !isSandbox) {
        const kycRedirectUri2 = `${appUrl}/p2p?kyc_done=1`;
        let kycUrl: string | null = null;
        try {
          const kycLink = await getKycLink(customer.id, { redirect_uri: kycRedirectUri2 });
          kycUrl = kycLink.url ?? (kycLink as unknown as Record<string, string>).kyc_link ?? null;
        } catch (e3) {
          console.error(`[bridge/checkout] getKycLink endorsement fallback error: ${(e3 as Error).message}`);
        }
        if (!kycUrl) {
        }
          if (!kycUrl) {
            return NextResponse.json({
              error: "No se pudo generar el link de verificación adicional. Por favor intenta de nuevo.",
              bridge_type: "kyc_url_unavailable",
              customer_id: customer.id,
            }, { status: 502 });
          }
          return NextResponse.json({
          needs_kyc:   true,
          kyc_url:     kycUrl,
          customer_id: customer.id,
          message:     "Tu verificación necesita aprobación adicional para este corredor. Completa el proceso y vuelve a intentarlo.",
        }, { status: 202 });
      }
      throw liqErr;
    }

    // 4. Encrypt metadata into token
    const targetCurrency = getTargetCurrency(country_upper);
    const recipientLocale = req.cookies.get("OMNIPAY_LOCALE")?.value ?? "es";
    const meta = JSON.stringify({
      liq_addr_id:       liqAddr.id,
      liq_addr_address:  liqAddr.address,
      customer_id:       customer.id,
      nombre,
      email:             email.toLowerCase(),
      country:           country_upper,
      target_currency:   targetCurrency,
      amount_target,
      receive_method,
      recipient_phone,
      recipient_locale:  recipientLocale,
    });
    const metaToken = await encryptPayload({
      account:        meta,
      receiveMode:    "bank",
      recipientPhone: recipient_phone,
    });

    const payLink = `${appUrl}/pagar?t=${metaToken}&type=p2p`;

    return NextResponse.json({
      pay_link:        payLink,
      token:           metaToken,
      customer_id:     customer.id,
      liq_addr_id:     liqAddr.id,
      usdc_address:    liqAddr.address,
      needs_kyc:       false,
      amount_target,
      target_currency: targetCurrency,
      country:         country_upper,
      receive_method,
      share_message:   `OmniPay — Envíame dinero a través de este link: ${payLink}`,
    });
  } catch (e) {
    const err = e as Error & { type?: string; status?: number; details?: unknown };
    console.error("[bridge/checkout]", err.message, err.type, err.status, JSON.stringify(err.details));

    // Friendly message when a corridor/currency isn't enabled on the Bridge account yet
    const detailsStr = JSON.stringify(err.details ?? "");
    const msg = err.message ?? "";
    if (msg.toLowerCase().includes("not fully enabled") || detailsStr.toLowerCase().includes("not fully enabled")) {
      const currencyMatch = detailsStr.match(/\b([A-Z]{3})\b/) ?? msg.match(/\b([A-Z]{3})\b/);
      const currency = currencyMatch?.[1] ?? targetCurrency ?? "";
      return NextResponse.json({
        error: `${currency} no está habilitado aún en nuestra cuenta Bridge. Por el momento puedes recibir en USD, EUR, MXN o GBP. Estamos activando más monedas — contáctanos si necesitas ${currency} urgente.`,
        currency_not_enabled: currency,
      }, { status: 422 });
    }

    console.error("[bridge/checkout] unhandled:", err.message, err.type, JSON.stringify(err.details));
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
