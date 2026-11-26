// ASTRO CAFÉ - the offline helper. The first visit keeps a copy of the game; after that it starts even with no internet.
// The page itself is always fetched fresh when there IS internet, so every new version arrives straight away.
const CACHE = "astro-cafe-v1.8.68";
// (v1.8.57) THE MUSIC KEEPS ITS OWN SHELF: the songs (up to ~48 MB) were saved in the versioned cache and thrown away with
// every update - an offline player lost them until each was played online again. They live in a cache of their own now
const MUSIC = "astro-cafe-music";
// (v1.8.57: "./" was listed too - the 4 MB page was stored twice, and only ./index.html is ever read)
const CORE = ["./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      // (v1.8.57: only the game's own old caches - every GitHub Pages site of the owner shares this address, and the
      //  other sites' caches were deleted too; the music shelf is kept)
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("astro-cafe-") && k !== CACHE && k !== MUSIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    // the game page: the newest from the internet, or the saved copy when offline
    // (v1.8.57: "no-cache" asks the server whether it changed - GitHub lets browsers reuse the page for 10 minutes, so
    //  a new version took that long to show; and with a weak signal the saved copy is shown after 4 seconds instead of a
    //  blank screen while 4 MB crawl in - the fresh one is still saved for next time)
    const fresh = fetch(req.url, { cache: "no-cache" }).then((r) => {
      // (v1.8.57: only a good page is kept - a 404 or a server error used to replace the offline copy)
      if (r && r.ok) {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put("./index.html", copy));
      }
      return r;
    });
    e.respondWith(
      Promise.race([
        fresh.catch(() => caches.match("./index.html")),
        new Promise((res) => setTimeout(() => caches.match("./index.html").then((hit) => hit && res(hit)), 4000)),
      ])
    );
    return;
  }
  const music = /\/music\//.test(req.url);
  // everything else (icons, the fonts): the saved copy first, kept fresh in the background
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((r) => {
          if (r && (r.ok || r.type === "opaque")) {
            const copy = r.clone();
            caches.open(music ? MUSIC : CACHE).then((c) => c.put(req, copy)); // (v1.8.57: the songs on their own shelf)
          }
          return r;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
