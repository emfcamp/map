import './index.css'
// @ts-ignore: virtual module from vite-pwa
import { registerSW } from 'virtual:pwa-register'
import maplibregl from 'maplibre-gl'
import map_style from './map_style.json'
import Marker from './marker'
import LayerSwitcher from '@russss/maplibregl-layer-switcher'
import URLHash from '@russss/maplibregl-layer-switcher/urlhash'
import DistanceMeasure from './distancemeasure'
import ContextMenu from './contextmenu'
import { roundPosition } from './util'

if (import.meta.env.DEV) {
    map_style.sources.villages.data = 'http://localhost:2342/api/villages.geojson'
    map_style.sources.site_plan.url = 'http://localhost:8888/capabilities/buildmap'
    map_style.glyphs = 'http://localhost:8080/fonts/{fontstack}/{range}.pbf'
}

class EventMap {
    layers: Record<string, string> = {
        'Buried Services': 'services_',
        Water: 'site_water_',
        DKs: 'dk_',
        'NOC-Physical': 'noc_',
        Power: 'power_',
        Lighting: 'lighting_',
        Villages: 'villages_',
    }
    map?: maplibregl.Map
    layer_switcher?: LayerSwitcher
    url_hash?: URLHash
    marker?: Marker

    init() {
        registerSW({ immediate: true })

        const layers_enabled = ['Villages']
        this.layer_switcher = new LayerSwitcher(this.layers, layers_enabled)

        this.url_hash = new URLHash(this.layer_switcher)
        this.layer_switcher.urlhash = this.url_hash
        this.marker = new Marker(this.url_hash)

        this.layer_switcher.setInitialVisibility(map_style)
        this.map = new maplibregl.Map(
            this.url_hash.init({
                container: 'map',
                style: map_style,
                pitchWithRotate: false,
                dragRotate: false,
            })
        )

        this.map.touchZoomRotate.disableRotation()

        this.map.addControl(new maplibregl.NavigationControl(), 'top-right')

        this.map.addControl(
            new maplibregl.GeolocateControl({
                positionOptions: {
                    enableHighAccuracy: true,
                },
                trackUserLocation: true,
            })
        )

        this.map.addControl(
            new maplibregl.ScaleControl({
                maxWidth: 200,
                unit: 'metric',
            })
        )

        this.map.addControl(new DistanceMeasure(), 'top-right')

        /*
    map.addControl(
      new VillagesEditor('villages', 'villages_symbol'),
      'top-right',
    );
    */
        this.map.addControl(this.layer_switcher, 'top-right')
        this.url_hash.enable(this.map)

        this.map.addControl(this.marker, 'top-right')

        const contextMenu = new ContextMenu(this.map)
        contextMenu.addItem('Set marker', (_e, coords) => {
            this.marker!.setLocation(coords)
        })
        contextMenu.addItem(
            'Clear marker',
            () => {
                this.marker!.setLocation(null)
            },
            () => this.marker!.location != null
        )

        contextMenu.addItem('Copy coordinates', (_e, coords) => {
            const [lng, lat] = roundPosition([coords.lng, coords.lat], this.map!.getZoom())
            navigator.clipboard.writeText(lat + ', ' + lng)
        })
    }

    showInstallPrompt() {
        let deferredPrompt: any
        const install_prompt = document.getElementById('install-prompt')

        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault()
            if (localStorage.getItem('pwa_closed')) {
                return
            }
            // Stash the event so it can be triggered later.
            deferredPrompt = e
            install_prompt!.style.display = 'block'
        })

        document.getElementById('install-button')!.onclick = (e) => {
            e.preventDefault()
            install_prompt!.style.display = 'none'
            deferredPrompt.prompt()
            deferredPrompt.userChoice.then((result) => {
                if (result.outcome === 'accepted') {
                    console.log('PWA choice accepted')
                    // No need to do anything here, beforeinstallprompt won't be called if the app is installed
                }
                deferredPrompt = null
            })
        }

        document.getElementById('install-close')!.onclick = (e) => {
            e.preventDefault()
            install_prompt!.style.display = 'none'
            localStorage.setItem('pwa_closed', 'true')
        }
    }
}

const em = new EventMap()
window.em = em

if (document.readyState != 'loading') {
    em.init()
} else {
    document.addEventListener('DOMContentLoaded', em.init)
}
