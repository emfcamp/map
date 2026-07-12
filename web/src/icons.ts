import { manifest } from 'virtual:render-svg'

export async function loadIcons(map: maplibregl.Map) {
  const ratio = Math.min(Math.round(window.devicePixelRatio), 2)
  const icons = manifest[ratio.toString()]

  let hostname = ''
  if (import.meta.env.VITE_HOSTNAME) {
    hostname = import.meta.env.VITE_HOSTNAME
  }

  const images = [
    'camping',
    'no-access',
    'water',
    'water-point',
    'tree',
    'toilet',
    'datenklo',
    'datenklo_active',
    'datenklo_down',
    'marker',
    'marker-light',
    'power-distro',
    'power-generator',
    'network-switch',
    'network-switch-active',
    'network-switch-down',
    'phone',
    'golf-buggy',
    'bus',
    'person',
  ]

  Promise.all(
    images
      .map((image) => async () => {
        const img = await map.loadImage(hostname + '/' + icons[image])
        map.addImage(image, img.data, { pixelRatio: ratio })
      })
      .map((f) => f())
  )

  const sdfs = ['telehandler', 'cherrypicker']

  for (const sdf of sdfs) {
    const img = await map.loadImage(`${hostname}/sdf/${sdf}.png`)
    map.addImage(sdf, img.data, { sdf: true })
  }
}
