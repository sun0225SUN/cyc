'use client'

import { MapPin, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import {
  type Activity,
  activityNameKey,
  type RideDetailData,
} from '@/entities/activity'
import { loadRideDetail } from '@/entities/activity/api/load-ride-detail'
import { RideHighlights } from './ride-highlights'
import { RideLaps } from './ride-laps'
import { RideRoutePreview } from './ride-route-preview'
import { RideStreamChart } from './ride-stream-chart'
import { RideZoneAnalysis } from './ride-zone-analysis'
import './year-tabs.css'

type RideDetailProps = {
  activity: Activity
  occurrences?: Activity[]
  locale: string
  token: string
  onSelectOccurrence?: (activity: Activity) => void
  onBack: () => void
}

function localDate(activity: Activity) {
  return new Date(`${activity.start_date_local.replace(' ', 'T')}Z`)
}

function useDesktop() {
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const sync = () => setDesktop(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  return desktop
}

const detailCache = new Map<number, RideDetailData | null>()

async function loadCachedRideDetail(id: number) {
  if (detailCache.has(id)) return detailCache.get(id) ?? null
  const next = await loadRideDetail(id)
  detailCache.set(id, next)
  return next
}

export function RideDetail({
  activity,
  occurrences = [activity],
  locale,
  token,
  onSelectOccurrence,
  onBack,
}: RideDetailProps) {
  const t = useTranslations('rideDetail')
  const activityNames = useTranslations('activityNames')
  const desktop = useDesktop()
  const [detail, setDetail] = useState<RideDetailData | null>(null)
  const [ready, setReady] = useState(false)
  const [selectedLap, setSelectedLap] = useState<number | null>(null)
  const formatName = (name: string) => {
    const key = activityNameKey(name)
    return key ? activityNames(key) : name || t('untitled')
  }

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const doc = document as Document & { webkitFullscreenElement?: Element }
      if (doc.fullscreenElement || doc.webkitFullscreenElement) return
      onBack()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onBack])

  useEffect(() => {
    let cancelled = false
    setSelectedLap(null)
    const cached = detailCache.get(activity.run_id)
    if (cached !== undefined) {
      setDetail(cached)
      setReady(true)
      return
    }
    setReady(false)
    setDetail(null)
    void loadCachedRideDetail(activity.run_id)
      .then((next) => {
        if (cancelled) return
        setDetail(next)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!cancelled) setReady(true)
          })
        })
      })
      .catch(() => {
        if (cancelled) return
        setDetail(null)
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [activity.run_id])

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-8'>
      <button
        type='button'
        onClick={onBack}
        aria-label={t('back')}
        className='absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm'
        data-umami-event='close-ride'
        data-umami-event-ride={activity.run_id}
        data-umami-event-source='backdrop'
      />
      <article
        role='dialog'
        aria-modal='true'
        aria-labelledby={ready ? 'ride-detail-title' : undefined}
        aria-label={ready ? undefined : t('loading')}
        className='bg-background/95 relative flex h-full max-h-[min(92dvh,58rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border shadow-2xl backdrop-blur-xl lg:max-w-368 lg:flex-row'
        aria-busy={!ready}
      >
        <button
          type='button'
          onClick={onBack}
          aria-label={t('back')}
          className='absolute top-5 right-5 z-20 grid size-10 cursor-pointer place-items-center rounded-full bg-white/80 text-neutral-700 shadow-sm backdrop-blur-md transition-colors hover:bg-white dark:bg-black/65 dark:text-white dark:hover:bg-black/85'
          data-umami-event='close-ride'
          data-umami-event-ride={activity.run_id}
          data-umami-event-source='button'
        >
          <X size={20} />
        </button>
        {!ready ? (
          <div
            className='grid min-h-0 flex-1 place-items-center'
            role='status'
            aria-label={t('loading')}
          >
            <span className='border-foreground/15 size-10 animate-spin rounded-full border-2 border-t-ride' />
          </div>
        ) : (
          <>
            <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
              <header className='bg-background relative z-10 shrink-0 px-6 pt-7 pr-12 pb-6 sm:px-10 sm:pt-9 sm:pb-8 lg:pr-10'>
                <p className='text-muted-foreground text-sm tabular-nums'>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'long',
                    timeStyle: 'short',
                    timeZone: 'UTC',
                  }).format(localDate(activity))}
                </p>
                <h1
                  id='ride-detail-title'
                  className='mt-3 text-4xl leading-tight font-medium tracking-tight md:text-5xl'
                >
                  {formatName(activity.name)}
                </h1>
                {activity.location_country && (
                  <div className='text-muted-foreground mt-4 flex flex-wrap items-center gap-4 text-sm'>
                    <span className='flex items-center gap-1.5'>
                      <MapPin size={14} />
                      {activity.location_country}
                    </span>
                  </div>
                )}
                {occurrences.length > 1 && (
                  <fieldset className='year-tabs mt-5 flex flex-wrap gap-2 border-0 p-0'>
                    <legend className='sr-only'>{t('eachTime')}</legend>
                    {occurrences.map((ride) => (
                      <button
                        type='button'
                        key={ride.run_id}
                        onClick={() => onSelectOccurrence?.(ride)}
                        aria-pressed={ride.run_id === activity.run_id}
                        data-umami-event='ride-occurrence'
                        data-umami-event-ride={ride.run_id}
                        className='year-tab cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition-[color,background-color,border-color,transform] active:scale-95'
                      >
                        {formatName(ride.name)}
                      </button>
                    ))}
                  </fieldset>
                )}
              </header>
              <div className='min-h-0 min-w-0 flex-1 scrollbar-none overflow-x-hidden overflow-y-auto overscroll-y-contain px-6 pt-2 pb-7 sm:px-10 sm:pt-3 sm:pb-9 [&::-webkit-scrollbar]:hidden'>
                <RideHighlights
                  activity={activity}
                  detail={detail}
                  locale={locale}
                />
                {detail && (
                  <RideStreamChart
                    detail={detail}
                    locale={locale}
                    selectedLap={selectedLap}
                  />
                )}
                {detail && (
                  <RideLaps
                    detail={detail}
                    locale={locale}
                    selectedLap={selectedLap}
                    onSelectLap={setSelectedLap}
                  />
                )}
                {detail && <RideZoneAnalysis detail={detail} />}
              </div>
            </div>
            <div className='relative hidden h-full w-[42%] shrink-0 lg:block'>
              {desktop ? (
                <RideRoutePreview
                  activity={activity}
                  laps={detail?.laps ?? []}
                  selectedLap={selectedLap}
                  token={token}
                  onSelectLap={setSelectedLap}
                />
              ) : null}
            </div>
          </>
        )}
      </article>
    </div>
  )
}
