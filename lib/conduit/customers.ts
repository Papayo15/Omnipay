// Conduit customer management
// OmniPay operates under KYC Reliance — platform approval covers individual users.
// No Persona / KYC link needed; just create a customer record by email.

import { conduitRequest } from "./client";
import type { ConduitCustomer } from "./types";

interface CreateCustomerParams {
  email:     string;
  firstName: string;
  lastName:  string;
  type?:     "individual" | "business";
}

interface ConduitCustomerListResponse {
  data:     ConduitCustomer[];
  nextPage?: string;
}

export async function findConduitCustomer(email: string): Promise<ConduitCustomer | null> {
  try {
    const res = await conduitRequest<ConduitCustomerListResponse>(
      "GET",
      `/customers?email=${encodeURIComponent(email)}&limit=1`,
    );
    return res.data?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function createConduitCustomer(params: CreateCustomerParams): Promise<ConduitCustomer> {
  return conduitRequest<ConduitCustomer>(
    "POST",
    "/customers",
    {
      type:      params.type ?? "individual",
      email:     params.email,
      firstName: params.firstName,
      lastName:  params.lastName,
    },
    // Idempotency key derived from email so concurrent requests don't create duplicates
    `cust-${Buffer.from(params.email).toString("base64url").slice(0, 40)}`,
  );
}

export async function findOrCreateConduitCustomer(
  email:     string,
  firstName: string,
  lastName:  string,
): Promise<ConduitCustomer> {
  const existing = await findConduitCustomer(email);
  if (existing) return existing;
  return createConduitCustomer({ email, firstName, lastName });
}
