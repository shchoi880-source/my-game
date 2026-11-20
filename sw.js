// 오프라인 캐시: 게임 파일을 기기에 저장해 인터넷 없이 실행되게 함.
// 파일을 수정해서 올릴 때마다 VERSION 숫자를 올려 주세요.
const VERSION = 'nd-13';
const CACHE = 'neondash-' + VERSION;
const SFX = ['back', 'bigboom', 'book', 'chop', 'click', 'coin', 'confirm', 'door', 'draw', 'equip', 'error', 'explode', 'fire', 'gold', 'hit', 'hurt', 'kill', 'laser', 'latch', 'open', 'page', 'potion', 'shield', 'slash', 'slash2', 'step'];
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './js/core.js', './js/audio.js', './js/levels.js', './js/gems.js','./js/engine.js', './js/render.js', './js/screens.js', './js/main.js',
  './assets/fx.png', './assets/fx.json', './assets/kenney-future.ttf',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-192.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon-180.png',
].concat(SFX.map(n => './assets/sfx/' + n + '.ogg'));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 캐시 먼저 보여주고, 인터넷이 되면 뒤에서 새 버전으로 갱신
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request, { ignoreSearch: true }).then(cached => {
        const net = fetch(e.request, { cache: 'no-cache' })
          .then(res => { if (res && res.ok) cache.put(e.request, res.clone()); return res; })
          .catch(() => cached || cache.match('./index.html'));
        return cached || net;
      })
    )
  );
});
