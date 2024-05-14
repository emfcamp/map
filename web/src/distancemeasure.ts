import { el } from 'redom'
import './distancemeasure.css'
import length from '@turf/length'

class DistanceMeasure implements maplibregl.IControl {
    _container: HTMLElement
    _distanceButton: HTMLButtonElement
    _map?: maplibregl.Map
    _distanceContainer?: HTMLElement
    _touchAllowance: number
    _measuring: boolean = false
    _geojson: GeoJSON.FeatureCollection
    _linestring: GeoJSON.Feature<GeoJSON.LineString>

    constructor() {
        // Adjust this to allow removal of points on mobile devices
        this._touchAllowance = 20

        this._container = el('div', { class: 'maplibregl-ctrl maplibregl-ctrl-group distance-switch' })
        this._distanceButton = el('button', {
            type: 'button',
            'aria-label': 'DistanceMeasure',
            'aria-pressed': 'false',
            title: 'Measure distance',
        })
        this._geojson = {
            type: 'FeatureCollection',
            features: [],
        }
        this._linestring = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [],
            },
            properties: {},
        }
    }

    onAdd(map: maplibregl.Map) {
        this._map = map

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Escape' && this._measuring) {
                this._removeMeasuring()
            }
        })

        this._distanceContainer = document.getElementById('distance')!

        this._container.appendChild(this._distanceButton)
        this._distanceButton.addEventListener('click', this._onClickDistanceMeasure.bind(this))
        this._map.on('click', (e) => this._measure(e))
        return this._container
    }

    onRemove() {
        this._container.parentNode.removeChild(this._container)
        this._map = undefined
    }

    _onClickDistanceMeasure() {
        if (this._measuring) {
            this._removeMeasuring()
        } else {
            this._setupMeasuring()
        }
    }

    _setupMeasuring() {
        if (!this._map || this._measuring == true) return
        this._container.classList.add('measuring')
        this._measuring = true
        this._map.getCanvas().style.cursor = 'crosshair'

        this._map.addSource('geojson', {
            type: 'geojson',
            data: this._geojson,
        })

        // Add styles to the map
        this._map.addLayer({
            id: 'measure-points',
            type: 'circle',
            source: 'geojson',
            paint: {
                'circle-radius': 5,
                'circle-color': '#000',
            },
            filter: ['in', '$type', 'Point'],
        })

        this._map.addLayer({
            id: 'measure-lines',
            type: 'line',
            source: 'geojson',
            layout: {
                'line-cap': 'round',
                'line-join': 'round',
            },
            paint: {
                'line-color': '#000',
                'line-width': 2.5,
            },
            filter: ['in', '$type', 'LineString'],
        })
    }

    _removeMeasuring() {
        if (!this._map || this._measuring == false) return
        this._measuring = false
        this._container.classList.remove('measuring')
        this._map.getCanvas().style.cursor = ''
        this._map.removeLayer('measure-points')
        this._map.removeLayer('measure-lines')
        this._map.removeSource('geojson')
        this._distanceContainer.innerHTML = ''
        this._geojson.features = []
    }

    _measure(e: maplibregl.MapMouseEvent) {
        if (!this._measuring || !this._map) return
        const bbox = [
            [e.point.x - this._touchAllowance, e.point.y - this._touchAllowance],
            [e.point.x + this._touchAllowance, e.point.y + this._touchAllowance],
        ]
        var features = this._map.queryRenderedFeatures(bbox, { layers: ['measure-points'] })

        // Remove the linestring from the group
        // So we can redraw it based on the points collection
        if (this._geojson.features.length > 1) this._geojson.features.pop()

        // Clear the Distance container to populate it with a new value
        this._distanceContainer.innerHTML = ''

        // If a feature was clicked, remove it from the map
        if (features.length) {
            var id = features[0].properties.id
            this._geojson.features = this._geojson.features.filter(function (point) {
                return point.properties.id !== id
            })
        } else {
            const point = {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [e.lngLat.lng, e.lngLat.lat],
                },
                properties: {
                    id: String(new Date().getTime()),
                },
            }

            this._geojson.features.push(point)
        }

        if (this._geojson.features.length > 1) {
            this._linestring.geometry.coordinates = this._geojson.features.map(function (point) {
                return point.geometry.coordinates
            })

            this._geojson.features.push(this._linestring)

            // Populate the distanceContainer with total distance
            const value = document.createElement('pre')
            value.textContent = 'Total distance: ' + (length(this._linestring) * 1000).toLocaleString() + 'm'
            this._distanceContainer.appendChild(value)
        }

        this._map.getSource('geojson').setData(this._geojson)
    }
}

export { DistanceMeasure as default }
