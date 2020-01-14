import { el, text } from 'redom'
import './distancemeasure.css'
import length from '@turf/length'

class DistanceMeasure {
    constructor() {
        // Adjust this to allow removal of points on mobile devices
        this._touchAllowance = 20

        this._container = el('div', {'class': "mapboxgl-ctrl mapboxgl-ctrl-group distance-switch"})
        this._distanceButton = el('button', {'type': 'button', 'aria-label': 'DistanceMeasure', 'aria-pressed': 'false'})
        this._mesauring = 'OFF'
        this._geojson = {
            "type": "FeatureCollection",
            "features": []
        }
        this._linestring = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": []
            }
        };

        this.move = this._move.bind(this);
        this.onClick = this._mesaure.bind(this);

    }

    onAdd(map) {
        this._map = map

        this._distanceContainer = document.getElementById('distance');
        
        this._container.appendChild(this._distanceButton)
        this._distanceButton.addEventListener('click', this._onCLickDistanceMesaure.bind(this))
        return this._container
    }

    onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
    }

    _onCLickDistanceMesaure() {
        switch(this._mesauring) {
        case 'OFF':
            this._container.classList.add('mesauring')
            this._mesauring = 'ON'
            this._setupMesauring()
            break;
        case "ON":
            this._container.classList.remove('mesauring')
            this._mesauring = 'OFF'
            this._removeMeasuring()
            break; 
        }
    }

    _setupMesauring() {
        this._map.addSource('geojson', {
            "type": "geojson",
            "data": this._geojson
        });

        // Add styles to the map
        this._map.addLayer({
            id: 'measure-points',
            type: 'circle',
            source: 'geojson',
            paint: {
                'circle-radius': 5,
                'circle-color': '#000'
            },
            filter: ['in', '$type', 'Point']
        });

        this._map.addLayer({
            id: 'measure-lines',
            type: 'line',
            source: 'geojson',
            layout: {
                'line-cap': 'round',
                'line-join': 'round'
            },
            paint: {
                'line-color': '#000',
                'line-width': 2.5
            },
            filter: ['in', '$type', 'LineString']
        });
        this._map.on('click', this.onClick)
        this._map.on('mousemove', this.move)
    }

    _removeMeasuring() {
        this._map.off('click', this.onClick)
        this._map.off('mousemove', this.move)
        this._map.removeLayer('measure-points')
        this._map.removeLayer('measure-lines')
        this._map.removeSource('geojson')
        this._distanceContainer.innerHTML = ''
        this._geojson.features = []
    }

    _move(e) {
        var features = this._map.queryRenderedFeatures(e.point, { layers: ['measure-points'] });
        // UI indicator for clicking/hovering a point on the map
        this._map.getCanvas().style.cursor = (features.length) ? 'pointer' : 'crosshair';
    }

    _mesaure(e) {
        var bbox = [
            [e.point.x - this._touchAllowance, e.point.y - this._touchAllowance],
            [e.point.x + this._touchAllowance, e.point.y + this._touchAllowance]
            ];
        var features = this._map.queryRenderedFeatures(bbox, { layers: ['measure-points'] });

        // Remove the linestring from the group
        // So we can redraw it based on the points collection
        if (this._geojson.features.length > 1) this._geojson.features.pop();

        // Clear the Distance container to populate it with a new value
        this._distanceContainer.innerHTML = '';

        // If a feature was clicked, remove it from the map
        if (features.length) {
            var id = features[0].properties.id;
            this._geojson.features = this._geojson.features.filter(function(point) {
                return point.properties.id !== id;
            });
        } else {
            var point = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        e.lngLat.lng,
                        e.lngLat.lat
                    ]
                },
                "properties": {
                    "id": String(new Date().getTime())
                }
            };

            this._geojson.features.push(point);
        }

        if (this._geojson.features.length > 1) {
            this._linestring.geometry.coordinates = this._geojson.features.map(function(point) {
                return point.geometry.coordinates;
            });

            this._geojson.features.push(this._linestring);

            // Populate the distanceContainer with total distance
            var value = document.createElement('pre');
            value.textContent = 'Total distance: ' + (length(this._linestring)*1000).toLocaleString() + 'm';
            this._distanceContainer.appendChild(value);
        }

        this._map.getSource('geojson').setData(this._geojson);
    }
}

export { DistanceMeasure as default }