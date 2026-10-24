const EMPTY = '--'

export function formatClock(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return EMPTY
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return `${pad(hours)}:${pad(minutes)}:${pad(rest)}`
}

export function formatHoursMinutes(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return EMPTY
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  return `${pad(hours)}:${pad(minutes)}`
}

export function formatPair(
  average: string,
  maximum: string,
  separator = ' / ',
) {
  return `${average}${separator}${maximum}`
}

export function formatNumber(
  value: number | null | undefined,
  locale: string,
  options?: Intl.NumberFormatOptions,
) {
  if (value == null || !Number.isFinite(value)) return EMPTY
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    ...options,
  }).format(value)
}

export function metersPerSecondToKmh(value: number | null | undefined) {
  return value == null ? null : value * 3.6
}

export function verticalMetersPerHour(value: number | null | undefined) {
  return value == null ? null : value * 3600
}

export function percent(value: number | null | undefined, locale: string) {
  if (value == null || !Number.isFinite(value)) return EMPTY
  return `${formatNumber(value, locale, { maximumFractionDigits: 2 })}%`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}
