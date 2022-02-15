import maplibregl from 'maplibre-gl';
import { el, text, mount, unmount, setChildren, setStyle } from 'redom';
import './villages.css';
import { VillageEditor } from './components.js';

class VillagesLayer {
  constructor(source, click_layer) {
    this._source = source;
    this._layer = click_layer;
    this._wiki_url = 'https://wiki.emfcamp.org/wiki/';
    if (DEV) {
      this._api_url = 'http://localhost:5000';
    } else {
      this._api_url = 'https://www.emfcamp.org';
    }
    this.popup = null;
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
    );

    if (feature.properties.owner == this._user_id) {
      var edit_link = el('a', 'Edit', { href: '#' });
      edit_link.onclick = e => {
        e.preventDefault();
        var data = feature.properties;
        data.lng = feature.geometry.coordinates[0];
        data.lat = feature.geometry.coordinates[1];
        this.createForm(feature.properties, true);
        this.popup.remove();
      };

      mount(obj, el('.edit_links', edit_link));
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

  getUserDetails() {
    this.fetch('/api/user/current')
      .then(response => {
        if (response.status == 200) {
          setStyle(this._wrapper, 'display', 'block');
          response.json().then(json => {
            this._user_id = json.id;
          });
        }
      })
      .catch(error =>
        console.log('Network error trying to get user details:', error),
      );
  }

  onAdd(map) {
    this._map = map;

    this.addClickHandlers(map);

    var button = el('button');
    button.onclick = e => this.createForm();

    var wrapper = el('div', button, {
      class: 'mapboxgl-ctrl mapboxgl-ctrl-group villages-ctrl',
      style: 'display:none',
    });

    this._wrapper = wrapper;
    this.getUserDetails();
    return wrapper;
  }

  createForm(data = {}, edit = false) {
    var editor = new VillageEditor(this._map, data, edit);

    var closeDialog = () => {
      unmount(document.body, editor);
    };

    editor.onClose = closeDialog;

    var endpoint = '/api/map/create';
    var method = 'PUT';
    if (edit) {
      endpoint = data.id;
      method = 'POST';
    }

    editor.onSubmit = e =>
      this.post_data(endpoint, editor.getData(), method).then(resp => {
        if (resp.status == 200) {
          closeDialog();
          this.refreshLayer();
        } else {
          resp.json().then(json => {
            editor.setError(json.message);
          });
        }
      });

    editor.onDelete = e =>
      this.post_data(data.id, '', 'DELETE').then(resp => {
        if (resp.status == 200) {
          closeDialog();
          this.refreshLayer();
        } else {
          resp.json().then(json => {
            editor.setError(json.message);
          });
        }
      });

    mount(document.body, editor);
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
