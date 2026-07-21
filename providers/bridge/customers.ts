// Bridge.xyz customer management — KYC (individual P2P) and KYB (business B2B)
// Bridge stores ALL customer state. We never persist this locally (zero-data policy).

import { bridgeRequest, BridgeError } from "./client";

export interface BridgeCustomer {
  id:          string;
  type:        "individual" | "business";
  email:       string;
  status?:     "active" | "inactive" | "incomplete" | "rejected" | "under_review";
  kyc_status?: "approved" | "pending" | "incomplete" | "rejected" | "under_review";
  kyb_status?: "approved" | "pending" | "incomplete" | "rejected" | "under_review";
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

// Patch customer address — uses same `address` field as customer creation.
// country param is alpha-2 (e.g. "MX"); converted to alpha-3 for Bridge.
export async function patchCustomerAddress(customerId: string, country: string): Promise<void> {
  const ISO3: Record<string, string> = {
    MX:"MEX", US:"USA", BR:"BRA", CO:"COL", GB:"GBR", CA:"CAN",
    DE:"DEU", FR:"FRA", ES:"ESP", IT:"ITA", NL:"NLD", PT:"PRT",
    BE:"BEL", AT:"AUT", IE:"IRL", FI:"FIN", GR:"GRC", CY:"CYP",
    EE:"EST", LV:"LVA", LT:"LTU", LU:"LUX", MT:"MLT", SK:"SVK",
    SI:"SVN", HR:"HRV", SE:"SWE", DK:"DNK", NO:"NOR", PL:"POL",
    CZ:"CZE", HU:"HUN", RO:"ROU", BG:"BGR", CH:"CHE", IS:"ISL",
    LI:"LIE", AR:"ARG", PE:"PER", IN:"IND",
  };
  const iso3 = ISO3[country] ?? "USA";
  const addr = ADDRESS_DEFAULTS[iso3] ?? ADDRESS_DEFAULTS["USA"];
  await bridgeRequest("PATCH", `/customers/${customerId}`, { address: addr });
}

// Create a new customer (KYC individual or KYB business)
// Bridge requires `address` at creation time in both sandbox and production.
// Sandbox additionally requires birth_date, tax_id, phone, signed_agreement_id.
export async function createCustomer(params: {
  type:           "individual" | "business";
  email:          string;
  first_name?:    string;
  last_name?:     string;
  business_name?: string;
  country?:       string;  // alpha-3 (e.g. "MEX"), used for address defaults
}): Promise<BridgeCustomer> {
  const isSandbox = (process.env.BRIDGE_API_BASE ?? "").includes("sandbox");
  const { country: _c, ...rest } = params;
  const body: Record<string, unknown> = { ...rest };

  // Address is always required — Bridge rejects customers without one
  body.address = ADDRESS_DEFAULTS[params.country ?? "USA"] ?? ADDRESS_DEFAULTS["USA"];

  if (isSandbox) {
    body.birth_date                = "1990-01-01";
    body.tax_identification_number = "111-11-1111";
    body.phone                     = "+15555555555";
    body.signed_agreement_id       = crypto.randomUUID();
  }
  return bridgeRequest<BridgeCustomer>(
    "POST",
    "/customers",
    body,
    `customer-${params.email.toLowerCase()}`,
  );
}

// Default addresses keyed by ISO alpha-3 country code
const ADDRESS_DEFAULTS: Record<string, { street_line_1: string; city: string; state: string; postal_code: string; country: string }> = {
  USA: { street_line_1: "123 Main Street", city: "San Francisco", state: "CA", postal_code: "94102", country: "USA" },
  MEX: { street_line_1: "123 Main Street", city: "Ciudad de Mexico", state: "CDMX", postal_code: "06600", country: "MEX" },
  BRA: { street_line_1: "123 Main Street", city: "São Paulo", state: "SP", postal_code: "01310100", country: "BRA" },
  COL: { street_line_1: "123 Main Street", city: "Bogotá", state: "DC", postal_code: "110111", country: "COL" },
  GBR: { street_line_1: "123 Main Street", city: "London", state: "ENG", postal_code: "EC1A1BB", country: "GBR" },
  DEU: { street_line_1: "123 Main Street", city: "Berlin", state: "BE", postal_code: "10115", country: "DEU" },
  FRA: { street_line_1: "123 Main Street", city: "Paris", state: "IDF", postal_code: "75001", country: "FRA" },
  ESP: { street_line_1: "123 Main Street", city: "Madrid", state: "MD", postal_code: "28001", country: "ESP" },
  CAN: { street_line_1: "123 Main Street", city: "Toronto", state: "ON", postal_code: "M5H2N2", country: "CAN" },
};

// Sandbox only — instantly approves KYC without going through Persona
export async function simulateKycApproval(customerId: string): Promise<void> {
  await bridgeRequest("POST", `/customers/${customerId}/simulate_kyc_approval`);
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
    // Prefer active customer if multiple exist with same email
    return res.data.find((c) => c.status === "active") ?? res.data[0];
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
  country?:       string;  // alpha-3, passed to createCustomer for address defaults
}): Promise<{ customer: BridgeCustomer; isNew: boolean; needsKyc: boolean }> {
  const existing = await findCustomerByEmail(params.email);

  if (existing) {
    const kycApproved = params.type === "business"
      ? existing.kyb_status === "approved"
      : existing.status === "active" || existing.kyc_status === "approved";
    return { customer: existing, isNew: false, needsKyc: !kycApproved };
  }

  const customer = await createCustomer(params);
  return { customer, isNew: true, needsKyc: true };
}

// Create KYC link — per docs: use full_name + email (customer created inside Bridge's KYC flow)
// Returns kyc_link (Persona) + tos_link + customer_id
export async function createKycLink(params: {
  full_name: string;
  email:     string;
  type:      "individual" | "business";
}): Promise<BridgeKycLink> {
  const idempKey = `kyc-link-${params.email.toLowerCase()}-${Math.floor(Date.now() / 3_600_000)}`;
  return bridgeRequest<BridgeKycLink>("POST", "/kyc_links", params, idempKey);
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

export { BridgeError };
