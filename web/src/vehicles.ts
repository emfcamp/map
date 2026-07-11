import maplibregl from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'
import { el, mount } from 'redom'
import './vehicles.css'

const TRACKING_HOST = 'https://emf.eventwan.net'

const LAYER = 'vehicles_symbol'
const SOURCE = 'vehicles'
const TTL_MS = 3600 * 1000

const devices = new Map<string, Feature>()

function fresh(feature: Feature): boolean {
  const lastSeen = feature.properties?.lastSeen
  return typeof lastSeen !== 'number' || Date.now() - lastSeen < TTL_MS
}

function render(map: maplibregl.Map) {
  for (const [devEui, feature] of devices) {
    if (!fresh(feature)) devices.delete(devEui)
  }
  const source = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined
  if (!source) return
  const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [...devices.values()],
  }
  source.setData(collection)
}

function upsert(feature: Feature) {
  const props = feature.properties
  if (!props || props.type !== 'vehicles' || props.devEui == null) return
  devices.set(props.devEui, feature)
}

async function loadSnapshot(map: maplibregl.Map) {
  const response = await fetch(`${TRACKING_HOST}/lorawan.geojson`)
  const collection: FeatureCollection = await response.json()
  for (const feature of collection.features) {
    upsert(feature)
  }
  render(map)
}

function subscribe(map: maplibregl.Map) {
  const stream = new EventSource(`${TRACKING_HOST}/lorawan`)
  stream.onmessage = (e) => {
    upsert(JSON.parse(e.data))
    render(map)
  }
}

function popupContent(props: Record<string, any>) {
  const content = el('.vehicles-popup', el('h3', props.deviceName))
  if (props.battery != null) {
    mount(content, el('p', `Battery ${props.battery}%`))
  }
  if (props.temperature != null) {
    mount(content, el('p', `Temperature ${props.temperature}°C`))
  }
  if (props.lastSeen != null) {
    mount(content, el('p', `Last seen ${new Date(props.lastSeen).toLocaleString()}`))
  }
  return content
}

export function setupVehicles(map: maplibregl.Map) {
  map.on('click', LAYER, (e: maplibregl.MapLayerMouseEvent) => {
    const props = e.features![0].properties
    new maplibregl.Popup().setLngLat(e.lngLat).setDOMContent(popupContent(props)).addTo(map)
  })

  let old_cursor = ''

  map.on('mouseenter', LAYER, () => {
    old_cursor = map.getCanvas().style.cursor
    map.getCanvas().style.cursor = 'pointer'
  })

  map.on('mouseleave', LAYER, () => {
    map.getCanvas().style.cursor = old_cursor
  })

  map.on('load', () => {
    loadSnapshot(map)
    subscribe(map)
    setInterval(() => render(map), 60_000)
  })
}
