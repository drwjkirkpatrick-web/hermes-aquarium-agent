/**
 * sw.js — Service Worker for Hermes Aquarium Dashboard
 *
 * Provides offline caching, progressive loading, and asset preloading.
 * Strategy: Cache-first for static assets, network-first for API calls.
 */

const CACHE_NAME = 'hermes-aquarium-v2';
const STATIC_CACHE = `${CACHE_NAME}-static`;
const IMAGE_CACHE = `${CACHE_NAME}-images`;
const WEBP_CACHE = `${CACHE_NAME}-webp`;

// Core files to cache on install
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/css/aquarium.css',
    '/js/utils.js',
    '/js/state-manager.js',
    '/js/limbic-bridge.js',
    '/js/image-manager.js',
    '/js/environment.js',
    '/js/angelfish.js',
    '/js/aquarium.js',
    '/js/audio-engine.js',
    '/js/touch-engine.js',
    '/js/hud-overlay.js',
    '/js/weather-sync.js',
    '/js/capture-module.js',
];

// Install: cache core assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key.startsWith(CACHE_NAME) && key !== STATIC_CACHE && key !== IMAGE_CACHE && key !== WEBP_CACHE)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: route strategies
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // ─── API calls (network-first) ───
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // ─── WebP images (cache-first, lazy populate) ───
    if (url.pathname.endsWith('.webp')) {
        event.respondWith(cacheFirst(request, WEBP_CACHE));
        return;
    }

    // ─── PNG images (cache-first, lazy populate) ───
    if (url.pathname.endsWith('.png')) {
        event.respondWith(cacheFirst(request, IMAGE_CACHE));
        return;
    }

    // ─── Static assets (cache-first) ───
    if (CORE_ASSETS.includes(url.pathname)) {
        event.respondWith(cacheFirst(request, STATIC_CACHE));
        return;
    }

    // ─── Everything else (stale-while-revalidate) ───
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
});

// ─── Strategies ───

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch (e) {
        // Return a fallback for images
        if (request.url.match(/\.(png|webp)$/)) {
            return new Response(
                new Blob([''], { type: 'image/png' }),
                { status: 200, headers: { 'Content-Type': 'image/png' } }
            );
        }
        throw e;
    }
}

async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (e) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw e;
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const fetchPromise = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    }).catch(() => cached);

    return cached || fetchPromise;
}

// ─── Message handling from main thread ───
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
