import maplibregl from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'
import { el, mount } from 'redom'
import './tracking.css'

const TRACKING_HOST = import.meta.env.DEV ? 'http://localhost:3000' : 'https://emf.eventwan.net'

const TTL_MS = 3600 * 1000
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const MOVING_MS = 0.5

interface TrackingLayer {
  type: string
  layer: string
  source: string
  snapshot: string
  id: (props: Record<string, any>) => string | undefined
  popup: (props: Record<string, any>) => HTMLElement
  features: Map<string, Feature>
}

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

function vehiclePopup(props: Record<string, any>) {
  const vehicleName = `${props.vehicleType}${props.registration ? ` (${props.registration})` : ''}`

  const content = el('.tracking-popup', el('h3', vehicleName))
  if (props.registration != null) {
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
  const content = el('.tracking-popup', el('h3', props.name))
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

const trackingLayers: TrackingLayer[] = [
  {
    type: 'lorawan',
    layer: 'vehicles_symbol',
    source: 'vehicles',
    snapshot: 'vehicles.geojson',
    id: (props) => props.devEui,
    popup: vehiclePopup,
    features: new Map(),
  },
  {
    type: 'bus',
    layer: 'bus_symbol',
    source: 'bus',
    snapshot: 'bus.geojson',
    id: (props) => props.assetId?.toString(),
    popup: busPopup,
    features: new Map(),
  },
]

function fresh(feature: Feature): boolean {
  const lastSeen = Date.parse(feature.properties?.lastSeen)
  return isNaN(lastSeen) || Date.now() - lastSeen < TTL_MS
}

function render(map: maplibregl.Map, layer: TrackingLayer) {
  for (const [id, feature] of layer.features) {
    if (!fresh(feature)) layer.features.delete(id)
  }
  const source = map.getSource(layer.source) as maplibregl.GeoJSONSource | undefined
  if (!source) return
  const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [...layer.features.values()],
  }
  source.setData(collection)
}

function upsert(layer: TrackingLayer, feature: Feature) {
  const props = feature.properties
  if (!props) return
  const id = layer.id(props)
  if (id == null) return
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
