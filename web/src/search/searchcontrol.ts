import { el, mount } from 'redom'
import maplibregl, { GeoJSONSource, LngLatBounds } from 'maplibre-gl'
import type { SearchIndex } from './searchindex.ts'
import type { SearchCategory, SearchEntry } from './searchentry.ts'
import { trackingSearchEntries, trackingPosition, subscribeTrackingUpdates } from '../tracking.ts'

const categoryZoom: Record<SearchCategory, number> = {
  structure: 18,
  gate: 17.5,
  village: 17.5,
  area: 17,
  camping: 16.5,
  parking: 16.5,
  vehicle: 18,
  bus: 17.5,
  person: 18,
}

/* Zoom cap when fitting all results at once; matches the widest per-category
   zoom in categoryZoom so co-located matches don't over-zoom */
const MULTI_RESULT_MAX_ZOOM = 17.5

const categoryLabel: Record<SearchCategory, string> = {
  structure: 'venue',
  area: 'area',
  camping: 'camping',
  parking: 'parking',
  gate: 'gate',
  village: 'village',
  vehicle: 'vehicle',
  bus: 'bus',
  person: 'person',
}

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
  _indexError: boolean = false
  _searchFn?: typeof import('./searchindex.ts').search
  _results: SearchEntry[] = []
  _activeIndex: number = -1
  _highlighted: SearchEntry[] = []
  _unsubscribeTracking?: () => void

  constructor() {
    this._toggleButton = el('button.search-toggle', {
      type: 'button',
      'aria-label': 'Search venues',
      'aria-expanded': 'false',
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
      'aria-autocomplete': 'list',
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

    // Listeners live on our own elements and are attached once here, so the
    // control survives addControl/removeControl/addControl without doubling
    this._toggleButton.addEventListener('click', () => this._toggle())
    this._clearButton.addEventListener('click', () => {
      this._clear()
      this._input.focus()
    })
    this._input.addEventListener('input', () => this._renderResults())
    this._input.addEventListener('focus', () => this._renderResults())
    this._input.addEventListener('keydown', (e) => this._onInputKeyDown(e))
    // Escape works from anywhere in the expanded bar, not just the input
    this._container.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._onEscape(e)
    })
    // DistanceMeasure cancels measuring on a document-level Escape keyup;
    // don't leak Escape presses that belong to the search bar
    this._container.addEventListener('keyup', (e) => {
      if (e.key === 'Escape') e.stopPropagation()
    })
    // Close the dropdown only when focus leaves the whole widget, so tabbing
    // between the input and the clear button doesn't dismiss results
    this._container.addEventListener('focusout', (e) => {
      if (!this._container.contains(e.relatedTarget as Node)) this._hideResults()
    })
    // Prevent result taps from blurring the input before their click handler runs
    this._resultsList.addEventListener('mousedown', (e) => e.preventDefault())
  }

  onAdd(map: maplibregl.Map) {
    this._map = map

    // Hoist above the navigation (+/-) controls, which are added before this one.
    // The container isn't attached to the corner element until onAdd returns.
    queueMicrotask(() => this._container.parentElement?.prepend(this._container))

    return this._container
  }

  onRemove() {
    this._setHighlights([])
    this._collapse()
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
    this._toggleButton.setAttribute('aria-expanded', 'true')
    this._toggleButton.setAttribute('aria-label', 'Close search')
    this._toggleButton.title = 'Close search'
    this._input.focus()
    this._ensureIndex()
    this._renderResults()
  }

  _collapse() {
    this._container.classList.remove('expanded')
    this._toggleButton.setAttribute('aria-expanded', 'false')
    this._toggleButton.setAttribute('aria-label', 'Search venues')
    this._toggleButton.title = 'Search venues'
    this._input.blur()
  }

  _ensureIndex() {
    const map = this._map
    if (!map) return
    this._indexPromise ??= import('./searchindex.ts')
      .then(async (module) => {
        this._searchFn = module.search
        this._indexError = false
        this._index = await module.buildIndex(map, () => {
          // Villages can merge in after the first render
          if (this._container.classList.contains('expanded')) this._renderResults()
        })
        this._renderResults()
      })
      .catch((e) => {
        // Chunk load can fail (e.g. offline before the service worker has
        // cached it); reset so the next expansion retries
        console.warn('Search: failed to load index', e)
        this._indexPromise = undefined
        this._indexError = true
        this._renderResults()
      })
  }

  /* Clear query, results and highlights */
  _clear() {
    this._input.value = ''
    this._setHighlights([])
    this._renderResults()
  }

  _onEscape(e: KeyboardEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (this._input.value) {
      this._clear()
      this._input.focus()
    } else {
      this._setHighlights([])
      this._collapse()
      this._toggleButton.focus()
    }
  }

  _onInputKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (this._results.length === 0) return
      if (this._activeIndex === -1) {
        this._activeIndex = e.key === 'ArrowDown' ? 0 : this._results.length - 1
      } else {
        const delta = e.key === 'ArrowDown' ? 1 : -1
        this._activeIndex = (this._activeIndex + delta + this._results.length) % this._results.length
      }
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
    }
  }

  _renderResults() {
    const query = this._input.value.trim()
    this._resultsList.innerHTML = ''
    this._activeIndex = -1
    this._input.removeAttribute('aria-activedescendant')

    if (!query) {
      this._input.setAttribute('aria-expanded', 'false')
      this._results = []
      return
    }

    if (this._indexError) {
      mount(
        this._resultsList,
        el('li.search-note', { role: 'presentation' }, 'Search failed to load — close and reopen to retry')
      )
      this._results = []
      return
    }

    if (!this._index || !this._searchFn) {
      mount(this._resultsList, el('li.search-note', { role: 'presentation' }, 'Loading…'))
      this._results = []
      return
    }

    // Live tracked entities are merged in per query so their positions and
    // enabled state are current; only enabled layers contribute entries
    const trackingEntries = this._map ? trackingSearchEntries(this._map) : []
    this._results = this._searchFn([...this._index.entries, ...trackingEntries], query)
    this._input.setAttribute('aria-expanded', 'true')

    if (this._index.offline) {
      mount(
        this._resultsList,
        el('li.search-note', { role: 'presentation' }, 'Offline — results limited to visible area')
      )
    }

    if (this._results.length === 0) {
      mount(
        this._resultsList,
        el(
          'li.search-note',
          { role: 'presentation' },
          this._index.entries.length ? 'No results' : 'Search unavailable offline'
        )
      )
      return
    }

    this._results.forEach((entry, i) => {
      const row = el(
        'li.search-result',
        {
          role: 'option',
          id: `search-result-${i}`,
          'aria-selected': 'false',
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
    rows.forEach((row, i) => {
      row.classList.toggle('active', i === this._activeIndex)
      row.setAttribute('aria-selected', String(i === this._activeIndex))
    })
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
    this._input.removeAttribute('aria-activedescendant')
  }

  // Live position of a tracked entry, falling back to its query-time coords
  _liveCoords(entry: SearchEntry): [number, number] {
    return (entry.tracked && trackingPosition(entry.tracked.type, entry.tracked.id)) || entry.coords
  }

  _select(entry: SearchEntry) {
    this._setHighlights([entry])
    this._map?.flyTo({ center: this._liveCoords(entry), zoom: categoryZoom[entry.category] })
    this._afterSelection()
  }

  _selectAll() {
    const results = this._results
    this._setHighlights(results)
    const first = this._liveCoords(results[0])
    const bounds = results.reduce(
      (b, entry) => b.extend(this._liveCoords(entry)),
      new LngLatBounds(first, first)
    )
    this._map?.fitBounds(bounds, {
      padding: { top: 90, bottom: 50, left: 50, right: 50 },
      maxZoom: MULTI_RESULT_MAX_ZOOM,
    })
    this._afterSelection()
  }

  _afterSelection() {
    // The expanded bar overlays the top of the map, so get out of the way
    // once a result is chosen; the query is kept for the next expansion
    this._collapse()
  }

  _setHighlights(entries: SearchEntry[]) {
    this._highlighted = entries
    this._syncFollow()
    this._renderHighlights()
  }

  // Follow live entities while one is highlighted, so the halo tracks them;
  // drop the subscription once nothing tracked is left
  _syncFollow() {
    const following = this._highlighted.some((entry) => entry.tracked)
    if (following && !this._unsubscribeTracking) {
      this._unsubscribeTracking = subscribeTrackingUpdates(() => this._renderHighlights())
    } else if (!following && this._unsubscribeTracking) {
      this._unsubscribeTracking()
      this._unsubscribeTracking = undefined
    }
  }

  // Rebuild the halo from live positions; a tracked entity that expired or whose
  // layer was turned off resolves to no coords, drops out and stops the follow
  _renderHighlights() {
    const source = this._map?.getSource('search_results') as GeoJSONSource | undefined
    if (!source) return
    const features: GeoJSON.Feature[] = []
    const live: SearchEntry[] = []
    for (const entry of this._highlighted) {
      const coords = entry.tracked ? trackingPosition(entry.tracked.type, entry.tracked.id) : entry.coords
      if (!coords) continue
      live.push(entry)
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords },
        properties: { name: entry.displayName, category: entry.category },
      })
    }
    if (live.length < this._highlighted.length) {
      this._highlighted = live
      this._syncFollow()
    }
    source.setData({ type: 'FeatureCollection', features })
    this._toggleButton.classList.toggle('active', features.length > 0)
  }
}

export default SearchControl
