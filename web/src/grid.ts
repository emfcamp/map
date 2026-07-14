import { css, LitElement, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { center } from './style/map_style.ts'

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

type XY = [number, number]

/* Zoom at which the whole grid fits inside a single site_plan tile, so every
   cell is present and unclipped. Matches the search index (searchindex.ts). */
const GRID_TILE_ZOOM = 11
const TILE_FETCH_TIMEOUT_MS = 5000

function tileForPoint(lng: number, lat: number, z: number): { x: number; y: number } {
  const latR = (lat * Math.PI) / 180
  const x = Math.floor(((lng + 180) / 360) * 2 ** z)
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * 2 ** z)
  return { x, y }
}

/* Centre of a (rotated-rectangle) cell. Its axis-aligned bounding box is centred
   on the cell centre, so this is robust to vertex count and winding. */
function cellCentre(geometry: GeoJSON.Geometry): XY {
  const rings =
    geometry.type === 'Polygon'
      ? geometry.coordinates
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates.flat()
        : []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < minX) minX = lng
      if (lng > maxX) maxX = lng
      if (lat < minY) minY = lat
      if (lat > maxY) maxY = lat
    }
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2]
}

function labelPoint(coordinates: XY, axis: 'col' | 'row' | 'cell', label: string): GeoJSON.Feature {
  return { type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { axis, label } }
}

/* Generate the grid labels as real geographic points so they stay glued to the
   grid during zoom (a screen-space text offset drifts instead). The whole grid
   fits in one z11 site_plan tile, so a single fetch gives every cell unclipped:
   one point per cell (the "F7" references), plus column letters just above the
   top edge and row numbers just left of the grid, stepped out along the grid's
   rotation. Mirrors the tile fetch/decode used by the search index. */
export async function setupGrid(map: maplibregl.Map) {
  // getStyle() is only valid once the style has loaded. `idle` fires repeatedly,
  // so this self-heals if isStyleLoaded() reads false transiently after load.
  if (!map.isStyleLoaded()) {
    map.once('idle', () => setupGrid(map))
    return
  }
  try {
    const source = map.getStyle().sources['site_plan']
    if (!source || source.type !== 'vector' || !source.tiles?.length) {
      throw new Error('site_plan source has no tile URL')
    }
    const [lng, lat] = center
    const { x, y } = tileForPoint(lng, lat, GRID_TILE_ZOOM)
    const url = source.tiles[0]
      .replace('{z}', String(GRID_TILE_ZOOM))
      .replace('{x}', String(x))
      .replace('{y}', String(y))

    const resp = await fetch(url, { signal: AbortSignal.timeout(TILE_FETCH_TIMEOUT_MS) })
    if (!resp.ok) throw new Error(`grid tile fetch failed: ${resp.status}`)
    const layer = new VectorTile(new Pbf(new Uint8Array(await resp.arrayBuffer()))).layers['grid']
    if (!layer) throw new Error('grid layer missing from site plan tile')

    const centres = new Map<string, XY>()
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i)
      const { column, row } = feature.properties
      if (column == null || row == null) continue
      const key = `${column}|${row}`
      if (!centres.has(key)) {
        centres.set(key, cellCentre(feature.toGeoJSON(x, y, GRID_TILE_ZOOM).geometry))
      }
    }

    const cols = [...new Set([...centres.keys()].map((k) => k.split('|')[0]))].sort()
    const rows = [...new Set([...centres.keys()].map((k) => Number(k.split('|')[1])))].sort((a, b) => a - b)
    if (cols.length < 2 || rows.length < 2) throw new Error('grid too small to label')

    // Average step vector between adjacent columns / rows across the lattice.
    const step = (along: 'col' | 'row'): XY => {
      let sx = 0
      let sy = 0
      let n = 0
      for (const c of cols) {
        for (const r of rows) {
          const from = centres.get(`${c}|${r}`)
          const to =
            along === 'col'
              ? centres.get(`${cols[cols.indexOf(c) + 1]}|${r}`)
              : centres.get(`${c}|${rows[rows.indexOf(r) + 1]}`)
          if (from && to) {
            sx += to[0] - from[0]
            sy += to[1] - from[1]
            n++
          }
        }
      }
      return n ? [sx / n, sy / n] : [0, 0]
    }
    const colStep = step('col')
    const rowStep = step('row')
    const minCol = cols[0]
    const minRow = rows[0]

    const features: GeoJSON.Feature[] = []
    // In-cell references.
    for (const [key, centre] of centres) {
      const [c, r] = key.split('|')
      features.push(labelPoint(centre, 'cell', `${c}${r}`))
    }
    // Column letters, one step above the top row.
    for (const c of cols) {
      const top = centres.get(`${c}|${minRow}`)
      if (top) features.push(labelPoint([top[0] - rowStep[0], top[1] - rowStep[1]], 'col', c))
    }
    // Row numbers, one step left of the left column.
    for (const r of rows) {
      const left = centres.get(`${minCol}|${r}`)
      if (left) {
        features.push(labelPoint([left[0] - colStep[0], left[1] - colStep[1]], 'row', String(r)))
      }
    }

    ;(map.getSource('grid_labels') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    })
  } catch (e) {
    console.warn('Grid: labels unavailable', e)
  }
}
