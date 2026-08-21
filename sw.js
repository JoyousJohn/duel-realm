var CACHE_NAME = 'duel-realm-v10';
var CORE_ASSETS = [
    './',
    './index.html',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './css/style.css',
    './css/selection.css',
    './css/game.css',
    './css/card.css',
    './css/board.css',
    './css/info.css',
    './css/homescreen.css',
    './css/battle-fx.css',
    './css/card-effects.css',
    './js/cards.js',
    './js/state.js',
    './js/effects-core.js',
    './js/stat-engine.js',
    './js/trap-triggers.js',
    './js/card-effects.js',
    './js/ai.js',
    './js/battle-fx.js',
    './js/deck.js',
    './js/getters.js',
    './js/setters.js',
    './js/game.js',
    './js/phases.js',
    './js/preview.js'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(CORE_ASSETS);
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(keys.map(function(key) {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// Only cache successful same-origin responses.
function isCacheable(response) {
    return response && response.status === 200 && response.type === 'basic';
}

// Stale-while-revalidate: serve the cached copy instantly, then refresh the
// cache from the network in the background. Used for mutable assets (JS/CSS)
// so deployed updates propagate without manual cache-version bumps. The
// current load may see the previous version; the next one is fresh.
function staleWhileRevalidate(request) {
    return caches.match(request).then(function(cached) {
        var networkFetch = fetch(request).then(function(response) {
            if (isCacheable(response)) {
                var clone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(request, clone);
                });
            }
            return response;
        }).catch(function() {
            return cached; // offline: fall back to whatever we have
        });
        return cached || networkFetch;
    });
}

// Network-first: try the network so the latest version is always served when
// online; fall back to the cached copy when offline. Used for the HTML shell.
function networkFirst(request) {
    return fetch(request).then(function(response) {
        if (isCacheable(response)) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
                cache.put(request, clone);
            });
        }
        return response;
    }).catch(function() {
        return caches.match(request).then(function(cached) {
            return cached || caches.match('./index.html');
        });
    });
}

// Cache-first: serve from cache; only hit the network on a miss. Used for
// static/immutable assets (images, icons) which are versioned by filename.
function cacheFirst(request) {
    return caches.match(request).then(function(cached) {
        if (cached) return cached;
        return fetch(request).then(function(response) {
            if (isCacheable(response)) {
                var clone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(request, clone);
                });
            }
            return response;
        });
    });
}

self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') return;

    var url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    var request = event.request;

    // Document navigations: always try the network first so the latest app
    // shell is served, with the cached copy as the offline fallback.
    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request));
        return;
    }

    // Static/immutable assets: cache-first for instant, offline-friendly loads.
    if (/\.(png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(url.pathname)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Everything else (JS, CSS, manifest): stale-while-revalidate.
    event.respondWith(staleWhileRevalidate(request));
});
