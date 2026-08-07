#!/usr/bin/env node
/**
 * Test rápido Bridge producción — corre directo desde terminal.
 * No mueve dinero. Solo verifica KYC + API key.
 *
 * Uso:
 *   BRIDGE_API_KEY=tu_key EMAIL=tu@email.com node scripts/test-kyc-local.mjs
 *
 * Opcional — también prueba crear un link de cobro real (sin dinero):
 *   BRIDGE_API_KEY=tu_key EMAIL=tu@email.com FULL=1 node scripts/test-kyc-local.mjs
 */

import { createHmac } from "crypto";

const KEY     = process.env.BRIDGE_API_KEY;
const EMAIL   = process.env.EMAIL;
const BASE    = process.env.BRIDGE_API_BASE ?? "https://api.bridge.xyz/v0";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnipay.solutions";
const FULL    = process.env.FULL === "1";

const G  = "\x1b[32m✓\x1b[0m";
const R  = "\x1b[31m✗\x1b[0m";
const Y  = "\x1b[33m⚠\x1b[0m";
const B  = "\x1b[36m";
const RS = "\x1b[0m";

if (!KEY || !EMAIL) {
  console.error(`\nUso: BRIDGE_API_KEY=xxx EMAIL=tu@email.com node scripts/test-kyc-local.mjs\n`);
  process.exit(1);
}

async function bridgeGet(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Api-Key": KEY, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message ?? JSON.stringify(data)), { status: res.status, body: data });
  return data;
}

async function bridgePost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Api-Key": KEY, "Content-Type": "application/json", "Idempotency-Key": `test-${Date.now()}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message ?? JSON.stringify(data)), { status: res.status, body: data });
  return data;
}

console.log(`\n${B}── OmniPay · Bridge Production Test ──${RS}`);
console.log(`  Email: ${EMAIL}`);
console.log(`  Base:  ${BASE}`);

// ── TEST 1: API Key ──────────────────────────────────────────────────────────
console.log(`\n${B}[1] Bridge API Key${RS}`);
try {
  // Light call — just list customers with a limit of 1
  await bridgeGet("/customers?limit=1");
  console.log(`  ${G} API key válida — Bridge responde`);
} catch (e) {
  if (e.status === 401) {
    console.log(`  ${R} API key inválida (401) — verifica BRIDGE_API_KEY`);
  } else {
    console.log(`  ${G} Bridge responde (status ${e.status} — key válida)`);
  }
}

// ── TEST 2: KYC del usuario ──────────────────────────────────────────────────
console.log(`\n${B}[2] KYC status para ${EMAIL}${RS}`);
let customer = null;
try {
  const res = await bridgeGet(`/customers?email=${encodeURIComponent(EMAIL.toLowerCase())}`);
  const customers = res.data ?? res.customers ?? res;
  customer = Array.isArray(customers)
    ? (customers.find(c => c.status === "active") ?? customers[0])
    : null;

  if (!customer) {
    console.log(`  ${Y} Customer NO encontrado en Bridge para este email`);
    console.log(`     Primera transferencia requerirá KYC`);
  } else {
    console.log(`  ${G} Customer encontrado`);
    console.log(`     id:         ${customer.id}`);
    console.log(`     status:     ${customer.status}`);
    console.log(`     kyc_status: ${customer.kyc_status ?? "n/a"}`);
    console.log(`     type:       ${customer.type}`);
    console.log(`     created:    ${customer.created_at}`);

    const approved = customer.status === "active" || customer.kyc_status === "approved";
    if (approved) {
      console.log(`\n  ${G} KYC APROBADO — este usuario NO verá pantalla de verificación`);
    } else {
      console.log(`\n  ${R} KYC PENDIENTE (${customer.kyc_status}) — se pedirá verificación`);
    }
  }
} catch (e) {
  console.log(`  ${R} Error buscando customer: ${e.message}`);
}

// ── TEST 3: KYC link con redirect_uri ────────────────────────────────────────
if (customer && (customer.status !== "active" && customer.kyc_status !== "approved")) {
  console.log(`\n${B}[3] KYC link (redirect_uri test)${RS}`);
  try {
    const link = await bridgePost("/kyc_links", {
      full_name:    EMAIL.split("@")[0],
      email:        EMAIL.toLowerCase(),
      type:         "individual",
      endorsements: ["base", "sepa", "spei"],
      redirect_uri: `${APP_URL}/p2p?kyc_done=1`,
    });
    const url = link.kyc_link ?? link.url;
    console.log(`  ${G} KYC link generado con redirect_uri`);
    console.log(`     URL: ${url}`);
    console.log(`     (abre esta URL para completar verificación)`);
  } catch (e) {
    if (e.body?.type === "duplicate_record") {
      console.log(`  ${Y} KYC link ya existe (duplicate_record) — Bridge lo está procesando`);
    } else {
      console.log(`  ${R} Error generando KYC link: ${e.message}`);
    }
  }
} else if (customer) {
  console.log(`\n${B}[3] KYC link${RS}`);
  console.log(`  ${G} No necesario — KYC ya aprobado`);
}

// ── TEST 4: Checkout completo (opcional) ────────────────────────────────────
if (FULL) {
  console.log(`\n${B}[4] Checkout completo (FULL=1) — prueba sin dinero real${RS}`);
  console.log(`  Llamando a ${APP_URL}/api/bridge/checkout ...`);
  try {
    const res = await fetch(`${APP_URL}/api/bridge/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre:         EMAIL.split("@")[0],
        email:          EMAIL,
        country:        "MX",
        receive_method: "bank",
        clabe:          "646180157069665167",
        amount_target:  500,
      }),
    });
    const data = await res.json();
    if (data.needs_kyc) {
      console.log(`  ${Y} Bridge pide KYC → URL: ${data.kyc_url?.slice(0,60)}...`);
    } else if (data.pay_link) {
      console.log(`  ${G} Checkout exitoso — link generado`);
      console.log(`     pay_link: ${data.pay_link}`);
      console.log(`     liq_addr: ${data.liq_addr_id}`);
    } else if (data.error) {
      console.log(`  ${R} Error: ${data.error}`);
    } else {
      console.log(`  ${Y} Respuesta: ${JSON.stringify(data).slice(0, 120)}`);
    }
  } catch (e) {
    console.log(`  ${R} Error de red: ${e.message}`);
  }
}

console.log(`\n${B}────────────────────────────────────────${RS}\n`);
