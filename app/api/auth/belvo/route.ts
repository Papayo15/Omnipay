import { buildAuthHeaders, getBaseURL } from "@/lib/rails/router";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const { institution } = await request.json() as { institution?: string };

    const base = getBaseURL("belvo");
    const headers = buildAuthHeaders("belvo");

    // Crear sesión de acceso a institución bancaria en Belvo
    const res = await fetch(`${base}/api/links/`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        institution: institution ?? "banamex_mx_retail",
        access_mode: "single",
      }),
    });

    const data = await res.json() as { access: string; id: string };
    if (!res.ok) {
      return Response.json({ error: "No se pudo crear sesión bancaria" }, { status: 400 });
    }

    // Retornamos el token compacto (primeros 12 chars del ID)
    return Response.json({ token: data.id.slice(0, 12), session: data.access });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
