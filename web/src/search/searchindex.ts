import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import maplibregl, { GeoJSONSource } from 'maplibre-gl'
import { center } from '../style/map_style.ts'

export type SearchCategory = 'structure' | 'area' | 'camping' | 'parking' | 'gate' | 'village'

export interface SearchEntry {
  displayName: string
  normalized: string
  category: SearchCategory
  coords: [number, number]
  importance: number
}

export interface SearchIndex {
  entries: SearchEntry[]
  /* True when the site plan tile couldn't be fetched and the index only
     covers features loaded in the current viewport */
  offline: boolean
}

// Zoom level at which the whole site fits in a single site_plan tile
const INDEX_TILE_ZOOM = 12

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function tileForPoint(lng: number, lat: number, z: number): { x: number; y: number } {
  const latR = (lat * Math.PI) / 180
  const x = Math.floor(((lng + 180) / 360) * 2 ** z)
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * 2 ** z)
  return { x, y }
}

interface LayerExtractor {
  sourceLayer: string
  category: SearchCategory
  displayName: (props: Record<string, unknown>) => string | undefined
  importance: (props: Record<string, unknown>) => number
}

const constImportance = () => 3

// Display names and exclusions mirror the label layers in style/emf.ts
const extractors: LayerExtractor[] = [
  {
    sourceLayer: 'structure_centroid',
    category: 'structure',
    displayName: (props) => (props.name ? String(props.name) : undefined),
    importance: (props) => (typeof props.importance === 'number' ? props.importance : 0),
  },
  {
    sourceLayer: 'areas_event_centroid',
    category: 'area',
    displayName: (props) => (props.name && props.type !== 'toilets' ? String(props.name) : undefined),
    importance: constImportance,
  },
  {
    sourceLayer: 'areas_camping_centroid',
    category: 'camping',
    displayName: (props) => {
      switch (props.type) {
        case 'camping':
          return props.name ? 'Camping ' + String(props.name) : undefined
        case 'accessible':
          return 'Accessible Camping'
        case 'vehicles':
          return props.name ? 'Live-in Vehicles ' + String(props.name) : undefined
        default:
          return undefined
      }
    },
    importance: constImportance,
  },
  {
    sourceLayer: 'parking_centroid',
    category: 'parking',
    displayName: (props) => (props.name ? 'Parking: ' + String(props.name) : undefined),
    importance: constImportance,
  },
  {
    sourceLayer: 'gates',
    category: 'gate',
    displayName: (props) => (props.name ? 'Gate ' + String(props.name) : undefined),
    importance: constImportance,
  },
]

function entryFromPoint(
  extractor: LayerExtractor,
  props: Record<string, unknown>,
  geometry: GeoJSON.Geometry
): SearchEntry | undefined {
  if (geometry.type !== 'Point') return undefined
  const displayName = extractor.displayName(props)
  if (!displayName) return undefined
  return {
    displayName,
    normalized: normalize(displayName),
    category: extractor.category,
    coords: geometry.coordinates as [number, number],
    importance: extractor.importance(props),
  }
}

function sitePlanTileURL(map: maplibregl.Map): string | undefined {
  const source = map.getStyle().sources['site_plan']
  if (!source || source.type !== 'vector' || !source.tiles?.length) return undefined
  const [lng, lat] = center
  const { x, y } = tileForPoint(lng, lat, INDEX_TILE_ZOOM)
  return source.tiles[0]
    .replace('{z}', String(INDEX_TILE_ZOOM))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}

async function sitePlanEntries(map: maplibregl.Map): Promise<{ entries: SearchEntry[]; offline: boolean }> {
  const url = sitePlanTileURL(map)
  try {
    if (!url) throw new Error('site_plan source has no tile URL')
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`tile fetch failed: ${resp.status}`)
    const tile = new VectorTile(new Pbf(new Uint8Array(await resp.arrayBuffer())))
    const [lng, lat] = center
    const { x, y } = tileForPoint(lng, lat, INDEX_TILE_ZOOM)

    const entries: SearchEntry[] = []
    for (const extractor of extractors) {
      const layer = tile.layers[extractor.sourceLayer]
      if (!layer) {
        console.warn(`Search: source-layer ${extractor.sourceLayer} missing from site plan tile`)
        continue
      }
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i)
        const geojson = feature.toGeoJSON(x, y, INDEX_TILE_ZOOM)
        const entry = entryFromPoint(extractor, feature.properties, geojson.geometry)
        if (entry) entries.push(entry)
      }
    }
    return { entries, offline: false }
  } catch (e) {
    console.warn('Search: falling back to loaded tiles only', e)
    return { entries: viewportEntries(map), offline: true }
  }
}

/* Offline fallback: only sees features in tiles the map has already loaded */
function viewportEntries(map: maplibregl.Map): SearchEntry[] {
  const entries: SearchEntry[] = []
  const seen = new Set<string>()
  for (const extractor of extractors) {
    for (const feature of map.querySourceFeatures('site_plan', { sourceLayer: extractor.sourceLayer })) {
      const entry = entryFromPoint(extractor, feature.properties, feature.geometry)
      if (!entry) continue
      const key = extractor.category + ':' + entry.normalized
      if (seen.has(key)) continue
      seen.add(key)
      entries.push(entry)
    }
  }
  return entries
}

async function villageEntries(map: maplibregl.Map): Promise<SearchEntry[]> {
  try {
    const source = map.getSource('villages') as GeoJSONSource | undefined
    if (!source) return []
    const data = await source.getData()
    if (data.type !== 'FeatureCollection') return []
    const entries: SearchEntry[] = []
    for (const feature of data.features) {
      const name = feature.properties?.name
      if (!name || feature.geometry.type !== 'Point') continue
      entries.push({
        displayName: String(name),
        normalized: normalize(String(name)),
        category: 'village',
        coords: feature.geometry.coordinates as [number, number],
        importance: 3,
      })
    }
    return entries
  } catch (e) {
    console.warn('Search: villages unavailable', e)
    return []
  }
}

export async function buildIndex(map: maplibregl.Map): Promise<SearchIndex> {
  const sitePlan = await sitePlanEntries(map)
  const index: SearchIndex = { entries: sitePlan.entries, offline: sitePlan.offline }
  // Merge villages in whenever they arrive: getData() never settles while the
  // villages source is unreachable, so the main index must not wait for it
  villageEntries(map).then((villages) => index.entries.push(...villages))
  return index
}

function score(entry: SearchEntry, query: string): number {
  if (entry.normalized === query) return 4
  if (entry.normalized.startsWith(query)) return 3
  if (entry.normalized.split(/[^a-z0-9]+/).some((word) => word.startsWith(query))) return 2
  if (entry.normalized.includes(query)) return 1
  return 0
}

export function search(index: SearchEntry[], query: string, limit: number = 20): SearchEntry[] {
  const q = normalize(query)
  if (!q) return []
  return index
    .map((entry) => ({ entry, score: score(entry, q) }))
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.entry.importance - a.entry.importance ||
        a.entry.displayName.localeCompare(b.entry.displayName)
    )
    .slice(0, limit)
    .map((item) => item.entry)
}
