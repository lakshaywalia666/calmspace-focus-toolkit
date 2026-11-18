const scope = new URL(self.registration.scope);
const cachePrefix = `calmspace:${scope.pathname}:`;
const cacheName = cachePrefix + 'v1';
const paths = [
    'index.html', 'manifest.webmanifest',
    'assets/accessibility.css', 'assets/studio.css', 'assets/shared.js', 'assets/home.js',
    'assets/audio.js', 'assets/mixer.js', 'assets/focus.js', 'assets/writing.js',
    'assets/icon-192.png', 'assets/icon-512.png',
    'tools/breathing.html', 'tools/calculator.html', 'tools/draw.html', 'tools/dropballs.html',
    'tools/focus.html', 'tools/gravity.html', 'tools/noisegen.html', 'tools/rocket.html',
    'tools/stressburster.html', 'tools/sxenagame.html', 'tools/thecalmspace.html'
];
const pages = new Set(paths.map(path => new URL(path, scope).href));

self.addEventListener('install', event => {
    event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(paths.map(path => new Request(new URL(path, scope), { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== scope.origin) return;
    if (request.mode === 'navigate') {
        url.search = '';
        if (url.pathname === scope.pathname) url.pathname += 'index.html';
    }
    if (!pages.has(url.href)) return;
    event.respondWith((async () => {
        const cache = await caches.open(cacheName);
        return await cache.match(url.href) || fetch(request);
    })());
});
