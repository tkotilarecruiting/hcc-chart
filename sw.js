// HCC Chart offline keeper — cache-first so the app opens with no internet,
// background-refresh so updates arrive when internet happens to exist.
const CACHE = "hcc-chart-v8";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) =>
    c.addAll(["./index.html", "./manifest.json"])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match("./index.html").then((cached) => {
        const refresh = fetch(req).then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put("./index.html", copy));
          }
          return resp;
        }).catch(() => cached);
        return cached || refresh;
      }));
    return;
  }
  e.respondWith(
    caches.match(req).then((cached) => cached ||
      fetch(req).then((resp) => {
        if (resp && resp.status === 200 && req.url.startsWith(self.location.origin)) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return resp;
      })));
});
