import { LitElement, html, nothing, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { FeatureCollection } from 'geojson'
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
  static styles = css`
    :host {
      position: relative;
      box-sizing: border-box;
      width: auto;
      margin: 8px 0 0 8px;
      --search-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E");
    }
    .search-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .search-input-wrap::before {
      content: '';
      position: absolute;
      left: 16px;
      width: 16px;
      height: 16px;
      z-index: 1;
      pointer-events: none;
      background-color: #000;
      -webkit-mask: var(--search-icon) center / contain no-repeat;
      mask: var(--search-icon) center / contain no-repeat;
    }
    .search-input {
      box-sizing: border-box;
      width: 100%;
      height: 46px;
      padding: 0 16px 0 42px;
      border: none;
      border-radius: 12px;
      box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
      font-family: inherit;
      font-size: 16px;
      font-weight: 500;
      color: #2b2f1f;
      background: #fff;
      backdrop-filter: blur(3px) saturate(80%);
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }
    .search-input::placeholder {
      color: #9aa088;
      font-weight: 400;
    }
    .search-input:focus {
      outline: none;
    }
    .search-input::-webkit-search-cancel-button {
      -webkit-appearance: none;
      appearance: none;
    }
    .search-results {
      position: absolute;
      top: 54px;
      left: 0;
      right: 0;
      z-index: 3;
      list-style: none;
      margin: 0;
      padding: 6px;
      max-height: 50vh;
      overflow-y: auto;
      background: #fff;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 12px;
      box-shadow:
        0 2px 6px rgba(0, 0, 0, 0.08),
        0 12px 28px rgba(0, 0, 0, 0.18);
    }
    .search-result {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      cursor: pointer;
      border-radius: 8px;
      transition: background-color 0.1s ease;
    }
    .search-result:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }
    .search-result-name {
      font-size: 15px;
      font-weight: 500;
      color: #2b2f1f;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .search-result-category {
      flex-shrink: 0;
      padding: 3px 9px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #5c6b18;
      background: #e8efcb;
      border-radius: 999px;
    }
  `

  @state() private _index: SearchResult[] = []
  @state() private _query: string = ''
  @state() private _focused: boolean = false

  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('focusout', this._onFocusOut)
    if (this._index.length === 0) this.loadIndex()
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
        this._index = [...this._index, ...result.value]
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

  private match(query: string): SearchResult[] {
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
