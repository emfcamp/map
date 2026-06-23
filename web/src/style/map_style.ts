import sortBy from 'lodash.sortby'
import { StyleSpecification } from 'maplibre-gl'
import { layers } from './emf.ts'

export const center: [number, number] = [-2.3784, 52.0411]
export const zoom = 16

const style: StyleSpecification = {
  version: 8,
  name: 'EMF',
  center: center,
  zoom: zoom,
  bearing: 0,
  pitch: 0,
  sources: {
    basemap: {
      type: 'vector',
      tiles: ['https://map.emfcamp.org/tiles/basemap/{z}/{x}/{y}'],
      maxzoom: 14,
      attribution: '© OpenStreetMap contributors',
    },
    site_plan: {
      type: 'vector',
      tiles: ['https://map.emfcamp.org/tiles/_main/{z}/{x}/{y}'],
    },
    villages: {
      type: 'geojson',
      data: 'https://www.emfcamp.org/api/villages.geojson',
    },
    slope: {
      type: 'raster',
      tiles: ['https://map.emfcamp.org/tiles/slope/{z}/{x}/{y}'],
      tileSize: 256,
      attribution: 'Elevation data © Environment Agency 2022. All rights reserved.',
    },
    hillshade: {
      type: 'raster',
      tiles: ['https://map.emfcamp.org/tiles/hillshade/{z}/{x}/{y}'],
      tileSize: 256,
      attribution: 'Elevation data © Environment Agency 2022. All rights reserved.',
    },
    ortho: {
      type: 'raster',
      tileSize: 256,
      tiles: ['https://map.emfcamp.org/tiles/eastnor-ortho-202606/{z}/{x}/{y}'],
    },
    vehicles: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
    grist_markers: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
  },
  glyphs: 'https://map.emfcamp.org/tiles/font/{fontstack}/{range}',
  layers: sortBy(layers, [(item) => item.zindex || 0]).map((item) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { zindex: _, ...new_item } = item
    return new_item
  }),
}

export default style
