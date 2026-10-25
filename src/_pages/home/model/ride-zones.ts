export type ZoneId = 'z1' | 'z2' | 'z3' | 'z4' | 'z5'

export type ZoneRange = {
  id: ZoneId
  min: number
  max: number
}

export type ZoneShare = ZoneRange & {
  seconds: number
  ratio: number
}

export type ZoneHistogramBin = {
  start: number
  seconds: number
  zone: ZoneId | null
}

export const SPEED_ZONES: ZoneRange[] = [
  { id: 'z1', min: 0, max: 18 },
  { id: 'z2', min: 18, max: 25 },
  { id: 'z3', min: 25, max: 30 },
  { id: 'z4', min: 30, max: 35 },
  { id: 'z5', min: 35, max: Number.POSITIVE_INFINITY },
]

export const CADENCE_ZONES: ZoneRange[] = [
  { id: 'z1', min: 0, max: 70 },
  { id: 'z2', min: 70, max: 80 },
  { id: 'z3', min: 80, max: 90 },
  { id: 'z4', min: 90, max: 100 },
  { id: 'z5', min: 100, max: Number.POSITIVE_INFINITY },
]

type ZoneStreams = {
  distance?: Array<number | null | undefined>
  speed?: Array<number | null | undefined>
}

export function analyzeZones(
  values: Array<number | null | undefined>,
  elapsed: Array<number | null | undefined>,
  ranges: ZoneRange[],
  binSize: number,
  streams: ZoneStreams = {},
  movingTime?: number | null,
  positiveValuesOnly = false,
): { zones: ZoneShare[]; histogram: ZoneHistogramBin[] } {
  const seconds = new Map<ZoneId, number>()
  const bins = new Map<number, number>()
  for (const range of ranges) seconds.set(range.id, 0)

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    const start = elapsed[index]
    if (value == null || start == null || (positiveValuesOnly && value <= 0))
      continue
    const elapsedDt = sampleElapsed(elapsed, index)
    const moving = isMoving(value, streams.speed?.[index])
    const duration = moving ? sampleMoving(elapsedDt, streams, index) : 0
    if (!moving) continue
    if (duration <= 0) continue
    const bin = Math.floor(value / binSize) * binSize
    bins.set(bin, (bins.get(bin) ?? 0) + duration)
    const range = ranges.find((item) =>
      item.max === Number.POSITIVE_INFINITY
        ? value >= item.min
        : value >= item.min && value < item.max,
    )
    if (range) seconds.set(range.id, (seconds.get(range.id) ?? 0) + duration)
  }

  const measuredTotal = [...seconds.values()].reduce(
    (sum, value) => sum + value,
    0,
  )
  const total =
    movingTime != null && movingTime > 0 ? movingTime : measuredTotal
  const scale = measuredTotal > 0 ? total / measuredTotal : 1
  const maxBin = bins.size === 0 ? 0 : Math.max(...bins.keys())
  const histogram: ZoneHistogramBin[] = []
  for (let start = 0; start <= maxBin; start += binSize) {
    histogram.push({
      start,
      seconds: (bins.get(start) ?? 0) * scale,
      zone: zoneForValue(start, ranges),
    })
  }

  return {
    zones: ranges.map((range) => ({
      ...range,
      seconds: (seconds.get(range.id) ?? 0) * scale,
      ratio: total > 0 ? ((seconds.get(range.id) ?? 0) * scale) / total : 0,
    })),
    histogram,
  }
}

export function zoneForValue(value: number, ranges: ZoneRange[]) {
  return (
    ranges.find((range) =>
      range.max === Number.POSITIVE_INFINITY
        ? value >= range.min
        : value >= range.min && value < range.max,
    )?.id ?? null
  )
}

export function zoneMarks(ranges: ZoneRange[], max: number) {
  return {
    bounds: ranges
      .slice(1)
      .map((range) => range.min)
      .filter((value) => value <= max),
    labels: ranges.map((range) => {
      const end = Number.isFinite(range.max) ? Math.min(range.max, max) : max
      return { id: range.id, at: (range.min + Math.max(range.min, end)) / 2 }
    }),
  }
}

function isMoving(value: number, speed: number | null | undefined) {
  return speed == null ? value > 0 : speed > 0
}

function sampleElapsed(
  elapsed: Array<number | null | undefined>,
  index: number,
) {
  const start = elapsed[index]
  const next = elapsed[index + 1]
  if (start == null || next == null) return 0
  return Math.max(0, next - start)
}

function sampleMoving(elapsedDt: number, streams: ZoneStreams, index: number) {
  const speed = streams.speed?.[index]
  const from = streams.distance?.[index]
  const to = streams.distance?.[index + 1]
  if (speed != null && speed > 0 && from != null && to != null && to > from) {
    return (to - from) / speed
  }
  return elapsedDt
}
