import { el, mount, setStyle } from 'redom'
import { FeatureCollection } from 'geojson'
import './search.css'
import { apiBase } from '../util'

export interface SearchResult {
  name: string
  category: string
  lngLat: [number, number]
}

interface GeoJSONProvider {
  url: string
  category: string
}

const MAX_RESULTS = 20

class Search {
  element: HTMLElement
  _input: HTMLInputElement
  _results: HTMLElement
  _index: SearchResult[] = []
  _onSelect: (result: SearchResult) => void

  constructor(onSelect: (result: SearchResult) => void) {
    this._onSelect = onSelect

    this._input = el('input', {
      type: 'search',
      placeholder: 'Search villages...',
      autocomplete: 'off',
      spellcheck: false,
      class: 'search-input',
    }) as HTMLInputElement

    this._results = el('ul.search-results', { style: 'display:none' })

    this.element = el(
      'div.search',
      el('div.search-input-wrap', this._input),
      this._results
    )

    this._input.addEventListener('input', () => this.render())
    this._input.addEventListener('focus', () => this.render())
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._input.value = ''
        this._input.blur()
        this.render()
      }
    })
    this._results.addEventListener('mousedown', (e) => e.preventDefault())
    this.element.addEventListener('focusout', (e) => {
      if (!this.element.contains(e.relatedTarget as Node)) {
        setStyle(this._results, { display: 'none' })
      }
    })

    this.loadIndex()
  }

  async loadIndex() {
    const providers: GeoJSONProvider[] = [
      { url: `${apiBase()}/api/villages.geojson`, category: 'Village' },
    ]

    const results = await Promise.allSettled(providers.map((p) => this.loadGeoJSON(p)))

    for (const result of results) {
      if (result.status === 'fulfilled') {
        this._index.push(...result.value)
      } else {
        console.warn('Search source failed to load:', result.reason)
      }
    }
    if (document.activeElement === this._input) this.render()
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

  render() {
    const matches = this.match(this._input.value)
    this._results.innerHTML = ''

    if (matches.length === 0) {
      setStyle(this._results, { display: 'none' })
      return
    }

    for (const item of matches) {
      const row = el(
        'li.search-result',
        el('span.search-result-name', item.name),
        el('span.search-result-category', item.category)
      )
      row.addEventListener('click', () => this.select(item))
      mount(this._results, row)
    }
    setStyle(this._results, { display: 'block' })
  }

  select(item: SearchResult) {
    this._onSelect(item)
    setStyle(this._results, { display: 'none' })
    this._input.blur()
  }
}

export default Search
