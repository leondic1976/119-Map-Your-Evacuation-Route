/*
 * 이전 판의 저장본을 지우는 워커 (대장 #132). 이 앱은 웹에서 화면을 저장해 두지 않는다.
 *
 * 예전에 이 사이트를 연 브라우저에는 옛 워커와 저장본이 남아 있고, 브라우저는 그 워커를 이 파일로 새로 받는다.
 * 곧바로 넘겨받아 저장본을 지우고 스스로 물러난 뒤, 열려 있는 화면을 다시 연다. 요청은 가로채지 않는다.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  const done = (async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('hem')).map((key) => caches.delete(key)));
    await self.clients.claim();
    await self.registration.unregister();
  })();
  event.waitUntil(done);
  /* 이동 요청은 활성화가 끝나야 닿으므로 waitUntil 안에서 기다리지 않는다 */
  done
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then((windows) => Promise.all(windows.map((client) => client.navigate(client.url).catch(() => null))))
    .catch(() => null);
});
