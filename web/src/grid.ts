import { css, LitElement, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'

@customElement('emf-map-grid-position')
export class GridPositionControl extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-width: 5em;
      padding: 0.5em;
      font-size: 0.8rem;
    }
    :host(.hidden) {
      display: none;
    }
  `

  @property()
  position: string = ''

  render() {
    if (this.position) {
      this.classList.remove('hidden')
      return html`${this.position}`
    } else {
      this.classList.add('hidden')
    }
  }
}

export class GridPosition implements maplibregl.IControl {
  _container: HTMLElement
  _map?: maplibregl.Map
  _layer_name: string

  constructor(layer_name: string) {
    this._layer_name = layer_name
    this._container = document.createElement('emf-map-grid-position')
    this._container.classList.add('maplibregl-ctrl', 'maplibregl-ctrl-group')
  }

  onAdd(map: maplibregl.Map): HTMLElement {
    this._map = map

    map.on('mousemove', this._layer_name, (e) => {
      const features = map.queryRenderedFeatures(e.point)
      if (features.length > 0) {
        const el = features[0]
        if (el.properties.row && el.properties.column) {
          this._container.setAttribute('position', `Grid: ${el.properties.column}${el.properties.row}`)
          return
        }
      }
      this._container.setAttribute('position', '')
    })

    map.on('mouseleave', this._layer_name, () => {
      this._container.setAttribute('position', '')
    })

    return this._container
  }

  onRemove() {
    this._container.parentNode!.removeChild(this._container)
    this._map = undefined
  }
}
