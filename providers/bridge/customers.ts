// Bridge.xyz customer management — KYC (individual P2P) and KYB (business B2B)
// Bridge stores ALL customer state. We never persist this locally (zero-data policy).

import { bridgeRequest, BridgeError } from "./client";

export interface BridgeCustomer {
  id:          string;
  type:        "individual" | "business";
  email:       string;
  status?:     "active" | "inactive" | "incomplete" | "rejected" | "under_review" | "under_review_awaiting_ubo" | "deposits_restricted" | "paused" | "offboarded";
  kyc_status?: "approved" | "pending" | "incomplete" | "not_started" | "rejected" | "under_review" | "awaiting_ubo";
  kyb_status?: "approved" | "pending" | "incomplete" | "not_started" | "rejected" | "under_review" | "awaiting_ubo";
  first_name?: string;
  last_name?:  string;
  business_name?: string;
  created_at:  string;
  tos_link?:   string;  // Bridge-hosted KYC/TOS URL already embedded in customer object
}

export interface BridgeKycLink {
  id:          string;
  url?:        string;        // legacy field
  kyc_link?:   string;        // Persona verification URL
  tos_link?:   string;        // TOS acceptance URL
  kyc_status?: string;
  tos_status?: string;
  customer_id?: string;
  expires_at?: string;
}

export const ALPHA2_TO_ALPHA3: Record<string, string> = {
  MX:"MEX", US:"USA", BR:"BRA", CO:"COL", GB:"GBR", CA:"CAN",
  DE:"DEU", FR:"FRA", ES:"ESP", IT:"ITA", NL:"NLD", PT:"PRT",
  BE:"BEL", AT:"AUT", IE:"IRL", FI:"FIN", GR:"GRC", CY:"CYP",
  EE:"EST", LV:"LVA", LT:"LTU", LU:"LUX", MT:"MLT", SK:"SVK",
  SI:"SVN", HR:"HRV", SE:"SWE", DK:"DNK", NO:"NOR", PL:"POL",
  CZ:"CZE", HU:"HUN", RO:"ROU", BG:"BGR", CH:"CHE", IS:"ISL",
  LI:"LIE", AR:"ARG", PE:"PER", IN:"IND",
};

// Update customer with address + compliance fields via PUT.
// In sandbox: also includes KYC compliance fields so simulate_kyc_approval works.
// customerType: "individual" | "business" — business customers must NOT receive
// individual-only fields (source_of_funds, employment_status, etc.) or Bridge rejects.
// country param is alpha-2 (e.g. "MX" or "DE").
export async function patchCustomerAddress(
  customerId: string,
  country: string,
  includeComplianceFields = false,
  customerType: "individual" | "business" = "individual",
  businessName?: string,
): Promise<void> {
  const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");
  const iso3      = ALPHA2_TO_ALPHA3[country] ?? "USA";
  const addr      = ADDRESS_DEFAULTS[iso3] ?? ADDRESS_DEFAULTS["USA"];

  // Bridge address fields per type (from Bridge API docs):
  //   individual → residential_address
  //   business   → registered_address + physical_address + business_name required in PUT
  // Send residential_address for all types as Bridge may check it universally.
  const update: Record<string, unknown> = customerType === "business"
    ? { registered_address: addr, physical_address: addr, residential_address: addr, ...(businessName ? { business_name: businessName } : {}) }
    : { residential_address: addr };

  if (isSandbox && includeComplianceFields && customerType === "individual") {
    // Individual compliance fields — Bridge rejects these for business customers.
    const FAKE_IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";
    update.account_purpose               = "payments_to_friends_or_family_abroad";
    update.source_of_funds               = "salary";
    update.employment_status             = "employed";
    update.expected_monthly_payments_usd = "0_4999";
    update.acting_as_intermediary        = false;
    update.place_of_birth                = { city: "San Francisco", country: "USA" };
    update.documents                     = [{ purposes: ["proof_of_address"], file: FAKE_IMG }];
    if (iso3 !== "USA") {
      update.nationalities = [iso3];
    }
  }

  await bridgeRequest("PUT", `/customers/${customerId}`, update);
}

