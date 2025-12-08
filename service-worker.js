const CACHE_NAME = "bible-reader-v1";
const OFFLINE_URL = "/index.html";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png"
];

// On install -> cache core
self.addEventListener("install", evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// On activate -> cleanup old caches
self.addEventListener("activate", evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
    ).then(()=> self.clients.claim())
  );
});

// On fetch -> try cache, then network, fallback to offline page
self.addEventListener("fetch", evt => {
  if (evt.request.method !== "GET") return;
  const req = evt.request;
  // For cross-origin requests (CDN JSONs) prefer network but cache when possible
  const isSameOrigin = new URL(req.url).origin === self.location.origin;
  if (!isSameOrigin) {
    evt.respondWith(
      fetch(req).then(res => {
        // optional: cache CDN JSON responses (if you want)
        return res;
      }).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  evt.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(OFFLINE_URL));
    })
  );
});
