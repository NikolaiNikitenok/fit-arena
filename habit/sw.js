// Кэш для работы без сети и показ уведомлений.
const CACHE = 'svoboda-v12';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'data.js', 'phrases.js', 'util.js', 'store.js', 'activities.js', 'share.js', 'cloud.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'arena.png', 'match3.js', 'm3engine.js', 'settings.js', 'm3sound.js', 'garden.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Сначала сеть (чтобы обновления приходили сразу), без сети — из кэша.
// cache: 'no-cache' — сверяемся с сервером, иначе браузер отдаёт старые файлы из своего HTTP-кэша.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' })
      .then((res) => {
        // Возврат из Nikitenok ID (/?code=…) не кэшируем: одноразовые адреса.
        if (!new URL(e.request.url).search) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow('./');
    }),
  );
});
