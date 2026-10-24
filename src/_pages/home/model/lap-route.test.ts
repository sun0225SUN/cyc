import { encode } from '@mapbox/polyline'
import { expect, test } from 'vitest'
import type { RideLap } from '@/entities/activity'
import {
  coordinatesBounds,
  lapCoordinates,
  lapDistanceWindow,
  lapPaths,
  routeCoordinates,
} from './lap-route'

const first: [number, number] = [30, 120]
const middle: [number, number] = [30.01, 120]
const last: [number, number] = [30.03, 120]
const polyline = encode([
  [first[0], first[1]],
  [middle[0], middle[1]],
  [last[0], last[1]],
])

function lap(index: number, distance: number): RideLap {
  return {
    index,
    elapsed: 0,
    distance,
    lat: null,
    lng: null,
  }
}

test('builds a distance window from previous laps', () => {
  expect(
    lapDistanceWindow([lap(1, 5000), lap(2, 5000), lap(3, 400)], 2),
  ).toEqual({
    start: 5000,
    end: 10000,
  })
})

test('slices the polyline to the selected lap', () => {
  const laps = [lap(1, 1000), lap(2, 2000)]
  const firstLap = lapCoordinates(polyline, laps, 1)
  const secondLap = lapCoordinates(polyline, laps, 2)
  expect(firstLap.length).toBeGreaterThanOrEqual(2)
  expect(firstLap[0]?.[0]).toBeCloseTo(first[1], 3)
  expect(secondLap[0]?.[1]).toBeGreaterThan(firstLap[0]?.[1] ?? 0)
})

test('splits the polyline into one path per lap', () => {
  const laps = [lap(1, 1000), lap(2, 2000)]
  const paths = lapPaths(polyline, laps)
  expect(paths.map((path) => path.index)).toEqual([1, 2])
  expect(paths[0]?.coordinates.length).toBeGreaterThanOrEqual(2)
  expect(paths[1]?.coordinates[0]?.[1]).toBeGreaterThan(
    paths[0]?.coordinates[0]?.[1] ?? 0,
  )
})

test('frames only the selected lap instead of the whole route', () => {
  const laps = [lap(1, 1000), lap(2, 2000)]
  const lapBounds = coordinatesBounds(lapCoordinates(polyline, laps, 1))
  const routeBounds = coordinatesBounds(routeCoordinates(polyline))
  expect(lapBounds).not.toEqual(routeBounds)
  expect(lapBounds?.[1][1] ?? 0).toBeLessThan(routeBounds?.[1][1] ?? 0)
})
