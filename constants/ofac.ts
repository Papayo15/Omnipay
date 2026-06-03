// Lista de países bajo sanciones OFAC que requieren bloqueo total
// Fuente: https://ofac.treasury.gov/sanctions-programs-and-country-information
export const OFAC_BLOCKED: Set<string> = new Set([
  "KP", // Corea del Norte
  "IR", // Irán
  "SY", // Siria
  "CU", // Cuba
  "SD", // Sudán
  "MM", // Myanmar/Birmania
  "BY", // Bielorrusia (sanciones EU)
  "LY", // Libia
  "SO", // Somalia
  "YE", // Yemen
  "CF", // República Centroafricana
  "SS", // Sudán del Sur
  "ZW", // Zimbabwe (listas restrictivas)
]);

export function isOFACBlocked(countryCode: string): boolean {
  return OFAC_BLOCKED.has(countryCode.toUpperCase());
}
