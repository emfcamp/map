import './grid.css'
import { el } from 'redom'

export class GridPosition implements maplibregl.IControl {
  _container: HTMLElement
  _map?: maplibregl.Map
  _layer_name: string

  constructor(layer_name: string) {
    this._layer_name = layer_name
    this._container = el('div', { class: 'maplibregl-ctrl maplibregl-ctrl-group grid-position hidden' })
  }

  onAdd(map: maplibregl.Map): HTMLElement {
    this._map = map

    map.on('mousemove', this._layer_name, (e) => {
      const features = map.queryRenderedFeatures(e.point)
      if (features.length > 0) {
        const el = features[0]
        if (el.properties.row && el.properties.column) {
          this._container.classList.remove('hidden')
          this._container.textContent = `Grid: ${el.properties.column}${el.properties.row}`
          return
        }
      }
      this._container.classList.add('hidden')
      this._container.textContent = ''
    })

    map.on('mouseleave', this._layer_name, () => {
      this._container.classList.add('hidden')
      this._container.textContent = ''
    })

    return this._container
  }

  onRemove() {
    this._container.parentNode!.removeChild(this._container)
    this._map = undefined
  }
}
