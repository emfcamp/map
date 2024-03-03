import { el } from 'redom'
import URLHash from '@russss/maplibregl-layer-switcher/urlhash'
import maplibregl from 'maplibre-gl'
import { roundPosition } from './util'

class Marker implements maplibregl.IControl {
    location: any | null
    marker: any | null
    _map: maplibregl.Map | undefined
    urlHash: URLHash

    constructor(urlHash: URLHash) {
        this.location = null
        this.marker = null
        this.urlHash = urlHash
        this.urlHash.registerHandler('m', (string: string) => this.setURLString(string))
    }

    getURLString() {
        if (this.location) {
            return `${this.location[1]},${this.location[0]}`
        } else {
            return null
        }
    }

    setURLString(string: string) {
        let location
        try {
            const parts = string.split(',')
            location = [parseFloat(parts[1]), parseFloat(parts[0])]

            if (!location[0] || !location[1]) {
                location = null
            }
        } catch {
            location = null
        }

        if (
            !this.location ||
            !location ||
            this.location[0] != location[0] ||
            this.location[1] != location[1]
        ) {
            this.location = location
            this.updateLocation()
        }
    }

    setLocation(location: maplibregl.LngLat | null) {
        if (!this._map) return

        if (location) {
            this.location = roundPosition([location.lng, location.lat], this._map.getZoom())
        } else {
            this.location = null
        }
        this.updateLocation()
        this.urlHash.setParameter('m', this.getURLString())
    }

    updateLocation() {
        if (!this._map) {
            return
        }

        if (this.marker) {
            this.marker.remove()
            this.marker = null
        }

        if (this.location) {
            this.marker = new maplibregl.Marker({ color: '#BA0000' })
                .setLngLat(this.location)
                .addTo(this._map)
        }
    }

    onAdd(map: maplibregl.Map) {
        this._map = map
        this._map.on('load', () => {
            this.updateLocation()
        })
        return el('div')
    }

    onRemove() {
        this._map = undefined
    }
}

export default Marker
