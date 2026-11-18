// Flow Produtividade — service worker
// Rede primeiro para o "casco" do app (HTML/JS/CSS/ícones), cache como reserva offline.
// Chamadas de API nunca passam pelo cache.
const CACHE = 'flow-shell-v1';
const SHELL = [
  '/', '/app', '/manifest.webmanifest',
  '/js/date.js', '/js/auth.js', '/js/core.js', '/js/timer.js', '/js/tasks.js',
  '/js/goals.js', '/js/analytics.js', '/js/review.js', '/js/areas.js', '/js/integrations.js',
  '/icons/icon-192.png', '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        // /app.html e /index.html são servidos pelo Pages como /app e /
        const clean = url.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
        return caches.match(clean);
      })
  );
});
