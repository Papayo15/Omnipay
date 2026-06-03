"use client";

import { deflateSync, inflateSync } from "fflate";
import { encrypt, decrypt, hmacSign, hmacVerify } from "./crypto";
import type { Rail } from "@/constants/rails";
import { calcFees } from "@/constants/fees";

// LINK_SECRET se inyecta en el cliente vía NEXT_PUBLIC_APP_URL como semilla pública.
// La firma real con LINK_SECRET (server-side) se realiza en Edge Functions.
// En cliente se usa la URL como clave derivada para cifrar localmente.
const CLIENT_KEY = process.env.NEXT_PUBLIC_APP_URL ?? "omnipay-dev-secret";

// Expiración estricta de 5 minutos para todos los links de pago
const LINK_TTL_MS = 5 * 60 * 1000;

export interface PaymentPayload {
  v: 1;
  ts: number;    // timestamp creación (unix ms)
  ex: number;    // expiración: ts + 5 min
  a: number;     // amount (en moneda destino)
  c: string;     // currency code (moneda destino)
  m: "A" | "B"; // mode
  f: number;     // fee amount
  n: number;     // net to receiver
  r: Rail;       // rail
  t: string;     // compact bank token del receptor
  nb: string;    // nombre banco receptor
  cn: string;    // country code receptor
  rn: string;    // nombre receptor (del banco)
  sc?: string;   // source currency ("USD")
  sa?: number;   // sender amount en moneda origen
  fx?: number;   // tipo de cambio aplicado
  tt?: "remesa" | "terminal" | "importacion";
  h?: string;    // HMAC signature (excluida al firmar)
}

interface BuildPayloadInput {
  amount: number;
  currency: string;
  mode: "A" | "B";
  rail: Rail;
  bankToken: string;
  bankName: string;
  country: string;
  receiverName: string;
  sourceCurrency?: string;
  senderAmount?: number;
  exchangeRate?: number;
  transactionType?: "remesa" | "terminal" | "importacion";
}

// Construye, firma, comprime y cifra el payload → URL-safe string
export async function buildPayload(input: BuildPayloadInput): Promise<string> {
  const { fee, receiverGets } = calcFees(input.amount, input.mode);
  const now = Date.now();

  const payload: PaymentPayload = {
    v: 1,
    ts: now,
    ex: now + LINK_TTL_MS,
    a: input.amount,
    c: input.currency,
    m: input.mode,
    f: fee,
    n: receiverGets,
    r: input.rail,
    t: input.bankToken,
    nb: input.bankName,
    cn: input.country,
    rn: input.receiverName,
    ...(input.sourceCurrency && { sc: input.sourceCurrency }),
    ...(input.senderAmount   && { sa: input.senderAmount }),
    ...(input.exchangeRate   && { fx: input.exchangeRate }),
    ...(input.transactionType && { tt: input.transactionType }),
  };

  const dataToSign = JSON.stringify({ ...payload });
  payload.h = await hmacSign(dataToSign, CLIENT_KEY);

  const json = JSON.stringify(payload);
  const compressed = deflateSync(new TextEncoder().encode(json));
  return encrypt(compressed, CLIENT_KEY);
}

// Decodifica, descifra, descomprime y verifica el payload de la URL
export async function parsePayload(encoded: string): Promise<PaymentPayload> {
  let decompressed: Uint8Array;
  try {
    const decrypted = await decrypt(encoded, CLIENT_KEY);
    decompressed = inflateSync(decrypted);
  } catch {
    throw new Error("invalid_payload");
  }

  let payload: PaymentPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(decompressed));
  } catch {
    throw new Error("invalid_payload");
  }

  if (Date.now() > payload.ex) {
    throw new Error("expired");
  }

  if (payload.v !== 1) {
    throw new Error("invalid_version");
  }

  const { h, ...rest } = payload;
  const dataToVerify = JSON.stringify(rest);
  const valid = await hmacVerify(dataToVerify, CLIENT_KEY, h ?? "");
  if (!valid) {
    throw new Error("invalid_signature");
  }

  return payload;
}

// ── Comprobante auditable (sin número de cuenta, solo para verificación) ──
export interface ReceiptPayload {
  id: string;   // tx_id de Stripe / Wise / Airwallex
  a: number;    // amount en moneda destino
  c: string;    // currency destino
  nb: string;   // nombre banco destino (nunca el número de cuenta)
  cn: string;   // country code destino
  ts: number;   // timestamp de la transacción
  tt: string;   // "remesa" | "terminal" | "importacion"
  r: string;    // rail usado
  sa?: number;  // sender amount (remesa)
  sc?: string;  // source currency (remesa)
}

export async function buildReceiptURL(receipt: ReceiptPayload, baseUrl?: string): Promise<string> {
  const json = JSON.stringify(receipt);
  const compressed = deflateSync(new TextEncoder().encode(json));
  const encoded = await encrypt(compressed, CLIENT_KEY);
  const base = baseUrl ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/resultado?r=${encoded}`;
}

export async function parseReceiptURL(encoded: string): Promise<ReceiptPayload> {
  let decompressed: Uint8Array;
  try {
    const decrypted = await decrypt(encoded, CLIENT_KEY);
    decompressed = inflateSync(decrypted);
  } catch {
    throw new Error("invalid_receipt");
  }
  try {
    return JSON.parse(new TextDecoder().decode(decompressed)) as ReceiptPayload;
  } catch {
    throw new Error("invalid_receipt");
  }
}

export function getPayloadFromURL(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get("s");
}

export function buildPaymentURL(encoded: string, baseUrl?: string): string {
  const base = baseUrl ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/pagar?s=${encoded}`;
}
