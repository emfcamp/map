import maplibregl from 'maplibre-gl'
import { el, mount, setStyle, unmount } from 'redom'
import './villages.css'
import { PlaceVillageDialog } from './components'

export type Village = Record<string, any>

class VillagesLayer {
    _source: string
    _layer: string
    _api_url: string
    _permissions: string[] = []
    _map?: maplibregl.Map
    _wrapper: HTMLElement
    _user_id?: string
    villages?: Village[]
    button: HTMLButtonElement
    popup: any

    constructor(source: string, click_layer: string) {
        this._source = source
        this._layer = click_layer
        if (import.meta.env.DEV) {
            this._api_url = 'http://localhost:2342'
        } else {
            this._api_url = 'https://www.emfcamp.org'
        }
        this.popup = null

        this.button = el('button')
        this._wrapper = el('div', this.button, {
            class: 'maplibregl-ctrl maplibregl-ctrl-group villages-ctrl',
            style: 'display:none',
        })
    }

    is_admin() {
        return this._permissions.includes('admin') || this._permissions.includes('villages')
    }

    description(feature: maplibregl.MapGeoJSONFeature) {
        const props = feature.properties
        let name = props.name
        if (props.url) {
            name = el('a', name, {
                target: '_blank',
                href: props.url,
            })
        }

        const obj = el('.villages-object', el('h3', name))
        if (props.description) {
            mount(obj, el('p', props.description))
        }
        return obj
    }

    addClickHandlers(map: maplibregl.Map) {
        map.on('click', this._layer, (e: maplibregl.MapLayerMouseEvent) => {
            const feature = e.features![0]
            this.popup = new maplibregl.Popup()
                .setLngLat(e.lngLat)
                .setDOMContent(this.description(feature))
                .addTo(map)
        })

        let old_cursor = ''

        map.on('mouseenter', this._layer, () => {
            old_cursor = map.getCanvas().style.cursor
            map.getCanvas().style.cursor = 'pointer'
        })

        map.on('mouseleave', this._layer, () => {
            map.getCanvas().style.cursor = old_cursor
        })
    }

    async getUserDetails() {
        const response = await this.fetch('/api/user/current')
        if (!response.ok) {
            // User likely not logged in
            return
        }
        const villages_response = await this.fetch('/api/villages/mine?all=true')
        const json = await response.json()
        this._permissions = json.permissions
        this._user_id = json.id

        this.villages = await villages_response.json()
        setStyle(this._wrapper, 'display', 'block')
    }

    onAdd(map: maplibregl.Map) {
        this._map = map

        this.addClickHandlers(map)

        this.button.onclick = () => {
            this.createForm()
            this.button.disabled = true
        }

        this.getUserDetails()
        return this._wrapper
    }

    createForm() {
        if (!this._map || !this.villages) return
        const editor = new PlaceVillageDialog(this._map, this.villages)

        const closeDialog = () => {
            unmount(document.body, editor)
            this.button.disabled = false
        }

        editor.onClose = closeDialog

        editor.onSubmit = (data: Village) => {
            if (!data) {
                console.log('No data on form submit')
                return
            }
            const endpoint = `/api/villages/${data.id}`

            this.post_data(endpoint, data, 'POST').then((resp) => {
                if (resp.status == 200) {
                    closeDialog()
                    this.refreshLayer()
                } else {
                    resp.json().then((json) => {
                        console.log(json.message)
                    })
                }
            })
        }

        mount(document.body, editor)
    }

    refreshLayer() {
        // Reload the villages GeoJSON layer from the server by setting it to an empty object and back.
        const source = this._map!.getSource(this._source) as maplibregl.GeoJSONSource
        if (!source) return
        const d = source._data as string
        source.setData({ type: 'FeatureCollection', features: [] })
        source.setData(d)
    }

    fetch(endpoint: string) {
        return fetch(this._api_url + endpoint, {
            credentials: 'include',
        })
    }

    post_data(endpoint: string, data: any, method = 'POST') {
        return fetch(this._api_url + endpoint, {
            method: method,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify(data),
        })
    }
}

export { VillagesLayer as default }
