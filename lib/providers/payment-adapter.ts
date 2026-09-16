// Feature flag router — determines active payment provider at runtime.
// Set NEXT_PUBLIC_PAYMENT_PROVIDER="conduit" to activate Conduit.
// Default (absent or any other value): Bridge.

export type PaymentProvider = "bridge" | "conduit";

export function getActiveProvider(): PaymentProvider {
  const flag = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER ?? "bridge";
  return flag === "conduit" ? "conduit" : "bridge";
}

export function getSendEndpoint(): string {
  return getActiveProvider() === "conduit"
    ? "/api/conduit/send"
    : "/api/bridge/send";
}

export function getFxQuoteEndpoint(): string {
  return getActiveProvider() === "conduit"
    ? "/api/conduit/fx-quote"
    : "/api/bridge/fx-quote";
}
