export interface Country {
  code: string;
  name: string;
  flag: string;
  currency: string;
  accountLabel: string; // etiqueta del campo de cuenta
  accountPlaceholder: string;
}

export const COUNTRIES: Country[] = [
  { code: "MX", name: "México", flag: "🇲🇽", currency: "MXN", accountLabel: "CLABE Interbancaria", accountPlaceholder: "18 dígitos" },
  { code: "US", name: "Estados Unidos", flag: "🇺🇸", currency: "USD", accountLabel: "Número de cuenta + Routing", accountPlaceholder: "Routing / Account" },
  { code: "BR", name: "Brasil", flag: "🇧🇷", currency: "BRL", accountLabel: "Chave PIX", accountPlaceholder: "CPF, email o celular" },
  { code: "CA", name: "Canadá", flag: "🇨🇦", currency: "CAD", accountLabel: "Account Number", accountPlaceholder: "Account + Transit" },
  { code: "GB", name: "Reino Unido", flag: "🇬🇧", currency: "GBP", accountLabel: "Sort Code + Account", accountPlaceholder: "00-00-00 / 12345678" },
  { code: "DE", name: "Alemania", flag: "🇩🇪", currency: "EUR", accountLabel: "IBAN", accountPlaceholder: "DE00 0000 0000..." },
  { code: "FR", name: "Francia", flag: "🇫🇷", currency: "EUR", accountLabel: "IBAN", accountPlaceholder: "FR00 0000 0000..." },
  { code: "ES", name: "España", flag: "🇪🇸", currency: "EUR", accountLabel: "IBAN", accountPlaceholder: "ES00 0000 0000..." },
  { code: "IT", name: "Italia", flag: "🇮🇹", currency: "EUR", accountLabel: "IBAN", accountPlaceholder: "IT00 0000 0000..." },
  { code: "CN", name: "China", flag: "🇨🇳", currency: "CNY", accountLabel: "Alipay / WeChat / UnionPay", accountPlaceholder: "Cuenta o teléfono" },
  { code: "RU", name: "Rusia", flag: "🇷🇺", currency: "RUB", accountLabel: "Teléfono / SBP", accountPlaceholder: "+7..." },
  { code: "AR", name: "Argentina", flag: "🇦🇷", currency: "ARS", accountLabel: "CBU / CVU", accountPlaceholder: "22 dígitos" },
  { code: "CO", name: "Colombia", flag: "🇨🇴", currency: "COP", accountLabel: "Cuenta Bancaria", accountPlaceholder: "Número de cuenta" },
  { code: "PE", name: "Perú", flag: "🇵🇪", currency: "PEN", accountLabel: "CCI / Cuenta", accountPlaceholder: "CCI 20 dígitos" },
  { code: "CL", name: "Chile", flag: "🇨🇱", currency: "CLP", accountLabel: "Cuenta / RUT", accountPlaceholder: "RUT + cuenta" },
  { code: "VE", name: "Venezuela", flag: "🇻🇪", currency: "USD", accountLabel: "Cuenta Bancaria", accountPlaceholder: "Número de cuenta" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬", currency: "NGN", accountLabel: "Account Number", accountPlaceholder: "10 dígitos NUBAN" },
  { code: "PK", name: "Pakistán", flag: "🇵🇰", currency: "PKR", accountLabel: "IBAN", accountPlaceholder: "PK00 0000..." },
  { code: "SG", name: "Singapur", flag: "🇸🇬", currency: "SGD", accountLabel: "PayNow / Cuenta", accountPlaceholder: "Teléfono o NRIC" },
  { code: "IN", name: "India", flag: "🇮🇳", currency: "INR", accountLabel: "UPI ID", accountPlaceholder: "nombre@banco" },
];

export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export const DEFAULT_COUNTRY = COUNTRIES[0]; // México
