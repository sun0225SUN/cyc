'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RideDetailData } from '@/entities/activity'
import { ChartContainer } from '@/shared/ui/chart'
import {
  formatClock,
  formatHoursMinutes,
  metersPerSecondToKmh,
} from '../model/format-ride'
import {
  analyzeZones,
  CADENCE_ZONES,
  SPEED_ZONES,
  type ZoneId,
  zoneMarks,
} from '../model/ride-zones'
import './year-tabs.css'
import './ride-detail-charts.css'

type ZoneKind = 'speed' | 'cadence'

type RideZoneAnalysisProps = {
  detail: RideDetailData
}

const ZONE_COLORS: Record<ZoneId, string> = {
  z1: '#60a5fa',
  z2: '#4ade80',
  z3: '#facc15',
  z4: '#fb923c',
  z5: '#fb7185',
}

const BAR_COLORS: Record<ZoneId, string> = {
  z1: '#93c5fd',
  z2: '#60a5fa',
  z3: '#3b82f6',
  z4: '#2563eb',
  z5: '#1d4ed8',
}

export function RideZoneAnalysis({ detail }: RideZoneAnalysisProps) {
  const t = useTranslations('rideDetail')
  const kinds = (
    [
      hasValues(detail.streams.speed) ? 'speed' : null,
      hasValues(detail.streams.cadence) ? 'cadence' : null,
    ] as const
  ).filter((value): value is ZoneKind => value != null)
  const [kind, setKind] = useState<ZoneKind>(kinds[0] ?? 'speed')
  const active = kinds.includes(kind) ? kind : kinds[0]
  const analysis = useMemo(() => {
    if (!active) return null
    const elapsed = detail.streams.elapsed ?? []
    const moving = {
      distance: detail.streams.distance,
      speed: detail.streams.speed,
    }
    if (active === 'speed') {
      return analyzeZones(
        (detail.streams.speed ?? []).map(metersPerSecondToKmh),
        elapsed,
        SPEED_ZONES,
        1,
        moving,
      )
    }
    return analyzeZones(
      detail.streams.cadence ?? [],
      elapsed,
      CADENCE_ZONES,
      5,
      moving,
    )
  }, [active, detail])

  if (
    !active ||
    !analysis ||
    analysis.zones.every((zone) => zone.seconds === 0)
  ) {
    return null
  }

  const unit = active === 'speed' ? 'km/h' : 'rpm'
  const ranges = active === 'speed' ? SPEED_ZONES : CADENCE_ZONES
  const maxX = analysis.histogram.at(-1)?.start ?? 0
  const marks = zoneMarks(ranges, maxX)

  return (
    <section className='mt-8'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <h2 className='text-xl font-medium tracking-tight'>{t('zones')}</h2>
        {kinds.length > 1 && (
          <fieldset className='year-tabs flex gap-2 border-0 p-0'>
            <legend className='sr-only'>{t('zoneKind')}</legend>
            {kinds.map((value) => (
              <button
                key={value}
                type='button'
                aria-pressed={active === value}
                onClick={() => setKind(value)}
                className='year-tab cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-[color,background-color,border-color,transform] active:scale-95'
              >
                {t(value)}
              </button>
            ))}
          </fieldset>
        )}
      </div>

      <div className='mt-4 grid gap-3 lg:grid-cols-2'>
        <div className='flex h-full flex-col rounded-2xl border bg-white/40 p-5 backdrop-blur-xs dark:bg-white/2.5'>
          <p className='text-muted-foreground text-sm'>
            {t('zoneList', { unit, label: t(active) })}
          </p>
          <ol className='mt-5 grid flex-1 grid-cols-[auto_minmax(0,1fr)_auto] content-center items-center gap-x-4 gap-y-4'>
            {analysis.zones.map((zone) => (
              <li
                key={zone.id}
                className='col-span-3 grid grid-cols-subgrid items-center text-sm'
              >
                <p>
                  <span className='font-medium'>{t(zone.id)}</span>
                  <span className='text-muted-foreground ml-2 text-xs tabular-nums'>
                    {formatRange(zone.min, zone.max)}
                  </span>
                </p>
                <div
                  className='h-2.5 min-w-0 overflow-hidden rounded-full bg-black/6 dark:bg-white/10'
                  aria-hidden
                >
                  <div
                    className='h-full rounded-full'
                    style={{
                      width: `${Math.max(zone.ratio * 100, zone.seconds > 0 ? 2 : 0)}%`,
                      background: ZONE_COLORS[zone.id],
                    }}
                  />
                </div>
                <p className='text-right text-xs tabular-nums'>
                  {formatHoursMinutes(zone.seconds)}
                  <span className='text-muted-foreground ml-2'>
                    {(zone.ratio * 100).toFixed(zone.ratio >= 0.1 ? 1 : 2)}%
                  </span>
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className='rounded-2xl border bg-white/40 p-5 backdrop-blur-xs dark:bg-white/2.5'>
          <p className='text-muted-foreground text-sm'>
            {t('zoneDistribution')}
          </p>
          <ChartContainer
            config={{ seconds: { label: t('time'), color: '#60a5fa' } }}
            className='ride-zone-chart mt-4 aspect-auto h-56 w-full'
          >
            <BarChart
              data={analysis.histogram}
              margin={{ top: 18, left: 8, right: 8 }}
            >
              <CartesianGrid vertical={false} syncWithTicks />
              <XAxis
                xAxisId='zone'
                type='number'
                dataKey='start'
                orientation='top'
                domain={[0, maxX]}
                ticks={marks.labels.map((mark) => mark.at)}
                tickFormatter={(value: number) => {
                  const mark = marks.labels.find((item) => item.at === value)
                  return mark ? t(mark.id) : ''
                }}
                tickLine={false}
                axisLine={false}
                tickMargin={4}
              />
              <XAxis
                xAxisId='value'
                type='number'
                dataKey='start'
                domain={[0, maxX]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={16}
                tickFormatter={(value: number) => String(value)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={40}
                tickFormatter={(value: number) => formatHoursMinutes(value)}
              />
              {marks.bounds.map((value) => (
                <ReferenceLine
                  key={value}
                  xAxisId='value'
                  x={value}
                  stroke='var(--border)'
                />
              ))}
              <Tooltip
                cursor={{
                  fill: 'color-mix(in oklab, var(--foreground) 6%, transparent)',
                }}
                content={({ active, payload }) => {
                  const bin = payload?.[0]?.payload as
                    | { start: number; seconds: number }
                    | undefined
                  if (!active || !bin) return null
                  return (
                    <div className='ride-stream-popover'>
                      <p className='text-sm font-medium tabular-nums'>
                        {bin.start} {unit}
                      </p>
                      <p className='text-muted-foreground mt-1 text-xs tabular-nums'>
                        {formatClock(bin.seconds)}
                      </p>
                    </div>
                  )
                }}
              />
              <Bar
                xAxisId='value'
                dataKey='seconds'
                radius={[3, 3, 0, 0]}
                maxBarSize={18}
              >
                {analysis.histogram.map((bin) => (
                  <Cell
                    key={bin.start}
                    fill={bin.zone ? BAR_COLORS[bin.zone] : '#93c5fd'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </div>
    </section>
  )
}

function formatRange(min: number, max: number) {
  if (!Number.isFinite(max)) return `≥${min}`
  return `${min}–${max}`
}

function hasValues(values?: Array<number | null>) {
  return Boolean(values?.some((value) => value != null && value > 0))
}
