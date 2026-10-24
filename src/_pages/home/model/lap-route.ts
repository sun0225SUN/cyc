import { decode } from '@mapbox/polyline'
import type { LngLatBounds, RideLap } from '@/entities/activity'

const EARTH = 6_371_000

export function routeCoordinates(polyline: string): [number, number][] {
  if (!polyline) return []
  return decode(polyline).map(
    ([latitude, longitude]) => [longitude, latitude] as [number, number],
  )
}

export function lapCoordinates(
  polyline: string,
  laps: RideLap[],
  index: number,
): [number, number][] {
  const coordinates = routeCoordinates(polyline)
  const window = lapDistanceWindow(laps, index)
  if (coordinates.length < 2 || !window) return []
  const lengths = cumulativeMeters(coordinates)
  const total = lengths[lengths.length - 1] ?? 0
  const lapTotal = laps.reduce((sum, lap) => sum + (lap.distance ?? 0), 0)
  const scale = lapTotal > 0 ? total / lapTotal : 1
  return sliceByDistance(
    coordinates,
    lengths,
    window.start * scale,
    window.end * scale,
  )
}

export function coordinatesBounds(
  coordinates: [number, number][],
): LngLatBounds | null {
  if (coordinates.length === 0) return null
  let west = Number.POSITIVE_INFINITY
  let south = Number.POSITIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY
  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude)
    south = Math.min(south, latitude)
    east = Math.max(east, longitude)
    north = Math.max(north, latitude)
  }
  if (west === east) {
    west -= 0.002
    east += 0.002
  }
  if (south === north) {
    south -= 0.002
    north += 0.002
  }
  return [
    [west, south],
    [east, north],
  ]
}

export function lapDistanceWindow(laps: RideLap[], index: number) {
  const ordered = [...laps].sort((left, right) => left.index - right.index)
  const at = ordered.findIndex((lap) => lap.index === index)
  if (at < 0) return null
  let start = 0
  for (const lap of ordered.slice(0, at)) start += lap.distance ?? 0
  return { start, end: start + (ordered[at]?.distance ?? 0) }
}

function sliceByDistance(
  coordinates: [number, number][],
  lengths: number[],
  start: number,
  end: number,
) {
  const points: [number, number][] = []
  const first = pointAt(coordinates, lengths, start)
  const last = pointAt(coordinates, lengths, end)
  if (first) points.push(first)
  for (let index = 1; index < coordinates.length - 1; index += 1) {
    const length = lengths[index] ?? 0
    const coordinate = coordinates[index]
    if (coordinate && length > start && length < end) points.push(coordinate)
  }
  if (last && !samePoint(points[points.length - 1], last)) points.push(last)
  return points
}

function pointAt(
  coordinates: [number, number][],
  lengths: number[],
  target: number,
) {
  const last = coordinates[coordinates.length - 1]
  const total = lengths[lengths.length - 1] ?? 0
  if (target <= 0) return coordinates[0]
  if (target >= total) return last
  for (let index = 1; index < coordinates.length; index += 1) {
    const previousLength = lengths[index - 1] ?? 0
    const length = lengths[index] ?? 0
    if (length < target) continue
    const from = coordinates[index - 1]
    const to = coordinates[index]
    if (!from || !to) return from ?? to
    const span = length - previousLength
    const t = span === 0 ? 0 : (target - previousLength) / span
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
  }
  return last
}

function samePoint(
  left: [number, number] | undefined,
  right: [number, number] | undefined,
) {
  return (
    left != null &&
    right != null &&
    left[0] === right[0] &&
    left[1] === right[1]
  )
}

function cumulativeMeters(coordinates: [number, number][]) {
  const lengths = [0]
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1]
    const current = coordinates[index]
    if (!previous || !current) continue
    lengths.push((lengths[index - 1] ?? 0) + metersBetween(previous, current))
  }
  return lengths
}

function metersBetween(left: [number, number], right: [number, number]) {
  const dLat = radians(right[1] - left[1])
  const dLng = radians(right[0] - left[0])
  const lat1 = radians(left[1])
  const lat2 = radians(right[1])
  const half =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(half)))
}

function radians(degrees: number) {
  return (degrees * Math.PI) / 180
}
