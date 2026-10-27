import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { cacheLife } from 'next/cache'
import { privacyMode } from '@/shared/config/privacy'
import type { Activity } from '../model/activity'
import { presentPolyline } from '../model/present-route'

export type ActivityCatalog = {
  activities: Activity[]
  missingData: boolean
}

export async function loadActivities(): Promise<ActivityCatalog> {
  'use cache'
  cacheLife('max')

  const root = path.join(process.cwd(), 'data')
  const file = path.join(root, 'activities.json')
  let missingData = false
  let text: string | null = null
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (!isEnoent(error)) throw error
    missingData = true
  }
  try {
    await access(path.join(root, 'rides'))
  } catch (error) {
    if (!isEnoent(error)) throw error
    missingData = true
  }
  if (text == null) return { activities: [], missingData }

  const activities: unknown = JSON.parse(text)
  if (!Array.isArray(activities)) {
    throw new Error('data/activities.json must be a list of activities')
  }
  const rides = activities as Activity[]
  const visible = privacyMode
    ? rides.map((activity) => ({
        ...activity,
        summary_polyline: presentPolyline(activity.summary_polyline),
      }))
    : rides
  return { activities: visible, missingData }
}

function isEnoent(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
