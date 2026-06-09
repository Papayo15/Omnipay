import { redirect } from "next/navigation";

// Ruta obsoleta — redirige a la One-Page App preservando el token del link
// para que links /pagar?t=...&s=... compartidos antes de este deploy sigan funcionando.
export default async function PagarPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (typeof params.t    === "string") qs.set("t",    params.t);
  if (typeof params.s    === "string") qs.set("s",    params.s);
  if (typeof params.type === "string") qs.set("type", params.type);
  const query = qs.toString();
  redirect(query ? `/?${query}` : "/");
}