// Create a new customer (KYC individual or KYB business)
// Bridge requires `residential_address` (individual) at creation time.
// Sandbox additionally requires birth_date, tax_id, phone, signed_agreement_id.
export async function createCustomer(params: {
  type:           "individual" | "business";
  email:          string;
  first_name?:    string;
  last_name?:     string;
  business_name?: string;
  country?:       string;       // alpha-3 (e.g. "MEX"), used for address defaults
  endorsements?:  string[];     // e.g. ["base", "sepa"] — puts them in pending state
}): Promise<BridgeCustomer> {
  const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");
  const { country: _c, endorsements: _e, ...rest } = params;
  const body: Record<string, unknown> = { ...rest };

  const addr = ADDRESS_DEFAULTS[params.country ?? "USA"] ?? ADDRESS_DEFAULTS["USA"];
  if (params.type === "business") {
    body.registered_address  = addr;
    body.physical_address    = addr;
    body.residential_address = addr;  // some Bridge validations check this for all types
  } else {
    body.residential_address = addr;
  }

  // Request specific endorsements — puts them in "pending" state so
  // simulate_kyc_approval (sandbox) or real KYC can approve them.
  if (params.endorsements?.length) {
    body.endorsements = params.endorsements;
  }

  if (isSandbox) {
    // signed_agreement_id required in sandbox for all customer types
    body.signed_agreement_id = crypto.randomUUID();

    if (params.type === "individual") {
      // Individual-only sandbox fields — Bridge rejects these for business customers
      body.birth_date = "1990-01-01";
      body.phone      = "+15555555555";
      const iso3      = params.country ?? "USA";

      const FAKE_IMG  = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";

      body.identifying_information = [
        { type: "ssn",      issuing_country: "USA", number: "123456789" },
        { type: "passport", issuing_country: iso3.toLowerCase(), number: "A12345678", image_front: FAKE_IMG, image_back: FAKE_IMG },
      ];
      body.documents = [
        { purposes: ["proof_of_address"], file: FAKE_IMG },
      ];
      body.account_purpose               = "payments_to_friends_or_family_abroad";
      body.source_of_funds               = "salary";
      body.employment_status             = "employed";
      body.expected_monthly_payments_usd = "0_4999";
      body.acting_as_intermediary        = false;
      body.place_of_birth                = { city: "San Francisco", country: "USA" };
      if (iso3 !== "USA") {
        body.nationalities = [iso3];
      }
    }
    // Business customers only need signed_agreement_id in sandbox — no personal docs
  }
  const day = Math.floor(Date.now() / 86_400_000);
  return bridgeRequest<BridgeCustomer>(
    "POST",
    "/customers",
    body,
    // Include type so individual and business customers with the same email
    // never share an idempotency key (different bodies → Bridge rejects)
    `customer-${params.type}-${params.email.toLowerCase()}-${day}`,
  );
}

// Default addresses keyed by ISO alpha-3 country code.
// Bridge's residential_address uses "subdivision" (ISO 3166-2 code), not "state".
const ADDRESS_DEFAULTS: Record<string, { street_line_1: string; city: string; subdivision: string; postal_code: string; country: string }> = {
  USA: { street_line_1: "123 Main Street", city: "San Francisco", subdivision: "CA",   postal_code: "94102",    country: "USA" },
  MEX: { street_line_1: "123 Main Street", city: "Ciudad de Mexico", subdivision: "CMX", postal_code: "06600",  country: "MEX" },
  BRA: { street_line_1: "123 Main Street", city: "São Paulo",       subdivision: "SP",   postal_code: "01310100", country: "BRA" },
  COL: { street_line_1: "123 Main Street", city: "Bogotá",          subdivision: "DC",   postal_code: "110111", country: "COL" },
  GBR: { street_line_1: "123 Main Street", city: "London",          subdivision: "ENG",  postal_code: "EC1A1BB", country: "GBR" },
  DEU: { street_line_1: "123 Main Street", city: "Berlin",          subdivision: "BE",   postal_code: "10115",  country: "DEU" },
  FRA: { street_line_1: "123 Main Street", city: "Paris",           subdivision: "IDF",  postal_code: "75001",  country: "FRA" },
  ESP: { street_line_1: "123 Main Street", city: "Madrid",          subdivision: "MD",   postal_code: "28001",  country: "ESP" },
  CAN: { street_line_1: "123 Main Street", city: "Toronto",         subdivision: "ON",   postal_code: "M5H2N2", country: "CAN" },
};

// Add endorsements to an existing customer (sandbox + production).
// Sends a minimal PUT with only `endorsements` — no compliance fields —
// so Bridge doesn't reject it for already-created customers.
// Call this BEFORE createKycLink + simulateKycApproval so the new
// rail-specific endorsement (spei/pix/fps/cop) enters pending state.
export async function ensureEndorsements(customerId: string, endorsements: string[]): Promise<void> {
  await bridgeRequest("PUT", `/customers/${customerId}`, { endorsements });
}

// Sandbox only — instantly approves KYC without going through Persona
export async function simulateKycApproval(customerId: string): Promise<void> {
  const day = Math.floor(Date.now() / 86_400_000);
  await bridgeRequest("POST", `/customers/${customerId}/simulate_kyc_approval`,
    undefined, `sim-${customerId}-${day}`);
}

// Find existing customer by email — returns null if not found or any error
// This IS the "database read" in the zero-data architecture.
export async function findCustomerByEmail(email: string): Promise<BridgeCustomer | null> {
  try {
    const res = await bridgeRequest<{ data: BridgeCustomer[] }>(
      "GET",
      `/customers?email=${encodeURIComponent(email.toLowerCase())}`,
    );
    if (!res.data?.length) return null;
    // Prefer fully active; deposits_restricted can still make outbound transfers
    return res.data.find((c) => c.status === "active")
        ?? res.data.find((c) => c.status === "deposits_restricted")
        ?? res.data[0];
  } catch {
    return null;
  }
}

