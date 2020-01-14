/**
 * ServiceWorker to handle caching.
 *
 * Currently this SW permanently caches the JS and HTML,
 * but doesn't try and persist any map data. This should
 * speed up the load on unreliable connections and allows
 * us to install as a PWA.
 *
 * serviceWorkerOption.assets is populated by the webpack
 * serviceworker plugin with all our local assets at the
 * top of this file, so any change in assets will result
 * in the bundle hash changing and a new SW being installed.
 *
 * Note that using ServiceWorkers in this way changes caching
 * semantics, and the updated JS doesn't come into effect until
 * the page is closed and reopened after the new SW is loaded.
 */

const CACHE_NAME = 'emf-map-1';

const additional_assets = [
  // We have to add the root here as the webpack serviceworker
  // plugin doesn't know about it.
  '/'
];

const cache_assets = serviceWorkerOption.assets.concat(additional_assets);

self.addEventListener('install', event => {
  caches.delete(CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(cache_assets);
    }),
  );
  console.log('ServiceWorker installed.');
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) {
        return response;
      }
      return fetch(event.request);
    }),
  );
});
