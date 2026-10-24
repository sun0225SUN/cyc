export const HIGHLIGHT_LIMIT = 8

export const HIGHLIGHT_RANK: Record<string, number> = {
  time: 0,
  distance: 1,
  averageSpeed: 2,
  moving: 3,
  averageHeartRate: 4,
  averagePower: 5,
  ascent: 6,
  calories: 7,
  averageCadence: 8,
  maxSpeed: 9,
  maxHeartRate: 10,
  maxPower: 11,
  maxCadence: 12,
  descent: 13,
  highest: 14,
  lowest: 15,
  averageAltitude: 16,
  maxTemperature: 17,
  temperature: 18,
  maxPosGrade: 19,
  avgPosGrade: 20,
  maxNegGrade: 21,
  avgNegGrade: 22,
  maxClimb: 23,
  avgClimb: 24,
  maxDrop: 25,
  avgDrop: 26,
}

export function pickHighlights<T extends { key: string; value: string | null }>(
  items: T[],
  limit = HIGHLIGHT_LIMIT,
) {
  return items
    .filter((item) => item.value != null)
    .sort((left, right) => rankOf(left.key) - rankOf(right.key))
    .slice(0, limit)
}

function rankOf(key: string) {
  return HIGHLIGHT_RANK[key] ?? Number.MAX_SAFE_INTEGER
}
