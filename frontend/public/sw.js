const CACHE_NAME = "fazenda-mais-static-v3";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/pwa-leaf-v2-192x192.png",
  "/pwa-leaf-v2-512x512.png",
  "/pwa-leaf-v2-maskable-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cacheKey = new Request(url.pathname, { headers: request.headers });
        const cached = await cache.match(request, { ignoreSearch: true });

        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              cache.put(cacheKey, response.clone());
            }
            return response;
          })
          .catch(() => (cached ? cached.clone() : caches.match(OFFLINE_URL)));

        if (cached) {
          // Entrega o shell salvo na hora e revalida em segundo plano.
          event.waitUntil(network.then(() => undefined));
          return cached;
        }
        return network;
      })(),
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname);

  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});