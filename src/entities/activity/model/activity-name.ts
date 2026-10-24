export const activityNameKeys = [
  'lateNight',
  'earlyMorning',
  'morning',
  'noon',
  'afternoon',
  'evening',
  'night',
] as const

export type ActivityNameKey = (typeof activityNameKeys)[number]

export function activityNameKey(name: string): ActivityNameKey | null {
  return activityNameKeys.includes(name as ActivityNameKey)
    ? (name as ActivityNameKey)
    : null
}
