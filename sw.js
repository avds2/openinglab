const CACHE_PREFIX = "openinglab-shell-";
const CACHE_NAME = "openinglab-shell-1.0.0-dc86e3115b23f396";
const CORE_ASSETS = [
  "./assets/app-icon-192.png",
  "./assets/app-icon-512.png",
  "./assets/app-icon.svg",
  "./css/styles.css",
  "./index.html",
  "./js/app.js",
  "./js/board.js",
  "./js/lesson.js",
  "./js/openings/additional.js",
  "./js/openings/catalog.js",
  "./js/openings/explanations.js",
  "./js/openings/index.js",
  "./js/openings/schema.js",
  "./js/openings/variations.js",
  "./js/pieces.js",
  "./js/practice.js",
  "./js/pwa.js",
  "./js/quiz.js",
  "./js/storage.js",
  "./js/version.js",
  "./manifest.webmanifest"
];

const scopeURL = new URL("./", self.registration.scope);
const shellURL = new URL("./index.html", scopeURL);
const coreURLs = new Set(CORE_ASSETS.map((asset) => new URL(asset, scopeURL).href));

async function installShell() {
  const cache = await caches.open(CACHE_NAME);
  try {
    await Promise.all(
      [...coreURLs].map(async (url) => {
        const response = await fetch(new Request(url, { cache: "reload" }));
        if (!response.ok) throw new Error(`Could not cache ${url}`);
        await cache.put(url, response);
      }),
    );
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(installShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const shell = await cache.match(shellURL);
        if (shell) return shell;
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(shellURL, response.clone());
          return response;
        } catch {
          return new Response("OpeningLab is unavailable offline until its first load completes.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      }),
    );
    return;
  }

  if (!coreURLs.has(request.url)) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }),
  );
});
