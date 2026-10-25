import { decode } from '@mapbox/polyline'
import type { Activity } from './activity'

export type LngLatBounds = [[number, number], [number, number]]

export type RideFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    id: number
    properties: { id: number; speed: number }
    geometry: { type: 'LineString'; coordinates: [number, number][] }
  }>
}

export type RideMapData = {
  geojson: RideFeatureCollection
  bounds: LngLatBounds | null
}

export function activityToFeature(
  activity: Activity,
): RideFeatureCollection['features'][number] | null {
  if (!activity.summary_polyline) return null
  const coordinates = decode(activity.summary_polyline).map(
    ([latitude, longitude]) => [longitude, latitude] as [number, number],
  )
  if (coordinates.length < 2) return null
  return {
    type: 'Feature',
    id: activity.run_id,
    properties: {
      id: activity.run_id,
      speed: activity.average_speed * 3.6,
    },
    geometry: { type: 'LineString', coordinates },
  }
}

export function activitiesToGeoJson(activities: Activity[]): RideMapData {
  const features: RideFeatureCollection['features'] = []
  let west = Number.POSITIVE_INFINITY
  let south = Number.POSITIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY

  for (const activity of activities) {
    const feature = activityToFeature(activity)
    if (!feature) continue
    for (const [longitude, latitude] of feature.geometry.coordinates) {
      west = Math.min(west, longitude)
      south = Math.min(south, latitude)
      east = Math.max(east, longitude)
      north = Math.max(north, latitude)
    }
    features.push(feature)
  }

  return {
    geojson: { type: 'FeatureCollection', features },
    bounds:
      features.length === 0
        ? null
        : [
            [west, south],
            [east, north],
          ],
  }
}
