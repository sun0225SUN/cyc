'use client'

import { useTranslations } from 'next-intl'
import { type ReactNode, useMemo } from 'react'
import { type Activity, activityNameKey } from '@/entities/activity'
import { clusterTracks } from '../model/cluster-tracks'
import {
  decodeTrack,
  TRACK_THUMB_SIZE,
  trackSvgPoints,
} from '../model/track-path'
import './ride-tracks.css'

type RideTracksProps = {
  activities: Activity[]
  locale: string
  yearTabs?: ReactNode
  onSelect?: (activity: Activity, occurrences: Activity[]) => void
}

type TrackCell = {
  activity: Activity
  occurrences: Activity[]
  points: string
}

export function RideTracks({
  activities,
  locale,
  yearTabs,
  onSelect,
}: RideTracksProps) {
  const t = useTranslations('tracks')
  const activityNames = useTranslations('activityNames')
  const dateFormat = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const distanceFormat = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  })

  const cells = useMemo<TrackCell[]>(() => {
    const withPolyline = activities.filter(
      (activity) => activity.summary_polyline.length > 20,
    )
    return clusterTracks(withPolyline).flatMap(({ index, indexes }) => {
      const activity = withPolyline[index]
      if (!activity) return []
      const occurrences = indexes.flatMap((item) => {
        const ride = withPolyline[item]
        return ride ? [ride] : []
      })
      const points = trackSvgPoints(decodeTrack(activity.summary_polyline))
      return points ? [{ activity, occurrences, points }] : []
    })
  }, [activities])

  const formatName = (name: string) => {
    const key = activityNameKey(name)
    return key ? activityNames(key) : name
  }

  return (
    <div id='ride-tracks' className='ride-tracks'>
      <div className='mx-auto flex w-full max-w-6xl flex-col px-6 pt-8 pb-24 md:px-10'>
        <header className='flex flex-wrap items-end justify-between gap-5'>
          <div>
            <h1 className='text-3xl font-medium tracking-tight'>
              {t('title')}
            </h1>
            <p className='text-muted-foreground mt-2 text-sm tabular-nums'>
              {t('routes', { count: cells.length })}
            </p>
          </div>
          {yearTabs}
        </header>

        {cells.length === 0 ? (
          <p className='text-muted-foreground mt-8 text-sm'>{t('empty')}</p>
        ) : (
          <div className='mt-8 overflow-hidden rounded-2xl border bg-white/40 p-5 backdrop-blur-xs md:p-7 dark:bg-white/2.5'>
            <div className='ride-tracks-grid'>
              {cells.map(({ activity, occurrences, points }) => {
                const date = activity.start_date_local.slice(0, 10)
                const name = formatName(activity.name)
                const distance = distanceFormat.format(activity.distance / 1000)
                return (
                  <div key={activity.run_id} className='relative'>
                    <button
                      type='button'
                      data-umami-event='open-ride'
                      data-umami-event-ride={activity.run_id}
                      data-umami-event-source='tracks'
                      aria-label={t('track', {
                        date: dateFormat.format(new Date(`${date}T00:00:00`)),
                        name,
                        distance,
                      })}
                      onClick={() => onSelect?.(activity, occurrences)}
                      className='ride-tracks-thumb cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2'
                    >
                      <svg
                        width={TRACK_THUMB_SIZE}
                        height={TRACK_THUMB_SIZE}
                        viewBox={`0 0 ${TRACK_THUMB_SIZE} ${TRACK_THUMB_SIZE}`}
                        aria-hidden='true'
                      >
                        <polyline
                          className='ride-tracks-path'
                          points={points}
                          fill='none'
                          strokeLinecap='round'
                          strokeLinejoin='round'
                        />
                      </svg>
                    </button>
                    {occurrences.length > 1 && (
                      <span className='pointer-events-none absolute right-1 bottom-1 rounded bg-white/80 px-1 py-0.5 text-[9px] leading-none font-medium text-neutral-500 tabular-nums dark:bg-black/70 dark:text-neutral-400'>
                        {t('cluster', { count: occurrences.length })}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
