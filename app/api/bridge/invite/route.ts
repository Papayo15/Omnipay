// POST /api/bridge/invite
//
// Emisor inicia el flujo P2P. Este endpoint:
//   1. Verifica si el receptor ya tiene cuenta Bridge activa (por email)
//   2a. Si existe y está activo → crea liquidation address con su CLABE/IBAN y retorna wa.me link directo a /pagar
//   2b. Si no existe → genera token de invitación (72h) con todos los datos del receptor
//       y retorna wa.me link para que el emisor comparta con el receptor
//
// Zero PII: los datos del receptor viajan encriptados en el token — nunca se persisten.

import { NextRequest, NextResponse } from "next/server";
import { findCustomerByEmail, createTosLink, createKycLink, ensureEndorsements } from "@/providers/bridge/customers";
import { createLiquidationAddress, ensureExternalAccount, NATIVE_RAILS } from "@/providers/bridge/liquidation";
import type { CreateLiquidationParams } from "@/providers/bridge/liquidation";
import { encryptPayload } from "@/lib/accountcrypto";
import { getTargetCurrency } from "@/lib/routing";
import { sendEmailNotification } from "@/lib/notify";

export const runtime = "edge";

const IV_BYTES = 12;

// Invite token: receptor datos + exp — AES-256-GCM, sin base de datos
async function encryptInvite(payload: Record<string, unknown>): Promise<string> {
  const secret = process.env.LINK_SECRET;
  if (!secret) throw new Error("LINK_SECRET not set");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret + ":invite"));
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const packed = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  packed.set(iv);
  packed.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(String.fromCharCode(...packed)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

interface InviteBody {
  // Datos del receptor
  recipient_name:    string;
  recipient_email:   string;
  recipient_phone?:  string;   // WhatsApp E.164 del receptor (opcional)
  recipient_country: string;   // alpha-2
  clabe?:            string;
  iban?:             string;
  bic?:              string;
  pix_key?:          string;
  routing_number?:   string;
  account_number?:   string;
  sort_code?:        string;
  bank_code?:        string;
  document_number?:  string;
  // Datos del emisor (para el link de retorno)
  sender_name:       string;
  sender_email:      string;
  // Monto que el receptor quiere recibir
  amount_target:     number;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: InviteBody;
  try { body = await req.json() as InviteBody; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const {
    recipient_name, recipient_email, recipient_phone, recipient_country,
    clabe, iban, bic, pix_key, routing_number, account_number,
    sort_code, bank_code, document_number,
    sender_name, sender_email, amount_target,
  } = body;
  const sender_currency = ((body as unknown as Record<string, unknown>).sender_currency as string | undefined) ?? "usd";

  if (!recipient_name || !recipient_email || !recipient_country || !amount_target) {
    return NextResponse.json(
      { error: "recipient_name, recipient_email, recipient_country, amount_target son requeridos" },
      { status: 400 },
    );
  }

  if (!NATIVE_RAILS[recipient_country.toUpperCase()]) {
    return NextResponse.json(
      { error: "País no soportado. Disponibles: MX, US, BR, CO, GB y zona SEPA." },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.solutions";
  const country = recipient_country.toUpperCase();
  const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");

  // 1. ¿El receptor ya tiene cuenta Bridge activa?
  const existing = await findCustomerByEmail(recipient_email.toLowerCase());
  const isActive = existing &&
    (existing.status === "active" || existing.kyc_status === "approved");

  if (isActive && existing) {
    // 2a. Receptor activo — crear liq address y retornar link de pago directo
    const ISO3: Record<string, string> = {
      MX:"MEX", US:"USA", BR:"BRA", CO:"COL", GB:"GBR", CA:"CAN",
      DE:"DEU", FR:"FRA", ES:"ESP", IT:"ITA", NL:"NLD", PT:"PRT",
    };

    const RAIL_ENDORSEMENT: Record<string, string> = {
      MX:"spei", US:"ach", BR:"pix", CO:"cop", GB:"faster_payments",
      DE:"sepa",FR:"sepa",ES:"sepa",IT:"sepa",NL:"sepa",PT:"sepa",
    };
    const allEndorsements = ["base","sepa","spei","pix","faster_payments","cop"];
    const railEnd = RAIL_ENDORSEMENT[country];
    const recipientEndorsements = railEnd
      ? ["base", railEnd, ...allEndorsements]
      : allEndorsements;

    // Ensure rail endorsement before liq address — Bridge requires it first
    try { await ensureEndorsements(existing.id, recipientEndorsements); } catch { /* best-effort */ }

    const liqParams: CreateLiquidationParams = {
      customerId:    existing.id,
      country,
      receiveMethod: "bank",
      ownerName:     recipient_name,
      ownerType:     "individual",
      clabe, iban, bic, pixKey: pix_key,
      routingNumber: routing_number, accountNumber: account_number,
      bankName: undefined, sortCode: sort_code, bankCode: bank_code,
      documentNumber: document_number,
    };

    try {
      await ensureExternalAccount(liqParams);
    } catch { /* best-effort */ }

    try {
      const liqAddr = await createLiquidationAddress(liqParams);
      const targetCurrency = getTargetCurrency(country);
      const meta = JSON.stringify({
        liq_addr_id:      liqAddr.id,
        liq_addr_address: liqAddr.address,
        customer_id:      existing.id,
        nombre:           recipient_name,
        email:            recipient_email.toLowerCase(),
        country,
        target_currency:  targetCurrency,
        amount_target,
        receive_method:   "bank",
      });
      const token = await encryptPayload({
        account:        meta,
        receiveMode:    "bank",
        recipientPhone: recipient_phone,
        senderEmail:    sender_email,
      });
      const payLink = `${appUrl}/pagar?t=${token}&type=p2p`;
      const waText = encodeURIComponent(
        `Hola ${recipient_name}, ${sender_name} quiere enviarte dinero. ` +
        `Tu identidad ya está verificada. Comparte este link con ${sender_name} para que complete el envío: ${payLink}`
      );
      // Normalize MX legacy format: 5219XXXXXXXXXX → 529XXXXXXXXXX (Mexico dropped the "1" in Oct 2020)
      let waLinkReady: string | null = null;
      if (recipient_phone) {
        let waPhone = recipient_phone.replace(/\D/g, "");
        if (/^521\d{10}$/.test(waPhone)) waPhone = "52" + waPhone.slice(3);
        waLinkReady = `https://wa.me/${waPhone}?text=${waText}`;
      }

      // Generate invite token so /enviar can poll invite/status to build the sender VA.
      // Embed the already-created liq addr so invite/status skips re-creation (avoids Bridge
      // duplicate validation error and cuts latency by 2-3 API calls).
      const exp = Date.now() + 72 * 60 * 60 * 1000;
      const invitePayload: Record<string, unknown> = {
        exp,
        recipient_name, recipient_email: recipient_email.toLowerCase(),
        recipient_country: country,
        recipient_id:  existing.id,
        liq_addr_id:   liqAddr.id,
        liq_addr_address: liqAddr.address,
        sender_name, sender_email: sender_email.toLowerCase(),
        sender_currency,
        amount_target,
        clabe, iban, bic, pix_key,
        routing_number, account_number, sort_code, bank_code, document_number,
      };
      const inviteToken = await encryptInvite(invitePayload);
      const inviteUrl   = `${appUrl}/recibir?i=${inviteToken}`;

      return NextResponse.json({
        status:       "ready",
        pay_link:     payLink,
        invite_url:   inviteUrl,
        wa_link:      waLinkReady,
        customer_id:  existing.id,
        liq_addr_id:  liqAddr.id,
      });
    } catch (e) {
      const err = e as Error & { message?: string };
      // Si liq address falla por endorsement → tratar como needs_kyc
      const needsKyc = err.message?.toLowerCase().includes("not active")
        || err.message?.toLowerCase().includes("endorsement");
      if (!needsKyc) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    }
  }

  // 2b. Receptor no existe o necesita KYC — generar token de invitación (72h)
  const exp = Date.now() + 72 * 60 * 60 * 1000; // 72 horas
  const invitePayload = {
    exp,
    recipient_name,
    recipient_email: recipient_email.toLowerCase(),
    recipient_phone,
    recipient_country: country,
    clabe, iban, bic, pix_key, routing_number, account_number,
    sort_code, bank_code, document_number,
    sender_name,
    sender_email:    sender_email.toLowerCase(),
    sender_currency: sender_currency.toLowerCase(),
    amount_target,
  };

  const inviteToken = await encryptInvite(invitePayload);
  const recibir = `${appUrl}/recibir?i=${inviteToken}`;

  // ToS link para producción (nuevo cliente)
  let tosUrl: string | null = null;
  if (!isSandbox) {
    try {
      const tos = await createTosLink({
        full_name:    recipient_name,
        email:        recipient_email.toLowerCase(),
        type:         "individual",
        redirect_uri: recibir,
      });
      tosUrl = tos.url;
    } catch { /* best-effort */ }
  }

  // KYC link (receptor hará KYC en /recibir, pero generamos URL de Bridge por si acaso)
  let kycUrl: string | null = null;
  if (!isSandbox) {
    try {
      const kycLink = await createKycLink({
        full_name:    recipient_name,
        email:        recipient_email.toLowerCase(),
        type:         "individual",
        endorsements: ["base", "sepa", "spei", "pix", "faster_payments", "cop"],
        redirect_uri: recibir,
      });
      kycUrl = kycLink.url ?? kycLink.kyc_link ?? null;
    } catch { /* duplicate = ya existe, ok */ }
  }

  const waText = encodeURIComponent(
    `Hola ${recipient_name} 👋, ${sender_name} quiere enviarte dinero. ` +
    `Solo necesitas verificar tu identidad una vez (2 min). ` +
    `Entra aquí: ${tosUrl ?? kycUrl ?? recibir}`
  );
  // Normalize MX legacy format: 5219XXXXXXXXXX → 529XXXXXXXXXX (Mexico dropped the "1" in Oct 2020)
  let waLink: string | null = null;
  if (recipient_phone) {
    let waPhone = recipient_phone.replace(/\D/g, "");
    if (/^521\d{10}$/.test(waPhone)) waPhone = "52" + waPhone.slice(3);
    waLink = `https://wa.me/${waPhone}?text=${waText}`;
  }

  // Send verification link email to recipient — fire-and-forget, never blocks response
  const verifyLink = tosUrl ?? kycUrl ?? recibir;
  const emailSubject = `${sender_name} quiere enviarte dinero — verifica tu identidad`;
  const emailHtml = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:32px;border-radius:16px">
      <p style="font-size:22px;font-weight:700;color:#fff;margin:0 0 8px">Hola ${recipient_name} 👋</p>
      <p style="font-size:15px;color:#94a3b8;margin:0 0 24px">
        <strong style="color:#e2e8f0">${sender_name}</strong> quiere enviarte dinero a través de OmniPay.
        Solo necesitas verificar tu identidad <strong style="color:#fff">una sola vez</strong> — tarda aproximadamente 2 minutos.
      </p>
      <a href="${verifyLink}" style="display:block;background:#10b981;color:#fff;text-align:center;padding:16px 24px;border-radius:12px;font-weight:700;font-size:16px;text-decoration:none;margin-bottom:24px">
        Verificar mi identidad →
      </a>
      <p style="font-size:12px;color:#475569;margin:0">
        OmniPay no almacena tus datos bancarios ni documentos de identidad.<br>
        La verificación es procesada por Bridge Building Inc., registrado ante FinCEN.<br>
        Si no esperabas este mensaje, puedes ignorarlo.
      </p>
    </div>
  `;
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  sendEmailNotification(recipient_email.toLowerCase(), emailSubject, emailHtml);

  return NextResponse.json({
    status:       "invite_sent",
    invite_url:   recibir,
    tos_url:      tosUrl,
    kyc_url:      kycUrl,
    wa_link:      waLink,
    expires_at:   new Date(exp).toISOString(),
  });
}
