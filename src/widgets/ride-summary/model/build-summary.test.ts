import { expect, test } from 'vitest'
import type { Activity } from '@/entities/activity'
import {
  buildSummaryChart,
  isoWeekKey,
  parseMovingTime,
  summarize,
} from './build-summary'

function activity(
  id: number,
  date: string,
  distance: number,
  movingTime = '1:00:00',
): Activity {
  return {
    run_id: id,
    name: '',
    distance,
    moving_time: movingTime,
    type: 'cycling',
    subtype: 'road',
    start_date: date,
    start_date_local: date,
    location_country: '',
    summary_polyline: '',
    average_heartrate: null,
    average_speed: 5,
    elevation_gain: 10,
    streak: 1,
  }
}

test('parses clock and multi-day moving times', () => {
  expect(parseMovingTime('1:02:03')).toBe(3723)
  expect(parseMovingTime('1 day, 1:00:00')).toBe(90_000)
})

test('uses ISO week keys from the local calendar date', () => {
  expect(isoWeekKey('2026-01-01 08:00:00')).toBe('2026-W01')
  expect(isoWeekKey('2025-12-29 08:00:00')).toBe('2026-W01')
})

test('builds a year chart from all rides', () => {
  const points = buildSummaryChart(
    [
      activity(1, '2024-06-01 08:00:00', 10_000),
      activity(2, '2026-01-02 08:00:00', 20_000),
      activity(3, '2026-03-01 08:00:00', 5_000),
    ],
    'year',
  )
  expect(points).toEqual([
    { key: '2024', km: 10, count: 1 },
    { key: '2026', km: 25, count: 2 },
  ])
})

test('fills twelve months for a year scope', () => {
  const points = buildSummaryChart(
    [
      activity(1, '2026-01-02 08:00:00', 10_000),
      activity(2, '2026-01-20 08:00:00', 5_000),
      activity(3, '2026-03-01 08:00:00', 20_000),
    ],
    'month',
    { year: 2026 },
  )
  expect(points).toHaveLength(12)
  expect(points[0]).toEqual({ key: '2026-01', km: 15, count: 2 })
  expect(points[2]).toEqual({ key: '2026-03', km: 20, count: 1 })
  expect(points[1]).toEqual({ key: '2026-02', km: 0, count: 0 })
})

test('builds seven day bars for an ISO week', () => {
  const points = buildSummaryChart(
    [activity(1, '2026-01-01 08:00:00', 10_000)],
    'day',
    { week: '2026-W01' },
  )
  expect(points).toHaveLength(7)
  expect(points[0]?.key).toBe('2025-12-29')
  expect(points[3]).toEqual({ key: '2026-01-01', km: 10, count: 1 })
})

test('summarizes distance, time, and elevation', () => {
  const stats = summarize([
    activity(1, '2026-01-01 08:00:00', 20_000, '1:00:00'),
    activity(2, '2026-01-02 08:00:00', 10_000, '0:30:00'),
  ])
  expect(stats.count).toBe(2)
  expect(stats.distance).toBe(30_000)
  expect(stats.seconds).toBe(5400)
  expect(stats.elevation).toBe(20)
  expect(stats.maxDistance).toBe(20_000)
  expect(stats.maxSpeed).toBeCloseTo(20_000 / 3600)
})

test('fills months across years when no year is scoped', () => {
  const points = buildSummaryChart(
    [
      activity(1, '2024-06-01 08:00:00', 10_000),
      activity(2, '2026-01-02 08:00:00', 20_000),
    ],
    'month',
  )
  expect(points).toHaveLength(36)
  expect(points[5]).toEqual({ key: '2024-06', km: 10, count: 1 })
  expect(points[24]).toEqual({ key: '2026-01', km: 20, count: 1 })
})
