import { LitElement, html, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { FeatureCollection } from 'geojson'
import './search.css'
import { apiBase } from '../util'

export enum SearchCategory {
  Village = 'Village',
}

export interface SearchResult {
  name: string
  category: SearchCategory
  lngLat: [number, number]
}

interface GeoJSONProvider {
  url: string
  category: SearchCategory
}

const MAX_RESULTS = 20

@customElement('emf-search')
class Search extends LitElement {
  @state() private _index: SearchResult[] = []
  @state() private _query: string = ''
  @state() private _focused: boolean = false

  createRenderRoot() {
    return this
  }

  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('focusout', this._onFocusOut)
    this.loadIndex()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('focusout', this._onFocusOut)
  }

  private _onFocusOut = (e: FocusEvent) => {
    if (!this.contains(e.relatedTarget as Node)) {
      this._focused = false
    }
  }

  async loadIndex() {
    const providers: GeoJSONProvider[] = [
      { url: `${apiBase()}/api/villages.geojson`, category: SearchCategory.Village },
    ]

    const results = await Promise.allSettled(providers.map((p) => this.loadGeoJSON(p)))

    for (const result of results) {
      if (result.status === 'fulfilled') {
        this._index.push(...result.value)
      } else {
        console.warn('Search source failed to load:', result.reason)
      }
    }
  }

  async loadGeoJSON(provider: GeoJSONProvider): Promise<SearchResult[]> {
    const resp = await fetch(provider.url)
    if (!resp.ok) throw new Error(`${provider.url}: ${resp.status}`)
    const data: FeatureCollection = await resp.json()
    const items: SearchResult[] = []
    for (const feature of data.features) {
      const name = feature.properties?.name
      if (!name || feature.geometry?.type !== 'Point') continue
      const [lng, lat] = feature.geometry.coordinates
      items.push({ name, category: provider.category, lngLat: [lng, lat] })
    }
    return items
  }

  match(query: string): SearchResult[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const scored: { item: SearchResult; score: number }[] = []
    for (const item of this._index) {
      const idx = item.name.toLowerCase().indexOf(q)
      if (idx === -1) continue
      scored.push({ item, score: idx === 0 ? 0 : 1 })
    }
    scored.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
    return scored.slice(0, MAX_RESULTS).map((s) => s.item)
  }

  select(item: SearchResult) {
    this.dispatchEvent(new CustomEvent<SearchResult>('select', { detail: item, bubbles: true, composed: true }))
    this._query = ''
    this._focused = false
  }

  render() {
    const matches = this._focused ? this.match(this._query) : []

    return html`
      <div class="search-input-wrap">
        <input
          type="search"
          placeholder="Search villages..."
          autocomplete="off"
          .spellcheck=${false}
          class="search-input"
          .value=${this._query}
          @input=${(e: InputEvent) => (this._query = (e.target as HTMLInputElement).value)}
          @focus=${() => (this._focused = true)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Escape') {
              this._query = ''
              this._focused = false
            }
          }}
        />
      </div>
      ${matches.length > 0
        ? html`
            <ul class="search-results">
              ${matches.map(
                (item) => html`
                  <li
                    class="search-result"
                    @mousedown=${(e: MouseEvent) => e.preventDefault()}
                    @click=${() => this.select(item)}
                  >
                    <span class="search-result-name">${item.name}</span>
                    <span class="search-result-category">${item.category}</span>
                  </li>
                `
              )}
            </ul>
          `
        : nothing}
    `
  }
}

export default Search
