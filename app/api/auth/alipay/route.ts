export const runtime = "edge";

export async function POST() {
  try {
    // Alipay+ usa autenticación por firma RSA en cada request
    // Aquí retornamos la configuración pública que el cliente necesita
    return Response.json({
      app_id: process.env.ALIPAY_APP_ID ?? "",
      // La clave privada NUNCA sale del servidor
      ready: !!(process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY),
    });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
