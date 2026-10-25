import { decode, encode } from '@mapbox/polyline'
import { privacyHideMeters, privacyMode } from '@/shared/config/privacy'
import type { RideLap } from './ride-detail'

export type TrackAxes = 'lnglat' | 'latlng'

type TrackPoint = readonly [number, number]

export type PrivacySettings = {
  enabled: boolean
  hideMeters: number
}

export type PresentedRoute = {
  points: [number, number][]
  /** Distance from the original start to `points[0]`. Zero when privacy is off. */
  originMeters: number
  /** Length of the original track. Zero when privacy is off. */
  totalMeters: number
}

const EARTH = 6_371_000

const defaultPrivacy = (): PrivacySettings => ({
  enabled: privacyMode,
  hideMeters: privacyHideMeters,
})

/**
 * Cut `hideMeters` off each end when privacy mode is on.
 * A track that is not longer than both cuts is removed.
 */
export function presentRoute(
  points: readonly TrackPoint[],
  axes: TrackAxes = 'lnglat',
  privacy: PrivacySettings = defaultPrivacy(),
): PresentedRoute {
  if (!privacy.enabled || privacy.hideMeters <= 0 || points.length < 2) {
    return {
      points: points as [number, number][],
      originMeters: 0,
      totalMeters: 0,
    }
  }
  const totalMeters = trackLength(points, axes)
  const hide = privacy.hideMeters
  if (!(totalMeters > hide * 2)) {
    return { points: [], originMeters: hide, totalMeters }
  }
  return {
    points: trimTrackEnds(points, hide, axes),
    originMeters: hide,
    totalMeters,
  }
}

/**
 * Shorten laps so they match a track whose ends were cut.
 * A lap marker that would sit on a hidden end is cleared.
 */
export function presentLaps(
  laps: readonly RideLap[],
  originMeters: number,
  totalMeters: number,
): RideLap[] {
  if (originMeters <= 0) return [...laps]
  if (!(totalMeters > originMeters * 2)) return []
  const ordered = [...laps].sort((left, right) => left.index - right.index)
  const lapTotal = ordered.reduce((sum, lap) => sum + (lap.distance ?? 0), 0)
  if (!(lapTotal > 0)) return []
  const hide = originMeters * (lapTotal / totalMeters)
  const visibleEnd = lapTotal - hide
  if (!(visibleEnd > hide)) return []

  const next: RideLap[] = []
  let cursor = 0
  for (const lap of ordered) {
    const start = cursor
    const end = cursor + (lap.distance ?? 0)
    cursor = end
    const from = Math.max(start, hide)
    const to = Math.min(end, visibleEnd)
    if (!(to - from > 1)) continue
    const keepMarker = end <= visibleEnd && end + 1e-6 >= hide
    next.push({
      ...lap,
      distance: to - from,
      lat: keepMarker ? lap.lat : null,
      lng: keepMarker ? lap.lng : null,
    })
  }
  return next
}

/** Encode a polyline with the privacy cut applied. An empty string hides the ride. */
export function presentPolyline(
  polyline: string,
  privacy: PrivacySettings = defaultPrivacy(),
): string {
  if (!privacy.enabled || privacy.hideMeters <= 0 || !polyline) return polyline
  let coordinates: [number, number][]
  try {
    coordinates = decode(polyline).map(([latitude, longitude]) => [
      longitude ?? 0,
      latitude ?? 0,
    ])
  } catch {
    return polyline
  }
  const presented = presentRoute(coordinates, 'lnglat', privacy)
  if (presented.points.length < 2) return ''
  return encode(
    presented.points.map(([longitude, latitude]) => [latitude, longitude]),
  )
}

/**
 * Offset for a line that was already cut by `privacyHideMeters` at both ends.
 * `lineMeters` is the length of that shortened line.
 */
export function privacyCut(lineMeters: number) {
  if (!privacyMode || privacyHideMeters <= 0 || !(lineMeters > 0)) {
    return { originMeters: 0, totalMeters: lineMeters }
  }
  return {
    originMeters: privacyHideMeters,
    totalMeters: lineMeters + privacyHideMeters * 2,
  }
}

/** Keep every lap row, but drop coordinates that sit on a hidden end. */
export function redactHiddenLapMarkers(
  laps: readonly RideLap[],
  originMeters: number,
  totalMeters: number,
): RideLap[] {
  if (originMeters <= 0) return [...laps]
  const visible = new Set(
    presentLaps(laps, originMeters, totalMeters)
      .filter((lap) => lap.lat != null || lap.lng != null)
      .map((lap) => lap.index),
  )
  return laps.map((lap) =>
    visible.has(lap.index) ? { ...lap } : { ...lap, lat: null, lng: null },
  )
}

export function trimTrackEnds(
  points: readonly TrackPoint[],
  meters: number,
  axes: TrackAxes = 'lnglat',
): [number, number][] {
  if (points.length < 2 || meters <= 0) {
    return points.map((point) => [point[0], point[1]])
  }
  const lengths = cumulative(points, axes)
  const total = lengths[lengths.length - 1] ?? 0
  if (!(total > meters * 2)) return []
  const start = pointAlong(points, lengths, meters)
  const end = pointAlong(points, lengths, total - meters)
  const kept: [number, number][] = []
  if (start) kept.push(start)
  for (let index = 1; index < points.length - 1; index += 1) {
    const length = lengths[index] ?? 0
    const point = points[index]
    if (!point || length <= meters || length >= total - meters) continue
    kept.push([point[0], point[1]])
  }
  if (end && !samePoint(kept[kept.length - 1], end)) kept.push(end)
  return kept.length >= 2 ? kept : []
}

function trackLength(points: readonly TrackPoint[], axes: TrackAxes) {
  return cumulative(points, axes).at(-1) ?? 0
}

function cumulative(points: readonly TrackPoint[], axes: TrackAxes) {
  const lengths = [0]
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (!previous || !current) continue
    lengths.push(
      (lengths[index - 1] ?? 0) + metersBetween(previous, current, axes),
    )
  }
  return lengths
}

function pointAlong(
  points: readonly TrackPoint[],
  lengths: number[],
  target: number,
): [number, number] | undefined {
  const last = points[points.length - 1]
  const total = lengths[lengths.length - 1] ?? 0
  if (!last) return undefined
  if (target <= 0) return [points[0]?.[0] ?? 0, points[0]?.[1] ?? 0]
  if (target >= total) return [last[0], last[1]]
  for (let index = 1; index < points.length; index += 1) {
    const previousLength = lengths[index - 1] ?? 0
    const length = lengths[index] ?? 0
    if (length < target) continue
    const from = points[index - 1]
    const to = points[index]
    if (!from || !to) {
      const point = from ?? to
      return point ? [point[0], point[1]] : undefined
    }
    const span = length - previousLength
    const t = span === 0 ? 0 : (target - previousLength) / span
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
  }
  return [last[0], last[1]]
}

function metersBetween(left: TrackPoint, right: TrackPoint, axes: TrackAxes) {
  const [lat1, lng1] = axes === 'lnglat' ? [left[1], left[0]] : left
  const [lat2, lng2] = axes === 'lnglat' ? [right[1], right[0]] : right
  const dLat = radians(lat2 - lat1)
  const dLng = radians(lng2 - lng1)
  const half =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(half)))
}

function radians(degrees: number) {
  return (degrees * Math.PI) / 180
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
