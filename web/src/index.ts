import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { css, LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import maplibregl from 'maplibre-gl'
import { EMFMap } from './components/map'
import Search, { SearchResult } from './search/search'
import DistanceMeasure from './components/distancemeasure.ts'
import VillagesEditor from './villages/index.ts'
import InstallControl from './installcontrol.ts'
import ExportControl from './export/export.ts'
import { GridPosition } from './grid.ts'
import './components/map'
import { loadIcons } from './icons.ts'

@customElement('emf-map-app')
export class EMFMapApp extends LitElement {
  /* Web component used on the main map (map.emfcamp.org).

    Wraps the reusable map component and adds a few more features.
  */
  static styles? = css`
    emf-map {
      width: 100%;
      height: 100%;
    }
  `

  render() {
    return html`<emf-map urlHash="true" navControls="true" @load=${this.init}> </emf-map>`
  }

  init() {
    const mapComponent = this.renderRoot.querySelector('emf-map') as EMFMap
    const map = mapComponent.map!

    map.addControl(new DistanceMeasure(), 'top-right')
    map.addControl(new InstallControl(), 'top-left')

    map.addControl(new VillagesEditor('villages', 'villages_symbol'), 'top-right')

    const search = new Search((result: SearchResult) =>
      this.flyTo(mapComponent, new maplibregl.LngLat(result.lngLat[0], result.lngLat[1]))
    )
    document.getElementById('top-left-stack')?.appendChild(search.element)

    // Display export control only on browsers which are likely to be desktop browsers
    if (window.matchMedia('(min-width: 600px)').matches) {
      map.addControl(new ExportControl(loadIcons), 'top-right')
    }

    map.addControl(new GridPosition('gridsquares'), 'bottom-right')
  }

  flyTo(mapComponent: EMFMap, lngLat: maplibregl.LngLat) {
    const map = mapComponent.map
    if (!map) return
    map.flyTo({
      center: lngLat,
      zoom: Math.max(map.getZoom(), 18),
      essential: true,
    })
    mapComponent.markerComponent!.setLocation(lngLat)
  }
}

registerSW({ immediate: true })
