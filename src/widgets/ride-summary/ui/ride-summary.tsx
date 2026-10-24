'use client'

import { useTranslations } from 'next-intl'
import { type ReactNode, useMemo, useState } from 'react'
import type { Activity } from '@/entities/activity'
import {
  buildSummaryChart,
  filterByScope,
  type SummaryGrain,
  summarize,
} from '../model/build-summary'
import { RideSummaryChart } from './ride-summary-chart'
import './ride-summary.css'

type RideSummaryProps = {
  activities: Activity[]
  locale: string
  selectedYear: number | 'all'
  yearTabs?: ReactNode
}

const PERIODS: SummaryGrain[] = ['year', 'month', 'week', 'day']

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

export function RideSummary({
  activities,
  locale,
  selectedYear,
  yearTabs,
}: RideSummaryProps) {
  const t = useTranslations('summary')
  const [period, setPeriod] = useState<SummaryGrain>('month')
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const spanYears = selectedYear === 'all'
  const periods = spanYears
    ? PERIODS
    : PERIODS.filter((value) => value !== 'year')
  const activePeriod = periods.includes(period) ? period : 'month'

  const scoped = useMemo(
    () =>
      filterByScope(
        activities,
        selectedYear === 'all' ? {} : { year: selectedYear },
      ),
    [activities, selectedYear],
  )
  const stats = useMemo(() => summarize(scoped), [scoped])
  const data = useMemo(
    () =>
      buildSummaryChart(
        activities,
        activePeriod,
        selectedYear === 'all' ? {} : { year: selectedYear },
      ),
    [activities, activePeriod, selectedYear],
  )
  const labels = Object.fromEntries(
    data.map((point) => [
      point.key,
      formatPointLabel(point.key, activePeriod, locale, spanYears),
    ]),
  )

  return (
    <div className='ride-summary'>
      <div className='mx-auto flex w-full max-w-6xl flex-col px-6 pt-8 pb-24 md:px-10'>
        <header className='flex flex-wrap items-end justify-between gap-5'>
          <div>
            <h1 className='text-3xl font-medium tracking-tight'>
              {t('title')}
            </h1>
            <p className='text-muted-foreground mt-2 text-sm tabular-nums'>
              {t('subtitle', {
                count: stats.count,
                distance: number.format(stats.distance / 1000),
              })}
            </p>
          </div>
          {yearTabs}
        </header>

        <section className='mt-8 overflow-hidden rounded-2xl border bg-white/40 p-5 backdrop-blur-xs md:p-7 dark:bg-white/2.5'>
          <fieldset className='ride-summary-periods flex flex-wrap items-center border-0 p-0'>
            <legend className='sr-only'>{t('period')}</legend>
            {PERIODS.map((value) => {
              const hidden = value === 'year' && !spanYears
              return (
                <div
                  key={value}
                  data-collapsed={hidden}
                  className='ride-summary-period'
                >
                  <div>
                    <button
                      type='button'
                      disabled={hidden}
                      aria-hidden={hidden}
                      tabIndex={hidden ? -1 : 0}
                      aria-pressed={activePeriod === value}
                      onClick={() => setPeriod(value)}
                      className='ride-summary-tab cursor-pointer rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,transform,opacity] active:scale-95'
                    >
                      {t(value)}
                    </button>
                  </div>
                </div>
              )
            })}
          </fieldset>
          <dl className='mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4'>
            <Stat label={t('rides')} value={String(stats.count)} />
            <Stat
              label={t('distance')}
              value={`${number.format(stats.distance / 1000)} km`}
            />
            <Stat
              label={t('movingTime')}
              value={formatDuration(stats.seconds)}
            />
            <Stat
              label={t('averageSpeed')}
              value={
                stats.speed > 0
                  ? `${number.format(stats.speed * 3.6)} km/h`
                  : '—'
              }
            />
            <Stat
              label={t('maxSpeed')}
              value={
                stats.maxSpeed > 0
                  ? `${number.format(stats.maxSpeed * 3.6)} km/h`
                  : '—'
              }
            />
            <Stat
              label={t('longest')}
              value={`${number.format(stats.maxDistance / 1000)} km`}
            />
            <Stat
              label={t('averageDistance')}
              value={
                stats.count > 0
                  ? `${number.format(stats.distance / stats.count / 1000)} km`
                  : '—'
              }
            />
            <Stat
              label={t('elevation')}
              value={`${number.format(stats.elevation)} m`}
            />
          </dl>
          <div className='mt-8'>
            <RideSummaryChart data={data} labels={labels} />
          </div>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className='text-muted-foreground text-sm'>{label}</dt>
      <dd className='mt-1 text-xl font-medium tracking-tight tabular-nums'>
        {value}
      </dd>
    </div>
  )
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h${minutes}m`
}

function formatPointLabel(
  key: string,
  grain: SummaryGrain,
  locale: string,
  spanYears: boolean,
) {
  const zh = locale.toLowerCase().startsWith('zh')
  if (grain === 'year') return key
  if (grain === 'month') {
    const year = key.slice(0, 4)
    const month = Number(key.slice(5, 7))
    const name = zh ? `${month}月` : ENGLISH_MONTHS[month - 1]
    return spanYears ? (zh ? `${year}年${name}` : `${name} ${year}`) : name
  }
  if (grain === 'week') return spanYears ? key.replace('-', ' ') : key.slice(5)
  const year = key.slice(0, 4)
  const day = Number(key.slice(8, 10))
  const month = Number(key.slice(5, 7))
  if (zh)
    return spanYears ? `${year}年${month}月${day}日` : `${month}月${day}日`
  const name = `${ENGLISH_MONTHS[month - 1]} ${day}`
  return spanYears ? `${name}, ${year}` : name
}
