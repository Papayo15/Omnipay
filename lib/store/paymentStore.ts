import { create } from "zustand";
import type { Rail } from "@/constants/rails";
import type { PaymentPayload } from "@/lib/payload";

export type TxStatus = "idle" | "authorizing" | "processing" | "success" | "error";
export type TransactionType = "remesa" | "terminal" | "importacion" | null;

interface PaymentState {
  role: "receiver" | "sender" | null;

  // Datos del pago
  amount: number;
  currency: string;
  mode: "A" | "B";
  rail: Rail | null;
  country: string;
  bankToken: string | null;
  bankName: string;
  receiverName: string;
  accountId: string;

  // Campos FX para remesas transfronterizas
  transactionType: TransactionType;
  sourceCurrency: string;      // moneda del emisor ("USD")
  sourceCountry: string;       // país del emisor ("US")
  senderAmount: number;        // monto en moneda del emisor
  exchangeRate: number | null; // tipo de cambio (ej. 17.40)
  fxUpdatedAt: number | null;  // timestamp de la cotización

  // Flujo desde QR/URL
  decodedPayload: PaymentPayload | null;

  // Identidad de emisor y receptor (para comprobante y notificación)
  senderName: string;
  recipientName: string;
  recipientPhone: string;   // E.164 opcional — para notificación SMS/WhatsApp

  // Metadatos de importación B2B
  invoiceRef: string;
  concept: string;
  supplierName: string;

  // Estado de la transacción
  txStatus: TxStatus;
  txId: string | null;
  txReference: string | null; // ID devuelto por Wise/Airwallex/Stripe
  errorMessage: string | null;

  // Acciones
  setRole: (role: "receiver" | "sender") => void;
  setAmount: (amount: number) => void;
  setCurrency: (currency: string) => void;
  setMode: (mode: "A" | "B") => void;
  setRail: (rail: Rail) => void;
  setCountry: (country: string) => void;
  setBankToken: (token: string) => void;
  setBankName: (name: string) => void;
  setReceiverName: (name: string) => void;
  setAccountId: (id: string) => void;
  setTransactionType: (type: TransactionType) => void;
  setSourceCurrency: (currency: string) => void;
  setSourceCountry: (country: string) => void;
  setSenderAmount: (amount: number) => void;
  setExchangeRate: (rate: number | null, updatedAt?: number) => void;
  setDecodedPayload: (payload: PaymentPayload) => void;
  setSenderName: (name: string) => void;
  setRecipientName: (name: string) => void;
  setRecipientPhone: (phone: string) => void;
  setInvoiceRef: (ref: string) => void;
  setConcept: (concept: string) => void;
  setSupplierName: (name: string) => void;
  setTxStatus: (status: TxStatus) => void;
  setTxId: (id: string) => void;
  setTxReference: (ref: string) => void;
  setError: (msg: string) => void;
  clearAll: () => void;
}

const INITIAL_STATE = {
  role: null,
  amount: 0,
  currency: "MXN",
  mode: "A" as const,
  rail: null,
  country: "MX",
  bankToken: null,
  bankName: "",
  receiverName: "",
  accountId: "",
  transactionType: null,
  sourceCurrency: "",
  sourceCountry: "",
  senderAmount: 0,
  exchangeRate: null,
  fxUpdatedAt: null,
  decodedPayload: null,
  senderName: "",
  recipientName: "",
  recipientPhone: "",
  invoiceRef: "",
  concept: "",
  supplierName: "",
  txStatus: "idle" as const,
  txId: null,
  txReference: null,
  errorMessage: null,
};

export const usePaymentStore = create<PaymentState>((set) => ({
  ...INITIAL_STATE,

  setRole: (role) => set({ role }),
  setAmount: (amount) => set({ amount }),
  setCurrency: (currency) => set({ currency }),
  setMode: (mode) => set({ mode }),
  setRail: (rail) => set({ rail }),
  setCountry: (country) => set({ country }),
  setBankToken: (bankToken) => set({ bankToken }),
  setBankName: (bankName) => set({ bankName }),
  setReceiverName: (receiverName) => set({ receiverName }),
  setAccountId: (accountId) => set({ accountId }),
  setTransactionType: (transactionType) => set({ transactionType }),
  setSourceCurrency: (sourceCurrency) => set({ sourceCurrency }),
  setSourceCountry: (sourceCountry) => set({ sourceCountry }),
  setSenderAmount: (senderAmount) => set({ senderAmount }),
  setExchangeRate: (rate, updatedAt) => set({ exchangeRate: rate, fxUpdatedAt: updatedAt ?? Date.now() }),
  setDecodedPayload: (decodedPayload) => set({ decodedPayload }),
  setSenderName: (senderName) => set({ senderName }),
  setRecipientName: (recipientName) => set({ recipientName }),
  setRecipientPhone: (recipientPhone) => set({ recipientPhone }),
  setInvoiceRef: (invoiceRef) => set({ invoiceRef }),
  setConcept: (concept) => set({ concept }),
  setSupplierName: (supplierName) => set({ supplierName }),
  setTxStatus: (txStatus) => set({ txStatus }),
  setTxId: (txId) => set({ txId }),
  setTxReference: (txReference) => set({ txReference }),
  setError: (errorMessage) => set({ txStatus: "error", errorMessage }),

  clearAll: () => {
    if (typeof window !== "undefined") sessionStorage.clear();
    set(INITIAL_STATE);
  },
}));
