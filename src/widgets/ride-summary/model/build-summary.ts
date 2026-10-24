import type { Activity } from '@/entities/activity'

export type SummaryGrain = 'year' | 'month' | 'week' | 'day'

export type SummaryScope = {
  year?: number
  month?: number
  week?: string
}

export type SummaryPoint = {
  key: string
  km: number
  count: number
}

export type SummaryStats = {
  count: number
  seconds: number
  distance: number
  speed: number
  maxSpeed: number
  maxDistance: number
  elevation: number
}

const DAY_TIME = /^(\d+)\s+days?,\s*(\d+):(\d{2}):(\d{2})/i
const CLOCK = /^(\d+):(\d{2}):(\d{2})/

export function parseMovingTime(value: string): number {
  const input = value.trim()
  const dayTime = DAY_TIME.exec(input)
  if (dayTime) {
    return (
      Number(dayTime[1]) * 86_400 +
      Number(dayTime[2]) * 3600 +
      Number(dayTime[3]) * 60 +
      Number(dayTime[4])
    )
  }
  const time = CLOCK.exec(input)
  if (!time) return 0
  return Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3])
}

export function isoWeekKey(date: string): string {
  const day = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7))
  const year = day.getUTCFullYear()
  const week = Math.ceil(
    ((day.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7,
  )
  return `${year}-W${String(week).padStart(2, '0')}`
}

export function summarize(activities: Activity[]): SummaryStats {
  const distance = activities.reduce(
    (sum, activity) => sum + activity.distance,
    0,
  )
  const seconds = activities.reduce(
    (sum, activity) => sum + parseMovingTime(activity.moving_time),
    0,
  )
  return {
    count: activities.length,
    seconds,
    distance,
    speed: seconds > 0 ? distance / seconds : 0,
    maxSpeed: activities.reduce((max, activity) => {
      const time = parseMovingTime(activity.moving_time)
      return Math.max(max, time > 0 ? activity.distance / time : 0)
    }, 0),
    maxDistance: activities.reduce(
      (max, activity) => Math.max(max, activity.distance),
      0,
    ),
    elevation: activities.reduce(
      (sum, activity) => sum + activity.elevation_gain,
      0,
    ),
  }
}

export function filterByScope(
  activities: Activity[],
  scope: SummaryScope,
): Activity[] {
  return activities.filter((activity) => {
    const date = activity.start_date_local.slice(0, 10)
    if (scope.week) return isoWeekKey(date) === scope.week
    if (scope.year && Number(date.slice(0, 4)) !== scope.year) return false
    if (scope.month && Number(date.slice(5, 7)) !== scope.month) return false
    return true
  })
}

export function buildSummaryChart(
  activities: Activity[],
  grain: SummaryGrain,
  scope: SummaryScope = {},
): SummaryPoint[] {
  const scoped = filterByScope(activities, scope)
  const keys = chartKeys(grain, scope, scoped)
  const points = new Map<string, SummaryPoint>(
    keys.map((key) => [key, { key, km: 0, count: 0 }]),
  )

  for (const activity of scoped) {
    const key = pointKey(activity.start_date_local.slice(0, 10), grain)
    const point = points.get(key) ?? { key, km: 0, count: 0 }
    point.km += activity.distance / 1000
    point.count += 1
    points.set(key, point)
  }

  const ordered = keys.length
    ? keys.map((key) => points.get(key) ?? { key, km: 0, count: 0 })
    : [...points.values()].sort((a, b) => a.key.localeCompare(b.key))

  return ordered.map((point) => ({
    ...point,
    km: Number(point.km.toFixed(2)),
  }))
}

function pointKey(date: string, grain: SummaryGrain) {
  if (grain === 'year') return date.slice(0, 4)
  if (grain === 'month') return date.slice(0, 7)
  if (grain === 'week') return isoWeekKey(date)
  return date
}

function chartKeys(
  grain: SummaryGrain,
  scope: SummaryScope,
  activities: Activity[],
): string[] {
  if (grain === 'year') return yearsOf(activities).map(String)

  if (grain === 'month') {
    if (scope.year) {
      return Array.from(
        { length: 12 },
        (_, index) => `${scope.year}-${pad(index + 1)}`,
      )
    }
    return monthsInRange(activities)
  }

  if (grain === 'week' && scope.week) return [scope.week]
  if (grain === 'week' && scope.year && scope.month) {
    return weeksInMonth(scope.year, scope.month)
  }
  if (grain === 'week' && scope.year) return weeksInYear(scope.year)
  if (grain === 'week') return yearsOf(activities).flatMap(weeksInYear)

  if (grain === 'day' && scope.week) return daysInWeek(scope.week)
  if (grain === 'day' && scope.year && scope.month) {
    return daysInMonth(scope.year, scope.month)
  }
  return [
    ...new Set(
      activities.map((activity) => activity.start_date_local.slice(0, 10)),
    ),
  ].sort()
}

function yearsOf(activities: Activity[]) {
  return [
    ...new Set(
      activities.map((activity) =>
        Number(activity.start_date_local.slice(0, 4)),
      ),
    ),
  ]
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
}

function monthsInRange(activities: Activity[]) {
  const years = yearsOf(activities)
  const first = years[0]
  const last = years[years.length - 1]
  if (first == null || last == null) return []
  const keys: string[] = []
  for (let year = first; year <= last; year++) {
    for (let month = 1; month <= 12; month++) {
      keys.push(`${year}-${pad(month)}`)
    }
  }
  return keys
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function lastIsoWeek(year: number) {
  return Number(isoWeekKey(`${year}-12-28`).slice(6))
}

function weeksInYear(year: number) {
  return Array.from(
    { length: lastIsoWeek(year) },
    (_, index) => `${year}-W${pad(index + 1)}`,
  )
}

function weeksInMonth(year: number, month: number) {
  const keys = new Set<string>()
  for (const day of daysInMonth(year, month)) keys.add(isoWeekKey(day))
  return [...keys]
}

function daysInMonth(year: number, month: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from(
    { length: last },
    (_, index) => `${year}-${pad(month)}-${pad(index + 1)}`,
  )
}

function isoWeekMonday(year: number, week: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const monday = new Date(jan4)
  const weekday = jan4.getUTCDay() || 7
  monday.setUTCDate(jan4.getUTCDate() - (weekday - 1) + (week - 1) * 7)
  return monday
}

function daysInWeek(weekKey: string) {
  const year = Number(weekKey.slice(0, 4))
  const week = Number(weekKey.slice(6))
  const monday = isoWeekMonday(year, week)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday)
    day.setUTCDate(monday.getUTCDate() + index)
    return day.toISOString().slice(0, 10)
  })
}
