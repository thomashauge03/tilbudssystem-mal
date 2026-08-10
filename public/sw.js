// Minimal service worker – gjør appen installerbar (PWA) på iOS og Android.
// Holder seg unna caching av API/HTML for å unngå at brukeren ser utdaterte data;
// nettverk-først, med fallback bare når man er offline.
const CACHE = "tilbud-shell-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add("/logo.png").catch(() => {}))
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
  if (req.method !== "GET") return;

  // Sider (navigasjoner) og API: ALLTID rett til nett — aldri server en
  // utdatert mellomlagret HTML-versjon. Dette unngår "lokalt lagret versjon".
  if (req.mode === "navigate" || !req.url.startsWith(self.location.origin)) {
    return; // la nettleseren håndtere det normalt
  }

  // Statiske ressurser (js/css/bilde): nettverk-først med cache som offline-fallback.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
