import maplibregl from 'maplibre-gl'
import './export.css'
import { el, mount, unmount } from 'redom'

function calculateDim(currentZoom: number, currentWidth: number, targetZoom: number): number {
    return Math.round(currentWidth * Math.pow(2, targetZoom - currentZoom))
}

class ExportControl implements maplibregl.IControl {
    _map?: maplibregl.Map
    exportZoom: number = 18
    pixelRatio: number = 4

    doExport() {
        const srcContainer = this._map!._container
        let width = srcContainer.clientWidth,
            height = srcContainer.clientHeight
        const zoom = this._map!.getZoom()

        // Rescale the pixel size of the container so that it covers the same
        // area at the target zoom level.
        // The eventual pixel size of the exported image is dictated by the pixelRatio passed into MapLibreGL
        if (this.exportZoom > this._map!.getZoom()) {
            width = calculateDim(zoom, width, this.exportZoom)
            height = calculateDim(zoom, height, this.exportZoom)
        }

        const destContainer = el('div', { style: { width: width + 'px', height: height + 'px' } })
        const wrapper = el('div', destContainer, { style: { visibility: 'hidden' } })
        mount(document.body, wrapper)

        const progressWrapper = el(
            'div.progressWrapper',
            el('div.progressWindow', 'Saving map as image, please wait...')
        )
        mount(document.body, progressWrapper)

        const renderMap = new maplibregl.Map({
            container: destContainer,
            style: this._map!.getStyle(),
            center: this._map!.getCenter(),
            pixelRatio: this.pixelRatio,
            // The maximum size may be limited by the graphics card.
            maxCanvasSize: [16384, 16384],
            zoom: this.exportZoom,
            // NB: bearing and pitch not supported
            interactive: false,
            preserveDrawingBuffer: true,
            fadeDuration: 0,
            attributionControl: false,
        })

        renderMap.once('idle', () => {
            const canvas = renderMap.getCanvas()
            const a = el('a', { href: canvas.toDataURL(), download: 'map.png' })
            a.click()
            a.remove()
            renderMap.remove()
            unmount(document.body, wrapper)
            unmount(document.body, progressWrapper)
        })
    }

    onAdd(map: maplibregl.Map): HTMLElement {
        this._map = map
        const button = el('button.export', {
            type: 'button',
            title: 'Download image',
        })
        button.onclick = () => this.doExport()
        return el('div', button, { class: 'maplibregl-ctrl maplibregl-ctrl-group' })
    }

    onRemove(): void {
        this._map = undefined
    }
}

export default ExportControl
