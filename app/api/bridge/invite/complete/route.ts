// POST /api/bridge/invite/complete
//
// Llamado por /recibir cuando el receptor completa KYC.
// Descifra el invite token, crea el liq address y retorna el link de pago para el emisor.
// Zero PII: los datos bancarios nunca salen del server.

import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateCustomer, getCustomer, createKycLink,
  patchCustomerAddress, ensureEndorsements, simulateKycApproval,
} from "@/providers/bridge/customers";
import { createLiquidationAddress, ensureExternalAccount, NATIVE_RAILS } from "@/providers/bridge/liquidation";
import type { CreateLiquidationParams } from "@/providers/bridge/liquidation";
import { encryptPayload } from "@/lib/accountcrypto";
import { getTargetCurrency } from "@/lib/routing";

export const runtime = "edge";

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
  const ciphertext = packed.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: { token?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { token } = body;
  if (!token) return NextResponse.json({ error: "token requerido" }, { status: 400 });

  let p: Record<string, unknown>;
  try { p = await decryptInvite(token); }
  catch { return NextResponse.json({ error: "Token inválido o alterado" }, { status: 400 }); }

  if (Date.now() > (p.exp as number)) {
    return NextResponse.json({ error: "El invite ha expirado" }, { status: 410 });
  }

  const nombre          = p.recipient_name    as string;
  const email           = (p.recipient_email  as string).toLowerCase();
  const recipient_phone = p.recipient_phone   as string;
  const country         = (p.recipient_country as string).toUpperCase();
  const sender_name     = p.sender_name       as string;
  const sender_email    = (p.sender_email     as string).toLowerCase();
  const amount_target   = p.amount_target     as number;

  const clabe          = p.clabe          as string | undefined;
  const iban           = p.iban           as string | undefined;
  const bic            = p.bic            as string | undefined;
  const pix_key        = p.pix_key        as string | undefined;
  const routing_number = p.routing_number as string | undefined;
  const account_number = p.account_number as string | undefined;
  const sort_code      = p.sort_code      as string | undefined;
  const bank_code      = p.bank_code      as string | undefined;
  const document_number = p.document_number as string | undefined;

  if (!NATIVE_RAILS[country]) {
    return NextResponse.json({ error: "País no soportado" }, { status: 400 });
  }

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.solutions";
  const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");

  const ISO3: Record<string, string> = {
    MX:"MEX", US:"USA", BR:"BRA", CO:"COL", GB:"GBR", CA:"CAN",
    DE:"DEU", FR:"FRA", ES:"ESP", IT:"ITA", NL:"NLD", PT:"PRT",
    BE:"BEL", AT:"AUT", IE:"IRL", FI:"FIN", GR:"GRC", SE:"SWE",
    DK:"DNK", NO:"NOR", PL:"POL", CZ:"CZE", HU:"HUN", RO:"ROU",
  };

  const endorsements = ["base", "sepa", "spei", "pix", "faster_payments", "cop"];

  try {
    // 1. Customer
    const { customer } = await getOrCreateCustomer({
      type:       "individual",
      email,
      first_name: nombre.split(" ")[0],
      last_name:  nombre.split(" ").slice(1).join(" ") || "-",
      country:    ISO3[country] ?? "USA",
      endorsements,
    });

    try { await patchCustomerAddress(customer.id, country, true); } catch { /* best-effort */ }

    const liqParams: CreateLiquidationParams = {
      customerId: customer.id, country, receiveMethod: "bank",
      ownerName: nombre, ownerType: "individual",
      clabe, iban, bic, pixKey: pix_key,
      routingNumber: routing_number, accountNumber: account_number,
      sortCode: sort_code, bankCode: bank_code, documentNumber: document_number,
    };

    // 2. Sandbox: simulate KYC
    if (isSandbox) {
      try { await ensureEndorsements(customer.id, endorsements); } catch { /* ignore */ }
      try {
        await createKycLink({ full_name: nombre, email, type: "individual", endorsements });
      } catch { /* duplicate = ok */ }
      try { await simulateKycApproval(customer.id); } catch { /* already approved = ok */ }
      await new Promise(r => setTimeout(r, 1000));
      try {
        const v = await getCustomer(customer.id);
        console.log(`[invite/complete] sandbox: id=${customer.id} status=${v.status} kyc=${v.kyc_status}`);
      } catch { /* best-effort */ }
    }

    // 3. External account + Liq Address
    try { await ensureExternalAccount(liqParams); } catch { /* best-effort */ }
    const liqAddr = await createLiquidationAddress(liqParams);

    // 4. Pay link
    const targetCurrency = getTargetCurrency(country);
    const meta = JSON.stringify({
      liq_addr_id:      liqAddr.id,
      liq_addr_address: liqAddr.address,
      customer_id:      customer.id,
      nombre, email, country, target_currency: targetCurrency,
      amount_target, receive_method: "bank",
      recipient_phone, sender_name, sender_email,
    });
    const metaToken = await encryptPayload({
      account: meta, receiveMode: "bank",
      recipientPhone: recipient_phone,
      senderEmail: sender_email,
    });

    const payLink = `${appUrl}/pagar?t=${metaToken}&type=p2p`;

    // WhatsApp al emisor
    const waText = encodeURIComponent(
      `Hola ${sender_name} 👋, ${nombre} ya verificó su identidad. ` +
      `Haz clic aquí para completar el envío de ${amount_target.toLocaleString()} ${targetCurrency}: ${payLink}`
    );
    const waLink = `https://wa.me/?text=${waText}`;

    return NextResponse.json({
      pay_link:        payLink,
      wa_link:         waLink,
      target_currency: targetCurrency,
      amount_target,
      sender_name,
      sender_email,
      recipient_name:  nombre,
    });
  } catch (e) {
    const err = e as Error & { type?: string; status?: number };
    console.error("[invite/complete]", err.message, err.type);
    return NextResponse.json({ error: err.message ?? "Error interno" }, { status: err.status ?? 500 });
  }
}
