import maplibregl from 'maplibre-gl'
import type { Feature, FeatureCollection, Position } from 'geojson'
import { el, mount } from 'redom'
import { makeEntry, validCoords } from './search/searchentry.ts'
import type { SearchCategory, SearchEntry } from './search/searchentry.ts'
import './tracking.css'

const TRACKING_HOST = import.meta.env.DEV ? 'http://localhost:3000' : 'https://emf.eventwan.net'

const TTL_MS = 3600 * 1000
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const MOVING_MS = 0.5
const MOVE_MS = 1000

interface Move {
  from: Position
  to: Position
  start: number
}

interface TrackingLayer {
  type: string
  layer: string
  source: string
  snapshot: string
  category: SearchCategory
  id: (props: Record<string, any>) => string | undefined
  name: (props: Record<string, any>) => string | undefined
  popup: (props: Record<string, any>) => HTMLElement
  features: Map<string, Feature>
  moves: Map<string, Move>
  frame?: number
}

// Only breaks ties; a tracker sorts just below a venue on an equal text score
const TRACKED_IMPORTANCE = 1

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function timeAgo(lastSeen: string): string {
  const seconds = Math.round((Date.parse(lastSeen) - Date.now()) / 1000)
  if (seconds > -60) return relativeTime.format(seconds, 'second')
  if (seconds > -3600) return relativeTime.format(Math.round(seconds / 60), 'minute')
  return relativeTime.format(Math.round(seconds / 3600), 'hour')
}

function lastSeenLine(props: Record<string, any>) {
  if (props.lastSeen == null) return undefined
  const time = el(
    'time',
    { datetime: props.lastSeen, title: new Date(props.lastSeen).toLocaleString() },
    timeAgo(props.lastSeen)
  )
  return el('p', 'Last seen ', time)
}

function refreshTimes(content: HTMLElement) {
  content.querySelectorAll('time').forEach((time) => {
    time.textContent = timeAgo(time.dateTime)
  })
}

// Display names shared by the popups and search, so a tracker reads the same in
// both. Return undefined when there's no usable name, so search can skip it.
function vehicleName(props: Record<string, any>): string | undefined {
  if (props.vehicleType) {
    return `${props.vehicleType}${props.registration ? ` (${props.registration})` : ''}`
  }
  return props.deviceName != null ? `Tracker ${props.deviceName}` : undefined
}

function busName(props: Record<string, any>): string | undefined {
  return props.name != null ? String(props.name) : undefined
}

function personName(props: Record<string, any>): string | undefined {
  const name = props.name ?? props.deviceName
  return name != null ? String(name) : undefined
}

function vehiclePopup(props: Record<string, any>) {
  const content = el('.tracking-popup', el('h3', vehicleName(props) ?? ''))
  if (props.vehicleType != null) {
    mount(content, el('p', `Tracker ${props.deviceName}`))
  }
  if (props.battery != null) {
    mount(content, el('p', `Battery ${props.battery}%`))
  }
  if (props.temperature != null) {
    mount(content, el('p', `Temperature ${props.temperature}°C`))
  }
  const lastSeen = lastSeenLine(props)
  if (lastSeen) mount(content, lastSeen)
  return content
}

function busPopup(props: Record<string, any>) {
  const content = el('.tracking-popup', el('h3', busName(props) ?? ''))
  if (props.address != null) {
    mount(content, el('p', props.address))
  }
  if (props.speed != null) {
    mount(content, el('p', `Speed ${Math.round(props.speed * 2.237)} mph`))
  }
  if (props.course != null && props.speed > MOVING_MS) {
    const point = COMPASS[Math.round(props.course / 45) % 8]
    mount(content, el('p', `Heading ${Math.round(props.course)}° (${point})`))
  }
  const lastSeen = lastSeenLine(props)
  if (lastSeen) mount(content, lastSeen)
  return content
}

function peoplePopup(props: Record<string, any>) {
  const content = el('.tracking-popup', el('h3', personName(props) ?? ''))
  if (props.battery != null) {
    mount(content, el('p', `Battery ${props.battery}%`))
  }
  if (props.temperature != null) {
    mount(content, el('p', `Temperature ${props.temperature}°C`))
  }
  const lastSeen = lastSeenLine(props)
  if (lastSeen) mount(content, lastSeen)
  return content
}

const trackingLayers: TrackingLayer[] = [
  {
    type: 'vehicles',
    layer: 'vehicles_symbol',
    source: 'vehicles',
    snapshot: 'vehicles.geojson',
    category: 'vehicle',
    id: (props) => props.devEui,
    name: vehicleName,
    popup: vehiclePopup,
    features: new Map(),
    moves: new Map(),
  },
  {
    type: 'bus',
    layer: 'bus_symbol',
    source: 'bus',
    snapshot: 'bus.geojson',
    category: 'bus',
    id: (props) => props.assetId?.toString(),
    name: busName,
    popup: busPopup,
    features: new Map(),
    moves: new Map(),
  },
  {
    type: 'people',
    layer: 'people_symbol',
    source: 'people',
    snapshot: 'people.geojson',
    category: 'person',
    id: (props) => props.devEui,
    name: personName,
    popup: peoplePopup,
    features: new Map(),
    moves: new Map(),
  },
]

function fresh(feature: Feature): boolean {
  const lastSeen = Date.parse(feature.properties?.lastSeen)
  return isNaN(lastSeen) || Date.now() - lastSeen < TTL_MS
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2
}

function moving(layer: TrackingLayer, id: string, now: number): Position | undefined {
  const move = layer.moves.get(id)
  if (!move) return undefined
  const t = (now - move.start) / MOVE_MS
  if (t >= 1) {
    layer.moves.delete(id)
    return undefined
  }
  const p = ease(t)
  return [move.from[0] + (move.to[0] - move.from[0]) * p, move.from[1] + (move.to[1] - move.from[1]) * p]
}

