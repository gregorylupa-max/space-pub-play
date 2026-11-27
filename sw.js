// ASTRO CAFÉ - the offline helper. The first visit keeps a copy of the game; after that it starts even with no internet.
// The page itself is always fetched fresh when there IS internet, so every new version arrives straight away.
const CACHE = "astro-cafe-v2.0.9";
// (v1.8.57) THE MUSIC KEEPS ITS OWN SHELF: the songs (up to ~48 MB) were saved in the versioned cache and thrown away with
// every update - an offline player lost them until each was played online again. They live in a cache of their own now
const MUSIC = "astro-cafe-music";
// (v1.8.57: "./" was listed too - the 4 MB page was stored twice, and only ./index.html is ever read)
// (v1.8.94: the page itself is saved from "./" in install below, so ./index.html isn't listed here any more)
const CORE = ["./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];
// (v1.8.94) the game's fonts, saved on the first visit - they were only saved when seen loading, and on the first
// visit they load before this helper is there, so a first-visit-then-offline player got plain fonts
const FONTS =
  "https://fonts.googleapis.com/css2?family=Bungee&family=Press+Start+2P&family=Chakra+Petch:wght@500;600;700&display=swap";
self.addEventListener("install", (e) => {
  // (v1.8.94) FRESH, AND ONLY ONCE: the files were taken from the browser's own 10-minute store, so after an update the
  // offline copy could be the OLD page; and the page was downloaded twice on a first visit ("./" for the visit,
  // ./index.html here - two addresses). Now the page comes from "./" asked with "no-cache": the server answers
  // "not changed" for the copy just loaded (no second 4 MB), or sends the new one
  e.waitUntil(
    caches
      .open(CACHE)
      .then(async (c) => {
        const pg = await fetch("./", { cache: "no-cache" });
        if (pg && pg.ok) await c.put("./index.html", pg);
        else await c.add(new Request("./index.html", { cache: "no-cache" }));
        await c.addAll(CORE.map((u) => new Request(u, { cache: "no-cache" })));
        try {
          const css = await fetch(FONTS, { mode: "cors" });
          if (css.ok) {
            const txt = await css.clone().text();
            await c.put(FONTS, css);
            const urls = [...txt.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
            await Promise.all(
              urls.map((u) =>
                fetch(u, { mode: "cors" })
                  .then((r) => r.ok && c.put(u, r))
                  .catch(() => {})
              )
            );
          }
        } catch (err) {} // (no fonts saved - they still come the old way, on a later visit)
      })
      .then(() => self.skipWaiting())
  );
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
  // (v1.9.6: only the game page itself - opening README.md or a song file in the tab saved THAT as the offline game,
  //  and offline the game's address showed it instead; other pages simply load from the internet)
  if (req.mode === "navigate" && !/\/(index\.html)?$/.test(new URL(req.url).pathname)) return;
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
      // (v1.8.98: a song already saved is played from the shelf, not downloaded again each time - up to 48 MB of a
      //  phone's data; the songs don't change between versions)
      if (music && hit) return hit;
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
