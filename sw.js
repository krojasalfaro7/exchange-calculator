// Service worker lite: cachea el app shell para que abra al instante y funcione sin conexión.
// Las tasas en vivo siguen intentando red-primero; todo lo demás es cache-first.

const CACHE = "calc-bs-v16";
const SHELL = [
  "./",
  "./index.html",
  "./calc.js",
  "./rates.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    // cache: "reload" para no guardar copias viejas del cache HTTP del navegador.
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Tasas (dolarapi y nuestro rates.json): siempre a la red, nunca del cache del SW.
  // Sin red, la app usa las tasas que guardó en localStorage.
  // ?fresh= lo usa la app para leer la versión publicada sin pasar por este cache.
  if (url.hostname !== self.location.hostname || url.pathname.endsWith("/rates.json") || url.searchParams.has("fresh")) {
    return;
  }

  // App shell: cache primero, red de respaldo
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => cached);
    })
  );
});