// Fired after every render so a search highlight can follow a moving entity.
// render() only runs when things change, so an idle subscriber costs nothing.
const updateListeners = new Set<() => void>()

export function subscribeTrackingUpdates(listener: () => void): () => void {
  updateListeners.add(listener)
  return () => updateListeners.delete(listener)
}

function notifyUpdate() {
  for (const listener of updateListeners) listener()
}

function render(map: maplibregl.Map, layer: TrackingLayer) {
  for (const [id, feature] of layer.features) {
    if (!fresh(feature)) {
      layer.features.delete(id)
      layer.moves.delete(id)
    }
  }
  const source = map.getSource(layer.source) as maplibregl.GeoJSONSource | undefined
  if (!source) return

  const now = performance.now()
  const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [...layer.features].map(([id, feature]) => {
      const coordinates = moving(layer, id, now)
      if (!coordinates) return feature
      return { ...feature, geometry: { type: 'Point', coordinates } }
    }),
  }
  source.setData(collection)
  notifyUpdate()

  if (layer.frame != null) cancelAnimationFrame(layer.frame)
  layer.frame = layer.moves.size
    ? requestAnimationFrame(() => {
        layer.frame = undefined
        render(map, layer)
      })
    : undefined
}

function upsert(layer: TrackingLayer, feature: Feature) {
  const props = feature.properties
  if (!props) return
  const id = layer.id(props)
  if (id == null) return

  const previous = layer.features.get(id)
  if (previous?.geometry.type === 'Point' && feature.geometry.type === 'Point') {
    const now = performance.now()
    const from = moving(layer, id, now) ?? previous.geometry.coordinates
    const to = feature.geometry.coordinates
    if (from[0] !== to[0] || from[1] !== to[1]) {
      layer.moves.set(id, { from, to, start: now })
    }
  }

  layer.features.set(id, feature)
}

async function loadSnapshot(map: maplibregl.Map, layer: TrackingLayer) {
  const response = await fetch(`${TRACKING_HOST}/${layer.snapshot}`)
  const collection: FeatureCollection = await response.json()
  for (const feature of collection.features) {
    upsert(layer, feature)
  }
  render(map, layer)
}

let stream: EventSource | undefined
let streamTypes = ''

function visible(map: maplibregl.Map, layer: TrackingLayer): boolean {
  if (!map.getLayer(layer.layer)) return false
  return map.getLayoutProperty(layer.layer, 'visibility') !== 'none'
}

// Search entries for enabled tracking layers, rebuilt each query so positions
// and the enabled set stay current. Skips stale and unnamed features.
export function trackingSearchEntries(map: maplibregl.Map): SearchEntry[] {
  const entries: SearchEntry[] = []
  for (const layer of trackingLayers) {
    if (!visible(map, layer)) continue
    for (const [id, feature] of layer.features) {
      if (!fresh(feature)) continue
      const displayName = layer.name(feature.properties ?? {})
      if (!displayName) continue
      const entry = makeEntry(layer.category, displayName, feature.geometry, TRACKED_IMPORTANCE, {
        type: layer.type,
        id,
      })
      if (entry) entries.push(entry)
    }
  }
  return entries
}

/* Current interpolated position of a tracked feature, or undefined once it has
   gone stale or dropped out, so a following highlight can drop it too. */
export function trackingPosition(type: string, id: string): [number, number] | undefined {
  const layer = trackingLayers.find((l) => l.type === type)
  if (!layer) return undefined
  const feature = layer.features.get(id)
  if (!feature || !fresh(feature) || feature.geometry.type !== 'Point') return undefined
  const now = performance.now()
  const coords = moving(layer, id, now) ?? feature.geometry.coordinates
  return validCoords(coords) ? [coords[0], coords[1]] : undefined
}

function disconnect() {
  stream?.close()
  stream = undefined
  streamTypes = ''
}

function syncConnection(map: maplibregl.Map) {
  const enabled = trackingLayers.filter((layer) => visible(map, layer))
  const types = enabled.map((layer) => layer.type).join(',')
  if (types === streamTypes) return

  disconnect()

  for (const layer of trackingLayers) {
    if (enabled.includes(layer)) continue
    layer.features.clear()
    layer.moves.clear()
    render(map, layer)
  }

  if (!types) return
  streamTypes = types

  for (const layer of enabled) {
    loadSnapshot(map, layer)
  }

  stream = new EventSource(`${TRACKING_HOST}/stream?type=${types}`)
  for (const layer of enabled) {
    stream.addEventListener(layer.type, (e) => {
      upsert(layer, JSON.parse(e.data))
      render(map, layer)
    })
  }
}

export function setupTracking(map: maplibregl.Map) {
  let old_cursor = ''

  for (const layer of trackingLayers) {
    map.on('click', layer.layer, (e: maplibregl.MapLayerMouseEvent) => {
      const content = layer.popup(e.features![0].properties)
      const popup = new maplibregl.Popup().setLngLat(e.lngLat).setDOMContent(content).addTo(map)

      const ticker = setInterval(() => refreshTimes(content), 1000)
      popup.on('close', () => clearInterval(ticker))
    })

    map.on('mouseenter', layer.layer, () => {
      old_cursor = map.getCanvas().style.cursor
      map.getCanvas().style.cursor = 'pointer'
    })

    map.on('mouseleave', layer.layer, () => {
      map.getCanvas().style.cursor = old_cursor
    })
  }

  map.on('load', () => {
    syncConnection(map)
    setInterval(() => {
      for (const layer of trackingLayers) render(map, layer)
    }, 60_000)
  })

  map.on('styledata', () => syncConnection(map))
}
