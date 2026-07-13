import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import maplibregl, { GeoJSONSource } from 'maplibre-gl'
import { center } from '../style/map_style.ts'
import { fold, slugify } from '../venueurlhash.ts'

export type SearchCategory = 'structure' | 'area' | 'camping' | 'parking' | 'gate' | 'village'

export interface SearchEntry {
  displayName: string
  normalized: string
  slug: string
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

/* Zoom level at which the whole site fits comfortably inside a single
   site_plan tile. z11 keeps the site centre well away from every tile edge,
   so the venue moving between events can't silently drop features that a
   tighter tile would clip. */
const INDEX_TILE_ZOOM = 11
const TILE_FETCH_TIMEOUT_MS = 5000
const DEFAULT_IMPORTANCE = 3

function normalize(s: string): string {
  return fold(s).trim()
}

function tileForPoint(lng: number, lat: number, z: number): { x: number; y: number } {
  const latR = (lat * Math.PI) / 180
  const x = Math.floor(((lng + 180) / 360) * 2 ** z)
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * 2 ** z)
  return { x, y }
}

/* Village data is attendee-editable, so coordinates can't be trusted to be
   well-formed; a bad entry must not break selection or bounds fitting */
function validCoords(coords: unknown): coords is [number, number] {
  return (
    Array.isArray(coords) &&
    coords.length >= 2 &&
    Number.isFinite(coords[0]) &&
    Number.isFinite(coords[1]) &&
    Math.abs(coords[0]) <= 180 &&
    Math.abs(coords[1]) <= 90
  )
}

function makeEntry(
  category: SearchCategory,
  displayName: string,
  geometry: GeoJSON.Geometry | null | undefined,
  importance: number
): SearchEntry | undefined {
  if (geometry?.type !== 'Point' || !validCoords(geometry.coordinates)) return undefined
  return {
    displayName,
    normalized: normalize(displayName),
    slug: slugify(displayName),
    category,
    coords: geometry.coordinates as [number, number],
    importance,
  }
}

/* Resolve a URL venue slug to entries, most-specific tier first:
   1. exact — duplicate names resolve together
   2. prefix at a hyphen boundary — #parking matches every "Parking: …"
   3. containment at hyphen boundaries — #robot-arms matches "The Robot Arms"
   Hyphen boundaries keep it predictable: #stage never matches "Backstage".
   Deliberately not fuzzy: URL slugs should be guessable and stable. */
export function resolveSlug(entries: SearchEntry[], slug: string): SearchEntry[] {
  const exact = entries.filter((entry) => entry.slug === slug)
  if (exact.length > 0) return exact
  const prefixed = entries.filter((entry) => entry.slug.startsWith(slug + '-'))
  if (prefixed.length > 0) return prefixed
  return entries.filter((entry) => entry.slug.includes('-' + slug + '-') || entry.slug.endsWith('-' + slug))
}

interface LayerExtractor {
  sourceLayer: string
  category: SearchCategory
  displayName: (props: Record<string, unknown>) => string | undefined
  importance: (props: Record<string, unknown>) => number
}

const constImportance = () => DEFAULT_IMPORTANCE

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

async function sitePlanEntries(map: maplibregl.Map): Promise<{ entries: SearchEntry[]; offline: boolean }> {
  try {
    const source = map.getStyle().sources['site_plan']
    if (!source || source.type !== 'vector' || !source.tiles?.length) {
      throw new Error('site_plan source has no tile URL')
    }
    const [lng, lat] = center
    const { x, y } = tileForPoint(lng, lat, INDEX_TILE_ZOOM)
    const url = source.tiles[0]
      .replace('{z}', String(INDEX_TILE_ZOOM))
      .replace('{x}', String(x))
      .replace('{y}', String(y))

    const resp = await fetch(url, { signal: AbortSignal.timeout(TILE_FETCH_TIMEOUT_MS) })
    if (!resp.ok) throw new Error(`tile fetch failed: ${resp.status}`)
    const tile = new VectorTile(new Pbf(new Uint8Array(await resp.arrayBuffer())))

    const entries: SearchEntry[] = []
    for (const extractor of extractors) {
      const layer = tile.layers[extractor.sourceLayer]
      if (!layer) {
        console.warn(`Search: source-layer ${extractor.sourceLayer} missing from site plan tile`)
        continue
      }
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i)
        const displayName = extractor.displayName(feature.properties)
        if (!displayName) continue
        const geometry = feature.toGeoJSON(x, y, INDEX_TILE_ZOOM).geometry
        const entry = makeEntry(
          extractor.category,
          displayName,
          geometry,
          extractor.importance(feature.properties)
        )
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
      const displayName = extractor.displayName(feature.properties)
      if (!displayName) continue
      const entry = makeEntry(
        extractor.category,
        displayName,
        feature.geometry,
        extractor.importance(feature.properties)
      )
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
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) return []
    const entries: SearchEntry[] = []
    for (const feature of data.features) {
      const name = feature.properties?.name
      if (!name) continue
      const entry = makeEntry('village', String(name), feature.geometry, DEFAULT_IMPORTANCE)
      if (entry) entries.push(entry)
    }
    return entries
  } catch (e) {
    console.warn('Search: villages unavailable', e)
    return []
  }
}

export async function buildIndex(map: maplibregl.Map, onUpdate?: () => void): Promise<SearchIndex> {
  // Start both loads concurrently, but never block on villages: getData()
  // does not settle while the villages source is unreachable, so they merge
  // in whenever they arrive and onUpdate lets the UI refresh
  const villagesPromise = villageEntries(map)
  const sitePlan = await sitePlanEntries(map)
  const index: SearchIndex = { entries: sitePlan.entries, offline: sitePlan.offline }
  villagesPromise.then((villages) => {
    for (const village of villages) index.entries.push(village)
    // Fires even with no villages: it doubles as the "index is final" signal
    onUpdate?.()
  })
  return index
}

function score(entry: SearchEntry, query: string): number {
  if (entry.normalized === query) return 4
  if (entry.normalized.startsWith(query)) return 3
  if (entry.normalized.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(query))) return 2
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
