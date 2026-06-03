import { isOFACBlocked } from "@/constants/ofac";

interface IPInfoResponse {
  country: string;
  ip: string;
}

// Detecta el país del usuario por IP (usando IPInfo — plan gratuito 50k req/mes)
export async function detectCountry(): Promise<string> {
  try {
    const token = process.env.NEXT_PUBLIC_IPINFO_TOKEN;
    const url = token
      ? `https://ipinfo.io/json?token=${token}`
      : "https://ipinfo.io/json";
    const res = await fetch(url, { cache: "no-store" });
    const data: IPInfoResponse = await res.json();
    return data.country?.toUpperCase() ?? "MX";
  } catch {
    return "MX"; // fallback
  }
}

// Verifica si el usuario está en un país bloqueado por OFAC
export async function checkOFAC(): Promise<{ blocked: boolean; country: string }> {
  const country = await detectCountry();
  return { blocked: isOFACBlocked(country), country };
}
