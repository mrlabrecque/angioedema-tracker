/*
 * Service worker: caches the static app shell ONLY.
 *
 * Privacy rules (do not relax):
 *  - Cross-origin requests (the API on workers.dev) are never intercepted, so health
 *    records and authenticated responses are never cached.
 *  - Requests carrying an Authorization header are never cached.
 *  - Page URLs are cached without their query string, so episode ids are not stored.
 *  - Only GET requests for same-origin static files are handled.
 */
const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const SCOPE = new URL(self.registration.scope);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.addAll([SCOPE.href, `${SCOPE.href}manifest.webmanifest`, `${SCOPE.href}icons/icon-192.png`]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStaticAsset = (p) => p.includes("/_next/static/") || /\.(png|svg|ico|webmanifest|woff2?)$/.test(p);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("authorization")) return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  if (req.mode === "navigate") {
    // Network first so updates show up; fall back to the cached shell when offline.
    const key = url.origin + url.pathname;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(key)) || (await caches.match(SCOPE.href)) || Response.error()),
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
