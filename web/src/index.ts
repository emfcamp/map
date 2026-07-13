import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { css, LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import { EMFMap } from './components/map'
import DistanceMeasure from './components/distancemeasure.ts'
import VillagesEditor from './villages/index.ts'
import InstallControl from './installcontrol.ts'
import ExportControl from './export/export.ts'
import SearchControl from './search/searchcontrol.ts'
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
    map.addControl(new SearchControl(), 'top-right')
    map.addControl(new InstallControl(), 'top-left')

    map.addControl(new VillagesEditor('villages', 'villages_symbol'), 'top-right')

    // Display export control only on browsers which are likely to be desktop browsers
    if (window.matchMedia('(min-width: 600px)').matches) {
      map.addControl(new ExportControl(loadIcons), 'top-right')
    }

    map.addControl(new GridPosition('gridsquares'), 'bottom-right')
  }
}

registerSW({ immediate: true })
