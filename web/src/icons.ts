import { manifest } from 'virtual:render-svg'

export async function loadIcons(map: maplibregl.Map) {
  const ratio = Math.min(Math.round(window.devicePixelRatio), 2)
  const icons = manifest[ratio.toString()]

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
  ]

  Promise.all(
    images
      .map((image) => async () => {
        const img = await map.loadImage(icons[image])
        map.addImage(image, img.data, { pixelRatio: ratio })
      })
      .map((f) => f())
  )

  const sdfs = ['telehandler', 'golf-buggy', 'cherrypicker']

  for (const sdf of sdfs) {
    const img = await map.loadImage(`/sdf/${sdf}.png`)
    map.addImage(sdf, img.data, { sdf: true })
  }
}
