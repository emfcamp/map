import './index.css'
import { EventMap } from './map.ts'
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })

const em = new EventMap()

if (document.readyState != 'loading') {
  em.init()
} else {
  document.addEventListener('DOMContentLoaded', () => em.init())
}
