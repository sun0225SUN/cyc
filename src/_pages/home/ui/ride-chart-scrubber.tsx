'use client'

import { Hand, RotateCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type PointerEvent as ReactPointerEvent, useRef } from 'react'
import {
  type ChartWindow,
  clampView,
  panWindow,
  valueAtRatio,
} from '../model/chart-window'
import './ride-detail-charts.css'

type RideChartScrubberProps = {
  view: ChartWindow
  bounds: ChartWindow
  label: string
  canReset: boolean
  onChange: (next: ChartWindow) => void
  onReset: () => void
}

type DragMode = 'move' | 'start' | 'end'

export function RideChartScrubber({
  view,
  bounds,
  label,
  canReset,
  onChange,
  onReset,
}: RideChartScrubberProps) {
  const t = useTranslations('rideDetail')
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    mode: DragMode
    origin: number
    view: ChartWindow
  } | null>(null)
  const span = bounds.end - bounds.start
  const start = span <= 0 ? 0 : ((view.start - bounds.start) / span) * 100
  const width = span <= 0 ? 100 : ((view.end - view.start) / span) * 100

  const begin = (mode: DragMode, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    dragRef.current = { mode, origin: event.clientX, view }

    const onMove = (next: PointerEvent) => {
      const drag = dragRef.current
      const track = trackRef.current
      if (!drag || !track) return
      const rect = track.getBoundingClientRect()
      if (rect.width <= 0) return
      if (drag.mode === 'move') {
        onChange(
          panWindow(
            drag.view,
            bounds,
            ((next.clientX - drag.origin) / rect.width) * span,
          ),
        )
        return
      }
      const value = valueAtRatio(
        bounds,
        (next.clientX - rect.left) / rect.width,
      )
      onChange(
        clampView(
          drag.mode === 'start'
            ? { start: Math.min(value, drag.view.end), end: drag.view.end }
            : { start: drag.view.start, end: Math.max(value, drag.view.start) },
          bounds,
        ),
      )
    }

    const onUp = (next: PointerEvent) => {
      if (target.hasPointerCapture(next.pointerId)) {
        target.releasePointerCapture(next.pointerId)
      }
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      dragRef.current = null
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  return (
    <div className='ride-chart-scrubber mt-7 flex items-center gap-4'>
      <span className='text-muted-foreground/70 grid size-7 shrink-0 place-items-center'>
        <Hand size={15} strokeWidth={1.5} aria-hidden />
      </span>
      <div className='ride-chart-scrubber-track relative min-w-0 flex-1'>
        <div className='ride-chart-scrubber-rail' aria-hidden />
        <div
          ref={trackRef}
          role='slider'
          tabIndex={0}
          aria-label={t('visibleRange')}
          aria-valuemin={bounds.start}
          aria-valuemax={bounds.end}
          aria-valuenow={view.start}
          aria-valuetext={label}
          className='ride-chart-scrubber-inner'
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return
            const rect = event.currentTarget.getBoundingClientRect()
            const value = valueAtRatio(
              bounds,
              (event.clientX - rect.left) / rect.width,
            )
            const half = (view.end - view.start) / 2
            onChange(
              clampView({ start: value - half, end: value + half }, bounds),
            )
          }}
        >
          <div
            className='ride-chart-scrubber-range'
            style={{ left: `${start}%`, width: `${Math.max(width, 3)}%` }}
            onPointerDown={(event) => begin('move', event)}
          >
            <button
              type='button'
              aria-label={t('rangeStart')}
              className='ride-chart-scrubber-edge is-start'
              onPointerDown={(event) => begin('start', event)}
            />
            <span className='ride-chart-scrubber-grip' aria-hidden>
              <i />
              <i />
            </span>
            <button
              type='button'
              aria-label={t('rangeEnd')}
              className='ride-chart-scrubber-edge is-end'
              onPointerDown={(event) => begin('end', event)}
            />
          </div>
        </div>
      </div>
      <button
        type='button'
        onClick={onReset}
        disabled={!canReset}
        className='text-muted-foreground/70 hover:text-foreground flex shrink-0 cursor-pointer items-center gap-1 text-[13px] transition-colors disabled:cursor-default disabled:opacity-35'
      >
        <RotateCw size={13} strokeWidth={1.75} />
        {t('reset')}
      </button>
    </div>
  )
}
