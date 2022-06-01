import maplibregl from 'maplibre-gl';
import { el, text, mount, unmount, setChildren, setStyle } from 'redom';
import './villages.css';
import { LocationSelector } from './components.js';

class VillagesLayer {
  constructor(source, click_layer) {
    this._source = source;
    this._layer = click_layer;
    this._wiki_url = 'https://wiki.emfcamp.org/wiki/';
    if (DEV) {
      this._api_url = 'http://localhost:2342';
    } else {
      this._api_url = 'https://www.emfcamp.org';
    }
    this.popup = null;
  }

  is_admin() {
    return this._permissions.includes("admin") || this._permissions.includes("villages");
  }

  description(feature) {
    var obj = el(
      '.villages-object',
      el(
        'h3',
        el('a', feature.properties.name, {
          target: '_blank',
          href:
            this._wiki_url + encodeURIComponent(feature.properties.wiki_page),
        }),
      ),
      el("p", feature.properties.description),
    );

    if (feature.properties.owner == this._user_id || this.is_admin()) {
      var move_link = el('a', 'Move', { href: '#' });
      move_link.onclick = e => {
        e.preventDefault();
        let location_selector = new LocationSelector(this._map, feature.geometry.coordinates[0], feature.geometry.coordinates[1]);
        this._map.add(location_selector);
        this.popup.remove();
      };

      mount(obj, el('.edit_links', move_link));
    }

    return obj;
  }

  addClickHandlers(map) {
    map.on('click', this._layer, e => {
      var feature = e.features[0];
      this.popup = new maplibregl.Popup()
        .setLngLat(feature.geometry.coordinates.slice())
        .setDOMContent(this.description(feature))
        .addTo(map);
    });

    var old_cursor = '';

    map.on('mouseenter', this._layer, () => {
      old_cursor = map.getCanvas().style.cursor;
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', this._layer, () => {
      map.getCanvas().style.cursor = old_cursor;
    });
  }

  async getUserDetails() {
    let response = await this.fetch('/api/user/current');
    if (!response.ok) {
      // User likely not logged in
      return;
    }

    setStyle(this._wrapper, 'display', 'block');
    let json = await response.json();
    this._permissions = json.permissions;
  }

  onAdd(map) {
    this._map = map;

    this.addClickHandlers(map);

    var button = el('button');
    button.onclick = () => this.createForm();

    var wrapper = el('div', button, {
      class: 'mapboxgl-ctrl mapboxgl-ctrl-group villages-ctrl',
      style: 'display:none',
    });

    this._wrapper = wrapper;
    this.getUserDetails();
    return wrapper;
  }

  refreshLayer() {
    var source = this._map.getSource(this._source);
    var d = source._data;
    source.setData(null);
    source.setData(d);
  }

  fetch(endpoint) {
    return fetch(this._api_url + endpoint, {
      credentials: 'include',
    });
  }

  post_data(endpoint, data, method = 'POST') {
    return fetch(this._api_url + endpoint, {
      method: method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(data),
    });
  }
}

export { VillagesLayer as default };
