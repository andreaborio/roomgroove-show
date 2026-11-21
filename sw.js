'use strict';

const prefix = 'roomgroove:' + new URL(self.registration.scope).pathname + ':';
const cacheName = prefix + 'v1';
const files = ['index.html', 'room-audio.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const assetPaths = new Set(files.map(file => new URL(file, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const page = event.request.mode === 'navigate';
  if (!page && !assetPaths.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const key = page ? 'index.html' : url.pathname;
    try {
      const response = await fetch(event.request);
      if (response.ok && (!page || url.pathname === new URL(self.registration.scope).pathname || url.pathname.endsWith('/index.html'))) {
        await cache.put(key, response.clone());
      }
      return response;
    } catch (error) {
      const saved = await cache.match(key);
      if (saved) return saved;
      throw error;
    }
  })());
});
