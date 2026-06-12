// Smart account format detection per country for Wise API integration.
// Used client-side (app/page.tsx) for labels/validation and server-side (webhooks) for Wise API calls.

export interface AccountValidation {
  inputMode: "numeric" | "text";
  label:      string;
  placeholder: string;
  minLength:  number;
  maxLength:  number;
  hint:       string;
  validate:   (v: string) => boolean;
  supported:  boolean; // false = Wise does not support this country
}

// Countries where Wise transfers are impossible due to OFAC/EU sanctions.
// Generating a payment link for these would always fail at the Wise API.
export const BLOCKED_COUNTRIES = new Set(["CU", "KP", "IR", "SY", "RU"]);

// All SEPA + EEA countries use IBAN; AE and SA also use IBAN format via Wise.
export const SEPA_COUNTRIES = new Set([
  "DE","FR","ES","IT","NL","PT","BE","AT","SE","NO","DK","FI",
  "IE","PL","RO","HU","CZ","GR","SK","HR","BG","CH","EE","LV",
  "LT","LU","MT","CY","SI","IS","LI",
  // Middle East IBAN
  "AE","SA","BH","QA","KW","JO","EG","TR","IL",
]);

// ── Wise account type strings (used in POST /v1/accounts `type` field) ────────

export function getWiseAccountType(countryCode: string): string {
  const map: Record<string, string> = {
    MX: "mexican_account", US: "aba",          CA: "canadian",
    GB: "sort_code",       AU: "australian",   NZ: "newzealand",
    BR: "brazil",          IN: "indian",       JP: "japan",
    KR: "privatBank",      SG: "singaporean",  HK: "hongkong",
    TH: "thailand",        VN: "vietnam",      ID: "indonesian",
    MY: "malaysian",       PH: "philippines",
    AE: "emirates",        SA: "saudi_arabian",
    NG: "nigerian",        GH: "ghana",        KE: "kenya",
    ZA: "southafrican",    TZ: "tanzanian",    MA: "moroccan",
    CO: "colombia",        AR: "argentina",    CL: "chile",
    PE: "peru",            UY: "uruguay",      BO: "bolivia",
    CR: "costarica",       GT: "guatemala",    EC: "ecuador",
    DO: "dominican",       PY: "paraguay",     HN: "honduras",
    BD: "bangladesh",      PK: "pakistan",     LK: "srilanka",
    ET: "ethiopia",        SN: "senegal",      GH2: "ghana",
  };
  const c = countryCode.toUpperCase();
  if (SEPA_COUNTRIES.has(c)) return "iban";
  if (c === "GB") return "sort_code";
  return map[c] ?? "iban";
}

// ── Validation rules for the client-side input field ─────────────────────────

