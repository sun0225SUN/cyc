'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import type { RideMapStyleId } from '@/shared/config/mapbox'
import { MapStylePicker } from './map-style-picker'
import { LayerSwitch } from './ride-map-layers'

type MapLayersDialogProps = {
  token: string
  center: [number, number]
  styleId: RideMapStyleId
  onStyleId: (id: RideMapStyleId) => void
  colorBySpeed: boolean
  onColorBySpeed: (value: boolean) => void
  onClose: () => void
}

export function MapLayersDialog({
  token,
  center,
  styleId,
  onStyleId,
  colorBySpeed,
  onColorBySpeed,
  onClose,
}: MapLayersDialogProps) {
  const t = useTranslations('map')

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', close, true)
    return () => window.removeEventListener('keydown', close, true)
  }, [onClose])

  return (
    <div className='pointer-events-auto fixed inset-0 z-40 flex items-center justify-center p-4'>
      <button
        type='button'
        onClick={onClose}
        aria-label={t('close')}
        className='absolute inset-0 cursor-default bg-black/45 backdrop-blur-sm'
        data-umami-event='close-map-layers'
      />
      <div
        role='dialog'
        aria-modal='true'
        aria-labelledby='home-map-layers-title'
        className='bg-background/95 relative w-full max-w-xl rounded-3xl border p-6 shadow-2xl backdrop-blur-xl'
      >
        <h2 id='home-map-layers-title' className='sr-only'>
          {t('layers')}
        </h2>
        <MapStylePicker
          token={token}
          center={center}
          styleId={styleId}
          onStyleId={onStyleId}
          event='map-style'
          hidePrivacy
        />
        <div className='mt-8'>
          <LayerSwitch
            label={t('colorBySpeed')}
            checked={colorBySpeed}
            onCheckedChange={onColorBySpeed}
            event='map-speed-color'
          />
        </div>
      </div>
    </div>
  )
}
