import { useTranslations } from 'next-intl'
import type { Activity, RideDetailData } from '@/entities/activity'
import {
  formatClock,
  formatNumber,
  metersPerSecondToKmh,
  percent,
  verticalMetersPerHour,
} from '../model/format-ride'
import { pickHighlights } from '../model/ride-highlights'

type RideHighlightsProps = {
  activity: Activity
  detail: RideDetailData | null
  locale: string
}

type Highlight = {
  key: string
  label: string
  value: string | null
}

export function RideHighlights({
  activity,
  detail,
  locale,
}: RideHighlightsProps) {
  const t = useTranslations('rideDetail')
  const moving = detail?.moving_time ?? parseMoving(activity.moving_time)
  const elapsed = detail?.elapsed_time ?? moving
  const items = pickHighlights([
    {
      key: 'time',
      label: t('time'),
      value: clock(elapsed),
    },
    {
      key: 'moving',
      label: t('movingTime'),
      value:
        elapsed != null && moving != null && Math.round(elapsed) === moving
          ? null
          : clock(moving),
    },
    {
      key: 'distance',
      label: t('distance'),
      value: unit((detail?.distance ?? activity.distance) / 1000, locale, 'km'),
    },
    {
      key: 'averageSpeed',
      label: t('averageSpeed'),
      value: unit(
        metersPerSecondToKmh(detail?.average_speed ?? activity.average_speed),
        locale,
        'km/h',
      ),
    },
    {
      key: 'maxSpeed',
      label: t('maxSpeed'),
      value: unit(metersPerSecondToKmh(detail?.max_speed), locale, 'km/h'),
    },
    {
      key: 'averageHeartRate',
      label: t('averageHeartRate'),
      value: unit(
        detail?.average_heartrate ?? activity.average_heartrate,
        locale,
        'bpm',
        0,
      ),
    },
    {
      key: 'maxHeartRate',
      label: t('maxHeartRate'),
      value: unit(detail?.max_heartrate, locale, 'bpm', 0),
    },
    {
      key: 'averagePower',
      label: t('averagePower'),
      value: unit(detail?.average_power, locale, 'W', 0),
    },
    {
      key: 'maxPower',
      label: t('maxPower'),
      value: unit(detail?.max_power, locale, 'W', 0),
    },
    {
      key: 'ascent',
      label: t('elevation'),
      value: unit(
        detail?.elevation_gain ?? activity.elevation_gain,
        locale,
        'm',
        0,
      ),
    },
    {
      key: 'descent',
      label: t('descent'),
      value: unit(detail?.elevation_loss, locale, 'm', 0),
    },
    {
      key: 'calories',
      label: t('calories'),
      value: unit(detail?.calories, locale, 'kcal', 0),
    },
    {
      key: 'averageCadence',
      label: t('averageCadence'),
      value: unit(detail?.average_cadence, locale, 'rpm', 0),
    },
    {
      key: 'maxCadence',
      label: t('maxCadence'),
      value: unit(detail?.max_cadence, locale, 'rpm', 0),
    },
    {
      key: 'highest',
      label: t('highest'),
      value: unit(detail?.max_altitude, locale, 'm'),
    },
    {
      key: 'lowest',
      label: t('lowest'),
      value: unit(detail?.min_altitude, locale, 'm'),
    },
    {
      key: 'averageAltitude',
      label: t('averageAltitude'),
      value: unit(detail?.average_altitude, locale, 'm', 0),
    },
    {
      key: 'maxTemperature',
      label: t('maxTemperature'),
      value: unit(detail?.max_temperature, locale, '°C', 0),
    },
    {
      key: 'temperature',
      label: t('temperature'),
      value: unit(detail?.average_temperature, locale, '°C', 0),
    },
    {
      key: 'maxPosGrade',
      label: t('maxPosGrade'),
      value: grade(detail?.max_pos_grade, locale),
    },
    {
      key: 'avgPosGrade',
      label: t('avgPosGrade'),
      value: grade(detail?.avg_pos_grade, locale),
    },
    {
      key: 'maxNegGrade',
      label: t('maxNegGrade'),
      value: grade(detail?.max_neg_grade, locale),
    },
    {
      key: 'avgNegGrade',
      label: t('avgNegGrade'),
      value: grade(detail?.avg_neg_grade, locale),
    },
    {
      key: 'maxClimb',
      label: t('maxClimb'),
      value: unit(
        verticalMetersPerHour(detail?.max_pos_vertical_speed),
        locale,
        'm/h',
        0,
      ),
    },
    {
      key: 'avgClimb',
      label: t('avgClimb'),
      value: unit(
        verticalMetersPerHour(detail?.avg_pos_vertical_speed),
        locale,
        'm/h',
        0,
      ),
    },
    {
      key: 'maxDrop',
      label: t('maxDrop'),
      value: unit(
        verticalMetersPerHour(detail?.max_neg_vertical_speed),
        locale,
        'm/h',
        0,
      ),
    },
    {
      key: 'avgDrop',
      label: t('avgDrop'),
      value: unit(
        verticalMetersPerHour(detail?.avg_neg_vertical_speed),
        locale,
        'm/h',
        0,
      ),
    },
  ] satisfies Highlight[])

  if (items.length === 0) return null

  return (
    <section className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
      {items.map((item) => (
        <div
          key={item.key}
          className='rounded-2xl border bg-white/40 px-4 py-4 backdrop-blur-xs dark:bg-white/2.5'
        >
          <p className='text-muted-foreground text-xs tracking-wider uppercase'>
            {item.label}
          </p>
          <p className='mt-2 text-sm font-medium tabular-nums sm:text-base'>
            {item.value}
          </p>
        </div>
      ))}
    </section>
  )
}

function clock(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return null
  return formatClock(seconds)
}

function unit(
  value: number | null | undefined,
  locale: string,
  suffix: string,
  digits = 1,
) {
  if (value == null || !Number.isFinite(value)) return null
  return `${formatNumber(value, locale, { maximumFractionDigits: digits })} ${suffix}`
}

function grade(value: number | null | undefined, locale: string) {
  if (value == null || !Number.isFinite(value)) return null
  return percent(value, locale)
}

function parseMoving(value: string) {
  const parts = value.split(':').map(Number)
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part)))
    return null
  const [hours, minutes, seconds] = parts
  return (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0)
}
