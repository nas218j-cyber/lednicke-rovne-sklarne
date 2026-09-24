const CACHE = "sklo-lr-v3";
const PHOTO_CACHE = "sklo-lr-photos-v1";
const PHOTO_CACHE_MAX = 400; // strop na počet uložených fotiek (thumb + plná verzia)
const ASSETS = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(ASSETS.map((a) => fetch(a, { cache: "reload" }).then((r) => cache.put(a, r))))
    ).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== PHOTO_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function trimPhotoCache(cache) {
  cache.keys().then((keys) => {
    if (keys.length > PHOTO_CACHE_MAX) {
      const toDelete = keys.slice(0, keys.length - PHOTO_CACHE_MAX);
      toDelete.forEach((req) => cache.delete(req));
    }
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Fotky z Cloudinary: cache-first, nech fungujú aj offline po prvom zobrazení.
  // Odpoveď na <img> request cez cudziu doménu je "opaque" (status 0, ok:false),
  // ale stále sa dá bezpečne uložiť do Cache Storage a znova prehrať.
  if (url.hostname === "res.cloudinary.com") {
    event.respondWith(
      caches.open(PHOTO_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          const network = fetch(event.request)
            .then((response) => {
              if (response && (response.ok || response.type === "opaque")) {
                cache.put(event.request, response.clone());
                trimPhotoCache(cache);
              }
              return response;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return; // never intercept YouTube/external links

  // Vlastné súbory appky (index.html a pod.): najprv skús sieť a to skutočne
  // vždy najnovšiu verziu (cache: "reload" obchádza aj bežnú HTTP cache
  // prehliadača, nielen Cache Storage service workera) — nech používateľ vždy
  // vidí najnovší obsah, keď je online. Cache slúži len ako záloha pre offline
  // režim alebo keď sieť/požiadavka zlyhá (napr. slabé pripojenie).
  event.respondWith(
    fetch(event.request, { cache: "reload" })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
