import { el, setChildren, mount, text } from 'redom';

class PlaceVillageDialog {
  constructor(map, villages = {}, edit = false) {
    this.map = map;
    this.el = el('.villages-create');
    this.create(villages, edit);
  }

  create(villages, edit) {

  }

}


class LocationSelector {
  constructor(map, lng = null, lat = null) {
    this.lng = lng;
    this.lat = lat;
    this.map = map;

    this.geojson = {
      type: 'FeatureCollection',
      features: [],
    };

    this.handleClick = this.handleClick.bind(this);
    this.el = el('.form-group #location-selector');
    this.onSelect = null;
    this.render();
  }

  onmount() {
    this.map.addSource('location-selector', {
      type: 'geojson',
      data: this.geojson,
    });
    this.map.addLayer({
      id: 'location-selector',
      type: 'circle',
      source: 'location-selector',
      paint: {
        'circle-radius': 10,
        'circle-color': '#05e',
      },
    });
  }

  onunmount() {
    this.map.removeLayer('location-selector');
    this.map.removeSource('location-selector');
  }

  render() {
    var button;
    if (this.lng != null) {
      button = el('button', 'Change location');
    } else {
      button = el('button', 'Select location');
    }
    button.onclick = e => this.start();
    setChildren(this, [button]);
  }

  start() {
    var cancel_link = el('a', 'cancel', { href: '#' });
    cancel_link.onclick = e => {
      e.preventDefault();
      this.cancelClick();
    };
    setChildren(this, [
      el('p', 'Click on the map to select a location (', cancel_link, ')'),
    ]);
    this.map.getCanvas().style.cursor = 'pointer';
    this.map.on('click', this.handleClick);
  }

  cancelClick() {
    this.map.getCanvas().style.cursor = '';
    this.map.off('click', this.handleClick);
    this.render();
  }

  handleClick(ev) {
    this.lng = ev.lngLat.lng;
    this.lat = ev.lngLat.lat;
    this.cancelClick();

    this.geojson.features = [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [ev.lngLat.lng, ev.lngLat.lat],
        },
      },
    ];
    this.map.getSource('location-selector').setData(this.geojson);

    if (this.onSelect) {
      this.onSelect();
    }
  }
}

export { LocationSelector };
