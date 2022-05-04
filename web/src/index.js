import './index.css';
import maplibregl from 'maplibre-gl';
import map_style from './map_style.json';
import LayerSwitcher from './layerswitcher.js';
import DistanceMeasure from './distancemeasure.js';
import VillagesEditor from './villages/villages.js';

if (DEV) {
  map_style.sources.villages.data = 'http://localhost:2342/api/map';
  map_style.sources.site_plan.url =
    'http://localhost:8888/capabilities/buildmap';
  map_style.glyphs = "http://localhost:8080/fonts/{fontstack}/{range}.pbf";
}

function init() {
  var layers = {
    'Buried Services': 'services_',
    Water: 'site_water_',
    DKs: 'dk_',
    'NOC-Physical': 'noc_',
    Power: 'power_',
    Lighting: 'lighting_',
    Villages: 'villages_',
    GSM: 'gsm_',
  };
  var layers_enabled = ['Villages'];
  var layer_switcher = new LayerSwitcher(layers, layers_enabled);

  layer_switcher.setInitialVisibility(map_style);

  var map = new maplibregl.Map({
    container: 'map',
    style: map_style,
    hash: true,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
    }),
  );

  map.addControl(
    new maplibregl.ScaleControl({
      maxWidth: 200,
      unit: 'metric',
    }),
  );

  map.addControl(new DistanceMeasure(), 'top-right');
  map.addControl(
    new VillagesEditor('villages', 'villages_symbol'),
    'top-right',
  );

  map.addControl(layer_switcher, 'top-right');

  // Note that we don't run InjectManifest or try to load the serviceworker in dev mode.
  // This is because Workbox doesn't like the webpack hot-reloader.
  // https://github.com/GoogleChrome/workbox/issues/1790
  if ('serviceWorker' in navigator && !DEV) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js');
    });
  }
}

let deferredPrompt;
const install_prompt = document.getElementById('install-prompt');

window.addEventListener('beforeinstallprompt', e => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  if (localStorage.getItem('pwa_closed')) {
    return;
  }
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  install_prompt.style.display = 'block';
});

document.getElementById('install-button').onclick = e => {
  e.preventDefault();
  install_prompt.style.display = 'none';
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(result => {
    if (result.outcome === 'accepted') {
      console.log('PWA choice accepted');
      // No need to do anything here, beforeinstallprompt won't be called if the app is installed
    }
    deferredPrompt = null;
  });
};

document.getElementById('install-close').onclick = e => {
  e.preventDefault();
  install_prompt.style.display = 'none';
  localStorage.setItem('pwa_closed', true);
};

if (document.readyState != 'loading') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
