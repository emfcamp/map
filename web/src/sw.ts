import { createHandlerBoundToURL, precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { StaleWhileRevalidate } from 'workbox-strategies'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

function register(match_url: string, strategy: any) {
    const prefix = '/'

    registerRoute(({ url }) => url.pathname.startsWith(prefix + match_url), strategy)
}

precacheAndRoute(self.__WB_MANIFEST)

register('capabilities/buildmap', new StaleWhileRevalidate())
register('maps', new StaleWhileRevalidate())

try {
    registerRoute(
        new NavigationRoute(createHandlerBoundToURL('index.html'), {
            denylist: [/\/stats/, /\/noc/, /\/power/],
        })
    )
} catch (e) {
    // This fails in dev as index.html is not in the manifest.
    console.error(e)
}

cleanupOutdatedCaches()

// Always skipWaiting (refresh) immediately after install.
self.skipWaiting()
clientsClaim()
