'use client'

import { Gauge, MapPin, Mountain, Route, Timer, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { type Activity, activityNameKey } from '@/entities/activity'
import { RideRoutePreview } from './ride-route-preview'
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
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const formatName = (name: string) => {
    const key = activityNameKey(name)
    return key ? activityNames(key) : name || t('untitled')
  }
  const metrics = [
    {
      label: t('distance'),
      value: `${number.format(activity.distance / 1000)} km`,
      icon: Route,
    },
    { label: t('movingTime'), value: activity.moving_time, icon: Timer },
    {
      label: t('averageSpeed'),
      value: `${number.format(activity.average_speed * 3.6)} km/h`,
      icon: Gauge,
    },
    {
      label: t('elevation'),
      value: `${number.format(activity.elevation_gain)} m`,
      icon: Mountain,
    },
  ]

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onBack])

  return (
    <div className='fixed inset-0 z-50 grid place-items-center p-3 sm:p-8'>
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
        aria-labelledby='ride-detail-title'
        className='bg-background/95 relative max-h-full w-full max-w-5xl overflow-y-auto rounded-3xl border shadow-2xl backdrop-blur-xl'
      >
        <RideRoutePreview activity={activity} token={token} />
        <button
          type='button'
          onClick={onBack}
          aria-label={t('back')}
          className='absolute top-5 right-5 z-10 grid size-10 cursor-pointer place-items-center rounded-full bg-white/80 text-neutral-700 shadow-sm backdrop-blur-md transition-colors hover:bg-white dark:bg-black/65 dark:text-white dark:hover:bg-black/85'
          data-umami-event='close-ride'
          data-umami-event-ride={activity.run_id}
          data-umami-event-source='button'
        >
          <X size={20} />
        </button>

        <div className='px-6 py-7 sm:px-10 sm:py-9'>
          <header className='pr-12'>
            <p className='text-muted-foreground text-sm tabular-nums'>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: 'long',
                timeStyle: 'short',
                timeZone: 'UTC',
              }).format(localDate(activity))}
            </p>
            <h1
              id='ride-detail-title'
              className='mt-3 text-4xl font-medium tracking-tight md:text-5xl'
            >
              {formatName(activity.name)}
            </h1>
            <div className='text-muted-foreground mt-4 flex flex-wrap items-center gap-4 text-sm'>
              <span>{activity.subtype || activity.type}</span>
              {activity.location_country && (
                <span className='flex items-center gap-1.5'>
                  <MapPin size={14} />
                  {activity.location_country}
                </span>
              )}
            </div>
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

          <section className='mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            {metrics.map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className='rounded-2xl border bg-white/40 p-5 backdrop-blur-xs dark:bg-white/2.5'
              >
                <Icon className='text-muted-foreground' size={18} />
                <p className='text-muted-foreground mt-8 text-xs tracking-wider uppercase'>
                  {label}
                </p>
                <p className='mt-2 text-xl font-medium tabular-nums'>{value}</p>
              </div>
            ))}
          </section>
        </div>
      </article>
    </div>
  )
}
