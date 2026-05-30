import { Feature, FeatureCollection } from 'geojson'
import './index.css'
import { EventMap } from './map.ts'
import { GeoJSONSource } from 'maplibre-gl/src/index.ts'
import { center as defaultCenter, zoom } from './style/map_style.ts'

const SOURCE_NAME = 'grist_markers'

function initGrist(map: maplibregl.Map) {
  grist.ready({
    columns: [
      { name: 'latitude', type: 'Numeric', title: 'Latitude' },
      { name: 'longitude', type: 'Numeric', title: 'Longitude' },
      { name: 'name', type: 'Text', title: 'Name', optional: true },
    ],
    requiredAccess: 'read table',
  })

  grist.onRecords(function (records, mappings) {
    const sourceRecords = grist.mapColumnNames(records, mappings)
    let markers: Feature[] = []
    for (let record of sourceRecords) {
      markers.push({
        type: 'Feature',
        id: record.id,
        geometry: {
          type: 'Point',
          coordinates: [record['longitude'], record['latitude']],
        },
        properties: {
          name: record['name'] || '',
        },
      })
    }

    const sourceData: FeatureCollection = {
      type: 'FeatureCollection',
      features: markers,
    }

    if (map.getSource(SOURCE_NAME)) {
      const source: GeoJSONSource = map.getSource(SOURCE_NAME)!
      source.setData(sourceData)
    } else {
      map.addSource(SOURCE_NAME, { type: 'geojson', data: sourceData })
    }
  })

  grist.onRecord(function (record) {
    map.removeFeatureState({
      source: SOURCE_NAME,
    })
    map.setFeatureState({ source: SOURCE_NAME, id: record.id }, { 'grist-selected': true })
  })

  async function savePosition() {
    const curCenter = map.getCenter()
    if (
      map.getZoom() == zoom &&
      curCenter.lng.toFixed(3) == defaultCenter[0].toFixed(3) &&
      curCenter.lat.toFixed(3) == defaultCenter[1].toFixed(3)
    ) {
      return
    }

    await grist.setOptions({
      zoom: map.getZoom(),
      center: curCenter,
    })
  }

  // Save map center and zoom as Grist options

  let saveTimeout: number

  map.on('zoomend', async () => {
    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(savePosition, 1000)
  })

  map.on('moveend', async () => {
    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(savePosition, 1000)
  })

  grist.onOptions((options) => {
    clearTimeout(saveTimeout)
    if (!options) {
      map.setZoom(zoom)
      map.setCenter(defaultCenter)
      return
    }

    if (options.zoom) {
      map.setZoom(options.zoom)
    }

    if (options.center) {
      map.setCenter(options.center)
    }
  })

  /*
  map.on('click', 'grist-markers', async (e) => {
    if (!e.features) return
    let id = e.features[0].id
    console.log(id)
    await grist.setCursorPos({ rowId: id })
  })
  */
}

function init() {
  const em = new EventMap()
  em.init({ embed: true })

  if (em.map?.isStyleLoaded()) {
    initGrist(em.map!)
  } else {
    em.map!.on('load', () => {
      initGrist(em.map!)
    })
  }
}

if (document.readyState != 'loading') {
  init()
} else {
  document.addEventListener('DOMContentLoaded', init)
}
