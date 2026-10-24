import type { Activity } from '@/entities/activity'

export type HeatmapDay = {
  date: string
  count: number
  distance: number
  intensity: number
  inYear: boolean
}

export type YearHeatmap = {
  year: number
  totalDistance: number
  totalRides: number
  weeks: HeatmapDay[][]
}

const DAY_MS = 86_400_000

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function buildYearHeatmap(
  activities: Activity[],
  year: number,
): YearHeatmap {
  const daily = new Map<string, { count: number; distance: number }>()
  let totalDistance = 0
  let totalRides = 0

  for (const activity of activities) {
    const date = activity.start_date_local.slice(0, 10)
    if (Number(date.slice(0, 4)) !== year) continue
    const value = daily.get(date) ?? { count: 0, distance: 0 }
    value.count += 1
    value.distance += activity.distance
    daily.set(date, value)
    totalDistance += activity.distance
    totalRides += 1
  }

  const yearStart = new Date(Date.UTC(year, 0, 1))
  const gridStart = new Date(yearStart)
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay())
  const maxDistance = Math.max(
    0,
    ...[...daily.values()].map((day) => day.distance),
  )
  const weeks: HeatmapDay[][] = []

  for (let week = 0; week < 53; week += 1) {
    const days: HeatmapDay[] = []
    for (let day = 0; day < 7; day += 1) {
      const current = new Date(gridStart.getTime() + (week * 7 + day) * DAY_MS)
      const date = dateKey(current)
      const value = daily.get(date) ?? { count: 0, distance: 0 }
      const inYear = current.getUTCFullYear() === year
      const intensity =
        inYear && value.distance > 0 && maxDistance > 0
          ? Math.max(1, Math.ceil(Math.sqrt(value.distance / maxDistance) * 5))
          : 0
      days.push({ date, ...value, intensity, inYear })
    }
    weeks.push(days)
  }

  return { year, totalDistance, totalRides, weeks }
}

export function activityYears(activities: Activity[]): number[] {
  return [
    ...new Set(
      activities.map((activity) =>
        Number(activity.start_date_local.slice(0, 4)),
      ),
    ),
  ]
    .filter(Number.isFinite)
    .sort((a, b) => b - a)
}
