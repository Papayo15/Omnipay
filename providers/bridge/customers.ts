// Bridge.xyz customer management — KYC (individual P2P) and KYB (business B2B)
// Bridge stores ALL customer state. We never persist this locally (zero-data policy).

import { createHash } from "crypto";
import { bridgeRequest, BridgeError } from "./client";

export interface BridgeCustomer {
  id:          string;
  type:        "individual" | "business";
  email:       string;
  status?:     "active" | "approved" | "inactive" | "incomplete" | "not_started" | "rejected" | "under_review" | "awaiting_questionnaire" | "awaiting_ubo" | "deposits_restricted" | "paused" | "offboarded";
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

  const day = Math.floor(Date.now() / 86_400_000);

  if (isSandbox) {
    // Deterministic per email+day — avoids "idempotency key already used" when
    // createCustomer is retried within the same day (Bridge eventual-consistency lag).
    const h = createHash("sha256").update(`${params.email.toLowerCase()}-${day}`).digest("hex");
    body.signed_agreement_id = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;

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
  // Include hashes of endorsements AND name so that if either changes between
  // retries (same email, same day), the key changes — Bridge rejects same-key/
  // different-body with not_truly_idempotent, so a fresh key is always safer.
  const endHash  = params.endorsements?.length
    ? createHash("sha256").update([...params.endorsements].sort().join(",")).digest("hex").slice(0, 8)
    : "none";
  const nameStr  = params.type === "business"
    ? (params.business_name ?? "").toLowerCase().trim()
    : `${(params.first_name ?? "").toLowerCase().trim()}-${(params.last_name ?? "").toLowerCase().trim()}`;
  const nameHash = createHash("sha256").update(nameStr).digest("hex").slice(0, 8);
  return bridgeRequest<BridgeCustomer>(
    "POST",
    "/customers",
    body,
    `customer-${params.type}-${params.email.toLowerCase()}-${endHash}-${nameHash}-${day}`,
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
    // Prefer fully active/approved; deposits_restricted can still make outbound transfers
    return res.data.find((c) => c.status === "active" || c.status === "approved")
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
        : existing.status === "active" || existing.status === "approved" || isRestricted || existing.kyc_status === "approved"
    );
    // incomplete/not_started = customer record exists in Bridge but never went through ToS+KYC.
    // Treat as isNew so the checkout shows the ToS popup before the KYC link.
    const neverStarted = existing.status === "incomplete" || existing.status === "not_started";
    return { customer: existing, isNew: neverStarted, needsKyc: !kycApproved, depositsRestricted: isRestricted, accountBlocked: isBlocked };
  }

