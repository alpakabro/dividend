// 설치형 웹앱(PWA) 서비스 워커 — build.py가 만든다(버전 901c5657df = 종목 DB 해시). 두 번째부터 빠르게 열리고 오프라인에서도 열린다
const SHELL = 'divsim-shell-901c5657df', DATA = 'divsim-data';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'], DB = './db.js?v=901c5657df';
self.addEventListener('install', e => { e.waitUntil(Promise.all([
  caches.open(SHELL).then(c => c.addAll(CORE)),
  caches.open(DATA).then(c => c.add(DB).then(() => c.keys()).then(ks => Promise.all(ks.filter(k => !k.url.endsWith(DB.slice(1))).map(k => c.delete(k)))))   // 첫 방문에 종목 DB도 캐시(페이지가 방금 받은 것을 HTTP 캐시에서 재사용), 옛 버전은 지움
]).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;                      // 외부(글꼴 등)는 그대로
  if (req.mode === 'navigate') {                                                           // 페이지: 네트워크 우선(새 빌드 바로 반영), 안 되면 캐시
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(SHELL).then(x => x.put('./index.html', c)); return r; }).catch(() => caches.match('./index.html')));
  } else if (/\/db\.js(\?|$)/.test(u.pathname + u.search)) {                              // 종목 DB: 캐시 우선, 새 버전이 오면 옛 버전은 지움
    e.respondWith(caches.open(DATA).then(c => c.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { c.keys().then(ks => ks.forEach(k => { if (k.url !== req.url) c.delete(k); })); c.put(req, r.clone()); }
      return r;
    }))));
  } else {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(SHELL).then(x => x.put(req, c)); } return r; })));
  }
});
