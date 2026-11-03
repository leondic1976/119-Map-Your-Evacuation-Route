/*
 * 우리집 대피지도 V2 — 서비스 워커 (설계서 §12). tools/make-sw.ts 가 이 틀로 dist/sw.js 를 만든다.
 *
 *   설치     화면·글꼴·그림을 받아 둔다. 음성은 활성화 뒤 뒤에서 네 개씩 받는다.
 *   요청     문서는 인터넷 먼저(3초 안에 오지 않거나 인터넷이 없으면 저장본), 나머지는 저장본 먼저다.
 *            그래서 인터넷이 있으면 새 판이 바로 보인다.
 *   갱신     새 워커는 열린 화면이 모두 닫힌 뒤에 넘어간다. 그리던 도중에 저장본을 지우지 않기 위해서다.
 */
const CACHE = '__CACHE_NAME__';
const PRECACHE = __PRECACHE__;
const VOICE = __VOICE__;
const HOME = new URL('./', self.location).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('hem2-') && key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'warm-voice') event.waitUntil(warmVoice());
});

let warming = null;
function warmVoice() {
  if (warming) return warming;
  warming = (async () => {
    const cache = await caches.open(CACHE);
    for (let i = 0; i < VOICE.length; i += 4) {
      await Promise.all(
        VOICE.slice(i, i + 4).map(async (url) => {
          if (await cache.match(url)) return;
          try {
            const response = await fetch(url);
            if (response.status === 200) await cache.put(url, response);
          } catch {
            /* 다음에 열 때 다시 받는다 */
          }
        }),
      );
    }
    warming = null;
  })();
  return warming;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(HOME)) return;
  event.respondWith(request.mode === 'navigate' ? navigate(request) : cacheFirst(request));
});

async function navigate(request) {
  const cache = await caches.open(CACHE);
  const fresh = await Promise.race([
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (response.status === 200) cache.put(HOME, response.clone());
        return response.ok ? response : null;
      })
      .catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
  return fresh || (await cache.match(HOME)) || Response.error();
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) {
    const range = request.headers.get('range');
    return range ? partOf(hit, range) : hit;
  }
  try {
    const response = await fetch(request);
    if (response.status === 200 && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

/* 태블릿 브라우저는 음성을 조각으로 달라고 한다. 저장본 통째로 답하면 재생하지 못한다 */
async function partOf(response, range) {
  const match = /bytes=(\d+)-(\d*)/.exec(range);
  if (!match) return response;
  const body = await response.arrayBuffer();
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), body.byteLength - 1) : body.byteLength - 1;
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${body.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