  try {
    const customer = await createCustomer(params);
    return { customer, isNew: true, needsKyc: true };
  } catch (err) {
    const e = err as Error & { details?: unknown };
    // Bridge returns { code:"invalid_parameters", source:{ key:{ email:"A customer with this email already exists" } } }
    // The full response is on e.details; e.message is the generic "Please resubmit..." text.
    const msg = JSON.stringify(e.details ?? e.message ?? "").toLowerCase();
    // Also recover when Bridge returns an idempotency conflict (same key, different body
    // due to a prior call that got a different signed_agreement_id before the fix).
    const isEmailTaken    = msg.includes("already exists");
    const isIdempConflict = msg.includes("idempotency") || msg.includes("not_truly_idempotent");
    if (isEmailTaken || isIdempConflict) {
      // Bridge may embed the existing customer in the error body — try every known field name.
      const det = e.details as Record<string, unknown> | undefined;
      const embedded = (
        det?.existing_resource ?? det?.existing_customer ?? det?.customer
      ) as BridgeCustomer | undefined;

      if (embedded?.id) {
        const isRestricted = embedded.status === "deposits_restricted";
        const isBlocked    = embedded.status === "paused" || embedded.status === "offboarded";
        const kycApproved  = !isBlocked && (
          params.type === "business"
            ? embedded.kyb_status === "approved"
            : embedded.status === "active" || embedded.status === "approved" || isRestricted || embedded.kyc_status === "approved"
        );
        return { customer: embedded, isNew: false, needsKyc: !kycApproved, depositsRestricted: isRestricted, accountBlocked: isBlocked };
      }

      // Bridge search is eventually consistent — retry up to 3 times with increasing delay.
      const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
      for (const delay of [800, 2000, 4000]) {
        await wait(delay);
        const recovered = await findCustomerByEmail(params.email);
        if (recovered) {
          const isRestricted = recovered.status === "deposits_restricted";
          const isBlocked    = recovered.status === "paused" || recovered.status === "offboarded";
          const kycApproved  = !isBlocked && (
            params.type === "business"
              ? recovered.kyb_status === "approved"
              : recovered.status === "active" || recovered.status === "approved" || isRestricted || recovered.kyc_status === "approved"
          );
          return { customer: recovered, isNew: false, needsKyc: !kycApproved, depositsRestricted: isRestricted, accountBlocked: isBlocked };
        }
      }
    }
    throw err;
  }
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
  // Include redirect_uri tag: same params = same key (idempotent); different redirect
  // = different key to avoid "idempotency key already used" when body differs.
  const uriTag   = params.redirect_uri
    ? params.redirect_uri.replace(/[^a-z0-9]/gi, "").slice(-16)
    : "none";
  // Include type: individual vs business KYC links have different bodies
  const idempKey = `kyc-link-${params.type}-${params.email.toLowerCase()}-${endStr}-${uriTag}-${Math.floor(Date.now() / 3_600_000)}`;
  // Bridge business KYC links use business_name, individual links use full_name
  const { full_name, ...rest } = params;
  const body = params.type === "business"
    ? { ...rest, business_name: full_name }
    : { ...rest, full_name };
  try {
    return await bridgeRequest<BridgeKycLink>("POST", "/kyc_links", body, idempKey);
  } catch (e) {
    const err = e as BridgeError & { details?: Record<string, unknown> };
    // Idempotency conflict (same key, different body) — return existing resource if embedded.
    const isIdempConflict = err.message?.toLowerCase().includes("idempotency")
      || err.type?.toLowerCase().includes("idempotency");
    if (isIdempConflict) {
      const existing = (err.details?.existing_resource ?? err.details?.kyc_link) as
        { id?: string; url?: string; kyc_link?: string } | undefined;
      if (existing?.url ?? existing?.kyc_link) return existing as unknown as BridgeKycLink;
    }
    throw e;
  }
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

// BridgeCustomer has no kyc_link field — tos_link is the ToS acceptance URL, not the Persona KYC URL.
// Always use createKycLink() to get an actual KYC link.
export function getKycUrlFromCustomer(_customer: BridgeCustomer): string | null {
  return null;
}

// Creates a Bridge ToS link for production — required before new customer creation.
// In sandbox, `signed_agreement_id: crypto.randomUUID()` is used instead.
// Production: call this, get { id, url }, redirect user to url, then retry checkout.
export async function createTosLink(params: {
  full_name:    string;
  email:        string;
  type:         "individual" | "business";
  customer_id?: string;   // pass when customer already exists — Bridge uses it to locate the record
  redirect_uri?: string;
}): Promise<{ id: string; url: string }> {
  const day = Math.floor(Date.now() / 86_400_000);
  // Include a stable tag derived from redirect_uri so that retries with a different
  // redirect (e.g., different query-string token) get a fresh key — Bridge rejects
  // the same idempotency key when the request body differs.
  const uriTag = params.redirect_uri
    ? params.redirect_uri.replace(/[^a-z0-9]/gi, "").slice(-16)
    : "none";
  // Include customer_id in key — same email but different customer_id means different body
  const cidTag = params.customer_id ? params.customer_id.slice(-8) : "none";
  const idempKey = `tos-${params.email.toLowerCase()}-${cidTag}-${day}-${uriTag}`;
  // Helper: Bridge may return the ToS URL in either `url` or `tos_link` field.
  const extractUrl = (obj: Record<string, unknown>): string =>
    ((obj.url ?? obj.tos_link ?? obj.link ?? "") as string);
  try {
    const raw = await bridgeRequest<Record<string, unknown>>(
      "POST",
      "/customers/tos_links",
      params,
      idempKey,
    );
    const url = extractUrl(raw);
    console.log(`[createTosLink] response fields: ${Object.keys(raw).join(", ")} url=${url}`);
    return { id: (raw.id ?? "") as string, url };
  } catch (e) {
    const err = e as BridgeError & { details?: Record<string, unknown> };
    console.error(`[createTosLink] error type=${err.type} msg=${err.message} details=${JSON.stringify(err.details)}`);
    // Idempotency conflict (same key, different body on a prior call) — Bridge
    // sometimes embeds the existing resource in the error body so we can return it.
    const isIdempConflict = err.message?.toLowerCase().includes("idempotency")
      || err.type?.toLowerCase().includes("idempotency");
    if (isIdempConflict) {
      const existing = (err.details?.existing_resource ?? err.details?.tos_link) as
        Record<string, unknown> | undefined;
      const url = existing ? extractUrl(existing) : "";
      if (url) return { id: (existing?.id ?? "") as string, url };
    }
    // Duplicate TOS link — customer already has one; extract URL from error details.
    if (err.type === "duplicate_record") {
      const existing = (err.details?.existing_tos_link ?? err.details?.existing_resource) as
        Record<string, unknown> | undefined;
      const url = existing ? extractUrl(existing) : "";
      if (url) return { id: (existing?.id ?? "") as string, url };
    }
    throw e;
  }
}

/** Append redirect_uri to any Bridge-hosted page URL so the user is sent back to OmniPay after completing the action. */
export function appendRedirectUri(url: string | null | undefined, redirectUri: string): string | null {
  if (!url) return null;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}redirect_uri=${encodeURIComponent(redirectUri)}`;
}

export { BridgeError };
