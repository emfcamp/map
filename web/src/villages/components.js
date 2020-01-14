import {el, setChildren, mount, text} from 'redom';

class VillageEditor {
  constructor(map, data = {}, edit = false) {
    this.map = map;
    this.el = el('.villages-create');
    this.errorDiv = el('.error');
    this.onClose = null;
    this.onSubmit = null;
    this.create(data, edit);
  }

  create(data, edit) {
    var close_button = el('.villages-close');
    close_button.onclick = () => {
      if (this.onClose) {
        this.onClose();
      }
    };

    var submit_button = el('button', edit ? 'Update' : 'Create', {
      disabled: !edit,
    });

    submit_button.onclick = () => {
      if (this.onSubmit) {
        this.onSubmit();
      }
    };

    var submit_group = el('.form-group', submit_button);

    if (edit) {
      var delete_button = el('button', 'Delete');
      delete_button.onclick = () => {
        if (this.onDelete) {
          this.onDelete();
        }
      };
      mount(submit_group, delete_button);
    }

    this.location_selector = new LocationSelector(this.map, data.lng, data.lat);
    this.location_selector.onSelect = () =>
      submit_button.removeAttribute('disabled');

    var form = el(
      'form',
      el(
        '.form-group',
        el('label', 'Name'),
        el('input#nameField', {
          value: data.name || '',
        }),
      ),
      el(
        '.form-group',
        el('label', 'Wiki Page'),
        el('input#wikiField', {
          value: data.wiki_page || '',
        }),
      ),
      this.location_selector,
      submit_group,
    );

    setChildren(this.el, [
      close_button,
      el('h3', edit ? 'Edit Village' : 'Create Village'),
      form,
    ]);
  }

  setError(error) {
    setChildren(this.errorDiv, [text(error)]);
    mount(this, this.errorDiv);
  }

  getData() {
    var form = this.el;
    return {
      name: form.querySelector('#nameField').value,
      wiki_page: form.querySelector('#wikiField').value,
      location: [this.location_selector.lng, this.location_selector.lat],
    };
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
    var cancel_link = el('a', 'cancel', {href: '#'});
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

export {LocationSelector, VillageEditor};
