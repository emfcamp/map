import maplibreglStyle from 'maplibre-gl/dist/maplibre-gl.css?inline'
import mapCss from './map.css?inline'
import { LitElement, html, css, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import maplibregl from 'maplibre-gl'
import map_style from '../style/map_style.ts'
import Marker from '../marker.ts'
import { Layer, LayerGroup, LayerSwitcher, URLHash } from '@russss/maplibregl-layer-switcher'
import ContextMenu from './contextmenu.ts'
import { roundPosition } from '../util.ts'
import { setupPhones } from '../phones.ts'
import { setupVehicles } from '../vehicles.ts'
import { loadIcons } from '../icons.ts'
import { LngLat, LngLatLike } from 'maplibre-gl'

export class MapLoadEvent extends Event {
  map: maplibregl.Map
  constructor(map: maplibregl.Map) {
    super('load', { composed: true })
    this.map = map
  }
}

export class MarkerChangeEvent extends Event {
  coords?: LngLatLike
  constructor(position: LngLatLike | undefined) {
    super('marker', { composed: true })
    this.coords = position
  }
}

const lngLatConverter = {
  fromAttribute: (value: string | null) => {
    if (!value) {
      return null
    }
    const parts = value.split(',')
    return new LngLat(parseFloat(parts[0]), parseFloat(parts[1]))
  },
  toAttribute: (value: LngLat) => {
    return `${value.lng},${value.lat}`
  },
}

@customElement('emf-map')
export class EMFMap extends LitElement {
  static styles = [
    unsafeCSS(maplibreglStyle),
    css`
      :host {
        display: block;
      }
      #map {
        height: 100%;
      }

      .maplibregl-canvas.clickable {
        cursor: crosshair;
      }

      .maplibregl-ctrl.maplibregl-ctrl-attrib {
        backdrop-filter: blur(3px) saturate(80%);
      }

      .maplibregl-ctrl-attrib {
        font-size: 10px;
      }

      #install-prompt {
        margin-left: 2px;
        position: absolute;
        margin-right: 50px;
        max-width: 250px;
        min-width: 200px;
        padding: 4px;
        top: 50px;
        border-radius: 4px;
        border: 1px #ddd solid;
        background-color: rgba(255, 255, 255, 0.8);
      }

      #install-button {
        float: left;
      }

      #install-close {
        float: right;
      }

      .btn {
        font-size: 1.1em;
        background-color: white;
        border-radius: 4px;
      }
    `,
    unsafeCSS(mapCss),
  ]

  layer_config: (Layer | LayerGroup)[] = [
    new Layer('g', 'Grid', 'grid_'),
    new LayerGroup('Background', [
      new Layer('b', 'Map', 'background_', 'background', true),
      new Layer('s', 'Slope', 'slope', 'background'),
      new Layer('h', 'Hillshade', 'hillshade', 'background'),
      new Layer('o', 'Aerial imagery', 'ortho', 'background'),
    ]),
    new LayerGroup('EMF', [
      new Layer('a', 'Labels', 'labels_', true),
      new Layer('t', 'Structures', 'structures_', true),
      new Layer('p', 'Paths', 'paths_', true),
      new Layer('v', 'Villages', 'villages_', true),
      new Layer('r', 'Phones', 'phones_', true),
      new Layer('i', 'Noise prediction', 'noise', false),
    ]),
    new LayerGroup('Tracking', [
      new Layer('V', 'Vehicles', 'vehicles_', true)
    ]),
    new LayerGroup('Infrastructure', [
      new Layer('w', 'Power', 'power_'),
      new Layer('n', 'Network', 'network_'),
      new Layer('l', 'Lighting', 'lighting_'),
      new Layer('W', 'Water', 'water_'),
    ]),
    new Layer('bs', 'Buried services', 'services_'),
  ]
  map?: maplibregl.Map
  layer_switcher?: LayerSwitcher
  url_hash?: URLHash
  markerComponent?: Marker

  /* Whether extended nav controls are present (zoom in/out buttons, and geolocate control) */
  @property()
  navControls: boolean = false

  /* Whether to update the page URL hash with the current location */
  @property()
  urlHash: boolean = false

  /* Zoom level of the map */
  @property()
  zoom?: number

  /* Center of the map (longitude, latitude) */
  @property({ converter: lngLatConverter })
  center?: LngLat

  /* Marker position (longitude, latitude) */
  @property({ converter: lngLatConverter })
  marker?: LngLat

  @property()
  clickForMarker: boolean = false

  @property()
  layers?: string

  render() {
    return html`<div id="map"></div>`
  }

  firstUpdated(): void {
    if (!this.map) {
      this.init()
    }
  }

  init() {
    const container = this.renderRoot.querySelector('#map')

    let map_options: maplibregl.MapOptions = {
      container: container as HTMLElement,
      style: map_style,
      maxBounds: [-3.284912, 51.547329, -1.494141, 52.477539],
      pitchWithRotate: false,
      dragRotate: false,
      zoom: this.zoom,
      center: this.center,
    }

    this.layer_switcher = new LayerSwitcher(this.layer_config)

    if (this.urlHash) {
      this.url_hash = new URLHash(this.layer_switcher)
      this.layer_switcher.urlhash = this.url_hash
      map_options = this.url_hash.init(map_options)
    }

    if (this.layers) {
      this.layer_switcher.setURLString(this.layers)
    }

    this.markerComponent = new Marker(this.url_hash)

    this.layer_switcher.setInitialVisibility(map_style)
    const map = new maplibregl.Map(map_options)
    this.map = map

    if (this.navControls) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

      map.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true,
          },
          trackUserLocation: true,
        })
      )

      map.addControl(
        new maplibregl.ScaleControl({
          maxWidth: 200,
          unit: 'metric',
        })
      )
    }

    map.on('load', () => {
      if (this.marker) {
        this.markerComponent!.setLocation(this.marker)
      }
      this.dispatchEvent(new MapLoadEvent(map))
    })

    loadIcons(map)
    setupPhones(map)
    setupVehicles(map)

    map.touchZoomRotate.disableRotation()

    if (this.url_hash) {
      this.url_hash.enable(map)
    }
    map.addControl(this.layer_switcher, 'top-right')

    map.addControl(this.markerComponent, 'top-right')

    this.initContextMenu(true)

    if (this.clickForMarker) {
      const canvas = this.renderRoot.querySelector('#map canvas')
      canvas?.classList.add('clickable')

      map.on('click', (e) => {
        this.markerComponent?.setLocation(e.lngLat)
        this.dispatchEvent(new MarkerChangeEvent(e.lngLat))
      })
    }
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('center')) {
      this.map?.jumpTo({ center: this.center })
    }
    if (changedProperties.has('zoom')) {
      this.map?.jumpTo({ zoom: this.zoom })
    }
    if (changedProperties.has('marker')) {
      this.markerComponent?.setLocation(this.marker)
    }
    if (changedProperties.has('layers') && this.layers) {
      this.layer_switcher?.setURLString(this.layers)
    }
  }

  initContextMenu(markers: boolean) {
    const contextMenu = new ContextMenu(this.map!)
    if (markers) {
      contextMenu.addItem('Set marker', (_e, coords) => {
        this.markerComponent!.setLocation(coords)
        this.dispatchEvent(new MarkerChangeEvent(coords))
      })
      contextMenu.addItem(
        'Clear marker',
        () => {
          this.markerComponent!.setLocation(undefined)
          this.dispatchEvent(new MarkerChangeEvent(undefined))
        },
        () => this.markerComponent!.location != undefined
      )
    }
    contextMenu.addItem('Copy coordinates', (e, coords) => {
      const [lng, lat] = roundPosition([coords.lng, coords.lat], this.map!.getZoom())
      if (e.shiftKey) {
        navigator.clipboard.writeText(lng + ', ' + lat)
      } else {
        navigator.clipboard.writeText(lat + ', ' + lng)
      }
    })
  }
}
