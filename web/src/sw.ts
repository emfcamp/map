import { createHandlerBoundToURL, precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies'
import { registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

function register(match_url: string, strategy: any) {
    const prefix = '/'

    registerRoute(
        ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith(prefix + match_url),
        strategy
    )
}

precacheAndRoute(self.__WB_MANIFEST)

register('capabilities/buildmap', new StaleWhileRevalidate())

// Cache map tiles using NetworkFirst for the moment - may be worth switching
// to StaleWhileRevalidate closer to the event.
register('maps', new NetworkFirst())

try {
    // Only catch requests to the root URL (a regex doesn't do this).
    registerRoute(
        ({ url, sameOrigin }) => sameOrigin && url.pathname == '/',
        createHandlerBoundToURL('index.html')
    )
} catch (e) {
    // This fails in dev as index.html is not in the manifest.
}

cleanupOutdatedCaches()

// Always skipWaiting (refresh) immediately after install.
self.skipWaiting()
clientsClaim()
