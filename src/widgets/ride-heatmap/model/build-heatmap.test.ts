import { expect, test } from 'vitest'
import type { Activity } from '@/entities/activity'
import { activityYears, buildYearHeatmap } from './build-heatmap'

function activity(id: number, date: string, distance: number): Activity {
  return {
    run_id: id,
    name: '',
    distance,
    moving_time: '1:00:00',
    type: 'cycling',
    subtype: 'road',
    start_date: date,
    start_date_local: date,
    location_country: '',
    summary_polyline: '',
    average_heartrate: null,
    average_speed: 5,
    elevation_gain: 0,
    streak: 1,
  }
}

test('groups rides by local calendar day and builds 53 weeks', () => {
  const data = buildYearHeatmap(
    [
      activity(1, '2026-01-02 08:00:00', 20_000),
      activity(2, '2026-01-02 18:00:00', 30_000),
      activity(3, '2026-06-01 08:00:00', 100_000),
      activity(4, '2025-01-02 08:00:00', 10_000),
    ],
    2026,
  )

  expect(data.weeks).toHaveLength(53)
  expect(data.totalRides).toBe(3)
  expect(data.totalDistance).toBe(150_000)
  const januarySecond = data.weeks
    .flat()
    .find((day) => day.date === '2026-01-02')
  expect(januarySecond).toMatchObject({ count: 2, distance: 50_000 })
  expect(januarySecond?.intensity).toBeGreaterThan(0)
})

test('returns available years newest first', () => {
  expect(
    activityYears([
      activity(1, '2024-01-01 08:00:00', 1),
      activity(2, '2026-01-01 08:00:00', 1),
      activity(3, '2025-01-01 08:00:00', 1),
    ]),
  ).toEqual([2026, 2025, 2024])
})
