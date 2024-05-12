import { el, setChildren, mount, RedomComponent } from 'redom'
import { Village } from './index.ts'

class VillageSelector implements RedomComponent {
    el: HTMLElement
    onSelected: any
    selectedVillage?: number
    villages: Village[]

    constructor(villages: Village[], selected?: number) {
        this.villages = villages

        if (!selected) {
            selected = villages[0].id
        }

        if (villages.length == 1) {
            this.el = el('div', villages[0].name)
            this.selectedVillage = villages[0].id
            return
        }

        this.el = el('select', { name: 'village' })

        villages.forEach((village: Village) => {
            const option = el('option', village.name, { value: village.id })
            if (village.id == selected) {
                option.selected = true
                this.selectedVillage = village.id
            }
            mount(this.el, option)
        })

        this.el.onchange = () => {
            this.selectedVillage = parseInt((this.el as HTMLSelectElement).value)
            if (this.onSelected) {
                this.onSelected(this.getSelected())
            }
        }
    }

    getSelected(): Village | undefined {
        return this.villages.find((village: Village) => village.id == this.selectedVillage)
    }
}

export class PlaceVillageDialog implements RedomComponent {
    map: maplibregl.Map
    onClose?: any
    onSubmit?: any
    onDelete?: any
    village_selector?: VillageSelector
    el: HTMLElement
    location_selector?: LocationSelector

    constructor(map: maplibregl.Map, villages: Village[]) {
        this.map = map
        this.el = el('.villages-create')
        this.create(villages)
    }

    create(villages: object[]) {
        const close_button = el('.villages-close')
        close_button.onclick = () => {
            if (this.onClose) {
                this.onClose()
            }
        }

        const submit_button = el('button', 'Place Village', { type: 'submit', disabled: true })

        submit_button.onclick = (e) => {
            if (this.onSubmit) {
                this.onSubmit(this.getData())
            }
            e.preventDefault()
        }

        const submit_group = el('.form-group', submit_button)

        this.village_selector = new VillageSelector(villages)
        const selected_village = this.village_selector.getSelected()!

        this.location_selector = new LocationSelector(this.map, selected_village.lng, selected_village.lat)

        this.location_selector.onSelect = () => {
            submit_button.removeAttribute('disabled')
        }

        this.village_selector.onSelected = (village: Village) => {
            this.location_selector!.setLocation(village.lng, village.lat)
        }

        const form = el(
            'form',
            el('div.form-group', el('label', 'Village'), this.village_selector),
            this.location_selector,
            submit_group
        )

        setChildren(this.el, [
            close_button,
            el('h3', 'Place Village'),
            el(
                'p',
                "Use this tool to select the location of your village. If you've already placed your village, this will update it. " +
                    "Note that we can't guarantee you'll have enough space at the location you've chosen."
            ),
            form,
        ])
    }

    getData() {
        if (!this.village_selector) return null

        const village = this.village_selector.getSelected()

        if (!village) return null

        village.location = [this.location_selector!.lng, this.location_selector!.lat]

        return village
    }
}

class LocationSelector implements RedomComponent {
    map: maplibregl.Map
    lat: number | null
    lng: number | null
    geojson: any
    el: any
    onSelect: any

    constructor(map: maplibregl.Map, lng = null, lat = null) {
        this.lng = lng
        this.lat = lat
        this.map = map

        this.geojson = {
            type: 'FeatureCollection',
            features: [],
        }

        this.handleClick = this.handleClick.bind(this)
        this.el = el('.form-group #location-selector')
        this.onSelect = null
        this.render()
    }

    setLocation(lng: number | null, lat: number | null) {
        this.lng = lng
        this.lat = lat
        this.render()
    }

    onmount() {
        this.map.addSource('location-selector', {
            type: 'geojson',
            data: this.geojson,
        })
        this.map.addLayer({
            id: 'location-selector',
            type: 'circle',
            source: 'location-selector',
            paint: {
                'circle-radius': 10,
                'circle-color': '#05e',
            },
        })
    }

    onunmount() {
        this.map.removeLayer('location-selector')
        this.map.removeSource('location-selector')
    }

    render() {
        let button
        if (this.lng != null) {
            button = el('button', 'Change location')
        } else {
            button = el('button', 'Select location')
        }
        button.onclick = () => this.start()
        setChildren(this, [button])
    }

    start() {
        const cancel_link = el('a', 'cancel', { href: '#' })
        cancel_link.onclick = (e) => {
            e.preventDefault()
            this.cancelClick()
        }
        setChildren(this, [
            el('p#village-status', 'Click on the map to select a location (', cancel_link, ')'),
        ])
        this.map.getCanvas().style.cursor = 'pointer'
        this.map.on('click', this.handleClick)
    }

    cancelClick() {
        this.map.getCanvas().style.cursor = ''
        this.map.off('click', this.handleClick)
        this.render()
    }

    handleClick(ev: maplibregl.MapMouseEvent) {
        this.lng = ev.lngLat.lng
        this.lat = ev.lngLat.lat
        this.cancelClick()

        this.geojson.features = [
            {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [ev.lngLat.lng, ev.lngLat.lat],
                },
            },
        ]

        const source = this.map.getSource('location-selector') as maplibregl.GeoJSONSource
        source?.setData(this.geojson)

        if (this.onSelect) {
            this.onSelect()
        }
    }
}

export { LocationSelector }
