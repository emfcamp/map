import { el, mount } from 'redom'
import maplibregl, { GeoJSONSource, LngLatBounds } from 'maplibre-gl'
import type { SearchCategory, SearchEntry, SearchIndex } from './searchindex.ts'

const categoryZoom: Record<SearchCategory, number> = {
  structure: 18,
  gate: 17.5,
  village: 17.5,
  area: 17,
  camping: 16.5,
  parking: 16.5,
}

const categoryLabel: Record<SearchCategory, string> = {
  structure: 'venue',
  area: 'area',
  camping: 'camping',
  parking: 'parking',
  gate: 'gate',
  village: 'village',
}

const emptyCollection: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

class SearchControl implements maplibregl.IControl {
  _map?: maplibregl.Map
  _container: HTMLElement
  _toggleButton: HTMLButtonElement
  _panel: HTMLElement
  _input: HTMLInputElement
  _clearButton: HTMLButtonElement
  _resultsList: HTMLElement
  _indexPromise?: Promise<void>
  _index?: SearchIndex
  _searchFn?: typeof import('./searchindex.ts').search
  _results: SearchEntry[] = []
  _activeIndex: number = -1

  constructor() {
    this._toggleButton = el('button.search-toggle', {
      type: 'button',
      'aria-label': 'Search venues',
      title: 'Search venues',
    }) as HTMLButtonElement
    this._input = el('input.search-input', {
      type: 'text',
      placeholder: 'Search venues…',
      enterkeyhint: 'search',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-controls': 'search-results-list',
    }) as HTMLInputElement
    this._clearButton = el('button.search-clear', {
      type: 'button',
      'aria-label': 'Clear search',
    }) as HTMLButtonElement
    this._clearButton.textContent = '✕'
    this._resultsList = el('ul.search-results', { role: 'listbox', id: 'search-results-list' })
    this._panel = el(
      'div.search-panel',
      el('div.search-input-row', this._input, this._clearButton),
      this._resultsList
    )
    this._container = el(
      'div.maplibregl-ctrl.maplibregl-ctrl-group.search-ctrl',
      this._toggleButton,
      this._panel
    )
  }

  onAdd(map: maplibregl.Map) {
    this._map = map

    this._toggleButton.addEventListener('click', () => this._toggle())
    this._clearButton.addEventListener('click', () => {
      this._clear()
      this._input.focus()
    })
    this._input.addEventListener('input', () => this._renderResults())
    this._input.addEventListener('keydown', (e) => this._onKeyDown(e))
    this._input.addEventListener('blur', () => this._hideResults())
    // Prevent result taps from blurring the input before their click handler runs
    this._resultsList.addEventListener('mousedown', (e) => e.preventDefault())

    // Hoist above the navigation (+/-) controls, which are added before this one.
    // The container isn't attached to the corner element until onAdd returns.
    queueMicrotask(() => this._container.parentElement?.prepend(this._container))

    return this._container
  }

  onRemove() {
    this._setHighlights([])
    this._container.parentNode?.removeChild(this._container)
    this._map = undefined
  }

  _toggle() {
    if (this._container.classList.contains('expanded')) {
      this._collapse()
    } else {
      this._expand()
    }
  }

  _expand() {
    this._container.classList.add('expanded')
    this._input.focus()
    this._ensureIndex()
    this._renderResults()
  }

  _collapse() {
    this._container.classList.remove('expanded')
    this._input.blur()
  }

  _ensureIndex() {
    this._indexPromise ??= import('./searchindex.ts').then(async (module) => {
      this._searchFn = module.search
      this._index = await module.buildIndex(this._map!)
      this._renderResults()
    })
  }

  /* Clear query, results and highlights */
  _clear() {
    this._input.value = ''
    this._setHighlights([])
    this._renderResults()
  }

  _onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (this._results.length === 0) return
      const delta = e.key === 'ArrowDown' ? 1 : -1
      this._activeIndex = (this._activeIndex + delta + this._results.length) % this._results.length
      this._updateActiveRow()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (this._activeIndex >= 0 && this._results[this._activeIndex]) {
        this._select(this._results[this._activeIndex])
      } else if (this._results.length === 1) {
        this._select(this._results[0])
      } else if (this._results.length > 1) {
        this._selectAll()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (this._input.value) {
        this._clear()
      } else {
        this._setHighlights([])
        this._collapse()
        this._toggleButton.focus()
      }
    }
  }

  _renderResults() {
    const query = this._input.value.trim()
    this._resultsList.innerHTML = ''
    this._activeIndex = -1

    if (!query) {
      this._input.setAttribute('aria-expanded', 'false')
      this._results = []
      return
    }

    if (!this._index || !this._searchFn) {
      mount(this._resultsList, el('li.search-note', 'Loading…'))
      this._results = []
      return
    }

    this._results = this._searchFn(this._index.entries, query)
    this._input.setAttribute('aria-expanded', 'true')

    if (this._index.offline) {
      mount(this._resultsList, el('li.search-note', 'Offline — results limited to visible area'))
    }

    if (this._results.length === 0) {
      mount(
        this._resultsList,
        el('li.search-note', this._index.entries.length ? 'No results' : 'Search unavailable offline')
      )
      return
    }

    this._results.forEach((entry, i) => {
      const row = el(
        'li.search-result',
        {
          role: 'option',
          id: `search-result-${i}`,
        },
        el('span.search-result-name', entry.displayName),
        el('span.search-badge.search-badge-' + entry.category, categoryLabel[entry.category])
      )
      row.addEventListener('click', () => this._select(entry))
      mount(this._resultsList, row)
    })
  }

  _updateActiveRow() {
    const rows = this._resultsList.querySelectorAll('.search-result')
    rows.forEach((row, i) => row.classList.toggle('active', i === this._activeIndex))
    if (this._activeIndex >= 0) {
      this._input.setAttribute('aria-activedescendant', `search-result-${this._activeIndex}`)
      rows[this._activeIndex]?.scrollIntoView({ block: 'nearest' })
    } else {
      this._input.removeAttribute('aria-activedescendant')
    }
  }

  _hideResults() {
    // Keep query and highlights; just close the dropdown
    this._resultsList.innerHTML = ''
    this._activeIndex = -1
    this._input.setAttribute('aria-expanded', 'false')
  }

  _select(entry: SearchEntry) {
    this._setHighlights([entry])
    this._map?.flyTo({ center: entry.coords, zoom: categoryZoom[entry.category] })
    this._afterSelection()
  }

  _selectAll() {
    const results = this._results
    this._setHighlights(results)
    const bounds = results.reduce(
      (b, entry) => b.extend(entry.coords),
      new LngLatBounds(results[0].coords, results[0].coords)
    )
    this._map?.fitBounds(bounds, {
      padding: { top: 90, bottom: 50, left: 50, right: 50 },
      maxZoom: 17.5,
    })
    this._afterSelection()
  }

  _afterSelection() {
    // The expanded bar overlays the top of the map, so get out of the way
    // once a result is chosen; the query is kept for the next expansion
    this._collapse()
  }

  _setHighlights(entries: SearchEntry[]) {
    const source = this._map?.getSource('search_results') as GeoJSONSource | undefined
    if (!source) return
    if (entries.length === 0) {
      source.setData(emptyCollection)
      this._toggleButton.classList.remove('active')
      return
    }
    source.setData({
      type: 'FeatureCollection',
      features: entries.map((entry) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: entry.coords },
        properties: { name: entry.displayName, category: entry.category },
      })),
    })
    this._toggleButton.classList.add('active')
  }
}

export default SearchControl
