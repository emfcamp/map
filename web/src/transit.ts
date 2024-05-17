import './transit.css';
import maplibregl from "maplibre-gl";

const STOP_ZOOM_LEVEL = 15;
const VEHICLE_ZOOM_LEVEL = 12;

const GTFS_FEED = "https://tracking.tfemf.uk/media/gtfs.json";
const GTFS_RT_FEED = "https://tracking.tfemf.uk/media/gtfs-rt.json";
const DEPARTURE_BOARD = "https://tracking.tfemf.uk/hafas/departureBoard";

type Stop = {
    name: string;
    marker: maplibregl.Marker;
    popup: maplibregl.Popup;
}

type Stops = {
    [stop_id: string]: Stop;
};

type Vehicle = {
    marker: maplibregl.Marker;
    popup: maplibregl.Popup;
}

type Vehicles = {
    [vehicle_id: string]: Vehicle;
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
    routes: {
        [route_id: string]: {
            route_id: string;
            agency_id: string;
            route_short_name: string;
            route_long_name: string;
            route_desc: string;
            route_type: number;
            route_url: string;
            route_color: string;
            route_text_color: string;
            route_sort_order: number;
        }
    };
    trips: {
        [trip_id: string]: {
            route_id: string;
            service_id: string;
            trip_id: string;
            trip_headsign: string;
            trip_short_name: string;
            direction_id: number;
            block_id: string;
            shape_id: string;
        }
    }
};

type GTFSRTFeed = {
    vehiclePositions: [{
        id: string;
        vehicle: {
            id: string;
            label: string;
            licensePlate?: string;
        };
        trip?: {
            trip_id: string;
            routeId?: string;
            scheduleRelationship: string;
        };
        position: {
            latitude: number;
            longitude: number;
        };
        stopId?: string;
        currentStopSequence?: string;
        currentStatus?: string;
        timestamp: number;
    }]
};

type HAFASDepartureBoard = {
    requestId: string;
    Departure: [{
        Product: [{
            operatorInfo: {
                name: string;
                id: string;
            },
            catOut: string;
        }],
        name: string;
        direction: string;
        time: string;
        date: string;
        rtTime: string;
        rtDate: string;
        rtPlatform?: {
            text: string;
            hidden: boolean;
        };
        Notes: {
            Note: [{
                value: string;
            }]
        };
        cancelled: boolean;
    }]
};

export default class TransitInfo {
    _map: maplibregl.Map;

    stops: Stops;
    vehicles: Vehicles;
    routes: GTFSFeed['routes'];
    trips: GTFSFeed['trips'];

    constructor(map: maplibregl.Map) {
        this._map = map;

        this.stops = {};
        this.vehicles = {};
        this.routes = {};
        this.trips = {};

        this.loadGTFSFeed();
        this.updateGTFSRTFeed();

        this._map.on('zoom', this.updateStopVisibility.bind(this));
    }

    loadGTFSFeed() {
        fetch(GTFS_FEED)
            .then(response => response.json())
            .then((data: GTFSFeed) => {
                this.routes = data.routes;
                this.trips = data.trips;
                this.loadStops(data.stops);
                this.updateStopVisibility();
            })
            .catch(error => {
                console.error("Failed to load GTFS feed", error);
            });
    }

