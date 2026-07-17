import { createHandlerBoundToURL, precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

function register(match_url: string, strategy: any) {
  const prefix = '/'

  registerRoute(({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith(prefix + match_url), strategy)
}

register('tiles', new StaleWhileRevalidate({ cacheName: 'tiles-20260717' }))
register('icons', new CacheFirst())

try {
  // Only catch requests to the root URL (a regex doesn't do this).
  registerRoute(
    ({ url, sameOrigin }) => sameOrigin && url.pathname == '/',
    createHandlerBoundToURL('index.html')
  )
} catch {
  // This fails in dev as index.html is not in the manifest.
}

cleanupOutdatedCaches()

// Always skipWaiting (refresh) immediately after install.
self.skipWaiting()
clientsClaim()
