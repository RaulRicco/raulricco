// Ricco Orçamento — service worker
// Rede primeiro; cópia local só como reserva para abrir o app sem internet.
// Só guarda respostas 200 (a tela de login sem sessão vem como 401 e nunca é guardada).
// Os dados (/api/fin/*) ficam fora do escopo deste worker e sempre vêm do servidor.
const CACHE = 'fin-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fin-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.status === 200 && !res.redirected) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || Response.error())
  );
});
