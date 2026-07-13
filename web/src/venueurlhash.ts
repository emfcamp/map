import { URLHash } from '@russss/maplibregl-layer-switcher'
import type maplibregl from 'maplibre-gl'

/* Strip diacritics and lowercase. Shared by slugify and the search index's
   normalize so URL matching and search matching can never drift apart. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

// Letters that NFD leaves undecomposed, mapped so venue names like "Røde Bar"
// still get a predictable slug (rode-bar, not r-de-bar)
const TRANSLITERATIONS: Record<string, string> = {
  ø: 'o',
  æ: 'ae',
  ß: 'ss',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
}

/* Canonical URL slug for a venue name: "Stage A" -> "stage-a",
   "Parking: Main" -> "parking-main", "Crêche" -> "creche" */
export function slugify(name: string): string {
  return fold(name)
    .replace(/[øæßłđðþ]/g, (c) => TRANSLITERATIONS[c])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/* Venue slugs must start with a letter so numeric fragments are never
   mistaken for venues */
export function isVenueSlug(slug: string): boolean {
  return /^[a-z]/.test(slug)
}

/* Returns the canonical venue slug for a location hash like "#stage-a", or
   null when the hash is empty, a coordinate hash, or carries parameters —
   those belong to the coordinate URL hash handling */
function parseVenueHash(hash: string): string | null {
  let raw = hash.replace(/^#/, '')
  if (!raw) return null
  try {
    raw = decodeURIComponent(raw)
  } catch {
    return null
  }
  // Delimiters are checked after decoding so percent-encoded forms can't
  // smuggle a coordinate or parameter hash past the guard
  if (raw.includes('/') || raw.includes('=')) return null
  const slug = slugify(raw)
  return isVenueSlug(slug) ? slug : null
}

/* Attached as MapLibre eventData to camera moves initiated by venue
   resolution, so the movestart listener can tell them from user moves */
export const VENUE_MOVE = { venueMove: true }

/* URLHash that can hold a venue slug (e.g. #stage-a) in place of the usual
   coordinate hash. Programmatic venue flights keep the slug in the URL; any
   other camera movement (drag, wheel, keyboard, zoom buttons, geolocate)
   reverts to coordinates. Inert unless a slug is set or arrives in the hash.

   Note: this subclass overrides/uses the library's underscore-prefixed
   internals (_onHashChange, _updateHash, _map). They are typed but
   undocumented — re-check them when upgrading @russss/maplibregl-layer-switcher. */
export default class VenueURLHash extends URLHash {
  venueSlug: string | null = null
  onVenueSlug?: (slug: string | null) => void

  getHashString(): string {
    if (this.venueSlug) return '#' + this.venueSlug
    return super.getHashString()
  }

  setVenueSlug(slug: string | null) {
    if (slug === this.venueSlug) return
    this.venueSlug = slug
    if (this._map) this._updateHash()
  }

  /* Parameters (e.g. the marker position) only appear in coordinate hashes,
     so setting one while a venue slug is active leaves venue mode — otherwise
     the copied URL would silently lose the parameter */
  setParameter(key: string, value: string | null) {
    if (this.venueSlug && value !== null) {
      this.setVenueSlug(null)
      this.onVenueSlug?.(null)
    }
    super.setParameter(key, value)
  }

  enable(map: maplibregl.Map) {
    super.enable(map)
    const clearSlug = () => {
      if (!this.venueSlug) return
      this.venueSlug = null
      this.onVenueSlug?.(null)
    }
    // A user-driven camera move means the view is no longer "the venue", so
    // the hash reverts to coordinates. User moves carry originalEvent (drag,
    // zoom buttons, keyboard, double-click, pinch) or geolocateSource
    // (geolocate flights). Venue flights are tagged VENUE_MOVE, and resize
    // fires movestart with neither — it must not clear the slug.
    map.on(
      'movestart',
      (e: maplibregl.MapLibreEvent & { venueMove?: boolean; geolocateSource?: boolean }) => {
        if (e.venueMove) return
        if (e.originalEvent || e.geolocateSource) clearSlug()
        // The moveend that follows rewrites the hash to coordinates
      }
    )
    // Wheel zoom's movestart carries no originalEvent, so it needs its own
    // listener. Rewrite the hash immediately: a wheel at the zoom limit
    // produces no moveend to do it.
    map.on('wheel', () => {
      if (!this.venueSlug) return
      clearSlug()
      if (this._map) this._updateHash()
    })
  }

  _onHashChange(new_hash: string) {
    const slug = parseVenueHash(new_hash)
    if (slug) {
      // Never forward slug hashes to the coordinate parser: it would wipe
      // registered parameters (e.g. the marker's m=) from memory
      if (slug !== this.venueSlug) {
        this.venueSlug = slug
        this.onVenueSlug?.(slug)
      }
      // Canonicalize the URL bar (e.g. #Stage%20A -> #stage-a)
      if (this._map && new_hash !== '#' + slug) this._updateHash()
      return
    }
    if (this.venueSlug) {
      // Leaving venue mode via the URL bar or history navigation; clear the
      // slug before delegating or the next moveend would clobber the new hash
      this.venueSlug = null
      this.onVenueSlug?.(null)
    }
    super._onHashChange(new_hash)
  }
}
