// Conduit — Platform customer access
//
// OmniPay operates as a PLATFORM customer on Conduit.
// One pre-provisioned customer ID covers all operations — no per-sender customers.
// Set CONDUIT_CUSTOMER_ID in env after onboarding OmniPay through the Conduit dashboard.
//
// If per-user customers are ever needed, use POST /onboarding (application-based,
// async — requires application.approved webhook before the customer ID is usable).

export function getConduitCustomerId(): string {
  const id = process.env.CONDUIT_CUSTOMER_ID;
  if (!id) {
    throw new Error(
      "CONDUIT_CUSTOMER_ID is not set. " +
      "Add OmniPay's Conduit customer ID (from the Conduit dashboard) to your env vars.",
    );
  }
  return id;
}
