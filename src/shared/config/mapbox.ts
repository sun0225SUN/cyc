export const mapboxStyles = {
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
} as const

export type MapAppearance = keyof typeof mapboxStyles

export const rideMapStyleIds = [
  'privacy',
  'standard',
  'streets',
  'outdoors',
  'light',
  'dark',
  'satellite',
  'standardSatellite',
  'navigationDay',
  'navigationNight',
] as const

export type RideMapStyleId = (typeof rideMapStyleIds)[number]

const rideMapStyleUrls: Record<Exclude<RideMapStyleId, 'privacy'>, string> = {
  standard: 'mapbox://styles/mapbox/standard',
  standardSatellite: 'mapbox://styles/mapbox/standard-satellite',
  streets: 'mapbox://styles/mapbox/streets-v12',
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-v9',
  navigationDay: 'mapbox://styles/mapbox/navigation-day-v1',
  navigationNight: 'mapbox://styles/mapbox/navigation-night-v1',
}

export function rideMapStyle(
  id: RideMapStyleId,
  appearance: MapAppearance = 'dark',
  overlay?: {
    route: [number, number][]
    color: string
  },
) {
  if (id === 'privacy') {
    const route = overlay?.route ?? []
    const color =
      overlay?.color ?? (appearance === 'dark' ? '#ceff00' : '#2563eb')
    return {
      version: 8 as const,
      glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
      sources: {
        'detail-ride': {
          type: 'geojson' as const,
          data: {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates: route },
          },
        },
      },
      layers: [
        {
          id: 'background',
          type: 'background' as const,
          paint: {
            'background-color': appearance === 'dark' ? '#0a0a0a' : '#f4f4f5',
          },
        },
        {
          id: 'detail-ride',
          type: 'line' as const,
          source: 'detail-ride',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': color,
            'line-width': 4,
            'line-opacity': 0.95,
          },
        },
      ],
    }
  }
  return rideMapStyleUrls[id]
}

export function rideMapStylePreview(
  id: RideMapStyleId,
  token: string,
  center: [number, number],
) {
  if (id === 'privacy' || !token) return null
  const path = rideMapStyleUrls[id].replace('mapbox://styles/', '')
  const [longitude, latitude] = center
  return `https://api.mapbox.com/styles/v1/${path}/static/${longitude.toFixed(4)},${latitude.toFixed(4)},12,0/80x80@2x?access_token=${token}&logo=false&attribution=false`
}

export function mapboxToken() {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? ''
}

export function mapLanguage(locale: string) {
  return locale === 'zh' ? 'zh-Hans' : 'en'
}
