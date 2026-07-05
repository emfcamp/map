/*
  Main code for Grist map widget (grist-widget.html)
*/
import '../index.css'
import '../components/map.ts'

import { Feature, FeatureCollection } from 'geojson'
import { LitElement, html, css } from 'lit'
import { customElement } from 'lit/decorators.js'
import { MapLoadEvent } from '../components/map.ts'
import { GeoJSONSource } from 'maplibre-gl'
import { center as defaultCenter, zoom } from '../style/map_style.ts'

const SOURCE_NAME = 'grist_markers'

@customElement('emf-map-grist-widget')
export class EMFMapGristWidget extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }
    emf-map {
      display: block;
      height: 100%;
      width: 100%;
    }
  `

  render() {
    return html`<emf-map embed="true" @load="${this.initGrist}"></emf-map>`
  }

  initGrist(e: MapLoadEvent) {
    const map = e.map
    grist.ready({
      columns: [
        { name: 'latitude', type: 'Numeric', title: 'Latitude' },
        { name: 'longitude', type: 'Numeric', title: 'Longitude' },
        { name: 'name', type: 'Text', title: 'Name', optional: true },
      ],
      requiredAccess: 'read table',
    })

    grist.onRecords(function (records, mappings) {
      const sourceRecords = grist.mapColumnNames(records, { mappings })
      const markers: Feature[] = []
      for (const record of sourceRecords) {
        console.log(record)

        const lat = parseFloat(record.latitude),
          lon = parseFloat(record.longitude)

        if (!lat || !lon) {
          continue
        }

        markers.push({
          type: 'Feature',
          id: record.id,
          geometry: {
            type: 'Point',
            coordinates: [lon, lat],
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
        const source: GeoJSONSource = map.getSource(SOURCE_NAME)! as GeoJSONSource
        source.setData(sourceData)
      } else {
        map.addSource(SOURCE_NAME, { type: 'geojson', data: sourceData })
      }
    })

    grist.onRecord(function (record) {
      map.removeFeatureState({
        source: SOURCE_NAME,
      })
      if (record) map.setFeatureState({ source: SOURCE_NAME, id: record.id }, { 'grist-selected': true })
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

    let saveTimeout: ReturnType<typeof setTimeout>

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
}
