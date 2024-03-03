export function roundPosition(coords: [number, number], zoom: number): [number, number] {
    zoom = Math.round(zoom * 100) / 100
    const precision = Math.ceil((zoom * Math.LN2 + Math.log(512 / 360)) / Math.LN10),
        m = Math.pow(10, precision),
        lng = Math.round(coords[0] * m) / m,
        lat = Math.round(coords[1] * m) / m

    return [lng, lat]
}

type RequestInitWithTimeout = RequestInit & { timeout?: number }

export async function fetchWithTimeout(
    resource: RequestInfo | URL,
    options: RequestInitWithTimeout = {}
): Promise<Response> {
    const { timeout = 8000 } = options

    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(resource, {
        ...options,
        signal: controller.signal,
    })
    clearTimeout(id)

    return response
}
