/*
 * 사이트 뿌리의 서비스 워커 (설계서 §12). 배포 때 이전 판의 sw.js 자리에 들어간다.
 *
 * 이전 판을 열어 본 브라우저에는 옛 워커와 옛 화면 저장본이 남아 있다. 이 워커가 곧바로 넘겨받아
 * 옛 저장본을 지우고, 첫 페이지(V2 로 넘기는 페이지)만 저장해 둔다. 그래서 인터넷이 없어도
 * 기본 주소를 열면 V2 로 간다. V2 는 자기 워커(`V2/sw.js`)로 열린다.
 */
const CACHE = 'hem-root';
const HOME = new URL('./', self.location).href;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(HOME)));
});

self.addEventListener('activate', (event) => {
  const ready = (async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('hem-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })();
  event.waitUntil(ready);
  /*
   * 옛 화면이 첫 페이지에 떠 있으면 V2 로 넘긴다. waitUntil 안에서 기다리면 안 된다 —
   * 이동 요청은 활성화가 끝나야 이 워커에 닿으므로 서로 기다리다 멈춘다.
   */
  ready
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then((windows) => Promise.all(windows.filter((client) => isHome(client.url)).map((client) => client.navigate(client.url).catch(() => null))))
    .catch(() => null);
});

function isHome(href) {
  const url = new URL(href);
  return `${url.origin}${url.pathname}` === HOME;
}

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || !isHome(event.request.url)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const fresh = await Promise.race([
        fetch(event.request, { cache: 'no-cache' })
          .then((response) => (response.ok ? response : null))
          .catch(() => null),
        new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (fresh) {
        cache.put(HOME, fresh.clone());
        return fresh;
      }
      return (await cache.match(HOME)) || Response.error();
    })(),
  );
});
