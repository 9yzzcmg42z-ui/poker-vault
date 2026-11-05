// Poker Vault service worker.
// Bump VERSION whenever you want every device to drop its old cache.
const VERSION = "pv-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// Relative paths so this works under /poker-vault/ on GitHub Pages.
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never touch writes, or anything from Supabase (data, auth, realtime).
  if (request.method !== "GET") return;
  if (url.hostname.endsWith("supabase.co")) return;

  // Page loads: network first so new deploys show up, cache as the offline fallback.
  // ignoreSearch lets invite links like ?join=ABC123 still find the cached page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match("./index.html", { ignoreSearch: true })) ||
            (await cache.match("./"))
          );
        }),
    );
    return;
  }

  // Own files, the Supabase/QR scripts from esm.sh, and Google Fonts:
  // serve from cache instantly and refresh in the background.
  const cacheable =
    url.origin === self.location.origin ||
    url.hostname === "esm.sh" ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com";

  if (!cacheable) return;

  event.respondWith(
    caches.open(RUNTIME_CACHE).then(async (cache) => {
      const cached = await cache.match(request);

      const refresh = fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === "opaque")) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);

      return cached || refresh;
    }),
  );
});
