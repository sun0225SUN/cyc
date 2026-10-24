import type { RideLap } from '@/entities/activity'
import {
  SPEED_GRADIENT,
  SPEED_MAX_KMH,
  SPEED_MIN_KMH,
  SPEED_STOPS,
  type SpeedStop,
} from '@/shared/config/speed-color'
import { routeDistances } from './lap-route'

export { SPEED_GRADIENT, SPEED_MAX_KMH, SPEED_MIN_KMH, SPEED_STOPS }

export type SpeedSegment = {
  index: number
  speed: number
  coordinates: [number, number][]
}

export function hasSpeedValues(
  speeds: Array<number | null | undefined> | undefined,
) {
  return Boolean(
    speeds?.some((value) => value != null && Number.isFinite(value)),
  )
}

export function colorAtSpeed(kmh: number) {
  const value = Math.min(SPEED_MAX_KMH, Math.max(SPEED_MIN_KMH, kmh))
  const first = SPEED_STOPS[0]
  const last = SPEED_STOPS[SPEED_STOPS.length - 1]
  if (!first || !last) return '#14d45a'
  let from: SpeedStop = first
  let to: SpeedStop = last
  for (let index = 1; index < SPEED_STOPS.length; index += 1) {
    const stop = SPEED_STOPS[index]
    if (!stop || value > stop[0]) continue
    from = SPEED_STOPS[index - 1] ?? from
    to = stop
    break
  }
  const span = to[0] - from[0]
  return mixHex(from[1], to[1], span === 0 ? 0 : (value - from[0]) / span)
}

export function speedLineStops(
  coordinates: [number, number][],
  distances: Array<number | null | undefined> | undefined,
  speeds: Array<number | null | undefined> | undefined,
  span?: { origin: number; routeTotal: number },
  maxStops = 48,
): Array<number | string> {
  if (coordinates.length < 2 || !hasSpeedValues(speeds)) return []
  const lengths = routeDistances(coordinates)
  const lineTotal = lengths[lengths.length - 1] ?? 0
  const routeTotal = span?.routeTotal ?? lineTotal
  const origin = span?.origin ?? 0
  const samples = speedSamples(distances, speeds, routeTotal)
  const sampleTotal = samples[samples.length - 1]?.distance ?? routeTotal
  const count = Math.max(2, maxStops)
  const stops: Array<number | string> = []
  for (let index = 0; index <= count; index += 1) {
    const progress = index / count
    const along = origin + progress * lineTotal
    const target = routeTotal > 0 ? (along / routeTotal) * sampleTotal : 0
    stops.push(progress, colorAtSpeed(lookupSpeed(samples, target)))
  }
  return stops
}

export function lapOrigins(laps: RideLap[], routeTotal: number) {
  return new Map(
    lapWindows(laps, routeTotal).map((window) => [window.index, window.start]),
  )
}

export function speedSegments(
  route: [number, number][],
  laps: RideLap[],
  distances: Array<number | null | undefined> | undefined,
  speeds: Array<number | null | undefined> | undefined,
): SpeedSegment[] {
  if (route.length < 2 || !hasSpeedValues(speeds)) return []
  const lengths = routeDistances(route)
  const total = lengths[lengths.length - 1] ?? 0
  const windows = lapWindows(laps, total)
  const samples = speedSamples(distances, speeds, total)
  const sampleTotal = samples[samples.length - 1]?.distance ?? total
  const segments: SpeedSegment[] = []
  for (let index = 1; index < route.length; index += 1) {
    const from = route[index - 1]
    const to = route[index]
    if (!from || !to) continue
    const mid = ((lengths[index - 1] ?? 0) + (lengths[index] ?? 0)) / 2
    const target = total > 0 ? (mid / total) * sampleTotal : 0
    segments.push({
      index: lapAt(windows, mid),
      speed: lookupSpeed(samples, target),
      coordinates: [from, to],
    })
  }
  return segments
}

function lapWindows(laps: RideLap[], routeTotal: number) {
  if (laps.length === 0) return [{ index: 0, start: 0, end: routeTotal }]
  const ordered = [...laps].sort((left, right) => left.index - right.index)
  const lapTotal = ordered.reduce((sum, lap) => sum + (lap.distance ?? 0), 0)
  const scale = lapTotal > 0 ? routeTotal / lapTotal : 1
  const windows: Array<{ index: number; start: number; end: number }> = []
  let start = 0
  for (const lap of ordered) {
    const end = start + (lap.distance ?? 0) * scale
    windows.push({ index: lap.index, start, end })
    start = end
  }
  return windows
}

function lapAt(
  windows: Array<{ index: number; start: number; end: number }>,
  meters: number,
) {
  for (const window of windows) {
    if (meters <= window.end) return window.index
  }
  return windows[windows.length - 1]?.index ?? 0
}

function speedSamples(
  distances: Array<number | null | undefined> | undefined,
  speeds: Array<number | null | undefined> | undefined,
  routeTotal: number,
) {
  const count = Math.max(distances?.length ?? 0, speeds?.length ?? 0)
  const samples: Array<{ distance: number; speed: number }> = []
  for (let index = 0; index < count; index += 1) {
    const raw = speeds?.[index]
    if (raw == null || !Number.isFinite(raw)) continue
    const distance = distances?.[index]
    samples.push({
      distance:
        distance != null && Number.isFinite(distance)
          ? distance
          : count > 1
            ? (index / (count - 1)) * routeTotal
            : 0,
      speed: raw * 3.6,
    })
  }
  return samples
}

function mixHex(left: string, right: string, amount: number) {
  const from = hexRgb(left)
  const to = hexRgb(right)
  const t = Math.min(1, Math.max(0, amount))
  return `#${[0, 1, 2]
    .map((index) => {
      const start = from[index] ?? 0
      const end = to[index] ?? start
      return Math.round(start + (end - start) * t)
        .toString(16)
        .padStart(2, '0')
    })
    .join('')}`
}

function hexRgb(color: string) {
  const hex = color.replace('#', '')
  return [0, 2, 4].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  )
}

function lookupSpeed(
  samples: Array<{ distance: number; speed: number }>,
  target: number,
) {
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (!first || !last) return 0
  if (target <= first.distance) return first.speed
  if (target >= last.distance) return last.speed
  let low = 0
  let high = samples.length - 1
  while (low < high - 1) {
    const mid = (low + high) >> 1
    if ((samples[mid]?.distance ?? 0) <= target) low = mid
    else high = mid
  }
  const from = samples[low]
  const to = samples[high]
  if (!from || !to) return from?.speed ?? to?.speed ?? 0
  const span = to.distance - from.distance
  const ratio = span === 0 ? 0 : (target - from.distance) / span
  return from.speed + (to.speed - from.speed) * ratio
}
