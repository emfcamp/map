import { URLHash } from '@russss/maplibregl-layer-switcher'
import maplibregl from 'maplibre-gl'

/* Canonical URL slug for a venue name: "Stage A" -> "stage-a",
   "Parking: Main" -> "parking-main", "Crêche" -> "creche" */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/* Returns the canonical venue slug for a location hash like "#stage-a", or
   null when the hash is empty, a coordinate hash, or carries parameters —
   those belong to the coordinate URL hash handling */
export function parseVenueHash(hash: string): string | null {
  let raw = hash.replace(/^#/, '')
  if (!raw || raw.includes('/') || raw.includes('=')) return null
  try {
    raw = decodeURIComponent(raw)
  } catch {
    return null
  }
  const slug = slugify(raw)
  // Require a leading letter so numeric fragments are never venue slugs
  return /^[a-z]/.test(slug) ? slug : null
}

/* URLHash that can hold a venue slug (e.g. #stage-a) in place of the usual
   coordinate hash. While a slug is active, map movement keeps the slug in the
   URL; a user-initiated gesture (drag/wheel/pinch) reverts to coordinates.
   Inert unless setVenueSlug is called or the page hash is a venue slug. */
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

  enable(map: maplibregl.Map) {
    super.enable(map)
    // A user camera gesture means the view is no longer "the venue", so the
    // hash reverts to coordinates. These events fire only on user input (a
    // wheel zoom's movestart carries no originalEvent, so movestart alone
    // can't tell user moves from the venue flyTo, which fires none of these)
    const clearSlug = () => {
      if (this.venueSlug) {
        this.venueSlug = null
        this.onVenueSlug?.(null)
      }
    }
    map.on('dragstart', clearSlug)
    map.on('wheel', clearSlug)
    map.on('dblclick', clearSlug)
    map.on('touchmove', clearSlug)
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
