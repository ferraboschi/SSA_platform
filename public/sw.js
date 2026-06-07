/* SSA Platform — service worker.
 *
 * Deliberately NON-CACHING for app assets/navigations: we had stale-chunk
 * ("This page couldn't load") issues after frequent deploys, and an aggressive
 * precache would bring them back. So this SW only:
 *   1. satisfies PWA installability (manifest + registered SW),
 *   2. provides a tiny offline fallback page for navigations,
 *   3. handles Web Push notifications (showNotification) + notificationclick.
 * Everything else passes straight through to the network.
 *
 * Bump CACHE_VERSION whenever offline.html changes.
 */
const CACHE_VERSION = "ssa-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.add(OFFLINE_URL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop old offline caches.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Network-first ONLY for top-level navigations, with the offline page as a
// fallback. Assets (JS/CSS/images) are never intercepted → no stale chunks.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(CACHE_VERSION);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      }
    })(),
  );
});

// ---- Web Push ----
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Sake Sommelier Association";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag,
    data: { url: payload.url || "/dashboard" },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});
