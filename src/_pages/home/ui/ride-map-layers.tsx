'use client'

import { cn } from 'cn'
import { EyeOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
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

const DEFAULT_HEIGHT = 340
const MIN_HEIGHT = 176
const CLOSE_HEIGHT = 132

type RideMapLayersProps = {
  token: string
  center: [number, number]
  styleId: RideMapStyleId
  onStyleId: (id: RideMapStyleId) => void
  showLaps: boolean
  onShowLaps: (value: boolean) => void
  showEnds: boolean
  onShowEnds: (value: boolean) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RideMapLayers({
  token,
  center,
  styleId,
  onStyleId,
  showLaps,
  onShowLaps,
  showEnds,
  onShowEnds,
  open,
  onOpenChange,
}: RideMapLayersProps) {
  const t = useTranslations('map')
  const sheetRef = useRef<HTMLDivElement>(null)
  const stopDragRef = useRef<(() => void) | null>(null)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) return
    const root = sheetRef.current?.offsetParent
    const max =
      root instanceof HTMLElement ? root.clientHeight * 0.78 : DEFAULT_HEIGHT
    setHeight(Math.min(DEFAULT_HEIGHT, Math.max(MIN_HEIGHT, max)))
  }, [open])

  useEffect(() => {
    if (open) return
    stopDragRef.current?.()
  }, [open])

  useEffect(() => () => stopDragRef.current?.(), [])

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      onOpenChange(false)
    }
    window.addEventListener('keydown', close, true)
    return () => window.removeEventListener('keydown', close, true)
  }, [onOpenChange, open])

  useEffect(() => {
    if (!open) return
    const sheet = sheetRef.current
    const root = sheet?.offsetParent
    if (!sheet || !(root instanceof HTMLElement)) return

    let press: { x: number; y: number; id: number } | null = null

    const isInside = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(target.closest('.ride-map-sheet, [data-ride-map-controls]'))

    const onDown = (event: PointerEvent) => {
      if (isInside(event.target)) return
      press = { x: event.clientX, y: event.clientY, id: event.pointerId }
    }
    const onUp = (event: PointerEvent) => {
      if (!press || press.id !== event.pointerId) return
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y)
      press = null
      if (moved > 8 || isInside(event.target)) return
      onOpenChange(false)
    }

    root.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    return () => {
      root.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onOpenChange, open])

  return (
    <div
      ref={sheetRef}
      role='dialog'
      aria-modal='false'
      aria-labelledby='ride-map-style-title'
      className={cn(
        'ride-map-sheet',
        open && 'is-open',
        dragging && 'is-dragging',
      )}
      style={{ height }}
    >
      <button
        type='button'
        aria-label={t('resizeSheet')}
        className='ride-map-sheet-handle'
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return
          const sheet = sheetRef.current
          const root = sheet?.offsetParent
          if (!sheet || !(root instanceof HTMLElement)) return
          event.preventDefault()
          stopDragRef.current?.()
          const pointerId = event.pointerId
          const startY = event.clientY
          const startHeight = sheet.getBoundingClientRect().height
          const max = root.getBoundingClientRect().height * 0.88
          setDragging(true)

          const stop = () => {
            window.removeEventListener('pointermove', onMove, true)
            window.removeEventListener('pointerup', onUp, true)
            window.removeEventListener('pointercancel', onUp, true)
            stopDragRef.current = null
            setDragging(false)
          }

          const onMove = (next: PointerEvent) => {
            if (next.pointerId !== pointerId) return
            if (next.pointerType === 'mouse' && (next.buttons & 1) === 0) {
              onUp(next)
              return
            }
            setHeight(
              Math.min(
                max,
                Math.max(MIN_HEIGHT, startHeight + (startY - next.clientY)),
              ),
            )
          }

          const onUp = (next: PointerEvent) => {
            if (next.pointerId !== pointerId) return
            const nextHeight = Math.min(
              max,
              Math.max(0, startHeight + (startY - next.clientY)),
            )
            stop()
            if (nextHeight < CLOSE_HEIGHT) {
              onOpenChange(false)
              setHeight(DEFAULT_HEIGHT)
            }
          }

          stopDragRef.current = stop
          window.addEventListener('pointermove', onMove, true)
          window.addEventListener('pointerup', onUp, true)
          window.addEventListener('pointercancel', onUp, true)
        }}
      >
        <span />
      </button>
      <div className='min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-6'>
        <h2
          id='ride-map-style-title'
          className='text-2xl font-medium tracking-tight'
        >
          {t('mapStyle')}
        </h2>
        <div className='mt-5 flex flex-wrap gap-x-2.5 gap-y-3'>
          {rideMapStyleIds.map((id) => {
            const selected = styleId === id
            const preview = rideMapStylePreview(id, token, center)
            return (
              <button
                key={id}
                type='button'
                aria-pressed={selected}
                onClick={() => onStyleId(id)}
                data-umami-event='ride-map-style'
                data-umami-event-style={id}
                className='flex w-11 cursor-pointer flex-col items-center gap-1.5'
              >
                <span
                  className={cn(
                    'bg-muted grid size-9 shrink-0 place-items-center rounded-md bg-cover bg-center',
                    selected &&
                      'ring-foreground ring-offset-background ring-2 ring-offset-1',
                  )}
                  style={
                    preview
                      ? { backgroundImage: `url("${preview}")` }
                      : undefined
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
        <div className='mt-8 flex flex-col gap-3'>
          <LayerSwitch
            label={t('showLapMarkers')}
            checked={showLaps}
            onCheckedChange={onShowLaps}
            event='ride-lap-markers'
          />
          <LayerSwitch
            label={t('showStartEnd')}
            checked={showEnds}
            onCheckedChange={onShowEnds}
            event='ride-end-markers'
          />
        </div>
      </div>
    </div>
  )
}

function LayerSwitch({
  label,
  checked,
  onCheckedChange,
  event,
}: {
  label: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
  event: string
}) {
  return (
    <div className='bg-muted/70 flex items-center justify-between gap-4 rounded-2xl px-5 py-4'>
      <p className='text-sm font-medium'>{label}</p>
      <button
        type='button'
        role='switch'
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        data-umami-event={event}
        className={cn(
          'relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors',
          checked ? 'bg-ride' : 'bg-neutral-300 dark:bg-white/16',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 block size-6 rounded-full shadow-sm transition-[translate,background-color]',
            checked
              ? 'bg-ride-on translate-x-5'
              : 'bg-white dark:bg-neutral-100',
          )}
        />
      </button>
    </div>
  )
}
