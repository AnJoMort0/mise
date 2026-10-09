const VERSION = "mise-pwa-v31";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const LUCIDE_URL = "https://unpkg.com/lucide@1.47.0";
const QRCODE_URL = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";

const APP_SHELL = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./assets/icons/favicon.svg",
    "./assets/icons/icon-180.png",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png",
    "./src/css/styles.css",
    "./src/js/runtime.js",
    "./src/js/icons.js",
    "./src/js/data.js",
    "./src/js/logic.js",
    "./src/js/app.js",
    "./src/js/pwa.js"
];

const scoped = path => new URL(path, self.registration.scope).href;

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        await cache.addAll(APP_SHELL.map(scoped));

        /* Warm Lucide when possible, but do not fail installation if the CDN
           is temporarily unavailable. */
        for (const url of [LUCIDE_URL, QRCODE_URL]) {
            try {
                const response = await fetch(url, { mode: "cors" });
                if (response.ok) await cache.put(url, response.clone());
            }
            catch { }
        }

        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => !keep.has(key)).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    /* Pinned UI libraries: cache-first after the first successful request. */
    if (request.url === LUCIDE_URL || request.url === QRCODE_URL || (url.origin === "https://unpkg.com" && url.pathname.startsWith("/lucide@1.47.0")) || (url.origin === "https://cdnjs.cloudflare.com" && url.pathname.endsWith("/qrcodejs/1.0.0/qrcode.min.js"))) {
        event.respondWith((async () => {
            const cached = await caches.match(request) || await caches.match(LUCIDE_URL);
            if (cached) return cached;
            const response = await fetch(request);
            const cache = await caches.open(RUNTIME_CACHE);
            await cache.put(request, response.clone());
            return response;
        })());
        return;
    }

    if (url.origin !== self.location.origin) return;

    /* Navigations prefer fresh HTML, with the cached app shell as fallback. */
    if (request.mode === "navigate") {
        event.respondWith((async () => {
            try {
                const response = await fetch(request, { cache: "no-store" });
                const cache = await caches.open(RUNTIME_CACHE);
                await cache.put(scoped("./index.html"), response.clone());
                return response;
            }
            catch {
                return await caches.match(scoped("./index.html")) || await caches.match(scoped("./"));
            }
        })());
        return;
    }

    /* Static files prefer the network so deployments update promptly, then
       fall back to cache if the device is offline. */
    event.respondWith((async () => {
        try {
            const response = await fetch(request, { cache: "no-store" });
            if (response.ok) {
                const cache = await caches.open(RUNTIME_CACHE);
                await cache.put(request, response.clone());
            }
            return response;
        }
        catch {
            return await caches.match(request);
        }
    })());
});
