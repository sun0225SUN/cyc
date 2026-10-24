const DAY_TIME_PATTERN = /^(\d+)\s+days?,\s*(\d+):(\d{2}):(\d{2})(?:\.\d+)?$/i
const TIME_PATTERN = /^(\d+):(\d{2}):(\d{2})(?:\.\d+)?$/

export function formatMovingTime(value: string): string {
  const input = value.trim()
  const dayTime = DAY_TIME_PATTERN.exec(input)
  if (dayTime) {
    const [, days, hours, minutes, seconds] = dayTime
    return `${Number(days) * 24 + Number(hours)}:${minutes}:${seconds}`
  }

  const time = TIME_PATTERN.exec(input)
  if (time) {
    const [, hours, minutes, seconds] = time
    return `${Number(hours)}:${minutes}:${seconds}`
  }

  return input
}
