#!/usr/bin/env node
/**
 * OmniPay — Bridge production diagnostic
 *
 * Usage:
 *   DIAG_SECRET=<your-secret> node scripts/bridge-test.mjs <email> [country]
 *   DIAG_SECRET=<your-secret> node scripts/bridge-test.mjs jp@example.com MX
 *
 * Checks:
 *   1. Bridge API key is valid
 *   2. Customer KYC status in Bridge
 *   3. Whether they'd be asked for KYC again
 *   4. KYC link generation with redirect_uri (no money moved)
 */

const BASE_URL  = process.env.APP_URL ?? "https://omnipay.solutions";
const SECRET    = process.env.DIAG_SECRET;
const email     = process.argv[2];
const country   = process.argv[3] ?? "MX";
const create    = process.argv.includes("--create");

if (!SECRET) {
  console.error("Error: set DIAG_SECRET env var (same value as in Vercel)");
  process.exit(1);
}
if (!email) {
  console.error("Usage: DIAG_SECRET=xxx node scripts/bridge-test.mjs <email> [country] [--create]");
  console.error("  --create   create the customer in Bridge if not found (still no money moved)");
  process.exit(1);
}

const res = await fetch(`${BASE_URL}/api/internal/bridge-diag`, {
  method:  "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SECRET}` },
  body:    JSON.stringify({ email, country, create_if_missing: create }),
});

const data = await res.json();

const G = "\x1b[32m✓\x1b[0m";
const R = "\x1b[31m✗\x1b[0m";
const Y = "\x1b[33m⚠\x1b[0m";
const B = "\x1b[36m";
const RS = "\x1b[0m";

console.log(`\n${B}── OmniPay Bridge Diagnostic ──${RS}`);
console.log(`  Email:    ${data.email}`);
console.log(`  Country:  ${data.country}`);
console.log(`  Time:     ${data.timestamp}`);

console.log(`\n${B}── Bridge API Key ──${RS}`);
console.log(`  ${data.bridge_api_key_ok ? G : R} ${data.bridge_api_key_ok ? "API key válida — Bridge responde correctamente" : "API key INVÁLIDA o error de conexión"}`);
if (data.error) console.log(`     Error: ${data.error}`);

console.log(`\n${B}── Customer KYC Status ──${RS}`);
if (data.customer_found) {
  console.log(`  ${G} Customer encontrado en Bridge`);
  console.log(`     ID:             ${data.customer_id}`);
  console.log(`     status:         ${data.customer_status}`);
  console.log(`     kyc_status:     ${data.kyc_status}`);
  if (data.kyb_status) console.log(`     kyb_status:     ${data.kyb_status}`);
  console.log(`     type:           ${data.type}`);
  console.log(`     created:        ${data.created_at}`);
  console.log(``);
  if (data.would_pass_kyc_gate) {
    console.log(`  ${G} KYC APROBADO — este usuario NO verá la pantalla de verificación en su próximo envío`);
  } else {
    console.log(`  ${R} KYC PENDIENTE — este usuario será enviado a verificación`);
    if (data.kyc_link_ok) {
      console.log(`  ${G} KYC link generado correctamente con redirect_uri`);
      console.log(`     URL: ${data.kyc_link_url}`);
    } else {
      const note = data.kyc_link_type === "duplicate_record"
        ? `${Y} (duplicate_record — KYC link ya existe, Bridge lo está procesando)`
        : `${R} Error al generar KYC link: ${data.kyc_link_error}`;
      console.log(`  ${note}`);
    }
  }
} else {
  console.log(`  ${Y} Customer NO encontrado — primer envío requerirá KYC`);
  if (create) {
    if (data.customer_created) {
      console.log(`  ${G} Customer creado en Bridge`);
      console.log(`     ID:  ${data.customer_id}`);
      console.log(`     KYC link: ${data.kyc_link_url ?? "ver kyc_link_raw"}`);
    } else if (data.create_error) {
      console.log(`  ${R} Error al crear customer: ${data.create_error}`);
    }
  } else {
    console.log(`     Añade --create para crear el customer de prueba en Bridge (sin enviar dinero)`);
  }
}

console.log(`\n${B}── Diagnóstico ──${RS}`);
console.log(`  ${data.diagnosis ?? "(ninguno)"}`);
console.log();
