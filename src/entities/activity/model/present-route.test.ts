import { decode, encode } from '@mapbox/polyline'
import { expect, test } from 'vitest'
import { privacyHideMeters, privacyMode } from '@/shared/config/privacy'
import {
  presentLaps,
  presentPolyline,
  presentRoute,
  privacyCut,
  redactHiddenLapMarkers,
  trimTrackEnds,
} from './present-route'
import type { RideLap } from './ride-detail'

const EARTH = 6_371_000

function meters(left: [number, number], right: [number, number]) {
  const dLat = ((right[1] - left[1]) * Math.PI) / 180
  const dLng = ((right[0] - left[0]) * Math.PI) / 180
  const lat1 = (left[1] * Math.PI) / 180
  const lat2 = (right[1] * Math.PI) / 180
  const half =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(half)))
}

function line(): [number, number][] {
  return [
    [120, 30],
    [120, 30.01],
    [120, 30.02],
    [120, 30.03],
  ]
}

function lap(
  index: number,
  distance: number,
  lat: number | null = null,
  lng: number | null = null,
): RideLap {
  return { index, elapsed: 0, distance, lat, lng }
}

test('cuts the same distance from both ends of a track', () => {
  const points = line()
  const trimmed = trimTrackEnds(points, 500, 'lnglat')
  const start = points[0]
  const end = points.at(-1)
  const cutStart = trimmed[0]
  const cutEnd = trimmed.at(-1)
  expect(start && cutStart && meters(start, cutStart)).toBeCloseTo(500, 0)
  expect(end && cutEnd && meters(end, cutEnd)).toBeCloseTo(500, 0)
  expect(cutStart?.[0]).toBeCloseTo(120, 6)
  expect(trimmed.some((point) => point[1] === 30.02)).toBe(true)
  expect(trimmed[0]?.[1]).toBeGreaterThan(30)
  expect(cutEnd?.[1] ?? 0).toBeLessThan(30.03)
})

test('drops a track that is shorter than both cuts', () => {
  expect(
    trimTrackEnds(
      [
        [120, 30],
        [120, 30.004],
      ],
      500,
      'lnglat',
    ),
  ).toEqual([])
})

test('leaves coordinates in place when privacy mode is off', () => {
  const points = line()
  const presented = presentRoute(points, 'lnglat', {
    enabled: false,
    hideMeters: 500,
  })
  expect(presented.points).toBe(points)
  expect(presented.originMeters).toBe(0)
  expect(presented.totalMeters).toBe(0)
})

test('applies the configured cut when privacy mode is on', () => {
  const presented = presentRoute(line(), 'lnglat', {
    enabled: true,
    hideMeters: 500,
  })
  expect(presented.originMeters).toBe(500)
  expect(presented.totalMeters).toBeGreaterThan(3000)
  expect(presented.points[0]?.[1] ?? 0).toBeGreaterThan(30)
  expect(presented.points.at(-1)?.[1] ?? 30).toBeLessThan(30.03)
})

test('shortens the first and last laps and clears a hidden end marker', () => {
  const laps = [lap(1, 5000, 23.1, 113.4), lap(2, 1000, 23.2, 113.5)]
  const next = presentLaps(laps, 500, 6000)
  expect(next.map((item) => item.index)).toEqual([1, 2])
  expect(next[0]?.distance).toBeCloseTo(4500)
  expect(next[0]?.lat).toBe(23.1)
  expect(next[1]?.distance).toBeCloseTo(500)
  expect(next[1]?.lat).toBeNull()
  expect(next[1]?.lng).toBeNull()
})

test('keeps laps unchanged when nothing is hidden', () => {
  const laps = [lap(1, 1000)]
  expect(presentLaps(laps, 0, 1000)).toEqual(laps)
})

test('removes every lap when the whole ride is inside the hidden ends', () => {
  expect(presentLaps([lap(1, 800, 1, 2)], 500, 800)).toEqual([])
})

test('presentPolyline encodes a track with both ends removed', () => {
  const encoded = encode([
    [30, 120],
    [30.01, 120],
    [30.02, 120],
    [30.03, 120],
  ])
  const decoded = decode(
    presentPolyline(encoded, { enabled: true, hideMeters: 500 }),
  )
  expect(decoded[0]?.[0] ?? 0).toBeGreaterThan(30)
  expect(decoded.at(-1)?.[0] ?? 30).toBeLessThan(30.03)
})

test('presentPolyline keeps the encoded track when privacy is off', () => {
  const encoded = encode([
    [30, 120],
    [30.02, 120],
  ])
  expect(presentPolyline(encoded, { enabled: false, hideMeters: 500 })).toBe(
    encoded,
  )
})

test('redact keeps lap rows and clears a marker on the hidden finish', () => {
  const laps = [lap(1, 5000, 23.1, 113.4), lap(2, 1000, 23.2, 113.5)]
  const next = redactHiddenLapMarkers(laps, 500, 6000)
  expect(next.map((item) => item.distance)).toEqual([5000, 1000])
  expect(next[0]?.lat).toBe(23.1)
  expect(next[1]?.lat).toBeNull()
  expect(next[1]?.lng).toBeNull()
})

test('privacyCut matches the configured hide distance', () => {
  const cut = privacyCut(2000)
  if (privacyMode) {
    expect(cut.originMeters).toBe(privacyHideMeters)
    expect(cut.totalMeters).toBe(2000 + privacyHideMeters * 2)
    return
  }
  expect(cut).toEqual({ originMeters: 0, totalMeters: 2000 })
})
