import './contextmenu.css'
import { MapMouseEvent } from 'maplibre-gl'
import { RedomComponent, list, List, el, mount } from 'redom'

type ContextMenuCallback = (e: MouseEvent, location: maplibregl.LngLat) => void
type EnabledCallback = (location: maplibregl.LngLat) => boolean

class ContextMenu {
    map: maplibregl.Map
    _menu: HTMLElement
    _menuList: List
    coords: maplibregl.LngLat | null = null
    items: Array<any> = []

    constructor(map: maplibregl.Map) {
        this.map = map

        this._menuList = list('ul', ContextMenuItem, 'text')
        this._menu = el('div', this._menuList, { class: 'contextMenu' })
        mount(this.map.getContainer(), this._menu)

        map.on('contextmenu', (e: MapMouseEvent) => {
            this._menuList.update(this.items, this)
            this._menu.style.top = e.point.y + 'px'
            this._menu.style.left = e.point.x + 'px'
            this._menu.style.display = 'block'
            this.coords = e.lngLat
        })

        map.on('click', () => {
            this._menu.style.display = 'none'
            this.coords = null
        })
    }

    addItem(text: string, onClick: ContextMenuCallback, isEnabled?: EnabledCallback) {
        this.items.push({
            text: text,
            callback: onClick,
            isEnabled: isEnabled,
        })
    }
}

class ContextMenuItem implements RedomComponent {
    el: HTMLElement

    constructor() {
        this.el = el('li')
    }

    update(data: any, _index: number, _items: any, context?: any): void {
        this.el.innerText = data.text

        const enabled = !data.isEnabled || data.isEnabled(context.coords)
        this.el.classList.toggle('disabled', !enabled)

        if (enabled) {
            this.el.onclick = (e: MouseEvent) => {
                if (!context.coords) return
                context._menu.style.display = 'none'
                data.callback(e, context.coords)
            }
        } else {
            this.el.onclick = null
        }
    }
}

export default ContextMenu
