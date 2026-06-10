// OmniPay Service Worker — cache mínimo para instalación PWA
// No cachea rutas de API ni webhooks (siempre deben ir a la red)

const CACHE = "omnipay-v1";
const SHELL  = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Nunca interceptar: APIs, webhooks, Stripe
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname !== self.location.hostname
  ) {
    return;
  }

  // Navegación → red primero, fallback al shell cacheado
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/"))
    );
    return;
  }

  // Assets estáticos → cache first
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached ?? fetch(e.request)
    )
  );
});
