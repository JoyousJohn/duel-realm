var CACHE_NAME = 'duel-realm-v8';
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
    './js/ai.js',
    './js/battle-fx.js',
    './js/deck.js',
    './js/getters.js',
    './js/setters.js',
    './js/game.js',
    './js/phases.js',
    './js/preview.js',
    './js/card-effects.js'
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

self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') return;

    var url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(event.request).then(function(cached) {
            if (cached) return cached;
            return fetch(event.request).then(function(response) {
                if (response && response.status === 200 && response.type === 'basic') {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            }).catch(function() {
                return caches.match('./index.html');
            });
        })
    );
});
