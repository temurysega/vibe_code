/* Живой конспект: офлайн-кэш (создаётся при сборке) */
const CACHE = "zk-873ea503dea4";
const FILES = ["./","assets/NotesMode-BHHDzxxM.css","assets/NotesMode-BV_ggSfv.js","assets/PhotoOcrDialog-B03pA7FL.css","assets/PhotoOcrDialog-Dfhynh1P.js","assets/editor-Dn_cbH0T.js","assets/graph-BNOW54PK.js","assets/index-BZKlhiTf.js","assets/index-BcKd8vBt.css","assets/three-CWKlLYFL.js","assets/web-BO4NVpau.js","assets/web-BzfpE06n.js","assets/web-Ct8hKx3W.js","assets/web-DmbRr78M.js","favicon.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","index.html","manifest.webmanifest"];

self.addEventListener('install', event => {
    // Wait for the previous application's tabs to close before replacing its worker.
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k.startsWith('zk-') && k !== CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (req.mode === 'navigate') {
        // Keep HTML and lazy chunks from the same release while it has open tabs.
        event.respondWith(caches.open(CACHE).then(cache => cache.match(new URL('index.html', self.registration.scope).href))
            .then(hit => hit || fetch(req)));
        return;
    }
    // Файлы сборки неизменны (хэш в имени): сначала кэш.
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok && url.pathname.includes('/assets/')) {
            const copy = res.clone();
            caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
    })));
});
