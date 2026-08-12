// POST /api/bridge/b2b/checkout
//
// B2B via Bridge — receptor business generates a payment link.
// Identical to /api/bridge/checkout (P2P) but creates a BUSINESS customer (KYB).
// Stripe+Wise B2B (/api/remesa/request) remains untouched — this is a parallel channel.
//
// Flow:
//   1. Business recipient provides business_name, email, country, bank account, amount
//   2. Server creates/finds Bridge business customer (KYB)
//   3. KYB incomplete → return KYB link (202). Complete, then retry.
//   4. Server creates liquidation address (USDC → local bank via SPEI/ACH/SEPA/FPS/PIX)
//   5. Returns shareable payment link: ${APP_URL}/b2b-bridge?t={token}&type=b2b

import { NextRequest, NextResponse }       from "next/server";
import { getOrCreateCustomer, getCustomer, getKycUrlFromCustomer, createKycLink, patchCustomerAddress, ensureEndorsements, simulateKycApproval, createTosLink, RAIL_ENDORSEMENT, ALPHA2_TO_ALPHA3 as ISO3_FROM_ALPHA2 } from "@/providers/bridge/customers";
import { createLiquidationAddress, ensureExternalAccount, NATIVE_RAILS } from "@/providers/bridge/liquidation";
import type { CreateLiquidationParams } from "@/providers/bridge/liquidation";
import { encryptPayload }                  from "@/lib/accountcrypto";
import { getTargetCurrency }               from "@/lib/routing";

export const runtime = "edge";

