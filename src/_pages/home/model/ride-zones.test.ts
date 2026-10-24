import { expect, test } from 'vitest'
import { analyzeZones, SPEED_ZONES, zoneMarks } from './ride-zones'

test('splits time across speed zones and 1 km/h bins', () => {
  const result = analyzeZones(
    [10, 20, 27, 40],
    [0, 10, 20, 30, 40],
    SPEED_ZONES,
    1,
  )

  expect(result.zones.map((zone) => zone.id)).toEqual([
    'z1',
    'z2',
    'z3',
    'z4',
    'z5',
  ])
  expect(result.zones[0]?.seconds).toBe(10)
  expect(result.zones[1]?.seconds).toBe(10)
  expect(result.zones[2]?.seconds).toBe(10)
  expect(result.zones[4]?.seconds).toBe(10)
  expect(result.zones[0]?.ratio).toBe(0.25)
  expect(result.histogram.find((bin) => bin.start === 20)?.seconds).toBe(10)
  expect(result.histogram.at(-1)?.start).toBe(40)
})

test('ignores samples without a following timestamp', () => {
  const result = analyzeZones([12], [0], SPEED_ZONES, 1)
  expect(result.zones.every((zone) => zone.seconds === 0)).toBe(true)
})

test('keeps a zero bin in the histogram but not in Z1', () => {
  const result = analyzeZones([0, 12], [0, 10, 20], SPEED_ZONES, 1)
  expect(result.histogram[0]?.seconds).toBe(10)
  expect(result.zones[0]?.seconds).toBe(10)
  expect(result.zones[0]?.ratio).toBe(1)
})

test('places zone labels and boundary marks', () => {
  expect(zoneMarks(SPEED_ZONES, 43)).toEqual({
    bounds: [18, 25, 30, 35],
    labels: [
      { id: 'z1', at: 9 },
      { id: 'z2', at: 21.5 },
      { id: 'z3', at: 27.5 },
      { id: 'z4', at: 32.5 },
      { id: 'z5', at: 39 },
    ],
  })
})

test('uses distance and speed for moving time', () => {
  const result = analyzeZones([18, 18], [0, 100, 200], SPEED_ZONES, 1, {
    speed: [5, 5],
    distance: [0, 50, 100],
  })
  expect(result.zones[1]?.seconds).toBeCloseTo(20)
})
