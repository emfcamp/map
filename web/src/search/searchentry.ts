// Shared search entry types and builders. Kept dependency-free so tracking.ts
// can build entries without dragging searchindex.ts's VectorTile/Pbf deps into
// the initial bundle.

export type SearchCategory =
  'structure' | 'area' | 'camping' | 'parking' | 'gate' | 'village' | 'vehicle' | 'bus' | 'person'

/* Identifies a live tracked feature so its highlight can follow the moving
   entity. Absent on static site-plan and village entries. */
export interface TrackedRef {
  type: string
  id: string
}

export interface SearchEntry {
  displayName: string
  normalized: string
  category: SearchCategory
  coords: [number, number]
  importance: number
  tracked?: TrackedRef
}

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/* Village data is attendee-editable and live tracker positions arrive from an
   external stream, so coordinates can't be trusted to be well-formed; a bad
   entry must not break selection, bounds fitting or a flyTo. */
export function validCoords(coords: unknown): coords is [number, number] {
  return (
    Array.isArray(coords) &&
    coords.length >= 2 &&
    Number.isFinite(coords[0]) &&
    Number.isFinite(coords[1]) &&
    Math.abs(coords[0]) <= 180 &&
    Math.abs(coords[1]) <= 90
  )
}

export function makeEntry(
  category: SearchCategory,
  displayName: string,
  geometry: GeoJSON.Geometry | null | undefined,
  importance: number,
  tracked?: TrackedRef
): SearchEntry | undefined {
  if (geometry?.type !== 'Point' || !validCoords(geometry.coordinates)) return undefined
  return {
    displayName,
    normalized: normalize(displayName),
    category,
    coords: geometry.coordinates as [number, number],
    importance,
    ...(tracked ? { tracked } : {}),
  }
}
