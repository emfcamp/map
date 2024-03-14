import './transit.css';
import maplibregl from "maplibre-gl";

type Stop = {
    marker: maplibregl.Marker;
    popup: maplibregl.Popup;
}

type Stops = {
    [stop_id: string]: Stop;
};

type GTFSFeed = {
    stops: {
        [stop_id: string]: {
            stop_id: string;
            stop_code: string;
            stop_name: string;
            tts_stop_name?: string;
            stop_desc?: string;
            stop_lat: number;
            stop_lon: number;
            stop_url?: string;
        };
    };
};

export default class TransitInfo {
    _map: maplibregl.Map;
    _gtfs_feed: string;

    stops: Stops;

    constructor(map: maplibregl.Map) {
        this._map = map;
        this._gtfs_feed = 'https://tracking.tfemf.uk/media/gtfs.json';

        this.stops = {};

        this.loadGTFSFeed();

        this._map.on('zoom', this.updateStopVisibility.bind(this));
    }

    loadGTFSFeed() {
        fetch(this._gtfs_feed)
            .then(response => response.json())
            .then((data: GTFSFeed) => {
                this.loadStops(data.stops);
            })
            .catch(error => {
                console.error("Failed to load GTFS feed", error);
            });
    }

    loadStops(stops: GTFSFeed['stops']) {
        this.clearStops();

        this.stops = {};
        Object.values(stops).forEach((stop) => {
            const el = document.createElement('div');
            el.className = 'marker-stop';
            el.innerText = stop.stop_name;

            const popup = new maplibregl.Popup({
                className: 'popup-stop',
                offset: 25
            })
                .setText(`Departures from ${stop.stop_name}`);

            const marker = new maplibregl.Marker({
                element: el
            })
                .setLngLat([stop.stop_lon, stop.stop_lat])
                .setPopup(popup)
                .addTo(this._map);
            this.stops[stop.stop_id] = {
                marker: marker,
                popup: popup
            };
        });
    }

    clearStops() {
        Object.values(this.stops).forEach((stop) => {
            stop.marker.remove();
        });
    }

    updateStopVisibility() {
        const zoom = this._map.getZoom();
        Object.values(this.stops).forEach((stop) => {
            if (zoom < 16) {
                stop.marker.getElement().style.visibility = 'hidden';
            } else {
                stop.marker.getElement().style.visibility = 'visible';
            }
        });
    }
}