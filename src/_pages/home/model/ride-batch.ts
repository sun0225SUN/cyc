import { activitiesNewestFirst, type Activity } from '@/entities/activity'

export const RIDE_MAP_BATCH = 100

export function rideIdsNewestFirst(activities: readonly Activity[]) {
  return activitiesNewestFirst(activities)
    .filter((activity) => Boolean(activity.summary_polyline))
    .map((activity) => activity.run_id)
}

export function firstRideBatchIds(ids: readonly number[]) {
  return ids.slice(0, RIDE_MAP_BATCH)
}

export function nextRideBatchIds(ids: readonly number[], cursor: number) {
  return ids.slice(cursor, cursor + RIDE_MAP_BATCH)
}
