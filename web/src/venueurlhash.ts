import { URLHash } from '@russss/maplibregl-layer-switcher'
import type maplibregl from 'maplibre-gl'

/* Strip diacritics and lowercase; shared with the search index's normalize */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/* "Stage A" -> "stage-a", "Parking: Main" -> "parking-main", "Crêche" -> "creche" */
export function slugify(name: string): string {
  return fold(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/* Slugs start with a letter, so numeric fragments are never venues */
export function isVenueSlug(slug: string): boolean {
  return /^[a-z]/.test(slug)
}

/* "#stage-a" -> "stage-a"; null for coordinate hashes and parameters */
function parseVenueHash(hash: string): string | null {
  let raw = hash.replace(/^#/, '')
  if (!raw) return null
  try {
    raw = decodeURIComponent(raw)
  } catch {
    return null
  }
  // Checked after decoding so %2F etc. can't smuggle delimiters past the guard
  if (raw.includes('/') || raw.includes('=')) return null
  const slug = slugify(raw)
  return isVenueSlug(slug) ? slug : null
}

/* eventData tag exempting venue flyTo/fitBounds from slug clearing */
export const VENUE_MOVE = { venueMove: true }

/* URLHash that can hold a venue slug (#stage-a) instead of the coordinate
   hash. User camera moves revert to coordinates; venue flights don't.
   Uses the library's underscore-prefixed internals (_onHashChange,
   _updateHash, _map) — re-check on layer-switcher upgrades. */
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

  /* Parameters (e.g. the marker's m=) only appear in coordinate hashes, so
     setting one leaves venue mode or the copied URL would lose it */
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
    // User moves carry originalEvent (drag, zoom buttons, keyboard, pinch) or
    // geolocateSource; resize fires movestart with neither and must not clear
    map.on(
      'movestart',
      (e: maplibregl.MapLibreEvent & { venueMove?: boolean; geolocateSource?: boolean }) => {
        if (!e.venueMove && (e.originalEvent || e.geolocateSource)) clearSlug()
      }
    )
    // Wheel zoom's movestart carries no originalEvent; rewrite immediately
    // because a wheel at the zoom limit produces no moveend
    map.on('wheel', () => {
      if (!this.venueSlug) return
      clearSlug()
      if (this._map) this._updateHash()
    })
  }

  _onHashChange(new_hash: string) {
    const slug = parseVenueHash(new_hash)
    if (slug) {
      if (slug !== this.venueSlug) {
        this.venueSlug = slug
        this.onVenueSlug?.(slug)
      }
      // Canonicalize the URL bar (#Stage%20A -> #stage-a); never forward slug
      // hashes to super, which would wipe registered parameters from memory
      if (this._map && new_hash !== '#' + slug) this._updateHash()
      return
    }
    if (this.venueSlug) {
      // Clear before delegating or the next moveend would clobber the new hash
      this.venueSlug = null
      this.onVenueSlug?.(null)
    }
    super._onHashChange(new_hash)
  }
}
