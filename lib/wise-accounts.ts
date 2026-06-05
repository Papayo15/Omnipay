// Smart account format detection per country for Wise API integration.
// Used client-side (pagar/page.tsx) for input validation and server-side (execute/route.ts) for Wise API calls.

export interface AccountValidation {
  inputMode: "numeric" | "text";
  label: string;
  placeholder: string;
  minLength: number;
  maxLength: number;
  hint: string;
  validate: (v: string) => boolean;
}

const SEPA = new Set([
  "DE","FR","ES","IT","NL","PT","BE","AT","SE","NO","DK","FI",
  "IE","PL","RO","HU","CZ","GR","SK","HR","BG","CH","EE","LV",
  "LT","LU","MT","CY","SI","IS","LI",
]);

// ── Wise account type strings (used in POST /v1/accounts `type` field) ────────

export function getWiseAccountType(countryCode: string): string {
  const map: Record<string, string> = {
    MX: "mexican_account", US: "aba",     CA: "canadian",
    GB: "sort_code",       AU: "australian",
    BR: "brazil",          IN: "indian",  JP: "japan",
    KR: "privatBank",      SG: "singaporean",
    NZ: "newzealand",      HK: "hongkong", TH: "thailand",
    VN: "vietnam",         ID: "indonesian",
    AE: "emirates",        SA: "saudi_arabian",
    NG: "nigerian",        GH: "ghana",   KE: "kenya",
    CO: "colombia",        AR: "argentina", CL: "chile",
    PE: "peru",            UY: "uruguay",
  };
  const c = countryCode.toUpperCase();
  if (SEPA.has(c) || c === "GB") return "iban";
  return map[c] ?? "iban";
}

// ── Validation rules for the client-side input field ─────────────────────────