    updateGTFSRTFeed() {
        fetch(GTFS_RT_FEED)
            .then(response => response.json())
            .then((data: GTFSRTFeed) => {
                this.updateVehicles(data.vehiclePositions);
                this.updateStopVisibility();
            })
            .catch(error => {
                console.error("Failed to load GTFS-RT feed", error);
            });
        setTimeout(this.updateGTFSRTFeed.bind(this), 2500);
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
                .setMaxWidth("80vw")
                .on('open', () => {
                    this.stopPopupOpen(stop.stop_id);
                });

            const marker = new maplibregl.Marker({
                element: el
            })
                .setLngLat([stop.stop_lon, stop.stop_lat])
                .setPopup(popup)
                .addTo(this._map);
            this.stops[stop.stop_id] = {
                name: stop.stop_name,
                marker: marker,
                popup: popup
            };
        });
    }

    updateVehicles(vehicles: GTFSRTFeed['vehiclePositions']) {
        const seenVehicles: string[] = [];
        vehicles.forEach((vehicle) => {
            seenVehicles.push(vehicle.id);

            if (vehicle.id in this.vehicles) {
                this.vehicles[vehicle.id].marker
                    .setLngLat([vehicle.position.longitude, vehicle.position.latitude]);
                this.vehicles[vehicle.id].popup
                    .setHTML(this.makeVehiclePopup(vehicle));
            } else {
                const el = document.createElement('div');
                el.className = 'marker-vehicle';

                const popup = new maplibregl.Popup({
                    className: 'popup-vehicle',
                    offset: 25
                })
                    .setHTML(this.makeVehiclePopup(vehicle));

                const marker = new maplibregl.Marker({
                    element: el
                })
                    .setLngLat([vehicle.position.longitude, vehicle.position.latitude])
                    .setPopup(popup)
                    .addTo(this._map);

                this.vehicles[vehicle.id] = {
                    marker: marker,
                    popup: popup,
                }
            }
        });

        Object.entries(this.vehicles).forEach(([vehicle_id, vehicle]) => {
            if (!seenVehicles.includes(vehicle_id)) {
                vehicle.marker.remove();
                delete this.vehicles[vehicle_id];
            }
        })
    }

    makeVehiclePopup(vehicle: GTFSRTFeed['vehiclePositions'][0]) {
        const updated = new Date(vehicle.timestamp * 1000);

        let html = `
<div class="vehicle-name">${vehicle.vehicle.label}</div>
<div class="vehicle-plate">${vehicle.vehicle.licensePlate}</div>
`;

        if (vehicle.stopId && vehicle.stopId in this.stops) {
            let verb;
            if (vehicle.currentStatus == "IN_TRANSIT_TO") {
                verb = "Next stop: ";
            } else if (vehicle.currentStatus == "STOPPED_AT") {
                verb = "Currently at: ";
            } else if (vehicle.currentStatus == "INCOMING_AT") {
                verb = "Arriving at: ";
            }
            html += `<div class="vehicle-stop">${verb}${this.stops[vehicle.stopId].name}</div>`;
        }

        if (vehicle.trip && vehicle.trip.routeId && vehicle.trip.routeId in this.routes) {
            html += `<div class="vehicle-route">Route ` +
                `<span style="background-color: #${this.routes[vehicle.trip.routeId].route_color}; color: #${this.routes[vehicle.trip.routeId].route_text_color}">` +
                `${this.routes[vehicle.trip.routeId].route_short_name}` +
                `</span></div>`;
        }

        html += `<div class="vehicle-updated">Last updated ${updated.toLocaleTimeString()}</div>`;

        return html;
    }

    clearStops() {
        Object.values(this.stops).forEach((stop) => {
            stop.marker.remove();
        });
    }

    updateStopVisibility() {
        const zoom = this._map.getZoom();
        Object.values(this.stops).forEach((stop) => {
            if (zoom < STOP_ZOOM_LEVEL) {
                stop.marker.getElement().style.visibility = 'hidden';
            } else {
                stop.marker.getElement().style.visibility = 'visible';
            }
        });
        Object.values(this.vehicles).forEach((vehicle) => {
            if (zoom < VEHICLE_ZOOM_LEVEL) {
                vehicle.marker.getElement().style.visibility = 'hidden';
            } else {
                vehicle.marker.getElement().style.visibility = 'visible';
            }
        });
    }

    stopPopupOpen(stop_id: string) {
        this.stops[stop_id].popup.setText("Loading...");

        fetch(`${DEPARTURE_BOARD}?` + new URLSearchParams({
            format: "json",
            id: stop_id,
            duration: "240"
        }))
            .then(response => response.json())
            .then((data: HAFASDepartureBoard) => {
                this.stops[stop_id].popup.setHTML(this.makeDepartureBoard(data));
            })
            .catch(error => {
                console.error("Failed to load departure board", error);
                this.stops[stop_id].popup.setText("Failed to load departure board");
            });
    }

    makeDepartureBoard(board: HAFASDepartureBoard) {
        let html = `<div class="departure-board">`;

        board.Departure.forEach((departure) => {
            console.log(departure.rtTime);
            const scheduledTime = new Date(Date.parse(`${departure.date}T${departure.time}Z`));
            const rtTime = departure.rtTime ? new Date(Date.parse(`${departure.rtDate || departure.date}T${departure.rtTime}Z`)) : null;
            const delay = rtTime ? rtTime.getTime() - scheduledTime.getTime() : 0;

            let timeClass;
            if (!rtTime) {
                timeClass = 'scheduled';
            } else if (delay <= 0) {
                timeClass = 'on-time';
            } else if (delay <= 300000) {
                timeClass = 'slightly-late';
            } else {
                timeClass = 'late';
            }

            if (departure.cancelled) {
                timeClass = 'cancelled';
            }

            html += `<div class="board-line">`;
            const time = (rtTime || scheduledTime).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
            });
            html += `<span class="time ${timeClass}">${time}</span>`;
            html += `<span class="destination">${departure.direction}</span>`;
            if (departure.rtPlatform && !departure.rtPlatform.hidden) {
                html += `<span class="platform">Pl. ${departure.rtPlatform.text}</span>`;
            }
            if (departure.Product) {
                html += `<span class="operator">A ${departure.Product[0].operatorInfo.name} service</span>`;
            }
            departure.Notes.Note.forEach((note) => {
                html += `<span class="note">${note.value}</span>`;
            })
            html += `</div>`;
        });

        html += `</div>`;
        return html;
    }
}