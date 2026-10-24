'use client'

import { cn } from 'cn'
import { EyeOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type RideMapStyleId,
  rideMapStyleIds,
  rideMapStylePreview,
} from '@/shared/config/mapbox'

const STYLE_LABEL = {
  privacy: 'stylePrivacy',
  standard: 'styleStandard',
  standardSatellite: 'styleStandardSatellite',
  streets: 'styleStreets',
  outdoors: 'styleOutdoors',
  light: 'styleLight',
  dark: 'styleDark',
  satellite: 'styleSatellite',
  navigationDay: 'styleNavigationDay',
  navigationNight: 'styleNavigationNight',
} as const

type MapStylePickerProps = {
  token: string
  center: [number, number]
  styleId: RideMapStyleId
  onStyleId: (id: RideMapStyleId) => void
  event?: string
  titleId?: string
  hidePrivacy?: boolean
}

export function MapStylePicker({
  token,
  center,
  styleId,
  onStyleId,
  event = 'ride-map-style',
  titleId,
  hidePrivacy = false,
}: MapStylePickerProps) {
  const t = useTranslations('map')
  const styles = hidePrivacy
    ? rideMapStyleIds.filter((id) => id !== 'privacy')
    : rideMapStyleIds

  return (
    <div>
      <h3 id={titleId} className='text-2xl font-medium tracking-tight'>
        {t('mapStyle')}
      </h3>
      <div
        className={
          hidePrivacy
            ? 'mt-5 grid grid-cols-9 gap-x-1 sm:gap-x-2'
            : 'mt-5 grid grid-cols-10 gap-x-1 sm:gap-x-2'
        }
      >
        {styles.map((id) => {
          const selected = styleId === id
          const preview = rideMapStylePreview(id, token, center)
          return (
            <button
              key={id}
              type='button'
              aria-pressed={selected}
              onClick={() => onStyleId(id)}
              data-umami-event={event}
              data-umami-event-style={id}
              className='flex min-w-0 cursor-pointer flex-col items-center gap-1.5'
            >
              <span
                className={cn(
                  'bg-muted grid size-9 shrink-0 place-items-center rounded-md bg-cover bg-center',
                  selected &&
                    'ring-foreground ring-offset-background ring-2 ring-offset-1',
                )}
                style={
                  preview ? { backgroundImage: `url("${preview}")` } : undefined
                }
              >
                {id === 'privacy' ? (
                  <EyeOff
                    size={16}
                    strokeWidth={2}
                    className='text-muted-foreground'
                  />
                ) : null}
              </span>
              <span className='text-muted-foreground text-center text-[10px] leading-tight'>
                {t(STYLE_LABEL[id])}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