interface B2BCheckoutBody {
  business_name:   string;
  email:           string;
  country:         string;
  receive_method:  "bank";
  clabe?:          string;
  iban?:           string;
  bic?:            string;
  pix_key?:        string;
  routing_number?: string;
  account_number?: string;
  sort_code?:      string;
  bank_name?:      string;
  bank_code?:      string;
  amount_target:   number;
  redirect_uri?:   string;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: B2BCheckoutBody;
  try { body = await req.json() as B2BCheckoutBody; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const {
    business_name, email, country, receive_method,
    clabe, iban, bic, pix_key, routing_number, account_number,
    sort_code, bank_name, bank_code,
    amount_target, redirect_uri,
  } = body;

  if (!business_name || !email || !country || !receive_method || !amount_target) {
    return NextResponse.json(
      { error: "business_name, email, country, receive_method, and amount_target are required" },
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
    const railForCountry = NATIVE_RAILS[country_upper]?.rail ?? "ach";
    const railEndorse    = RAIL_ENDORSEMENT[railForCountry] ?? "base";
    const endorsements   = ["base", "sepa", ...(railEndorse !== "base" && railEndorse !== "sepa" ? [railEndorse] : [])];

    // Get or create Bridge BUSINESS customer (KYB)
    // Pass country so the initial address matches the recipient's actual country
    const { customer, needsKyc: needsKyb, isNew } = await getOrCreateCustomer({
      type:          "business",
      email:         email.toLowerCase(),
      business_name,
      country:       ISO3_FROM_ALPHA2[country_upper] ?? "USA",
      endorsements,
    });

    const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");

    const liqParams: CreateLiquidationParams = {
      customerId:    customer.id,
      country:       country_upper,
      receiveMethod: receive_method,
      ownerName:     business_name,
      ownerType:     "business",
      clabe, iban, bic, pixKey: pix_key,
      routingNumber: routing_number, accountNumber: account_number,
      bankName: bank_name, sortCode: sort_code, bankCode: bank_code,
    };

    if (isSandbox) {
      try { await ensureEndorsements(customer.id, endorsements); } catch { /* best-effort */ }
      try {
        await createKycLink({ full_name: business_name, email: email.toLowerCase(), type: "business", endorsements });
      } catch { /* duplicate_record = already pending */ }
      try { await simulateKycApproval(customer.id); } catch { /* may already be approved */ }

      // Poll up to 6 s — Bridge may take a moment to mark the business customer active
      let kybActive = false;
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const verified = await getCustomer(customer.id);
          kybActive = verified.status === "active" || verified.kyb_status === "approved";
          if (kybActive) break;
          if (i === 2) {
            try { await simulateKycApproval(customer.id); } catch { /* retry */ }
          }
        } catch { break; }
      }
      if (!kybActive) {
        return NextResponse.json({
          error: "La empresa receptora no pudo activarse en Bridge sandbox.",
          bridge_type: "kyb_not_active",
        }, { status: 422 });
      }

      // Set address AFTER KYB simulation — sandbox simulate_kyc_approval may clear address fields.
      // Retry with multiple field names since Bridge business address field name varies by API version.
      try {
        await patchCustomerAddress(customer.id, country_upper, false, "business");
      } catch (addrErr) {
        console.warn("[bridge/b2b/checkout] patchCustomerAddress post-kyb:", (addrErr as Error).message);
      }
    } else {
      // Production: set address before external account creation
      try {
        await patchCustomerAddress(customer.id, country_upper, false, "business");
      } catch (addrErr) {
        console.warn("[bridge/b2b/checkout] patchCustomerAddress:", (addrErr as Error).message);
      }
    }

    // ToS gate for new business customers in production
    if (!isSandbox && isNew) {
      try {
        const tosLink = await createTosLink({ full_name: business_name, email: email.toLowerCase(), type: "business" });
        return NextResponse.json({
          needs_tos: true,
          tos_url:   tosLink.url,
          message:   "La empresa debe aceptar los Términos de Bridge antes de continuar.",
        }, { status: 202 });
      } catch { /* proceed; Bridge will surface error if truly required */ }
    }

    // KYB gate (production)
    const skipKyc = process.env.BRIDGE_SKIP_KYC === "true";
    if (needsKyb && !skipKyc && !isSandbox) {
      let kybUrl: string | null = getKycUrlFromCustomer(customer);
      if (!kybUrl) {
        try {
          const kycLink = await createKycLink({ full_name: business_name, email: email.toLowerCase(), type: "business" });
          kybUrl = (kycLink as unknown as Record<string, string>).kyc_link ?? kycLink.url ?? null;
        } catch (e1) {
          const err1 = e1 as Error & { type?: string; details?: Record<string, unknown> };
          if (err1.type === "duplicate_record") {
            const existing = err1.details?.existing_kyc_link as { kyc_link?: string; url?: string } | undefined;
            kybUrl = existing?.kyc_link ?? existing?.url ?? null;
          }
        }
      }
      if (kybUrl && redirect_uri) {
        const sep = kybUrl.includes("?") ? "&" : "?";
        kybUrl = `${kybUrl}${sep}redirect_uri=${encodeURIComponent(redirect_uri)}`;
      }
      return NextResponse.json({
        needs_kyb:   true,
        kyb_url:     kybUrl,
        customer_id: customer.id,
        message:     "Completa la verificación KYB y vuelve a generar el link.",
      }, { status: 202 });
    }

    // Create external account + liquidation address
    if (receive_method === "bank") {
      try { await ensureExternalAccount(liqParams); } catch (extErr) {
        const e2 = extErr as Error & { message?: string; type?: string };
        if (!e2.type?.includes("duplicate") && !e2.message?.toLowerCase().includes("not active")) {
          console.warn("[bridge/b2b/checkout] ensureExternalAccount:", e2.message);
        }
      }
    }

    let liqAddr: Awaited<ReturnType<typeof createLiquidationAddress>>;
    try {
      liqAddr = await createLiquidationAddress(liqParams);
    } catch (liqErr) {
      const e2 = liqErr as Error & { message?: string };
      const isNotActive = e2.message?.toLowerCase().includes("not active")
        || e2.message?.toLowerCase().includes("account_not_active");
      if (isNotActive && !isSandbox) {
        let kybUrl: string | null = getKycUrlFromCustomer(customer);
        if (!kybUrl) {
          try {
            const kycLink = await createKycLink({ full_name: business_name, email: email.toLowerCase(), type: "business", endorsements });
            kybUrl = (kycLink as unknown as Record<string, string>).kyc_link ?? kycLink.url ?? null;
          } catch { /* best-effort */ }
        }
        if (kybUrl) {
          const redirectUri = `${appUrl}/enviar-empresa-wire?kyb_done=1&step=checkout`;
          const sep = kybUrl.includes("?") ? "&" : "?";
          kybUrl = `${kybUrl}${sep}redirect_uri=${encodeURIComponent(redirectUri)}`;
        }
        return NextResponse.json({
          needs_kyb:   true,
          kyb_url:     kybUrl,
          customer_id: customer.id,
          message:     "Verificación adicional requerida para este corredor. Completa el KYB y vuelve a intentarlo.",
        }, { status: 202 });
      }
      throw liqErr;
    }

    const targetCurrency = getTargetCurrency(country_upper);
    const meta = JSON.stringify({
      liq_addr_id:      liqAddr.id,
      liq_addr_address: liqAddr.address,
      customer_id:      customer.id,
      nombre:           business_name,
      email:            email.toLowerCase(),
      country:          country_upper,
      target_currency:  targetCurrency,
      amount_target,
      receive_method,
      order_type:       "b2b-bridge",
    });
    const metaToken = await encryptPayload({ account: meta, receiveMode: "bank" });

    const payLink = `${appUrl}/b2b-bridge?t=${metaToken}&type=b2b`;

    return NextResponse.json({
      pay_link:        payLink,
      token:           metaToken,
      customer_id:     customer.id,
      liq_addr_id:     liqAddr.id,
      usdc_address:    liqAddr.address,
      needs_kyb:       false,
      amount_target,
      target_currency: targetCurrency,
      country:         country_upper,
      receive_method,
      share_message:   `OmniPay B2B — Envía el pago a través de este link: ${payLink}`,
    });
  } catch (e) {
    const err = e as Error & { type?: string; status?: number; details?: unknown };
    const detail = err.details ? JSON.stringify(err.details) : "";
    console.error("[bridge/b2b/checkout]", err.message, detail);
    // Include details in response so the UI can show the specific invalid field
    return NextResponse.json({
      error: err.message + (detail ? ` — ${detail}` : ""),
    }, { status: err.status ?? 500 });
  }
}
