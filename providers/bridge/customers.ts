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

// Create a new customer (KYC individual or KYB business)
export async function createCustomer(params: {
  type:           "individual" | "business";
  email:          string;
  first_name?:    string;
  last_name?:     string;
  business_name?: string;
}): Promise<BridgeCustomer> {
  return bridgeRequest<BridgeCustomer>(
    "POST",
    "/customers",
    params,
    `customer-${params.email.toLowerCase()}`,
  );
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
