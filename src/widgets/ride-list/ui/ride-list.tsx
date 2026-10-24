'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'
import type { Activity } from '@/entities/activity'
import { formatActivityDate } from '../model/format-activity-date'
import { formatMovingTime } from '../model/format-moving-time'

const PAGE_SIZE = 12

type RideListProps = {
  activities: Activity[]
  locale: string
}

export function RideList({ activities, locale }: RideListProps) {
  const t = useTranslations('rides')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const rows = [...activities].sort((a, b) =>
    b.start_date_local.localeCompare(a.start_date_local),
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

  const goToPage = useCallback((nextPage: number) => {
    setPage(nextPage)
    scrollerRef.current?.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    })
  }, [])

  return (
    <div
      ref={scrollerRef}
      className='h-full scrollbar-gutter-stable overflow-y-auto overscroll-y-contain'
    >
      <div className='mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 pt-14 pb-24 md:px-10 md:pt-16'>
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
          <table className='w-full min-w-170 text-left text-sm'>
            <thead className='text-muted-foreground sticky top-0 z-10 border-b bg-white/85 text-[11px] tracking-[0.08em] uppercase backdrop-blur-md dark:bg-neutral-950/85'>
              <tr>
                <th className='py-3 pr-4 pl-5 font-medium'>{t('date')}</th>
                <th className='px-4 py-3 font-medium'>{t('distance')}</th>
                <th className='px-4 py-3 font-medium'>{t('time')}</th>
                <th className='px-4 py-3 font-medium'>{t('speed')}</th>
                <th className='py-3 pr-5 pl-4 font-medium'>{t('elevation')}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((activity) => (
                <tr
                  key={activity.run_id}
                  className='border-b transition-colors last:border-b-0 hover:bg-black/2.5 dark:hover:bg-white/3.5'
                >
                  <td className='py-4 pr-4 pl-5'>
                    <span className='font-medium'>
                      {formatActivityDate(activity.start_date_local, locale)}
                    </span>
                    <span className='text-muted-foreground mt-1 block text-xs'>
                      {activity.name || activity.subtype || activity.type}
                    </span>
                  </td>
                  <td className='px-4 py-4 font-medium tabular-nums'>
                    {distanceFormat.format(activity.distance / 1000)}
                  </td>
                  <td className='text-muted-foreground px-4 py-4 tabular-nums'>
                    {formatMovingTime(activity.moving_time)}
                  </td>
                  <td className='text-muted-foreground px-4 py-4 tabular-nums'>
                    {speedFormat.format(activity.average_speed * 3.6)}
                  </td>
                  <td className='py-4 pr-5 pl-4 tabular-nums'>
                    {elevationFormat.format(activity.elevation_gain)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
