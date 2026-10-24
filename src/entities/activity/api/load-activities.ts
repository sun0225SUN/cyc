import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { cacheLife } from 'next/cache'
import type { Activity } from '../model/activity'

export async function loadActivities(): Promise<Activity[]> {
  'use cache'
  cacheLife('max')

  const file = path.join(process.cwd(), 'data', 'activities.json')
  const text = await readFile(file, 'utf8')
  const activities: unknown = JSON.parse(text)
  if (!Array.isArray(activities)) {
    throw new Error('data/activities.json must be a list of activities')
  }
  return activities as Activity[]
}
