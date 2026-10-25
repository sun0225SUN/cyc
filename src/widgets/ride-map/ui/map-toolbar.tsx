'use client'

import {
  CirclePause,
  CirclePlay,
  Map as MapIcon,
  Rotate3d,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LanguageToggle } from '@/features/language'
import { ThemeToggle } from '@/features/theme'
import { githubRepositoryUrl } from '@/shared/config/site'
import { cn } from '@/shared/lib/cn'
import { GithubIcon } from '@/shared/ui/github-icon'

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
    <div className='pointer-events-auto'>
      <div className={`${pill} px-5 py-3`}>
        {showMapTools && (
          <>
            <button
              type='button'
              onClick={onToggleProjection}
              disabled={isTransitioning}
              aria-label={isGlobe ? t('flat') : t('globe')}
              className={iconButton}
              data-umami-event='map-projection'
              data-umami-event-view={isGlobe ? 'flat' : 'globe'}
            >
              <Rotate3d
                size={22}
                strokeWidth={2.25}
                nonScalingStroke
                className={cn(isGlobe ? 'hidden' : 'block')}
              />
              <MapIcon
                size={22}
                strokeWidth={2.25}
                nonScalingStroke
                className={cn(isGlobe ? 'block' : 'hidden')}
              />
            </button>
            <button
              type='button'
              onClick={onToggleRotate}
              aria-label={isRotating ? t('pause') : t('rotate')}
              className={iconButton}
              data-umami-event='map-rotate'
              data-umami-event-playing={String(!isRotating)}
            >
              {isRotating ? (
                <CirclePause size={22} strokeWidth={2.25} nonScalingStroke />
              ) : (
                <CirclePlay size={22} strokeWidth={2.25} nonScalingStroke />
              )}
            </button>
          </>
        )}
        <a
          href={githubRepositoryUrl}
          target='_blank'
          rel='noopener noreferrer'
          aria-label={t('github')}
          className={iconButton}
          data-umami-event='github'
        >
          <GithubIcon size={22} strokeWidth={2.25} nonScalingStroke />
        </a>
        <LanguageToggle className='size-5.5' />
        <ThemeToggle className='size-5.5' strokeWidth={2.25} />
      </div>
    </div>
  )
}

type MapCameraBarProps = {
  bearing: number
  onZoomIn: () => void
  onZoomOut: () => void
  onResetNorth: () => void
}

export function MapCameraBar({
  bearing,
  onZoomIn,
  onZoomOut,
  onResetNorth,
}: MapCameraBarProps) {
  const t = useTranslations('map')

  return (
    <div className='pointer-events-auto'>
      <div className={`${pill} flex-col px-3 py-4`}>
        <button
          type='button'
          onClick={onZoomIn}
          aria-label={t('zoomIn')}
          className={iconButton}
          data-umami-event='map-zoom-in'
        >
          <ZoomIn size={22} strokeWidth={2.25} nonScalingStroke />
        </button>
        <button
          type='button'
          onClick={onZoomOut}
          aria-label={t('zoomOut')}
          className={iconButton}
          data-umami-event='map-zoom-out'
        >
          <ZoomOut size={22} strokeWidth={2.25} nonScalingStroke />
        </button>
        <button
          type='button'
          onClick={onResetNorth}
          aria-label={t('resetNorth')}
          className={iconButton}
          data-umami-event='map-reset-north'
          data-umami-event-bearing={String(Math.round(bearing))}
        >
          <svg
            viewBox='0 0 24 24'
            width='22'
            height='22'
            aria-hidden='true'
            className='transition-transform duration-200'
            style={{ transform: `rotate(${-bearing}deg)` }}
          >
            <path d='M12 2.75 17.25 10.75H6.75L12 2.75Z' fill='currentColor' />
            <path
              d='m12 21.25-5.25-8h10.5l-5.25 8Z'
              fill='currentColor'
              opacity='0.32'
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