export function getAccountValidation(countryCode: string): AccountValidation {
  const c = (countryCode ?? "").toUpperCase();

  switch (c) {
    case "MX":
      return {
        inputMode: "numeric",
        label:       "CLABE Interbancaria",
        placeholder: "18 dígitos",
        minLength: 18, maxLength: 18,
        hint: "Los 18 dígitos de tu CLABE (en tu app bancaria → datos de cuenta)",
        validate: (v) => /^\d{18}$/.test(v.replace(/\s/g, "")),
      };
    case "US":
      return {
        inputMode: "numeric",
        label:       "Routing (9 dígitos) + Account Number",
        placeholder: "Routing (9 dígitos) + Número de cuenta",
        minLength: 14, maxLength: 26,
        hint: "Primeros 9 dígitos = routing number, seguido del número de cuenta",
        validate: (v) => /^\d{14,26}$/.test(v.replace(/\s/g, "")),
      };
    case "CA":
      return {
        inputMode: "numeric",
        label:       "Transit (5) + Institution (3) + Account",
        placeholder: "Transit (5) + Institución (3) + Cuenta",
        minLength: 13, maxLength: 17,
        hint: "5 dígitos transit + 3 institución + número de cuenta (sin guiones)",
        validate: (v) => /^\d{13,17}$/.test(v.replace(/\s/g, "")),
      };
    case "BR":
      return {
        inputMode: "text",
        label:       "Chave PIX",
        placeholder: "CPF, email, celular o chave aleatória",
        minLength: 5, maxLength: 77,
        hint: "Tu llave PIX: CPF (11 dígitos), email, celular (+55...) o chave aleatória",
        validate: (v) => v.trim().length >= 5,
      };
    case "IN":
      return {
        inputMode: "text",
        label:       "UPI ID",
        placeholder: "nombre@banco (ej: juan@oksbi)",
        minLength: 5, maxLength: 50,
        hint: "Tu UPI ID de tu app bancaria (BHIM, PhonePe, Google Pay, etc.)",
        validate: (v) => v.trim().length >= 5 && v.includes("@"),
      };
    case "AU":
      return {
        inputMode: "numeric",
        label:       "BSB (6 dígitos) + Account Number",
        placeholder: "6 dígitos BSB + número de cuenta",
        minLength: 12, maxLength: 16,
        hint: "BSB de 6 dígitos (sin guión) seguido del número de cuenta",
        validate: (v) => /^\d{12,16}$/.test(v.replace(/[\s-]/g, "")),
      };
    case "NG":
      return {
        inputMode: "numeric",
        label:       "NUBAN — Número de cuenta bancaria",
        placeholder: "10 dígitos",
        minLength: 10, maxLength: 10,
        hint: "Número NUBAN de 10 dígitos (Zenith, GTBank, First Bank, etc.)",
        validate: (v) => /^\d{10}$/.test(v.replace(/\s/g, "")),
      };
    case "AR":
      return {
        inputMode: "text",
        label:       "CBU / CVU / Alias",
        placeholder: "22 dígitos o alias (ej: juan.banco.mp)",
        minLength: 5, maxLength: 22,
        hint: "CBU o CVU de 22 dígitos, o tu alias de Mercado Pago / banco",
        validate: (v) => v.trim().length >= 5,
      };
    case "CL":
      return {
        inputMode: "text",
        label:       "Número de cuenta bancaria",
        placeholder: "Número de cuenta (Banco Estado, Santander, etc.)",
        minLength: 8, maxLength: 20,
        hint: "Número de cuenta bancaria chilena",
        validate: (v) => v.trim().length >= 8,
      };
    case "CO":
      return {
        inputMode: "numeric",
        label:       "Número de cuenta bancaria",
        placeholder: "Número de cuenta",
        minLength: 10, maxLength: 16,
        hint: "Número de cuenta de ahorros o corriente (Bancolombia, Davivienda, etc.)",
        validate: (v) => /^\d{10,16}$/.test(v.replace(/\s/g, "")),
      };
    case "JP":
      return {
        inputMode: "numeric",
        label:       "Zengin — Bank + Branch + Account",
        placeholder: "Banco (4) + Sucursal (3) + Cuenta (7)",
        minLength: 7, maxLength: 14,
        hint: "Código banco (4) + código sucursal (3) + número de cuenta (7)",
        validate: (v) => /^\d{7,14}$/.test(v.replace(/\s/g, "")),
      };
    case "KR":
      return {
        inputMode: "numeric",
        label:       "Número de cuenta bancaria",
        placeholder: "Número de cuenta (11-14 dígitos)",
        minLength: 11, maxLength: 14,
        hint: "Número de cuenta bancaria coreana (Kookmin, Shinhan, Woori, etc.)",
        validate: (v) => /^\d{11,14}$/.test(v.replace(/\s|-/g, "")),
      };
    case "GB":
      return {
        inputMode: "text",
        label:       "IBAN",
        placeholder: "GB00 NWBK 0000 0000 0000 00",
        minLength: 22, maxLength: 22,
        hint: "IBAN de tu cuenta bancaria del Reino Unido (empieza con GB)",
        validate: (v) => /^GB\d{2}[A-Z0-9]{18}$/i.test(v.replace(/\s/g, "")),
      };
    case "PE":
      return {
        inputMode: "numeric",
        label:       "Número de cuenta bancaria / CCI",
        placeholder: "Número CCI o cuenta (20 dígitos)",
        minLength: 13, maxLength: 20,
        hint: "Código de Cuenta Interbancario (CCI) de 20 dígitos o número de cuenta",
        validate: (v) => /^\d{13,20}$/.test(v.replace(/\s/g, "")),
      };
    default:
      // SEPA IBAN countries
      if (SEPA.has(c)) {
        return {
          inputMode: "text",
          label:       "IBAN",
          placeholder: `${c}00 0000 0000...`,
          minLength: 15, maxLength: 34,
          hint: `IBAN de tu cuenta bancaria (empieza con ${c})`,
          validate: (v) => {
            const clean = v.replace(/\s/g, "").toUpperCase();
            return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(clean);
          },
        };
      }
      // Generic fallback
      return {
        inputMode: "text",
        label:       "Número de cuenta bancaria",
        placeholder: "Número de cuenta",
        minLength: 5, maxLength: 50,
        hint: "Número de cuenta bancaria o identificador de tu banco",
        validate: (v) => v.trim().length >= 5,
      };
  }
}

// ── Wise API `details` object builder ─────────────────────────────────────────

export function buildWiseAccountDetails(
  countryCode: string,
  accountInput: string,
): Record<string, unknown> {
  const c     = (countryCode ?? "").toUpperCase();
  const clean = accountInput.replace(/\s/g, "");

  switch (c) {
    case "MX":
      return { clabe: clean };
    case "US":
      return { abartn: clean.slice(0, 9), accountNumber: clean.slice(9) };
    case "CA":
      return {
        transitNo:     clean.slice(0, 5),
        institutionNo: clean.slice(5, 8),
        accountNumber: clean.slice(8),
      };
    case "BR":
      return { legalType: "PRIVATE", taxId: clean };
    case "IN":
      return { address: { country: "IN" }, accountType: "UPI", upi: accountInput.trim() };
    case "AU":
      return { bsbCode: clean.slice(0, 6), accountNumber: clean.slice(6) };
    case "NG":
      return { accountNumber: clean };
    case "AR":
      return { accountNumber: clean, legalType: "PRIVATE" };
    case "CL":
      return { accountNumber: clean };
    case "CO":
      return { accountNumber: clean };
    case "JP":
      return {
        bankCode:      clean.slice(0, 4),
        branchCode:    clean.slice(4, 7),
        accountNumber: clean.slice(7),
      };
    case "KR":
      return { accountNumber: clean };
    case "PE":
      return { accountNumber: clean };
    case "GB":
    default:
      if (SEPA.has(c) || c === "GB") {
        return { IBAN: clean.toUpperCase() };
      }
      return { accountNumber: clean };
  }
}
