import { IControl } from 'maplibre-gl'
import { el } from 'redom'

interface UserChoiceResult {
    outcome: string
    platform: string
}

class InstallControl implements IControl {
    _deferredPrompt: any
    _container: any
    _map: maplibregl.Map | undefined

    constructor() {
        this._deferredPrompt = null
        this._container = this.createControl()
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault()
            if (localStorage.getItem('pwa_closed')) {
                return
            }
            // Stash the event so it can be triggered later.
            this._deferredPrompt = e
            this._container.style.display = 'block'
        })
    }

    createControl() {
        const install_button = el('button.btn#install-button', 'Install')
        install_button.onclick = (e) => {
            e.preventDefault()
            this._container.style.display = 'none'
            this._deferredPrompt.prompt()
            this._deferredPrompt.userChoice.then((result: UserChoiceResult) => {
                if (result.outcome === 'accepted') {
                    console.log('PWA choice accepted')
                    // No need to do anything here, beforeinstallprompt won't be called if the app is installed
                }
                this._deferredPrompt = null
            })
        }

        const install_close_button = el('button.btn#install-close', 'Close')
        install_close_button.onclick = (e) => {
            e.preventDefault()
            this._container.style.display = 'none'
            localStorage.setItem('pwa_closed', 'true')
        }

        return el(
            'div#install-prompt.maplibregl-ctrl',
            el('p', 'You can install this site as an app for easy access'),
            install_button,
            install_close_button,
            { style: 'display:none' }
        )
    }

    onAdd(map: maplibregl.Map) {
        this._map = map
        return this._container
    }

    onRemove() {
        this._container.parentNode.removeChild(this._container)
        this._map = undefined
    }
}

export default InstallControl
