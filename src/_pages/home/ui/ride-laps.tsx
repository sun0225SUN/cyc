'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import type { RideDetailData, RideLap } from '@/entities/activity'
import {
  formatClock,
  formatNumber,
  metersPerSecondToKmh,
  percent,
  verticalMetersPerHour,
} from '../model/format-ride'
import { type LapColumnKey, visibleLapColumns } from '../model/ride-laps'

type RideLapsProps = {
  detail: RideDetailData
  locale: string
  selectedLap?: number | null
  onSelectLap?: (index: number | null) => void
}

export function RideLaps({
  detail,
  locale,
  selectedLap = null,
  onSelectLap,
}: RideLapsProps) {
  const t = useTranslations('rideDetail')
  const columns = visibleLapColumns(detail.laps)

  useEffect(() => {
    if (selectedLap == null) return
    document
      .getElementById(`ride-lap-${selectedLap}`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedLap])

  if (detail.laps.length === 0) return null

  return (
    <section className='mt-8'>
      <h2 className='text-xl font-medium tracking-tight'>{t('laps')}</h2>
      <div className='mt-4 overflow-x-auto rounded-2xl border bg-white/40 backdrop-blur-xs dark:bg-white/2.5'>
        <table className='w-full border-collapse text-sm'>
          <caption className='sr-only'>{t('laps')}</caption>
          <thead>
            <tr className='text-muted-foreground'>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className='px-4 py-4 text-left font-medium whitespace-nowrap first:pl-5 last:pr-5'
                >
                  {t(column.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detail.laps.map((lap) => {
              const selected = lap.index === selectedLap
              return (
                <tr
                  key={lap.index}
                  id={`ride-lap-${lap.index}`}
                  aria-selected={selected}
                  className={`border-t transition-colors ${
                    onSelectLap ? 'cursor-pointer' : ''
                  } ${
                    selected
                      ? 'bg-[color-mix(in_oklab,var(--color-ride)_16%,transparent)] shadow-[inset_3px_0_0_var(--color-ride)]'
                      : 'hover:bg-black/4 dark:hover:bg-white/5'
                  }`}
                  data-umami-event='ride-select-lap'
                  data-umami-event-lap={lap.index}
                  tabIndex={onSelectLap ? 0 : undefined}
                  onClick={() => onSelectLap?.(selected ? null : lap.index)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    onSelectLap?.(selected ? null : lap.index)
                  }}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className='px-4 py-3 whitespace-nowrap tabular-nums first:pl-5 first:font-medium last:pr-5'
                    >
                      {formatLapValue(column.key, lap, locale)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function formatLapValue(key: LapColumnKey, lap: RideLap, locale: string) {
  if (key === 'index') return String(lap.index)
  if (key === 'timer_time' || key === 'elapsed_time' || key === 'moving_time') {
    return formatClock(lap[key])
  }
  if (key === 'distance') {
    return lap.distance == null
      ? '--'
      : `${formatNumber(lap.distance / 1000, locale)} km`
  }
  if (key === 'average_speed' || key === 'max_speed') {
    return withUnit(metersPerSecondToKmh(lap[key]), locale, 'km/h')
  }
  if (key === 'average_heartrate' || key === 'max_heartrate') {
    return withUnit(lap[key], locale, 'bpm', 0)
  }
  if (key === 'average_cadence' || key === 'max_cadence') {
    return withUnit(lap[key], locale, 'rpm', 0)
  }
  if (key === 'average_power' || key === 'max_power') {
    return withUnit(lap[key], locale, 'W', 0)
  }
  if (key === 'calories') return withUnit(lap.calories, locale, 'kcal', 0)
  if (
    key === 'average_altitude' ||
    key === 'max_altitude' ||
    key === 'min_altitude' ||
    key === 'elevation_gain' ||
    key === 'elevation_loss'
  ) {
    return withUnit(lap[key], locale, 'm', key.includes('altitude') ? 1 : 0)
  }
  if (key === 'average_temperature' || key === 'max_temperature') {
    return withUnit(lap[key], locale, '°C', 0)
  }
  if (
    key === 'avg_pos_grade' ||
    key === 'max_pos_grade' ||
    key === 'avg_neg_grade' ||
    key === 'max_neg_grade'
  ) {
    return percent(lap[key], locale)
  }
  return withUnit(verticalMetersPerHour(lap[key]), locale, 'm/h', 0)
}

function withUnit(
  value: number | null | undefined,
  locale: string,
  suffix: string,
  digits = 1,
) {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${formatNumber(value, locale, { maximumFractionDigits: digits })} ${suffix}`
}
