import { expect, test } from 'vitest'
import type { RideLap } from '@/entities/activity'
import {
  colorAtSpeed,
  hasSpeedValues,
  speedLineStops,
  speedSegments,
} from './speed-route'

const slow: [number, number] = [120, 30]
const mid: [number, number] = [120, 30.01]
const fast: [number, number] = [120, 30.03]
const route = [slow, mid, fast]

function lap(index: number, distance: number): RideLap {
  return { index, elapsed: 0, distance, lat: null, lng: null }
}

test('skips coloring when the ride has no speed stream', () => {
  expect(hasSpeedValues(undefined)).toBe(false)
  expect(hasSpeedValues([null, null])).toBe(false)
  expect(speedSegments(route, [], [0, 1000, 3000], undefined)).toEqual([])
})

test('maps later, faster stream samples onto later route segments', () => {
  const segments = speedSegments(
    route,
    [lap(1, 1000), lap(2, 2000)],
    [0, 1000, 3000],
    [2, 6, 12],
  )
  expect(segments).toHaveLength(2)
  expect(segments[0]?.speed).toBeLessThan(segments[1]?.speed ?? 0)
  expect(segments[0]?.index).toBe(1)
  expect(segments[1]?.index).toBe(2)
})

test('stores segment speed in km/h', () => {
  const [segment] = speedSegments([slow, fast], [], [0, 1000], [0, 50 / 3.6])
  expect(segment?.speed).toBeCloseTo(25, 0)
})

test('builds a continuous line-progress gradient from 0 to 1', () => {
  const stops = speedLineStops(route, [0, 1000, 3000], [1, 6, 12], undefined, 4)
  expect(stops[0]).toBe(0)
  expect(stops.at(-2)).toBe(1)
  expect(stops).toHaveLength(10)
  expect(colorAtSpeed(0)).toBe('#14d45a')
  expect(colorAtSpeed(40)).toBe('#e02424')
})
