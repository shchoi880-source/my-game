// 오프라인 캐시. 파일을 고쳐 올릴 때마다 VERSION 을 올려 주세요.
// 같은 출처(shchoi880-source.github.io)를 NEON JUMP(neonjump-*/neondash-*)와 함께 쓰므로
// 정리할 때는 반드시 이 게임의 캐시(zerosignal-*, 옛 이름 zero-signal-*)만 지운다.
const VERSION = 'zs-111';
const CACHE = 'zerosignal-' + VERSION;
const OWN = /^(zerosignal|zero-signal)-/;
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png',
  './js/core.js',
  './js/audio.js',
  './js/patterns.js',
  './js/engine.js',
  './js/run.js',
  './js/render.js',
  './js/screens.js',
  './js/main.js',
];
self.addEventListener('install', (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then(async (c) => {
        for (const url of CORE)
          try {
            const res = await fetch(url, { cache: 'reload' });
            if (res.ok) await c.put(url, res);
          } catch (err) {
            console.warn('cache skip', url, err);
          }
      })
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && OWN.test(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  ),
);
// 캐시를 먼저 보여주고, 인터넷이 되면 뒤에서 새 버전으로 갱신 (?v= 가 바뀌어도 ignoreSearch 로 적중)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((cached) => {
        const net = fetch(req, { cache: 'no-cache' })
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => cached || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error()));
        if (cached) e.waitUntil(net.catch(() => {}));
        return cached || net;
      }),
    ),
  );
});
