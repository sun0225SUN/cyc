import { expect, test } from 'vitest'
import type { RideLap } from '@/entities/activity'
import { visibleLapColumns } from './ride-laps'

function lap(overrides: Partial<RideLap> = {}): RideLap {
  return {
    index: 1,
    elapsed: 0,
    distance: 5000,
    lat: 1,
    lng: 2,
    timer_time: 860,
    average_speed: 5.8,
    max_speed: 9.6,
    average_cadence: 54,
    max_cadence: 86,
    calories: 141,
    ...overrides,
  }
}

test('keeps the lap index and hides empty heart and power columns', () => {
  const columns = visibleLapColumns([lap()])
  expect(columns.map((column) => column.key)).toEqual([
    'index',
    'timer_time',
    'distance',
    'average_speed',
    'max_speed',
    'average_cadence',
    'max_cadence',
    'calories',
  ])
})

test('shows a column when any lap has a value', () => {
  const columns = visibleLapColumns([
    lap({ average_heartrate: null }),
    lap({ index: 2, average_heartrate: 140 }),
  ])
  expect(columns.some((column) => column.key === 'average_heartrate')).toBe(
    true,
  )
})
