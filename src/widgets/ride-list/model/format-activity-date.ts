const LOCAL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/

const ENGLISH_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export function formatActivityDate(value: string, locale: string): string {
  const match = LOCAL_DATE_TIME.exec(value.trim())
  if (!match) return value

  const [, year, month, day] = match
  if (locale.toLowerCase().startsWith('zh')) {
    return `${year}年${Number(month)}月${Number(day)}日`
  }

  return `${ENGLISH_MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`
}
