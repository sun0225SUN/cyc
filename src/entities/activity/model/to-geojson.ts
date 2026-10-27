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

/** Drop points that sit on top of the previous kept point at overview zoom. */
export function simplifyTrack(
  coordinates: [number, number][],
  spacing: number,
): [number, number][] {
  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]
  if (!first || !last || coordinates.length < 3 || spacing <= 0) {
    return coordinates
  }
  const kept: [number, number][] = [first]
  let lastLng = first[0]
  let lastLat = first[1]
  for (let index = 1; index < coordinates.length - 1; index += 1) {
    const point = coordinates[index]
    if (!point) continue
    if (Math.hypot(point[0] - lastLng, point[1] - lastLat) < spacing) continue
    kept.push(point)
    lastLng = point[0]
    lastLat = point[1]
  }
  kept.push(last)
  return kept
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
