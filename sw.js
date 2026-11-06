// Guarda la app en el celular para que abra sin señal.
const APP = 'app-v1';
const FOTOS = 'fotos-v1';
const ARCHIVOS = ['./', 'index.html', 'app.js', 'manifest.json', 'icono.png', 'articulos.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== FOTOS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // La prueba de conexión y la lista de precios van siempre a internet; la app decide qué hacer si no hay.
  if (url.pathname.endsWith('ping.txt') || url.pathname.endsWith('articulos.json')) return;
  if (url.pathname.includes('/fotos/')) {
    e.respondWith(caches.open(FOTOS).then(c => c.match(e.request).then(r => r || fetch(e.request))));
    return;
  }
  // Pantallas de la app: primero lo guardado; con señal se refresca para la próxima vez.
  e.respondWith(caches.open(APP).then(c => c.match(e.request, { ignoreSearch: true }).then(r => {
    const red = fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => r);
    return r || red;
  })));
});
