import { expect, test } from 'vitest'
import type { RideLap } from '@/entities/activity'
import {
  baseChartWindow,
  fullWindow,
  lapChartWindow,
  originAt,
  panWindow,
  sameWindow,
  valueAtRatio,
  windowedPoints,
  zoomWindow,
} from './chart-window'

function lap(
  index: number,
  elapsed: number,
  extras: Partial<RideLap> = {},
): RideLap {
  return {
    index,
    elapsed,
    distance: extras.distance ?? 5000,
    lat: null,
    lng: null,
    elapsed_time: extras.elapsed_time ?? 1000,
    timer_time: extras.timer_time,
  }
}

test('builds a time window from lap start to the next lap', () => {
  expect(
    lapChartWindow(
      [lap(1, 0, { elapsed_time: 1269 }), lap(2, 1269), lap(3, 2719)],
      2,
      'time',
    ),
  ).toEqual({ start: 1269, end: 2719 })
})

test('uses elapsed time for the last lap', () => {
  expect(
    lapChartWindow([lap(15, 25968, { elapsed_time: 176 })], 15, 'time'),
  ).toEqual({ start: 25968, end: 26144 })
})

test('builds a distance window from previous laps', () => {
  expect(
    lapChartWindow(
      [lap(1, 0, { distance: 5000 }), lap(2, 1269, { distance: 5000 })],
      2,
      'distance',
    ),
  ).toEqual({ start: 5000, end: 10000 })
})

test('zooms in around the pointer without leaving bounds', () => {
  const next = zoomWindow(
    { start: 0, end: 100 },
    { start: 0, end: 100 },
    0.5,
    25,
  )
  expect(next.end - next.start).toBeCloseTo(50)
  expect(next.start).toBeCloseTo(12.5)
  expect(next.end).toBeCloseTo(62.5)
})

test('pans the window and stays inside bounds', () => {
  expect(panWindow({ start: 20, end: 40 }, { start: 0, end: 100 }, 15)).toEqual(
    {
      start: 35,
      end: 55,
    },
  )
  expect(
    panWindow({ start: 20, end: 40 }, { start: 0, end: 100 }, -50),
  ).toEqual({
    start: 0,
    end: 20,
  })
})

test('cannot zoom out past the full range', () => {
  expect(
    zoomWindow({ start: 10, end: 40 }, { start: 0, end: 100 }, 8, 25),
  ).toEqual({ start: 0, end: 100 })
})

test('maps a pointer into the visible window', () => {
  expect(originAt(0, 148, 48 + 50, { start: 0, end: 100 })).toBeCloseTo(50)
})

test('keeps a point on each side of the window', () => {
  const points = [0, 10, 20, 30, 40].map((x) => ({ x }))
  expect(
    windowedPoints(points, { start: 18, end: 32 }).map((point) => point.x),
  ).toEqual([10, 20, 30, 40])
})

test('reads the full numeric range', () => {
  expect(fullWindow([0, null, 10, 4])).toEqual({ start: 0, end: 10 })
})

test('resets to the selected lap window', () => {
  expect(
    baseChartWindow(
      { start: 0, end: 10000 },
      [lap(1, 0, { elapsed_time: 1269 }), lap(2, 1269, { elapsed_time: 1450 })],
      2,
      'time',
    ),
  ).toEqual({ start: 1269, end: 2719 })
})

test('compares windows and maps a ratio onto the bounds', () => {
  expect(sameWindow({ start: 0, end: 10 }, { start: 0, end: 10.0004 })).toBe(
    true,
  )
  expect(valueAtRatio({ start: 0, end: 100 }, 0.25)).toBe(25)
})
