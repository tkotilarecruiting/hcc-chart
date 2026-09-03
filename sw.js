// HCC Chart offline keeper — network-first for the app, with an instant
// offline fallback so it still works with no WiFi at the field.
//
// Strategy:
//   • Opening the app tries the network first (so a WiFi open always loads the
//     newest version on the FIRST open), but races a 3s timeout — if there's no
//     signal or it's flaky, it serves the cached app immediately. No hang.
//   • With no network, fetch fails fast and the cached app is served instantly.
//   • Static files are cache-first so they load offline too.
//
// The cache version is bumped automatically on each deploy (deploy_chart.py).
const CACHE = "hcc-chart-v11";
const SHELL = ["./index.html", "./manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // App navigation (opening the app): network-first with a 3s timeout, then
  // fall back to the cached app. Guarantees a fast open even with no/weak WiFi.
  if (req.mode === "navigate") {
    const network = fetch(req)
      .then((resp) => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
        }
        return resp;
      })
      .catch(() => null);                       // offline → resolve null, no throw
    const timeout = new Promise((r) => setTimeout(() => r(null), 3000));
    e.respondWith(
      Promise.race([network, timeout]).then(
        (resp) => resp || caches.match("./index.html")
      )
    );
    return;
  }

  // Everything else: cache-first, then network, caching successes.
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && req.url.startsWith(self.location.origin)) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => cached);
    })
  );
});
