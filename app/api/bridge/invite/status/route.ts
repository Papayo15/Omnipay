// GET /api/bridge/invite/status?i=INVITE_TOKEN
//
// Llamado por /enviar (polling) para saber si el receptor completó KYC.
// Cuando el receptor está activo: crea liq address + VA del emisor → retorna instrucciones.
// Idempotente: Bridge maneja duplicados en liq address y VA.

import { NextRequest, NextResponse } from "next/server";
import {
  findCustomerByEmail, getOrCreateCustomer, getCustomer,
  createKycLink, patchCustomerAddress, ensureEndorsements, simulateKycApproval,
  getKycUrlFromCustomer,
} from "@/providers/bridge/customers";
import { createLiquidationAddress, ensureExternalAccount, NATIVE_RAILS } from "@/providers/bridge/liquidation";
import type { CreateLiquidationParams } from "@/providers/bridge/liquidation";
import { createVirtualAccount } from "@/providers/bridge/virtual-accounts";
import { encryptPayload } from "@/lib/accountcrypto";
import { getTargetCurrency } from "@/lib/routing";
import { createOrder } from "@/lib/order-state";

export const runtime = "nodejs"; // needs crypto.subtle + setTimeout

const IV_BYTES = 12;

async function decryptInvite(token: string): Promise<Record<string, unknown>> {
  const secret = process.env.LINK_SECRET;
  if (!secret) throw new Error("LINK_SECRET not set");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret + ":invite"));
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
  const b = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - b.length % 4);
  const packed = Uint8Array.from(atob(b + pad), c => c.charCodeAt(0));
  const iv = packed.slice(0, IV_BYTES);
  const cipher = packed.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
}

