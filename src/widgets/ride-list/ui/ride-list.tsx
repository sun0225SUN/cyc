'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Activity, activityNameKey } from '@/entities/activity'
import { formatActivityDate } from '../model/format-activity-date'
import { formatMovingTime } from '../model/format-moving-time'

const PAGE_SIZE = 12

type RideListProps = {
  activities: Activity[]
  locale: string
  selectedDate?: string | null
  onSelect?: (activity: Activity) => void
}

export function RideList({
  activities,
  locale,
  selectedDate,
  onSelect,
}: RideListProps) {
  const t = useTranslations('rides')
  const activityNames = useTranslations('activityNames')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const rows = useMemo(
    () =>
      [...activities].sort((a, b) =>
        b.start_date_local.localeCompare(a.start_date_local),
      ),
    [activities],
  )
  const totalPages = Math.ceil(rows.length / PAGE_SIZE)
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const firstRow = rows.length ? page * PAGE_SIZE + 1 : 0
  const lastRow = Math.min((page + 1) * PAGE_SIZE, rows.length)
  const distanceFormat = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  })
  const speedFormat = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  })
  const elevationFormat = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  })
  const formatActivityName = (name: string) => {
    const key = activityNameKey(name)
    return key ? activityNames(key) : name
  }

  useEffect(() => {
    if (!selectedDate) return
    const rowIndex = rows.findIndex((activity) =>
      activity.start_date_local.startsWith(selectedDate),
    )
    if (rowIndex >= 0) setPage(Math.floor(rowIndex / PAGE_SIZE))
    requestAnimationFrame(() => {
      scrollerRef.current?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      })
    })
  }, [rows, selectedDate])

  const goToPage = useCallback((nextPage: number) => {
    setPage(nextPage)
    scrollerRef.current?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    })
  }, [])

  return (
    <div ref={scrollerRef} className='scrollbar-gutter-stable'>
      <div className='mx-auto flex w-full max-w-6xl flex-col px-6 pt-8 pb-24 md:px-10'>
        <header className='shrink-0'>
          <div className='flex flex-wrap items-end justify-between gap-3'>
            <h1 className='text-3xl font-medium tracking-tight'>
              {t('title')}
            </h1>
            <p className='text-muted-foreground pb-1 text-sm tabular-nums'>
              {t('showing', {
                first: firstRow,
                last: lastRow,
                count: rows.length,
              })}
            </p>
          </div>
        </header>

        <div className='mt-8 overflow-x-auto rounded-2xl border bg-white/40 dark:bg-white/2.5'>
          <div className='min-w-200 text-sm'>
            <div className='text-muted-foreground sticky top-0 z-10 grid grid-cols-[1.4fr_1.15fr_0.85fr_0.95fr_0.85fr_0.85fr] border-b bg-white/85 text-[11px] tracking-[0.08em] uppercase backdrop-blur-md dark:bg-neutral-950/85'>
              <span className='py-3 pr-4 pl-5 font-medium'>{t('name')}</span>
              <span className='px-4 py-3 font-medium'>{t('date')}</span>
              <span className='px-4 py-3 font-medium'>{t('distance')}</span>
              <span className='px-4 py-3 font-medium'>{t('time')}</span>
              <span className='px-4 py-3 font-medium'>{t('speed')}</span>
              <span className='py-3 pr-5 pl-4 font-medium'>
                {t('elevation')}
              </span>
            </div>
            {pageRows.map((activity) => (
              <button
                type='button'
                key={activity.run_id}
                onClick={() => onSelect?.(activity)}
                data-active={
                  selectedDate === activity.start_date_local.slice(0, 10)
                }
                className='grid w-full cursor-pointer grid-cols-[1.4fr_1.15fr_0.85fr_0.95fr_0.85fr_0.85fr] border-b text-left transition-colors last:border-b-0 hover:bg-black/2.5 focus-visible:outline-2 focus-visible:-outline-offset-2 data-[active=true]:bg-blue-500/8 data-[active=true]:text-blue-600 dark:hover:bg-white/3.5 dark:data-[active=true]:bg-orange-400/8 dark:data-[active=true]:text-orange-400'
              >
                <span className='py-4 pr-4 pl-5 font-medium'>
                  {formatActivityName(activity.name)}
                </span>
                <span className='px-4 py-4 tabular-nums'>
                  {formatActivityDate(activity.start_date_local, locale)}
                </span>
                <span className='px-4 py-4 font-medium tabular-nums'>
                  {distanceFormat.format(activity.distance / 1000)}
                </span>
                <span className='px-4 py-4 tabular-nums'>
                  {formatMovingTime(activity.moving_time)}
                </span>
                <span className='px-4 py-4 tabular-nums'>
                  {speedFormat.format(activity.average_speed * 3.6)}
                </span>
                <span className='py-4 pr-5 pl-4 tabular-nums'>
                  {elevationFormat.format(activity.elevation_gain)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <nav
          className='mt-5 flex items-center justify-between'
          aria-label={t('pagination')}
        >
          <button
            type='button'
            onClick={() => goToPage(Math.max(0, page - 1))}
            disabled={page === 0}
            aria-label={t('previousPage')}
            className='text-muted-foreground grid size-10 cursor-pointer place-items-center rounded-full border transition-[color,background-color,transform,opacity] hover:bg-black/3 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/5'
          >
            <ArrowLeft size={18} strokeWidth={2} nonScalingStroke />
          </button>
          <span className='text-muted-foreground text-sm tabular-nums'>
            {t('page', {
              page: totalPages ? page + 1 : 0,
              pages: totalPages,
            })}
          </span>
          <button
            type='button'
            onClick={() => goToPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            aria-label={t('nextPage')}
            className='text-muted-foreground grid size-10 cursor-pointer place-items-center rounded-full border transition-[color,background-color,transform,opacity] hover:bg-black/3 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/5'
          >
            <ArrowRight size={18} strokeWidth={2} nonScalingStroke />
          </button>
        </nav>
      </div>
    </div>
  )
}
