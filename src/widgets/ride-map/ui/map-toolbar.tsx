'use client'

import {
  CirclePause,
  CirclePlay,
  LocateFixed,
  Map as MapIcon,
  Minus,
  Plus,
  Rotate3d,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LanguageToggle } from '@/features/language'
import { ThemeToggle } from '@/features/theme'
import { cn } from '@/shared/lib/cn'

const pill =
  'flex items-center gap-4 rounded-full bg-white/20 shadow-lg backdrop-blur-md dark:bg-black/20'
const iconButton =
  'grid size-5.5 shrink-0 place-items-center cursor-pointer disabled:cursor-not-allowed disabled:opacity-40'

type MapToolbarProps = {
  showMapTools: boolean
  isGlobe: boolean
  isRotating: boolean
  isTransitioning: boolean
  onToggleProjection: () => void
  onToggleRotate: () => void
}

export function MapToolbar({
  showMapTools,
  isGlobe,
  isRotating,
  isTransitioning,
  onToggleProjection,
  onToggleRotate,
}: MapToolbarProps) {
  const t = useTranslations('map')

  return (
    <div className='pointer-events-auto absolute top-4 right-4 z-20 max-md:top-auto max-md:right-auto max-md:bottom-4 max-md:left-1/2 max-md:-translate-x-1/2'>
      <div className={`${pill} px-5 py-3`}>
        {showMapTools && (
          <>
            <button
              type='button'
              onClick={onToggleProjection}
              disabled={isTransitioning}
              aria-label={isGlobe ? t('flat') : t('globe')}
              className={iconButton}
            >
              <Rotate3d
                size={22}
                strokeWidth={2.25}
                nonScalingStroke
                className={cn(isGlobe ? 'block' : 'hidden')}
              />
              <MapIcon
                size={22}
                strokeWidth={2.25}
                nonScalingStroke
                className={cn(isGlobe ? 'hidden' : 'block')}
              />
            </button>
            <button
              type='button'
              onClick={onToggleRotate}
              aria-label={isRotating ? t('pause') : t('rotate')}
              className={iconButton}
            >
              {isRotating ? (
                <CirclePause size={22} strokeWidth={2.25} nonScalingStroke />
              ) : (
                <CirclePlay size={22} strokeWidth={2.25} nonScalingStroke />
              )}
            </button>
          </>
        )}
        <LanguageToggle className='size-5.5' />
        <ThemeToggle className='size-5.5' strokeWidth={2.25} />
      </div>
    </div>
  )
}

type MapCameraBarProps = {
  onZoomIn: () => void
  onZoomOut: () => void
  onLocate: () => void
}

export function MapCameraBar({
  onZoomIn,
  onZoomOut,
  onLocate,
}: MapCameraBarProps) {
  const t = useTranslations('map')

  return (
    <div className='pointer-events-auto absolute right-4 bottom-4 z-20'>
      <div className={`${pill} flex-col px-3 py-4`}>
        <button
          type='button'
          onClick={onLocate}
          aria-label={t('locate')}
          className={iconButton}
        >
          <LocateFixed size={22} strokeWidth={2.25} nonScalingStroke />
        </button>
        <button
          type='button'
          onClick={onZoomIn}
          aria-label={t('zoomIn')}
          className={iconButton}
        >
          <Plus size={22} strokeWidth={2.25} nonScalingStroke />
        </button>
        <button
          type='button'
          onClick={onZoomOut}
          aria-label={t('zoomOut')}
          className={iconButton}
        >
          <Minus size={22} strokeWidth={2.25} nonScalingStroke />
        </button>
      </div>
    </div>
  )
}
