// Bridge.xyz customer management — KYC (individual P2P) and KYB (business B2B)
// Bridge stores ALL customer state. We never persist this locally (zero-data policy).

import { bridgeRequest, BridgeError } from "./client";

export interface BridgeCustomer {
  id:          string;
  type:        "individual" | "business";
  email:       string;
  kyc_status?: "approved" | "pending" | "incomplete" | "rejected" | "under_review";
  kyb_status?: "approved" | "pending" | "incomplete" | "rejected" | "under_review";
  first_name?: string;
  last_name?:  string;
  business_name?: string;
  created_at:  string;
}

export interface BridgeKycLink {
  id:         string;
  url:        string;
  expires_at: string;
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
    return res.data?.[0] ?? null;
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
      : existing.kyc_status === "approved";
    return { customer: existing, isNew: false, needsKyc: !kycApproved };
  }

  const customer = await createCustomer(params);
  return { customer, isNew: true, needsKyc: true };
}

// Get a hosted KYC/KYB link to redirect the user to Bridge's verification UI
export async function getKycLink(customerId: string): Promise<BridgeKycLink> {
  return bridgeRequest<BridgeKycLink>(
    "POST",
    `/customers/${customerId}/kyc_links`,
    { full_kyc: true },
    `kyc-link-${customerId}`,
  );
}

export { BridgeError };
