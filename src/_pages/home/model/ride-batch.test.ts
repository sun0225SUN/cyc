import { expect, test } from 'vitest'
import type { Activity } from '@/entities/activity'
import {
  firstRideBatchIds,
  nextRideBatchIds,
  RIDE_MAP_BATCH,
  rideIdsNewestFirst,
} from './ride-batch'

function activity(id: number, start: string, polyline = 'abc'): Activity {
  return {
    run_id: id,
    name: '',
    distance: 1000,
    moving_time: '0:10:00',
    type: 'cycling',
    subtype: 'road',
    start_date: start,
    start_date_local: start,
    location_country: '',
    summary_polyline: polyline,
    average_heartrate: null,
    average_speed: 5,
    elevation_gain: 10,
    streak: 1,
  }
}

test('orders ride ids from newest to oldest and skips empty tracks', () => {
  expect(
    rideIdsNewestFirst([
      activity(1, '2023-01-01 08:00:00'),
      activity(2, '2026-09-12 16:00:00', ''),
      activity(3, '2026-09-12 16:07:19'),
      activity(4, '2025-04-01 07:00:00'),
    ]),
  ).toEqual([3, 4, 1])
})

test('keeps a full first page when the catalog still fits in one batch', () => {
  const ids = Array.from({ length: 91 }, (_, index) => index + 1)
  expect(firstRideBatchIds(ids)).toEqual(ids)
  expect(nextRideBatchIds(ids, ids.length)).toEqual([])
})

test('loads the newest page first, then older leftovers', () => {
  const ids = Array.from({ length: 250 }, (_, index) => 250 - index)
  expect(firstRideBatchIds(ids)).toEqual(ids.slice(0, RIDE_MAP_BATCH))
  expect(nextRideBatchIds(ids, RIDE_MAP_BATCH)).toEqual(
    ids.slice(RIDE_MAP_BATCH, RIDE_MAP_BATCH * 2),
  )
  expect(nextRideBatchIds(ids, RIDE_MAP_BATCH * 2)).toEqual(
    ids.slice(RIDE_MAP_BATCH * 2),
  )
})
