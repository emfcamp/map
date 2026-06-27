import './index.css'
import { EventMap } from './map.ts'
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })

const em = new EventMap()
const params = new URLSearchParams(window.location.search)
const initOptions = {
  embed: params.get('embed') === 'true',
  readonly: params.get('readonly') === 'true',
}

if (document.readyState != 'loading') {
  em.init(initOptions)
} else {
  document.addEventListener('DOMContentLoaded', () => em.init(initOptions))
}
