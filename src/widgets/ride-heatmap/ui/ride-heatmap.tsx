'use client'

import { useTranslations } from 'next-intl'
import { type ReactNode, useMemo } from 'react'
import type { Activity } from '@/entities/activity'
import {
  activityYears,
  buildYearHeatmap,
  type YearHeatmap,
} from '../model/build-heatmap'
import './ride-heatmap.css'

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export type HeatmapYear = number | 'all'

type RideHeatmapProps = {
  activities: Activity[]
  selectedYear: HeatmapYear
  selectedDate: string | null
  yearTabs?: ReactNode
  onDateChange: (date: string | null) => void
}

function YearGrid({
  data,
  showYear,
  selectedDate,
  onDateChange,
}: {
  data: YearHeatmap
  showYear: boolean
  selectedDate: string | null
  onDateChange: (date: string | null) => void
}) {
  const t = useTranslations('heatmap')
  const monthStarts = useMemo(() => {
    const starts = new Map<number, number>()
    data.weeks.forEach((week, index) => {
      for (const day of week) {
        if (day.inYear && day.date.endsWith('-01')) {
          starts.set(index, Number(day.date.slice(5, 7)) - 1)
        }
      }
    })
    return starts
  }, [data.weeks])

  return (
    <div className='overflow-x-auto pb-2'>
      <div className='min-w-205'>
        {showYear && (
          <p className='mb-3 text-sm font-medium tabular-nums'>{data.year}</p>
        )}
        <div className='text-muted-foreground mb-2 ml-8 grid grid-cols-53 gap-1 text-[10px]'>
          {data.weeks.map((week, weekIndex) => (
            <span key={week[0]?.date} className='whitespace-nowrap'>
              {monthStarts.has(weekIndex)
                ? t(MONTHS[monthStarts.get(weekIndex) ?? 0])
                : ''}
            </span>
          ))}
        </div>
        <div className='flex gap-2'>
          <div className='text-muted-foreground grid w-6 shrink-0 grid-rows-7 gap-1 text-[10px]'>
            {WEEKDAYS.map((day, index) => (
              <span key={day} className='flex h-3 items-center'>
                {index % 2 === 1 ? t(day) : ''}
              </span>
            ))}
          </div>
          <div className='grid flex-1 grid-cols-53 gap-1'>
            {data.weeks.map((week) => (
              <div key={week[0]?.date} className='grid grid-rows-7 gap-1'>
                {week.map((day) => {
                  const detail = t('dayDetail', {
                    date: day.date,
                    count: day.count,
                    distance: (day.distance / 1000).toFixed(1),
                  })
                  return (
                    <button
                      type='button'
                      key={day.date}
                      disabled={!day.inYear || day.count === 0}
                      data-level={day.inYear ? day.intensity : 0}
                      data-active={selectedDate === day.date}
                      aria-label={day.inYear ? detail : undefined}
                      aria-pressed={selectedDate === day.date}
                      onClick={() =>
                        onDateChange(
                          selectedDate === day.date ? null : day.date,
                        )
                      }
                      className={`ride-heatmap-cell relative size-3 rounded-[3px] transition-[transform,outline] duration-150 focus-visible:z-20 focus-visible:outline-2 enabled:cursor-pointer enabled:hover:z-20 enabled:hover:scale-135 ${day.inYear ? '' : 'pointer-events-none opacity-0'}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function RideHeatmap({
  activities,
  selectedYear,
  selectedDate,
  yearTabs,
  onDateChange,
}: RideHeatmapProps) {
  const t = useTranslations('heatmap')
  const years = useMemo(() => activityYears(activities), [activities])
  const visibleYears = selectedYear === 'all' ? years : [selectedYear]
  const data = useMemo(
    () => visibleYears.map((year) => buildYearHeatmap(activities, year)),
    [activities, visibleYears],
  )
  const summaryActivities =
    selectedYear === 'all'
      ? activities
      : activities.filter((activity) =>
          activity.start_date_local.startsWith(String(selectedYear)),
        )
  const totalDistance = summaryActivities.reduce(
    (sum, activity) => sum + activity.distance,
    0,
  )

  return (
    <div className='ride-heatmap'>
      <div className='mx-auto w-full max-w-6xl px-6 pt-16 pb-6 md:px-10'>
        <header className='flex flex-wrap items-end justify-between gap-5'>
          <div>
            <h1 className='text-3xl font-medium tracking-tight'>
              {t('title')}
            </h1>
            <p className='text-muted-foreground mt-2 text-sm'>
              {t('summary', {
                count: summaryActivities.length,
                distance: (totalDistance / 1000).toFixed(1),
              })}
            </p>
          </div>
          {yearTabs}
        </header>

        <div className='mt-8 space-y-8 overflow-hidden rounded-2xl border bg-white/40 p-5 backdrop-blur-xs md:p-7 dark:bg-white/2.5'>
          {data.map((yearData) => (
            <YearGrid
              key={yearData.year}
              data={yearData}
              showYear={selectedYear === 'all'}
              selectedDate={selectedDate}
              onDateChange={onDateChange}
            />
          ))}
          <div className='text-muted-foreground flex items-center justify-end gap-2 text-xs'>
            <span>{t('less')}</span>
            {[0, 1, 2, 3, 4, 5].map((level) => (
              <span
                key={level}
                data-level={level}
                className='ride-heatmap-cell size-3 rounded-[3px]'
              />
            ))}
            <span>{t('more')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
