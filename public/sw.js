// Nano Lab service worker: keeps the app shell available offline.
// Model weights are NOT handled here; the model libraries keep those in their own caches.
const CACHE = 'nano-lab-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('nano-lab-shell-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const runtimeCdn = url.hostname === 'cdn.jsdelivr.net'; // model runtimes for the image and video pipelines
  if (!sameOrigin && !runtimeCdn) return;
  // the page itself: prefer fresh, fall back to the cached copy when offline
  if (sameOrigin && (request.mode === 'navigate' || !/\/assets\//.test(url.pathname))) {
    event.respondWith(networkFirst(request));
    return;
  }
  // hashed build assets and versioned CDN files never change
  event.respondWith(cacheFirst(request));
});
