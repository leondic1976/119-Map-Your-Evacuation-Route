/*
 * 우리집 대피지도 — 서비스 워커 (설계서 v1.18 §5.1).
 *
 * tools/pack.ts 가 이 틀에 선캐시 목록·음성 목록·캐시 이름·범위를 넣어 out/sw.js 로 만든다.
 * public/ 에 고정 파일로 두지 않는 이유는 기준 경로(BASE_PATH)와 묶음 파일 이름이 빌드마다 다르기 때문이다.
 *
 *   설치     앱 껍데기(HTML·CSS·JS·아이콘·그림·음성 매니페스트)를 받아 둔다. 실패하면 설치하지 않는다.
 *   활성화   지난 판 캐시를 지우고, MP3 를 배경에서 4개씩 받아 둔다. 끊겨도 앱은 이미 돈다.
 *   요청     같은 범위 안의 GET 만 다룬다. 문서는 캐시 우선·배경 갱신, 나머지는 캐시 우선이다.
 *            꾸러미 ZIP 은 캐시하지 않는다.
 *   갱신     새 판은 화면이 `skip-waiting` 을 보낼 때만 넘어간다 — 그리던 도중에 바뀌지 않게.
 */
const CACHE = '__CACHE_NAME__';
const SCOPE = '__SCOPE__';
const PRECACHE = __PRECACHE__;
const VOICE = __VOICE__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('hem-') && key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
      warmVoice();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
  if (event.data === 'warm-voice') warmVoice();
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
            const response = await fetch(url, { cache: 'no-cache' });
            if (response.ok) await cache.put(url, response);
          } catch {
            /* 다음 재생 때 다시 받는다 */
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
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  if (url.pathname.endsWith('.zip') || url.pathname.endsWith('.exe')) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

async function navigate(request) {
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  const key = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  const cached = (await cache.match(request, { ignoreSearch: true })) || (await cache.match(key));
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(key, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const fresh = await refresh;
  if (fresh) return fresh;
  return (await cache.match(SCOPE)) || Response.error();
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}