export async function GET(req: NextRequest): Promise<Response> {
  const token = new URL(req.url).searchParams.get("i");
  if (!token) return NextResponse.json({ ready: false, reason: "no_token" });

  let p: Record<string, unknown>;
  try { p = await decryptInvite(token); }
  catch { return NextResponse.json({ ready: false, reason: "invalid_token" }); }

  if (Date.now() > (p.exp as number)) {
    return NextResponse.json({ ready: false, reason: "expired" });
  }

  const recipientEmail = (p.recipient_email as string).toLowerCase();
  const recipientName  = p.recipient_name  as string;
  const senderName     = p.sender_name     as string;
  const senderEmail    = (p.sender_email   as string).toLowerCase();
  const country        = (p.recipient_country as string).toUpperCase();
  const amountTarget   = p.amount_target   as number;
  const recipientPhone = p.recipient_phone as string;

  const senderCurrency = (((p.sender_currency as string | undefined) ?? "usd").toLowerCase()) as "usd" | "eur" | "gbp" | "mxn" | "brl" | "cop";
  const clabe          = p.clabe          as string | undefined;
  const iban           = p.iban           as string | undefined;
  const bic            = p.bic            as string | undefined;
  const pix_key        = p.pix_key        as string | undefined;
  const routing_number = p.routing_number as string | undefined;
  const account_number = p.account_number as string | undefined;
  const sort_code      = p.sort_code      as string | undefined;
  const bank_code      = p.bank_code      as string | undefined;
  const document_number = p.document_number as string | undefined;

  // 1. Check recipient KYC status
  const recipient = await findCustomerByEmail(recipientEmail).catch(() => null);
  const recipientActive = recipient && (recipient.status === "active" || recipient.kyc_status === "approved");

  if (!recipientActive) {
    return NextResponse.json({ ready: false, reason: "recipient_pending" });
  }

  if (!NATIVE_RAILS[country]) {
    return NextResponse.json({ ready: false, reason: "country_not_supported" });
  }

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.solutions";
  const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");

  const ISO3: Record<string, string> = {
    MX:"MEX",US:"USA",BR:"BRA",CO:"COL",GB:"GBR",CA:"CAN",
    DE:"DEU",FR:"FRA",ES:"ESP",IT:"ITA",NL:"NLD",PT:"PRT",
    BE:"BEL",AT:"AUT",IE:"IRL",FI:"FIN",GR:"GRC",SE:"SWE",
    DK:"DNK",NO:"NOR",PL:"POL",CZ:"CZE",HU:"HUN",RO:"ROU",
  };

  const endorsements = ["base","sepa","spei","pix","faster_payments","cop"];

  // Rail endorsement required per country
  const RAIL_ENDORSEMENT: Record<string, string> = {
    MX:"spei", US:"ach", BR:"pix", CO:"cop", GB:"faster_payments",
    DE:"sepa",FR:"sepa",ES:"sepa",IT:"sepa",NL:"sepa",PT:"sepa",
    BE:"sepa",AT:"sepa",IE:"sepa",FI:"sepa",GR:"sepa",SE:"sepa",
    DK:"sepa",NO:"sepa",PL:"sepa",CZ:"sepa",HU:"sepa",RO:"sepa",
  };

  const isEndorsementErr = (e: unknown) =>
    (e as Error)?.message?.toLowerCase().includes("endorsement");

  try {
    // 2. Ensure recipient has the required endorsement for the target rail, then create liq address
    const railEndorsement = RAIL_ENDORSEMENT[country];
    const recipientEndorsements = railEndorsement
      ? ["base", railEndorsement, ...endorsements]
      : endorsements;
    try { await ensureEndorsements(recipient.id, recipientEndorsements); } catch { /* best-effort */ }

    const liqParams: CreateLiquidationParams = {
      customerId: recipient.id, country, receiveMethod: "bank",
      ownerName: recipientName, ownerType: "individual",
      clabe, iban, bic, pixKey: pix_key,
      routingNumber: routing_number, accountNumber: account_number,
      sortCode: sort_code, bankCode: bank_code, documentNumber: document_number,
    };
    try { await ensureExternalAccount(liqParams); } catch { /* best-effort */ }

    let liqAddr;
    try {
      liqAddr = await createLiquidationAddress(liqParams);
    } catch (e1) {
      if (!isEndorsementErr(e1)) throw e1;
      // Endorsement not yet propagated — wait 2s and retry once
      await new Promise(r => setTimeout(r, 2000));
      try { await ensureEndorsements(recipient.id, recipientEndorsements); } catch { /* ignore */ }
      liqAddr = await createLiquidationAddress(liqParams);
    }

    // 3. Create / KYC emisor
    const { customer: senderCustomer, needsKyc: senderNeedsKyc } = await getOrCreateCustomer({
      type: "individual",
      email: senderEmail,
      first_name: senderName.split(" ")[0],
      last_name:  senderName.split(" ").slice(1).join(" ") || "-",
      country: ISO3[country] ?? "USA",
      endorsements,
    });

    try { await patchCustomerAddress(senderCustomer.id, "US", true); } catch { /* best-effort */ }

    if (isSandbox) {
      try { await ensureEndorsements(senderCustomer.id, endorsements); } catch { /* ignore */ }
      try { await createKycLink({ full_name: senderName, email: senderEmail, type: "individual", endorsements }); } catch { /* dup ok */ }
      try { await simulateKycApproval(senderCustomer.id); } catch { /* already approved ok */ }
      await new Promise(r => setTimeout(r, 1000));
    } else if (senderNeedsKyc) {
      // Production: sender needs KYC — return kyc_url so /enviar can show the link
      let kycUrl: string | null = getKycUrlFromCustomer(senderCustomer);
      if (!kycUrl) {
        try {
          const kl = await createKycLink({
            full_name: senderName, email: senderEmail, type: "individual",
            endorsements,
            redirect_uri: `${appUrl}/enviar?kyc_done=1`,
          });
          kycUrl = (kl as unknown as Record<string,string>).kyc_link ?? kl.url ?? null;
        } catch (e1) {
          const err1 = e1 as Error & { type?: string; details?: Record<string,unknown> };
          if (err1.type === "duplicate_record") {
            const ex = err1.details?.existing_kyc_link as { kyc_link?: string; url?: string } | undefined;
            kycUrl = ex?.kyc_link ?? ex?.url ?? null;
          }
        }
      }
      return NextResponse.json({ ready: false, reason: "sender_needs_kyc", kyc_url: kycUrl });
    }

    // 4. Create VA for emisor — retry once on endorsement error
    const targetCurrency = getTargetCurrency(country);
    let va;
    try {
      va = await createVirtualAccount({
        customerId:          senderCustomer.id,
        destinationAddress:  liqAddr.address,
        destinationNetwork:  "polygon",
        sourceCurrency:      senderCurrency,
        developerFeePercent: "0.5",
        reference:           liqAddr.id,
        developerReference:  `liq-${liqAddr.id}`,
      });
    } catch (e2) {
      if (!isEndorsementErr(e2)) throw e2;
      await new Promise(r => setTimeout(r, 2000));
      try { await ensureEndorsements(senderCustomer.id, endorsements); } catch { /* ignore */ }
      va = await createVirtualAccount({
        customerId:          senderCustomer.id,
        destinationAddress:  liqAddr.address,
        destinationNetwork:  "polygon",
        sourceCurrency:      senderCurrency,
        developerFeePercent: "0.5",
        reference:           liqAddr.id,
        developerReference:  `liq-${liqAddr.id}`,
      });
    }

    // 5. Create order for tracking
    const orderId = `OP-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    createOrder(orderId, {
      destinationCountry: country,
      recipientName,
      recipientAccount:   clabe ?? iban ?? account_number ?? "",
      targetCurrency,
      amount:             amountTarget,
      senderEmail,
      recipientEmail,
      transferId:         va.id,
    });

    // 6. Encrypt pay token (for sandbox advance)
    const meta = JSON.stringify({
      liq_addr_id: liqAddr.id, liq_addr_address: liqAddr.address,
      customer_id: senderCustomer.id, nombre: recipientName, email: recipientEmail,
      country, target_currency: targetCurrency, amount_target: amountTarget,
      receive_method: "bank", sender_name: senderName, sender_email: senderEmail,
    });
    const metaToken = await encryptPayload({ account: meta, receiveMode: "bank", recipientPhone, senderEmail });

    const di = va.source_deposit_instructions;
    return NextResponse.json({
      ready:    true,
      order_id: orderId,
      token:    metaToken,
      va: {
        bank_name:      di.bank_name                                        ?? null,
        beneficiary:    di.bank_beneficiary_name ?? di.account_holder_name  ?? senderName,
        routing_number: di.bank_routing_number                              ?? null,
        account_number: di.bank_account_number ?? di.account_number         ?? null,
        iban:           di.iban                                             ?? null,
        bic:            di.bic                                              ?? null,
        sort_code:      di.sort_code                                        ?? null,
        clabe:          di.clabe                                            ?? null,
        pix:            di.br_code                                          ?? null,
        currency:       di.currency ?? "USD",
        payment_rail:   di.payment_rail ?? di.payment_rails?.[0]           ?? null,
      },
      amount_target:   amountTarget,
      target_currency: targetCurrency,
      recipient_name:  recipientName,
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error("[invite/status]", err.message);
    return NextResponse.json({ ready: false, reason: "error", error: err.message }, { status: err.status ?? 500 });
  }
}
