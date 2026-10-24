/* Mercenary Tales PWA – network first; story content is updated independently of build version. */
const CACHE_NAME = 'mercenary-tales-online-v062';
const CACHE_PREFIX = 'mercenary-tales-online-';
const SHELL = ['./', './index.html', './styles.css', './js/app.js', './js/game-storage.js', './js/pwa-update.js', './manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(SHELL.map(async url => {
      const request = new Request(new URL(url, self.registration.scope), {cache: 'reload'});
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/editor/') || url.pathname.includes('/api/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Do not trust HTTP cache for new stories, modified world.json, graphics or app scripts.
      const response = await fetch(request, {cache: 'no-store'});
      if (response.ok && response.type === 'basic') {
        try { await cache.put(request, response.clone()); } catch (e) { console.warn('PWA cache write:', e); }
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request, {ignoreSearch: true});
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await cache.match(new URL('./index.html', self.registration.scope));
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