export async function getCustomer(id: string): Promise<BridgeCustomer> {
  return bridgeRequest<BridgeCustomer>("GET", `/customers/${id}`);
}

// Get or create a customer — returns { customer, isNew, needsKyc }
export async function getOrCreateCustomer(params: {
  type:           "individual" | "business";
  email:          string;
  first_name?:    string;
  last_name?:     string;
  business_name?: string;
  country?:       string;       // alpha-3, passed to createCustomer for address defaults
  endorsements?:  string[];     // included in customer creation to put endorsements pending
}): Promise<{ customer: BridgeCustomer; isNew: boolean; needsKyc: boolean; depositsRestricted?: boolean; accountBlocked?: boolean }> {
  const existing = await findCustomerByEmail(params.email);

  if (existing && existing.type === params.type) {
    // Ensure all rail endorsements are requested — idempotent, Bridge ignores already-approved ones.
    // Prevents the case where a customer has base+sepa but is blocked on spei/pix/fps/cop.
    if (existing.type === "individual") {
      try { await ensureEndorsements(existing.id, ["base","sepa","spei","pix","faster_payments","cop"]); } catch { /* best-effort */ }
    }
    // deposits_restricted: inbound blocked, outbound allowed. Treat as approved for sender flows.
    // paused/offboarded: fully blocked — surface as needsKyc so caller shows an error.
    const isRestricted = existing.status === "deposits_restricted";
    const isBlocked    = existing.status === "paused" || existing.status === "offboarded";
    const kycApproved  = !isBlocked && (
      params.type === "business"
        ? existing.kyb_status === "approved"
        : existing.status === "active" || isRestricted || existing.kyc_status === "approved"
    );
    return { customer: existing, isNew: false, needsKyc: !kycApproved, depositsRestricted: isRestricted, accountBlocked: isBlocked };
  }

  const customer = await createCustomer(params);
  return { customer, isNew: true, needsKyc: true };
}

// Maps Bridge payment rail → endorsement type required
export const RAIL_ENDORSEMENT: Record<string, string> = {
  ach:             "base",
  spei:            "spei",
  sepa:            "sepa",
  pix:             "pix",
  fps:             "faster_payments",
  cop:             "cop",
};

// Create KYC link with endorsements — Bridge API uses `endorsements` (array).
// Must be called BEFORE simulate_kyc_approval for sandbox endorsements to work.
// Always include "base"; add rail-specific endorsement alongside it.
// For business customers Bridge expects `business_name` not `full_name`.
export async function createKycLink(params: {
  full_name:      string;
  email:          string;
  type:           "individual" | "business";
  endorsements?:  string[];  // e.g. ["base", "sepa"] — Bridge requires array
  redirect_uri?:  string;    // URL Bridge redirects the user to after KYC is complete
}): Promise<BridgeKycLink> {
  const endStr   = (params.endorsements ?? ["base"]).join("-");
  // Include type: individual vs business KYC links have different bodies
  const idempKey = `kyc-link-${params.type}-${params.email.toLowerCase()}-${endStr}-${Math.floor(Date.now() / 3_600_000)}`;
  // Bridge business KYC links use business_name, individual links use full_name
  const { full_name, ...rest } = params;
  const body = params.type === "business"
    ? { ...rest, business_name: full_name }
    : { ...rest, full_name };
  return bridgeRequest<BridgeKycLink>("POST", "/kyc_links", body, idempKey);
}

// Get existing KYC link for an already-created customer
export async function getKycLink(customerId: string): Promise<BridgeKycLink> {
  const idempKey = `kyc-link-${customerId}-${Math.floor(Date.now() / 3_600_000)}`;
  return bridgeRequest<BridgeKycLink>(
    "POST",
    `/customers/${customerId}/kyc_links`,
    {},
    idempKey,
  );
}

// Extract the KYC URL from the customer object itself (Bridge embeds tos_link)
export function getKycUrlFromCustomer(customer: BridgeCustomer): string | null {
  return customer.tos_link ?? null;
}

// Creates a Bridge ToS link for production — required before new customer creation.
// In sandbox, `signed_agreement_id: crypto.randomUUID()` is used instead.
// Production: call this, get { id, url }, redirect user to url, then retry checkout.
export async function createTosLink(params: {
  full_name:    string;
  email:        string;
  type:         "individual" | "business";
  redirect_uri?: string;
}): Promise<{ id: string; url: string }> {
  const { redirect_uri, ...body } = params;
  const day = Math.floor(Date.now() / 86_400_000);
  const res = await bridgeRequest<{ id: string; url: string }>(
    "POST",
    "/customers/tos_links",
    body,
    `tos-${params.email.toLowerCase()}-${day}`,
  );
  // redirect_uri goes as query param on the URL Bridge returns, not in the API body
  if (redirect_uri && res.url) {
    const sep = res.url.includes("?") ? "&" : "?";
    res.url = `${res.url}${sep}redirect_uri=${encodeURIComponent(redirect_uri)}`;
  }
  return res;
}

export { BridgeError };
