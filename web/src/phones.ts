import maplibregl from 'maplibre-gl'
import { el, mount } from 'redom'
import './phones.css'

const LAYER = 'phones_symbol'

export function setupPhones(map: maplibregl.Map) {
  map.on('click', LAYER, (e: maplibregl.MapLayerMouseEvent) => {
    const props = e.features![0].properties
    const href = `https://phones.emfcamp.org/${props.number}`
    const title = el('a', { href, target: '_blank' }, props.name)
    const content = el('.phones-popup', el('h3', title))
    if (props.number != null) {
      mount(content, el('p', `Dial ${props.number}` + (props.mnemonic ? ` (${props.mnemonic})` : '')))
    }
    if (props.imageUrl != null) {
      const image = el('img', { src: props.imageUrl, alt: props.name })
      mount(content, props.number != null ? el('a', { href, target: '_blank' }, image) : image)
    }
    new maplibregl.Popup().setLngLat(e.lngLat).setDOMContent(content).addTo(map)
  })

  let old_cursor = ''

  map.on('mouseenter', LAYER, () => {
    old_cursor = map.getCanvas().style.cursor
    map.getCanvas().style.cursor = 'pointer'
  })

  map.on('mouseleave', LAYER, () => {
    map.getCanvas().style.cursor = old_cursor
  })
}
