// Wayfarer's service worker: keeps a copy of the whole game on the device so it opens instantly and plays offline.
// The build fills in VERSION (a hash of every game file) and FILES; a new deploy therefore installs a new cache
// and removes the old one.
const VERSION = 'dev';
const FILES = ['./'];
const CACHE = 'wayfarer-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('wayfarer-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(cache => cache.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request))));
});
