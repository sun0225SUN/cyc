import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { cacheLife } from 'next/cache'
import { privacyMode } from '@/shared/config/privacy'
import type { Activity } from '../model/activity'
import { presentPolyline } from '../model/present-route'

export async function loadActivities(): Promise<Activity[]> {
  'use cache'
  cacheLife('max')

  const file = path.join(process.cwd(), 'data', 'activities.json')
  const text = await readFile(file, 'utf8')
  const activities: unknown = JSON.parse(text)
  if (!Array.isArray(activities)) {
    throw new Error('data/activities.json must be a list of activities')
  }
  const rides = activities as Activity[]
  if (!privacyMode) return rides
  return rides.map((activity) => ({
    ...activity,
    summary_polyline: presentPolyline(activity.summary_polyline),
  }))
}
