// Bridge.xyz unified facade
// Single import for all Bridge operations throughout the app.

export {
  bridgeRequest,
  BridgeError,
} from "./client";

export {
  createCustomer,
  findCustomerByEmail,
  getCustomer,
  getOrCreateCustomer,
  getKycLink,
  type BridgeCustomer,
  type BridgeKycLink,
} from "./customers";

export {
  createLiquidationAddress,
  getLiquidationAddress,
  NATIVE_RAILS,
  type CreateLiquidationParams,
  type LiquidationAddress,
  type ReceiveMethod,
} from "./liquidation";

export {
  createVirtualAccount,
  getVirtualAccount,
  type VirtualAccount,
  type CreateVirtualAccountParams,
} from "./virtual-accounts";

export {
  getTransfer,
  mapTransferStatus,
  type BridgeTransfer,
} from "./transfers";

export {
  verifyBridgeWebhook,
  parseWebhookEvent,
  type BridgeWebhookEvent,
} from "./webhooks";