export function getAccountValidation(countryCode: string): AccountValidation {
  const c = (countryCode ?? "").toUpperCase();

  if (BLOCKED_COUNTRIES.has(c)) {
    return {
      inputMode: "text", label: "—", placeholder: "—",
      minLength: 0, maxLength: 0, hint: "blocked",
      supported: false, validate: () => false,
    };
  }

  switch (c) {

    // ── Americas ──────────────────────────────────────────────────────────────

    case "MX":
      return {
        inputMode: "numeric", supported: true,
        label:       "CLABE Interbancaria",
        placeholder: "123456789012345678",
        minLength: 18, maxLength: 18,
        hint: "18 digits — find it in your bank app under Account Details",
        validate: (v) => /^\d{18}$/.test(v.replace(/\s/g, "")),
      };
    case "US":
      return {
        inputMode: "numeric", supported: true,
        label:       "Routing - Account number",
        placeholder: "021000021-1234567890",
        minLength: 14, maxLength: 26,
        hint: "Format: 9-digit routing · account number  →  e.g. 021000021-1234567890",
        validate: (v) => /^\d{9}-?\d{5,17}$/.test(v.replace(/\s/g, "")),
      };
    case "CA":
      return {
        inputMode: "numeric", supported: true,
        label:       "Transit - Institution - Account",
        placeholder: "00123-004-1234567",
        minLength: 13, maxLength: 17,
        hint: "Format: 5-digit transit · 3-digit institution · account  →  e.g. 00123-004-1234567",
        validate: (v) => /^\d{5}-?\d{3}-?\d{5,9}$/.test(v.replace(/\s/g, "")),
      };
    case "BR":
      return {
        inputMode: "text", supported: true,
        label:       "Chave PIX",
        placeholder: "CPF, email, phone or random key",
        minLength: 5, maxLength: 77,
        hint: "Your PIX key: CPF (11 digits), email, phone (+55...) or random key from your bank app",
        validate: (v) => v.trim().length >= 5,
      };
    case "AR":
      return {
        inputMode: "text", supported: true,
        label:       "CBU / CVU / Alias",
        placeholder: "22 digits or alias (e.g. juan.banco.mp)",
        minLength: 5, maxLength: 22,
        hint: "22-digit CBU/CVU, or your Mercado Pago alias",
        validate: (v) => v.trim().length >= 5,
      };
    case "CO":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number",
        placeholder: "Account number (10-16 digits)",
        minLength: 10, maxLength: 16,
        hint: "Savings or checking account number (Bancolombia, Davivienda, Nequi, etc.)",
        validate: (v) => /^\d{10,16}$/.test(v.replace(/\s/g, "")),
      };
    case "CL":
      return {
        inputMode: "text", supported: true,
        label:       "Bank account number",
        placeholder: "Account number (Banco Estado, Santander, etc.)",
        minLength: 8, maxLength: 20,
        hint: "Chilean bank account number",
        validate: (v) => v.trim().length >= 8,
      };
    case "PE":
      return {
        inputMode: "numeric", supported: true,
        label:       "CCI / Account number",
        placeholder: "CCI (20 digits) or account number",
        minLength: 13, maxLength: 20,
        hint: "Código de Cuenta Interbancario (CCI) — 20 digits from your bank app",
        validate: (v) => /^\d{13,20}$/.test(v.replace(/\s/g, "")),
      };
    case "UY":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number",
        placeholder: "Account number (Itaú, BROU, Santander, etc.)",
        minLength: 8, maxLength: 20,
        hint: "Uruguayan bank account number",
        validate: (v) => /^\d{8,20}$/.test(v.replace(/\s/g, "")),
      };
    case "BO":
    case "CR":
    case "EC":
    case "GT":
    case "HN":
    case "DO":
    case "PA":
    case "PY":
    case "SV":
    case "NI":
    case "JM":
    case "HT":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number",
        placeholder: "Account number",
        minLength: 8, maxLength: 20,
        hint: "Bank account number from your bank app or account statement",
        validate: (v) => /^\d{8,20}$/.test(v.replace(/\s/g, "")),
      };

    // ── Europe (non-SEPA) ─────────────────────────────────────────────────────

    case "GB":
      return {
        inputMode: "text", supported: true,
        label:       "IBAN",
        placeholder: "GB00 NWBK 0000 0000 0000 00",
        minLength: 22, maxLength: 22,
        hint: "UK IBAN starting with GB — find it in your banking app",
        validate: (v) => /^GB\d{2}[A-Z0-9]{18}$/i.test(v.replace(/\s/g, "")),
      };

    // ── Asia-Pacific ──────────────────────────────────────────────────────────

    case "IN":
      return {
        inputMode: "text", supported: true,
        label:       "UPI ID",
        placeholder: "username@oksbi  or  phone@upi",
        minLength: 5, maxLength: 50,
        hint: "Your UPI handle from PhonePe, Google Pay, BHIM or your bank app (e.g. user@oksbi)",
        validate: (v) => v.trim().length >= 5 && v.includes("@"),
      };
    case "AU":
      return {
        inputMode: "numeric", supported: true,
        label:       "BSB - Account number",
        placeholder: "062000-12345678",
        minLength: 12, maxLength: 16,
        hint: "Format: 6-digit BSB · account number  →  e.g. 062000-12345678",
        validate: (v) => /^\d{6}-?\d{6,10}$/.test(v.replace(/\s/g, "")),
      };
    case "NZ":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number (NZ)",
        placeholder: "01-0102-0000000-00",
        minLength: 14, maxLength: 16,
        hint: "New Zealand bank account — 16 digits without dashes",
        validate: (v) => /^\d{14,16}$/.test(v.replace(/[\s-]/g, "")),
      };
    case "JP":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank code - Branch - Account",
        placeholder: "0001-001-1234567",
        minLength: 7, maxLength: 16,
        hint: "Format: 4-digit bank code · 3-digit branch · 7-digit account  →  e.g. 0001-001-1234567",
        validate: (v) => /^\d{4}-?\d{3}-?\d{7}$/.test(v.replace(/\s/g, "")),
      };
    case "KR":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number (KR)",
        placeholder: "Account number (11-14 digits)",
        minLength: 11, maxLength: 14,
        hint: "Korean bank account number (Kookmin, Shinhan, Woori, KEB Hana, etc.)",
        validate: (v) => /^\d{11,14}$/.test(v.replace(/[\s-]/g, "")),
      };
    case "SG":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number (SG)",
        placeholder: "Account number (DBS, OCBC, UOB, etc.)",
        minLength: 9, maxLength: 11,
        hint: "Singapore bank account number — find it in your banking app",
        validate: (v) => /^\d{9,11}$/.test(v.replace(/\s/g, "")),
      };
    case "HK":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank - Branch - Account (HK)",
        placeholder: "012-345-678901234",
        minLength: 9, maxLength: 17,
        hint: "Format: 3-digit bank · 3-digit branch · 6-9 digit account  →  e.g. 012-345-678901234",
        validate: (v) => /^\d{3}-?\d{3}-?\d{6,9}$/.test(v.replace(/\s/g, "")),
      };
    case "MY":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number (MY)",
        placeholder: "Account number (Maybank, CIMB, etc.)",
        minLength: 10, maxLength: 16,
        hint: "Malaysian bank account number — find it in your bank app",
        validate: (v) => /^\d{10,16}$/.test(v.replace(/\s/g, "")),
      };
    case "PH":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number (PH)",
        placeholder: "Account number (BDO, BPI, UnionBank, GCash, etc.)",
        minLength: 10, maxLength: 16,
        hint: "Philippine bank account number or GCash/Maya mobile wallet number",
        validate: (v) => /^\d{10,16}$/.test(v.replace(/\s/g, "")),
      };
    case "TH":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number (TH)",
        placeholder: "Account number or PromptPay (10 digits)",
        minLength: 10, maxLength: 15,
        hint: "Thai bank account number or PromptPay ID (mobile/ID card number)",
        validate: (v) => /^\d{10,15}$/.test(v.replace(/\s/g, "")),
      };
    case "VN":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number (VN)",
        placeholder: "Account number (Vietcombank, Techcombank, etc.)",
        minLength: 10, maxLength: 20,
        hint: "Vietnamese bank account number from your bank app",
        validate: (v) => /^\d{10,20}$/.test(v.replace(/\s/g, "")),
      };
    case "ID":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number (ID)",
        placeholder: "Account number (BCA, Mandiri, BNI, BRI, etc.)",
        minLength: 10, maxLength: 16,
        hint: "Indonesian bank account number from your bank app",
        validate: (v) => /^\d{10,16}$/.test(v.replace(/\s/g, "")),
      };
    case "BD":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number (BD)",
        placeholder: "Account number (Dutch-Bangla, bKash, etc.)",
        minLength: 10, maxLength: 17,
        hint: "Bangladeshi bank account number or bKash mobile number",
        validate: (v) => /^\d{10,17}$/.test(v.replace(/\s/g, "")),
      };
    case "PK":
      return {
        inputMode: "text", supported: true,
        label:       "IBAN (PK...)",
        placeholder: "PK36 ALFH 0695 9000 1234 5702",
        minLength: 24, maxLength: 24,
        hint: "Pakistani IBAN — 24 characters starting with PK",
        validate: (v) => /^PK\d{2}[A-Z0-9]{20}$/i.test(v.replace(/\s/g, "")),
      };
    case "CN":
      return {
        inputMode: "numeric", supported: false,
        label:       "Bank account (CN)",
        placeholder: "CNY transfers have limited availability",
        minLength: 0, maxLength: 0,
        hint: "Direct CNY bank transfers are not currently available via this platform. Contact us for alternatives.",
        validate: () => false,
      };

    // ── Africa ────────────────────────────────────────────────────────────────

    case "NG":
      return {
        inputMode: "numeric", supported: true,
        label:       "NUBAN (10 digits)",
        placeholder: "1234567890",
        minLength: 10, maxLength: 10,
        hint: "10-digit NUBAN — works with Zenith, GTBank, First Bank, Access, UBA",
        validate: (v) => /^\d{10}$/.test(v.replace(/\s/g, "")),
      };
    case "KE":
      return {
        inputMode: "text", supported: true,
        label:       "M-Pesa / Bank account (KE)",
        placeholder: "+254 7XX XXX XXX or account number",
        minLength: 9, maxLength: 20,
        hint: "M-Pesa mobile number (+254...) or bank account number",
        validate: (v) => v.trim().length >= 9,
      };
    case "GH":
      return {
        inputMode: "text", supported: true,
        label:       "Mobile money / Bank account (GH)",
        placeholder: "+233 XX XXX XXXX or account number",
        minLength: 9, maxLength: 20,
        hint: "MTN Mobile Money or Vodafone Cash number (+233...) or bank account",
        validate: (v) => v.trim().length >= 9,
      };
    case "ZA":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number (ZA)",
        placeholder: "Account number (Standard, FNB, ABSA, Nedbank, etc.)",
        minLength: 9, maxLength: 11,
        hint: "South African bank account number (9-11 digits) from your bank app",
        validate: (v) => /^\d{9,11}$/.test(v.replace(/\s/g, "")),
      };
    case "TZ":
      return {
        inputMode: "text", supported: true,
        label:       "Bank / M-Pesa account (TZ)",
        placeholder: "+255 7XX XXX XXX or account number",
        minLength: 9, maxLength: 20,
        hint: "M-Pesa Tanzania (+255...) or bank account number",
        validate: (v) => v.trim().length >= 9,
      };
    case "MA":
      return {
        inputMode: "text", supported: true,
        label:       "RIB / Bank account (MA)",
        placeholder: "RIB (24 digits) — CIH, Attijariwafa, BMCE",
        minLength: 16, maxLength: 24,
        hint: "Moroccan RIB bank account number (24 digits) from your bank app",
        validate: (v) => /^\d{16,24}$/.test(v.replace(/\s/g, "")),
      };
    case "ET":
    case "SN":
      return {
        inputMode: "numeric", supported: true,
        label:       "Bank account number",
        placeholder: "Account number",
        minLength: 8, maxLength: 20,
        hint: "Bank account number from your bank app",
        validate: (v) => /^\d{8,20}$/.test(v.replace(/\s/g, "")),
      };

    default: {
      // SEPA + IBAN countries (Europe, Middle East)
      if (SEPA_COUNTRIES.has(c)) {
        return {
          inputMode: "text", supported: true,
          label:       "IBAN",
          placeholder: `${c}XX XXXX XXXX XXXX XXXX XX`,
          minLength: 15, maxLength: 34,
          hint: `IBAN starting with ${c} — find it in your banking app under Account Details`,
          validate: (v) => {
            const clean = v.replace(/\s/g, "").toUpperCase();
            return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(clean);
          },
        };
      }
      // Generic fallback — works for most remaining countries via Wise
      return {
        inputMode: "text", supported: true,
        label:       "Bank account number",
        placeholder: "Account number",
        minLength: 5, maxLength: 50,
        hint: "Bank account number or identifier from your bank app",
        validate: (v) => v.trim().length >= 5,
      };
    }
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
    case "US": {
      const d = clean.replace(/-/g, "");
      return { abartn: d.slice(0, 9), accountNumber: d.slice(9) };
    }
    case "CA": {
      const d = clean.replace(/-/g, "");
      return { transitNo: d.slice(0, 5), institutionNo: d.slice(5, 8), accountNumber: d.slice(8) };
    }
    case "BR":
      return { legalType: "PRIVATE", taxId: clean };
    case "IN":
      return { address: { country: "IN" }, accountType: "UPI", upi: accountInput.trim() };
    case "AU": {
      const d = clean.replace(/-/g, "");
      return { bsbCode: d.slice(0, 6), accountNumber: d.slice(6) };
    }
    case "NZ":
      return { accountNumber: clean };
    case "NG":
      return { accountNumber: clean };
    case "AR":
      return { accountNumber: clean, legalType: "PRIVATE" };
    case "CL":
      return { accountNumber: clean };
    case "CO":
      return { accountNumber: clean };
    case "JP": {
      const d = clean.replace(/-/g, "");
      return { bankCode: d.slice(0, 4), branchCode: d.slice(4, 7), accountNumber: d.slice(7) };
    }
    case "KR":
      return { accountNumber: clean };
    case "PE":
      return { accountNumber: clean };
    case "UY":
      return { accountNumber: clean };
    case "SG":
      return { accountNumber: clean };
    case "HK": {
      const d = clean.replace(/-/g, "");
      return { bankCode: d.slice(0, 3), branchCode: d.slice(3, 6), accountNumber: d.slice(6) };
    }
    case "MY":
      return { accountNumber: clean };
    case "PH":
      return { accountNumber: clean };
    case "TH":
      return { accountNumber: clean };
    case "VN":
      return { accountNumber: clean };
    case "ID":
      return { accountNumber: clean };
    case "KE":
    case "GH":
    case "TZ":
      return { accountNumber: clean };
    case "ZA":
      return { accountNumber: clean };
    case "BD":
      return { accountNumber: clean };
    default:
      // SEPA + IBAN countries (including AE, SA, GB, PK, EG, TR, IL, etc.)
      if (SEPA_COUNTRIES.has(c) || c === "GB" || c === "PK") {
        return { IBAN: clean.toUpperCase() };
      }
      return { accountNumber: clean };
  }
}
