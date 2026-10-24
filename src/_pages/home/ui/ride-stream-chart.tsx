'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { RideDetailData } from '@/entities/activity'
import { ChartContainer } from '@/shared/ui/chart'
import {
  baseChartWindow,
  type ChartWindow,
  fullWindow,
  originAt,
  panWindow,
  sameWindow,
  windowedPoints,
  zoomWindow,
} from '../model/chart-window'
import {
  formatClock,
  formatNumber,
  metersPerSecondToKmh,
} from '../model/format-ride'
import { RideChartScrubber } from './ride-chart-scrubber'
import './year-tabs.css'
import './ride-detail-charts.css'

type SeriesKey = 'speed' | 'heart_rate' | 'cadence' | 'altitude' | 'power'
type AxisKey = 'time' | 'distance'

type RideStreamChartProps = {
  detail: RideDetailData
  locale: string
  selectedLap?: number | null
}

const SERIES: Array<{ key: SeriesKey; color: string }> = [
  { key: 'speed', color: '#3b82f6' },
  { key: 'heart_rate', color: '#ef4444' },
  { key: 'cadence', color: '#eab308' },
  { key: 'altitude', color: '#22c55e' },
  { key: 'power', color: '#a855f7' },
]

export function RideStreamChart({
  detail,
  locale,
  selectedLap = null,
}: RideStreamChartProps) {
  const t = useTranslations('rideDetail')
  const available = SERIES.filter(({ key }) =>
    hasValues(valuesFor(detail, key)),
  )
  const [visible, setVisible] = useState<SeriesKey[]>(
    available.map((item) => item.key),
  )
  const [axis, setAxis] = useState<AxisKey>('time')
  const [view, setView] = useState<ChartWindow | null>(null)
  const [hover, setHover] = useState<{
    point: StreamPoint
    left: number
  } | null>(null)
  const points = useMemo(() => streamPoints(detail, axis), [axis, detail])
  const bounds = useMemo(
    () => fullWindow(points.map((point) => point.x)),
    [points],
  )
  const shown = available.filter((item) => visible.includes(item.key))
  const visiblePoints = useMemo(
    () => windowedPoints(points, view ?? bounds),
    [bounds, points, view],
  )
  const zoomRef = useChartZoom(view, bounds, setView)
  const base = useMemo(
    () =>
      bounds ? baseChartWindow(bounds, detail.laps, selectedLap, axis) : null,
    [axis, bounds, detail.laps, selectedLap],
  )

  useEffect(() => {
    setView(base)
  }, [base])

  if (available.length === 0 || points.length === 0) return null

  return (
    <section id='ride-track-analysis' className='mt-8 min-w-0'>
      <h2 className='text-xl font-medium tracking-tight'>
        {t('trackAnalysis')}
      </h2>
      <div className='mt-4 min-w-0 rounded-2xl border bg-white/40 p-5 backdrop-blur-xs md:p-7 dark:bg-white/2.5'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <fieldset className='year-tabs flex flex-wrap gap-2 border-0 p-0'>
            <legend className='sr-only'>{t('series')}</legend>
            {available.map((item) => (
              <button
                key={item.key}
                type='button'
                aria-pressed={visible.includes(item.key)}
                onClick={() =>
                  setVisible((current) => toggleSeries(current, item.key))
                }
                className='year-tab cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-[color,background-color,border-color,transform] active:scale-95'
              >
                {t(item.key)}
              </button>
            ))}
          </fieldset>
          <fieldset className='year-tabs flex gap-2 border-0 p-0'>
            <legend className='sr-only'>{t('axis')}</legend>
            {(['time', 'distance'] as const).map((value) => (
              <button
                key={value}
                type='button'
                aria-pressed={axis === value}
                onClick={() => setAxis(value)}
                className='year-tab cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-[color,background-color,border-color,transform] active:scale-95'
              >
                {t(value)}
              </button>
            ))}
          </fieldset>
        </div>

        <div
          ref={zoomRef}
          className='ride-stream-zoom relative mt-6 flex flex-col gap-5'
          onPointerMove={(event) => {
            if (event.buttons || !view) {
              setHover(null)
              return
            }
            const rect = event.currentTarget.getBoundingClientRect()
            const x = originAt(rect.left, rect.width, event.clientX, view)
            const point = nearestPoint(visiblePoints, x)
            setHover(point ? { point, left: event.clientX - rect.left } : null)
          }}
          onPointerLeave={() => setHover(null)}
        >
          {shown.map((item) => {
            const stats = seriesStats(visiblePoints, item.key)
            return (
              <div key={item.key}>
                <div className='mb-2 flex flex-wrap items-baseline justify-between gap-3'>
                  <p className='text-sm font-medium'>{t(item.key)}</p>
                  <p className='text-muted-foreground text-xs tabular-nums'>
                    {t('average')} {formatStat(item.key, stats.average, locale)}
                    <span className='mx-2'>·</span>
                    {t('maximum')} {formatStat(item.key, stats.maximum, locale)}
                  </p>
                </div>
                <ChartContainer
                  config={{
                    [item.key]: { label: t(item.key), color: item.color },
                  }}
                  className='ride-stream-chart aspect-auto h-24 w-full'
                >
                  <LineChart
                    data={visiblePoints}
                    syncId='ride-stream'
                    margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} syncWithTicks />
                    <XAxis
                      dataKey='x'
                      type='number'
                      domain={
                        view ? [view.start, view.end] : ['dataMin', 'dataMax']
                      }
                      allowDataOverflow
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={28}
                      tickFormatter={(value: number) =>
                        axis === 'time'
                          ? formatClock(value)
                          : `${formatNumber(value / 1000, locale)}`
                      }
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      width={40}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      cursor={{
                        stroke: 'var(--color-ride)',
                        strokeDasharray: '4 4',
                      }}
                      content={() => null}
                      wrapperStyle={{ display: 'none' }}
                    />
                    <Line
                      type='monotone'
                      dataKey={item.key}
                      stroke={item.color}
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ChartContainer>
              </div>
            )
          })}
          {hover && (
            <div
              className='ride-stream-popover pointer-events-none absolute z-20 -translate-x-1/2'
              style={{
                left: `clamp(6.5rem, ${hover.left}px, calc(100% - 6.5rem))`,
                top: '22%',
              }}
            >
              <p className='text-sm font-medium tabular-nums'>
                {axis === 'time'
                  ? formatClock(hover.point.x)
                  : `${formatNumber(hover.point.x / 1000, locale)} km`}
              </p>
              <ul className='mt-2 grid gap-1.5'>
                {shown.map((item) => {
                  const value = hover.point[item.key]
                  if (value == null) return null
                  return (
                    <li
                      key={item.key}
                      className='flex items-center gap-2 text-xs tabular-nums'
                    >
                      <span
                        className='size-1.5 rounded-full'
                        style={{ background: item.color }}
                      />
                      <span className='text-muted-foreground'>
                        {t(item.key)}
                      </span>
                      <span>{formatStat(item.key, value, locale)}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
        {view && bounds && base && (
          <RideChartScrubber
            view={view}
            bounds={bounds}
            label={
              axis === 'time'
                ? `${formatClock(view.start)} – ${formatClock(view.end)}`
                : `${formatNumber(view.start / 1000, locale)} – ${formatNumber(view.end / 1000, locale)} km`
            }
            canReset={!sameWindow(view, base)}
            onChange={setView}
            onReset={() => setView(base)}
          />
        )}
      </div>
    </section>
  )
}

type StreamPoint = {
  x: number
  speed: number | null
  heart_rate: number | null
  cadence: number | null
  altitude: number | null
  power: number | null
}

function streamPoints(detail: RideDetailData, axis: AxisKey): StreamPoint[] {
  const xs = axis === 'time' ? detail.streams.elapsed : detail.streams.distance
  if (!xs) return []
  return xs.flatMap((x, index) => {
    if (x == null) return []
    return [
      {
        x,
        speed: metersPerSecondToKmh(detail.streams.speed?.[index] ?? null),
        heart_rate: detail.streams.heart_rate?.[index] ?? null,
        cadence: detail.streams.cadence?.[index] ?? null,
        altitude: detail.streams.altitude?.[index] ?? null,
        power: detail.streams.power?.[index] ?? null,
      },
    ]
  })
}

function valuesFor(detail: RideDetailData, key: SeriesKey) {
  return detail.streams[key]
}

function hasValues(values?: Array<number | null>) {
  return Boolean(values?.some((value) => value != null))
}

function toggleSeries(current: SeriesKey[], key: SeriesKey) {
  if (current.includes(key)) {
    return current.length === 1
      ? current
      : current.filter((item) => item !== key)
  }
  return [...current, key]
}

function seriesStats(points: StreamPoint[], key: SeriesKey) {
  const values = points
    .map((point) => point[key])
    .filter((value): value is number => value != null)
  if (values.length === 0) return { average: null, maximum: null }
  const total = values.reduce((sum, value) => sum + value, 0)
  return { average: total / values.length, maximum: Math.max(...values) }
}

function formatStat(key: SeriesKey, value: number | null, locale: string) {
  if (value == null) return '--'
  const formatted = formatNumber(value, locale, {
    maximumFractionDigits: key === 'speed' || key === 'altitude' ? 1 : 0,
  })
  if (key === 'speed') return `${formatted} km/h`
  if (key === 'cadence') return `${formatted} rpm`
  if (key === 'altitude') return `${formatted} m`
  if (key === 'heart_rate') return `${formatted} bpm`
  return `${formatted} W`
}

function nearestPoint(points: StreamPoint[], x: number) {
  if (points.length === 0) return null
  let best = points[0]
  let distance = Math.abs(best.x - x)
  for (const point of points) {
    const next = Math.abs(point.x - x)
    if (next < distance) {
      best = point
      distance = next
    }
  }
  return best
}

function useChartZoom(
  view: ChartWindow | null,
  bounds: ChartWindow | null,
  setView: (next: ChartWindow) => void,
) {
  const ref = useRef<HTMLDivElement>(null)
  const viewRef = useRef(view)
  const boundsRef = useRef(bounds)
  viewRef.current = view
  boundsRef.current = bounds

  useEffect(() => {
    const node = ref.current
    if (!node) return
    let pinchDistance = 0
    let pinchOrigin = 0
    let lastX = 0
    const pointers = new Set<number>()

    const applyZoom = (factor: number, origin: number) => {
      const current = viewRef.current
      const limit = boundsRef.current
      if (!current || !limit) return
      setView(zoomWindow(current, limit, factor, origin))
    }

    const applyPan = (delta: number) => {
      const current = viewRef.current
      const limit = boundsRef.current
      if (!current || !limit) return
      setView(panWindow(current, limit, delta))
    }

    const panByPixels = (pixels: number) => {
      const current = viewRef.current
      if (!current) return
      const width = node.getBoundingClientRect().width
      if (width <= 0) return
      applyPan((pixels / width) * (current.end - current.start))
    }

    const onWheel = (event: WheelEvent) => {
      const current = viewRef.current
      if (!current) return
      event.preventDefault()
      event.stopPropagation()
      const horizontal =
        event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)
      if (horizontal) {
        panByPixels(event.shiftKey ? event.deltaY : event.deltaX)
        return
      }
      const origin = originAt(
        node.getBoundingClientRect().left,
        node.getBoundingClientRect().width,
        event.clientX,
        current,
      )
      applyZoom(Math.exp(event.deltaY * 0.0018), origin)
    }

    const onPointerDown = (event: PointerEvent) => {
      pointers.add(event.pointerId)
      if (pointers.size !== 1 || event.button !== 0) return
      lastX = event.clientX
      node.setPointerCapture(event.pointerId)
      node.classList.add('is-panning')
    }

    const onPointerMove = (event: PointerEvent) => {
      if (pointers.size !== 1 || !node.hasPointerCapture(event.pointerId))
        return
      const nextX = event.clientX
      panByPixels(lastX - nextX)
      lastX = nextX
    }

    const onPointerUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      if (node.hasPointerCapture(event.pointerId)) {
        node.releasePointerCapture(event.pointerId)
      }
      if (pointers.size === 0) node.classList.remove('is-panning')
    }

    const onTouchStart = (event: TouchEvent) => {
      const first = event.touches[0]
      const second = event.touches[1]
      if (!first || !second || !viewRef.current) return
      pinchDistance = touchDistance(event.touches)
      pinchOrigin = originAt(
        node.getBoundingClientRect().left,
        node.getBoundingClientRect().width,
        (first.clientX + second.clientX) / 2,
        viewRef.current,
      )
    }

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || pinchDistance === 0) return
      event.preventDefault()
      const distance = touchDistance(event.touches)
      if (distance === 0) return
      applyZoom(pinchDistance / distance, pinchOrigin)
      pinchDistance = distance
    }

    node.addEventListener('wheel', onWheel, { passive: false })
    node.addEventListener('pointerdown', onPointerDown)
    node.addEventListener('pointermove', onPointerMove)
    node.addEventListener('pointerup', onPointerUp)
    node.addEventListener('pointercancel', onPointerUp)
    node.addEventListener('touchstart', onTouchStart, { passive: true })
    node.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      node.removeEventListener('wheel', onWheel)
      node.removeEventListener('pointerdown', onPointerDown)
      node.removeEventListener('pointermove', onPointerMove)
      node.removeEventListener('pointerup', onPointerUp)
      node.removeEventListener('pointercancel', onPointerUp)
      node.removeEventListener('touchstart', onTouchStart)
      node.removeEventListener('touchmove', onTouchMove)
    }
  }, [setView])

  return ref
}

function touchDistance(touches: TouchList) {
  const first = touches[0]
  const second = touches[1]
  if (!first || !second) return 0
  return Math.hypot(
    second.clientX - first.clientX,
    second.clientY - first.clientY,
  )
}
