// 오프라인 캐시: 게임 파일을 기기에 저장해 인터넷 없이 실행되게 함.
// 파일을 수정해서 올릴 때마다 VERSION 숫자를 올려 주세요.
const VERSION = 'v5';
const CACHE = 'mdef-' + VERSION;
const SFX = ['shoot_pistol', 'shoot_smg', 'shoot_rifle', 'shoot_shotgun', 'hit', 'kill', 'kill2', 'explode', 'explode2', 'bigboom', 'crate', 'hurt', 'slam', 'shield', 'laser', 'fire', 'good', 'bad', 'click', 'back', 'open', 'confirm', 'error', 'coin', 'select', 'metal'];
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/core.js', './js/data.js', './js/audio.js', './js/battle.js', './js/ui.js', './js/main.js',
  './assets/main.png', './assets/main.json',
  './assets/monsters.png', './assets/monsters.json',
  './assets/fx.png', './assets/fx.json',
  './assets/kenney-future.ttf',
  './icons/icon-192.png', './icons/icon-512.png',
].concat(SFX.map(n => './assets/sfx/' + n + '.ogg'));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('mdef-') && k !== CACHE).map(k => caches.delete(k))))
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
