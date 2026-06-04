export interface Country {
  code: string;
  name: string;
  flag: string;
  currency: string;
  accountLabel: string;
  accountPlaceholder: string;
}

export const COUNTRIES: Country[] = [
  // ── Norteamérica ──────────────────────────────────────────────────
  { code:"MX", name:"México",           flag:"🇲🇽", currency:"MXN", accountLabel:"CLABE Interbancaria",    accountPlaceholder:"18 dígitos" },
  { code:"US", name:"Estados Unidos",   flag:"🇺🇸", currency:"USD", accountLabel:"Routing + Account",     accountPlaceholder:"ABA / Cuenta" },
  { code:"CA", name:"Canadá",           flag:"🇨🇦", currency:"CAD", accountLabel:"Transit + Account",     accountPlaceholder:"Transit / Cuenta" },

  // ── Europa ────────────────────────────────────────────────────────
  { code:"GB", name:"Reino Unido",      flag:"🇬🇧", currency:"GBP", accountLabel:"Sort Code + Account",  accountPlaceholder:"00-00-00 / 12345678" },
  { code:"DE", name:"Alemania",         flag:"🇩🇪", currency:"EUR", accountLabel:"IBAN",                  accountPlaceholder:"DE00 0000 0000..." },
  { code:"FR", name:"Francia",          flag:"🇫🇷", currency:"EUR", accountLabel:"IBAN",                  accountPlaceholder:"FR00 0000 0000..." },
  { code:"ES", name:"España",           flag:"🇪🇸", currency:"EUR", accountLabel:"IBAN",                  accountPlaceholder:"ES00 0000 0000..." },
  { code:"IT", name:"Italia",           flag:"🇮🇹", currency:"EUR", accountLabel:"IBAN",                  accountPlaceholder:"IT00 0000 0000..." },
  { code:"NL", name:"Países Bajos",     flag:"🇳🇱", currency:"EUR", accountLabel:"IBAN",                  accountPlaceholder:"NL00 0000 0000..." },
  { code:"PT", name:"Portugal",         flag:"🇵🇹", currency:"EUR", accountLabel:"IBAN",                  accountPlaceholder:"PT50 0000 0000..." },
  { code:"BE", name:"Bélgica",          flag:"🇧🇪", currency:"EUR", accountLabel:"IBAN",                  accountPlaceholder:"BE00 0000 0000..." },
  { code:"AT", name:"Austria",          flag:"🇦🇹", currency:"EUR", accountLabel:"IBAN",                  accountPlaceholder:"AT00 0000 0000..." },
  { code:"SE", name:"Suecia",           flag:"🇸🇪", currency:"SEK", accountLabel:"IBAN",                  accountPlaceholder:"SE00 0000 0000..." },
  { code:"NO", name:"Noruega",          flag:"🇳🇴", currency:"NOK", accountLabel:"IBAN",                  accountPlaceholder:"NO00 0000 0000..." },
  { code:"DK", name:"Dinamarca",        flag:"🇩🇰", currency:"DKK", accountLabel:"IBAN",                  accountPlaceholder:"DK00 0000 0000..." },
  { code:"FI", name:"Finlandia",        flag:"🇫🇮", currency:"EUR", accountLabel:"IBAN",                  accountPlaceholder:"FI00 0000 0000..." },
  { code:"IE", name:"Irlanda",          flag:"🇮🇪", currency:"EUR", accountLabel:"IBAN",                  accountPlaceholder:"IE00 0000 0000..." },
  { code:"PL", name:"Polonia",          flag:"🇵🇱", currency:"PLN", accountLabel:"IBAN",                  accountPlaceholder:"PL00 0000 0000..." },
  { code:"CH", name:"Suiza",            flag:"🇨🇭", currency:"CHF", accountLabel:"IBAN",                  accountPlaceholder:"CH00 0000 0000..." },
  { code:"RO", name:"Rumania",          flag:"🇷🇴", currency:"RON", accountLabel:"IBAN",                  accountPlaceholder:"RO00 0000 0000..." },
  { code:"HU", name:"Hungría",          flag:"🇭🇺", currency:"HUF", accountLabel:"IBAN",                  accountPlaceholder:"HU00 0000 0000..." },
  { code:"CZ", name:"Rep. Checa",       flag:"🇨🇿", currency:"CZK", accountLabel:"IBAN",                  accountPlaceholder:"CZ00 0000 0000..." },
  { code:"UA", name:"Ucrania",          flag:"🇺🇦", currency:"UAH", accountLabel:"IBAN",                  accountPlaceholder:"UA00 0000 0000..." },
  { code:"GR", name:"Grecia",           flag:"🇬🇷", currency:"EUR", accountLabel:"IBAN",                  accountPlaceholder:"GR00 0000 0000..." },
  { code:"SK", name:"Eslovaquia",       flag:"🇸🇰", currency:"EUR", accountLabel:"IBAN",                  accountPlaceholder:"SK00 0000 0000..." },
  { code:"HR", name:"Croacia",          flag:"🇭🇷", currency:"EUR", accountLabel:"IBAN",                  accountPlaceholder:"HR00 0000 0000..." },
  { code:"BG", name:"Bulgaria",         flag:"🇧🇬", currency:"BGN", accountLabel:"IBAN",                  accountPlaceholder:"BG00 0000 0000..." },

  // ── LATAM ─────────────────────────────────────────────────────────
  { code:"BR", name:"Brasil",           flag:"🇧🇷", currency:"BRL", accountLabel:"Chave PIX",             accountPlaceholder:"CPF, email o celular" },
  { code:"CO", name:"Colombia",         flag:"🇨🇴", currency:"COP", accountLabel:"Cuenta Bancaria",       accountPlaceholder:"Número de cuenta" },
  { code:"AR", name:"Argentina",        flag:"🇦🇷", currency:"ARS", accountLabel:"CBU / CVU / Alias",     accountPlaceholder:"22 dígitos o alias" },
  { code:"CL", name:"Chile",            flag:"🇨🇱", currency:"CLP", accountLabel:"RUT + Cuenta",          accountPlaceholder:"RUT / número cuenta" },
  { code:"PE", name:"Perú",             flag:"🇵🇪", currency:"PEN", accountLabel:"CCI / Cuenta",          accountPlaceholder:"CCI 20 dígitos" },
  { code:"UY", name:"Uruguay",          flag:"🇺🇾", currency:"UYU", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"PY", name:"Paraguay",         flag:"🇵🇾", currency:"PYG", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"EC", name:"Ecuador",          flag:"🇪🇨", currency:"USD", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"BO", name:"Bolivia",          flag:"🇧🇴", currency:"BOB", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"VE", name:"Venezuela",        flag:"🇻🇪", currency:"USD", accountLabel:"Cuenta / Teléfono",     accountPlaceholder:"Número de cuenta" },
  { code:"PA", name:"Panamá",           flag:"🇵🇦", currency:"USD", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"CR", name:"Costa Rica",       flag:"🇨🇷", currency:"CRC", accountLabel:"IBAN / Cuenta",         accountPlaceholder:"CR00 0000 0000..." },
  { code:"GT", name:"Guatemala",        flag:"🇬🇹", currency:"GTQ", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"SV", name:"El Salvador",      flag:"🇸🇻", currency:"USD", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"HN", name:"Honduras",         flag:"🇭🇳", currency:"HNL", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"DO", name:"Rep. Dominicana",  flag:"🇩🇴", currency:"DOP", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"CU", name:"Cuba",             flag:"🇨🇺", currency:"CUP", accountLabel:"Número de cuenta",      accountPlaceholder:"Servicio limitado" },
  { code:"JM", name:"Jamaica",          flag:"🇯🇲", currency:"JMD", accountLabel:"Account Number",        accountPlaceholder:"Cuenta bancaria" },

  // ── Asia-Pacífico ─────────────────────────────────────────────────
  { code:"AU", name:"Australia",        flag:"🇦🇺", currency:"AUD", accountLabel:"BSB + Account",         accountPlaceholder:"BSB / Cuenta" },
  { code:"NZ", name:"Nueva Zelanda",    flag:"🇳🇿", currency:"NZD", accountLabel:"Bank Account",          accountPlaceholder:"00-0000-0000000-00" },
  { code:"SG", name:"Singapur",         flag:"🇸🇬", currency:"SGD", accountLabel:"PayNow / Cuenta",       accountPlaceholder:"UEN / Teléfono" },
  { code:"JP", name:"Japón",            flag:"🇯🇵", currency:"JPY", accountLabel:"Zengin / Cuenta",       accountPlaceholder:"Bank + Branch + Account" },
  { code:"KR", name:"Corea del Sur",    flag:"🇰🇷", currency:"KRW", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"CN", name:"China",            flag:"🇨🇳", currency:"CNY", accountLabel:"Alipay / UnionPay",     accountPlaceholder:"Teléfono o tarjeta" },
  { code:"HK", name:"Hong Kong",        flag:"🇭🇰", currency:"HKD", accountLabel:"FPS / Cuenta",          accountPlaceholder:"Teléfono / HKID" },
  { code:"TW", name:"Taiwán",           flag:"🇹🇼", currency:"TWD", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"TH", name:"Tailandia",        flag:"🇹🇭", currency:"THB", accountLabel:"PromptPay",             accountPlaceholder:"Teléfono / ID nacional" },
  { code:"MY", name:"Malasia",          flag:"🇲🇾", currency:"MYR", accountLabel:"DuitNow / Cuenta",      accountPlaceholder:"Teléfono / IC" },
  { code:"PH", name:"Filipinas",        flag:"🇵🇭", currency:"PHP", accountLabel:"GCash / Cuenta",        accountPlaceholder:"Teléfono / número cuenta" },
  { code:"ID", name:"Indonesia",        flag:"🇮🇩", currency:"IDR", accountLabel:"GoPay / OVO / Cuenta",  accountPlaceholder:"Teléfono / número cuenta" },
  { code:"VN", name:"Vietnam",          flag:"🇻🇳", currency:"VND", accountLabel:"ViettelPay / Cuenta",   accountPlaceholder:"Teléfono / número cuenta" },
  { code:"MM", name:"Myanmar",          flag:"🇲🇲", currency:"MMK", accountLabel:"Wave / KBZ Pay",        accountPlaceholder:"Teléfono" },
  { code:"IN", name:"India",            flag:"🇮🇳", currency:"INR", accountLabel:"UPI ID",                accountPlaceholder:"nombre@banco" },
  { code:"PK", name:"Pakistán",         flag:"🇵🇰", currency:"PKR", accountLabel:"IBFT / easypaisa",      accountPlaceholder:"IBAN o teléfono" },
  { code:"BD", name:"Bangladesh",       flag:"🇧🇩", currency:"BDT", accountLabel:"bKash / Cuenta",        accountPlaceholder:"Teléfono / cuenta" },
  { code:"LK", name:"Sri Lanka",        flag:"🇱🇰", currency:"LKR", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"NP", name:"Nepal",            flag:"🇳🇵", currency:"NPR", accountLabel:"eSewa / Khalti",        accountPlaceholder:"Teléfono" },

  // ── Medio Oriente ─────────────────────────────────────────────────
  { code:"AE", name:"Emiratos Árabes",  flag:"🇦🇪", currency:"AED", accountLabel:"IBAN",                  accountPlaceholder:"AE00 0000 0000..." },
  { code:"SA", name:"Arabia Saudita",   flag:"🇸🇦", currency:"SAR", accountLabel:"IBAN",                  accountPlaceholder:"SA00 0000 0000..." },
  { code:"QA", name:"Qatar",            flag:"🇶🇦", currency:"QAR", accountLabel:"IBAN",                  accountPlaceholder:"QA00 0000 0000..." },
  { code:"KW", name:"Kuwait",           flag:"🇰🇼", currency:"KWD", accountLabel:"IBAN",                  accountPlaceholder:"KW00 0000 0000..." },
  { code:"BH", name:"Bahréin",          flag:"🇧🇭", currency:"BHD", accountLabel:"IBAN",                  accountPlaceholder:"BH00 0000 0000..." },
  { code:"OM", name:"Omán",             flag:"🇴🇲", currency:"OMR", accountLabel:"IBAN",                  accountPlaceholder:"OM00 0000 0000..." },
  { code:"JO", name:"Jordania",         flag:"🇯🇴", currency:"JOD", accountLabel:"IBAN",                  accountPlaceholder:"JO00 0000 0000..." },
  { code:"LB", name:"Líbano",           flag:"🇱🇧", currency:"LBP", accountLabel:"IBAN",                  accountPlaceholder:"LB00 0000 0000..." },
  { code:"IL", name:"Israel",           flag:"🇮🇱", currency:"ILS", accountLabel:"IBAN",                  accountPlaceholder:"IL00 0000 0000..." },
  { code:"TR", name:"Turquía",          flag:"🇹🇷", currency:"TRY", accountLabel:"IBAN",                  accountPlaceholder:"TR00 0000 0000..." },

  // ── Asia Central ──────────────────────────────────────────────────
  { code:"KZ", name:"Kazajistán",       flag:"🇰🇿", currency:"KZT", accountLabel:"Kaspi / Cuenta",        accountPlaceholder:"Teléfono / cuenta" },
  { code:"UZ", name:"Uzbekistán",       flag:"🇺🇿", currency:"UZS", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"GE", name:"Georgia",          flag:"🇬🇪", currency:"GEL", accountLabel:"Número de cuenta",      accountPlaceholder:"IBAN / cuenta" },
  { code:"AM", name:"Armenia",          flag:"🇦🇲", currency:"AMD", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
  { code:"AZ", name:"Azerbaiyán",       flag:"🇦🇿", currency:"AZN", accountLabel:"IBAN",                  accountPlaceholder:"AZ00 0000 0000..." },

  // ── África ────────────────────────────────────────────────────────
  { code:"NG", name:"Nigeria",          flag:"🇳🇬", currency:"NGN", accountLabel:"NUBAN / OPay",          accountPlaceholder:"10 dígitos" },
  { code:"GH", name:"Ghana",            flag:"🇬🇭", currency:"GHS", accountLabel:"MTN MoMo / Cuenta",     accountPlaceholder:"Teléfono / cuenta" },
  { code:"KE", name:"Kenia",            flag:"🇰🇪", currency:"KES", accountLabel:"M-Pesa / Cuenta",       accountPlaceholder:"Teléfono / cuenta" },
  { code:"TZ", name:"Tanzania",         flag:"🇹🇿", currency:"TZS", accountLabel:"M-Pesa / Tigo",         accountPlaceholder:"Teléfono" },
  { code:"ZA", name:"Sudáfrica",        flag:"🇿🇦", currency:"ZAR", accountLabel:"Cuenta bancaria",       accountPlaceholder:"Número de cuenta" },
  { code:"UG", name:"Uganda",           flag:"🇺🇬", currency:"UGX", accountLabel:"Airtel / MTN",          accountPlaceholder:"Teléfono" },
  { code:"SN", name:"Senegal",          flag:"🇸🇳", currency:"XOF", accountLabel:"Orange Money / Cuenta", accountPlaceholder:"Teléfono / cuenta" },
  { code:"CI", name:"Costa de Marfil",  flag:"🇨🇮", currency:"XOF", accountLabel:"MTN / Orange Money",    accountPlaceholder:"Teléfono" },
  { code:"CM", name:"Camerún",          flag:"🇨🇲", currency:"XAF", accountLabel:"MTN / Orange Money",    accountPlaceholder:"Teléfono" },
  { code:"RW", name:"Ruanda",           flag:"🇷🇼", currency:"RWF", accountLabel:"MTN MoMo / Cuenta",     accountPlaceholder:"Teléfono / cuenta" },
  { code:"ET", name:"Etiopía",          flag:"🇪🇹", currency:"ETB", accountLabel:"Telebirr / Cuenta",     accountPlaceholder:"Teléfono / cuenta" },
  { code:"EG", name:"Egipto",           flag:"🇪🇬", currency:"EGP", accountLabel:"InstaPay / Cuenta",     accountPlaceholder:"Teléfono / cuenta" },
  { code:"MA", name:"Marruecos",        flag:"🇲🇦", currency:"MAD", accountLabel:"CIH / Cuenta",          accountPlaceholder:"RIB / número cuenta" },
  { code:"TN", name:"Túnez",            flag:"🇹🇳", currency:"TND", accountLabel:"Número de cuenta",      accountPlaceholder:"RIB tunecino" },
  { code:"DZ", name:"Argelia",          flag:"🇩🇿", currency:"DZD", accountLabel:"Número de cuenta",      accountPlaceholder:"RIB argelino" },
  { code:"ZM", name:"Zambia",           flag:"🇿🇲", currency:"ZMW", accountLabel:"MTN / Airtel Money",    accountPlaceholder:"Teléfono" },
  { code:"MZ", name:"Mozambique",       flag:"🇲🇿", currency:"MZN", accountLabel:"M-Pesa / Cuenta",       accountPlaceholder:"Teléfono / cuenta" },
  { code:"ZW", name:"Zimbabwe",         flag:"🇿🇼", currency:"ZWL", accountLabel:"EcoCash / Cuenta",      accountPlaceholder:"Teléfono / cuenta" },
  { code:"BF", name:"Burkina Faso",     flag:"🇧🇫", currency:"XOF", accountLabel:"Orange Money / Cuenta", accountPlaceholder:"Teléfono" },
  { code:"ML", name:"Mali",             flag:"🇲🇱", currency:"XOF", accountLabel:"Orange Money / Cuenta", accountPlaceholder:"Teléfono" },

  // ── Países con restricciones (visible pero con aviso) ─────────────
  { code:"RU", name:"Rusia",            flag:"🇷🇺", currency:"RUB", accountLabel:"Tarjeta MIR / SBP",     accountPlaceholder:"+7 / tarjeta 16 dígitos" },
  { code:"IR", name:"Irán",             flag:"🇮🇷", currency:"IRR", accountLabel:"Sheba",                 accountPlaceholder:"IR00 0000 0000..." },
  { code:"BY", name:"Bielorrusia",      flag:"🇧🇾", currency:"BYN", accountLabel:"Número de cuenta",      accountPlaceholder:"BY00 0000 0000..." },
  { code:"SY", name:"Siria",            flag:"🇸🇾", currency:"SYP", accountLabel:"Número de cuenta",      accountPlaceholder:"Cuenta bancaria" },
];

export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export const DEFAULT_COUNTRY = COUNTRIES.find((c) => c.code === "MX") ?? COUNTRIES[0];
