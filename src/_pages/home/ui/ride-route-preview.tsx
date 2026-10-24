'use client'

import { Minus, Plus } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { type Activity, activitiesToGeoJson } from '@/entities/activity'
import { mapboxStyles } from '@/shared/config/mapbox'
import { accentColor } from '@/shared/config/theme'
import './ride-route-preview.css'

const SOURCE_ID = 'detail-ride'
const LAYER_ID = 'detail-ride'
const FIT = { padding: 42, maxZoom: 13 } as const

type RideRoutePreviewProps = {
  activity: Activity
  token: string
}

function motionDuration() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450
}

function paintRoute(map: mapboxgl.Map, dark: boolean) {
  const color = accentColor(dark ? 'dark' : 'light')
  if (map.getLayer(LAYER_ID)) {
    map.setPaintProperty(LAYER_ID, 'line-color', color)
    return
  }
  map.addLayer({
    id: LAYER_ID,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': color,
      'line-width': 4,
      'line-opacity': 0.95,
    },
  })
}

function applyRoute(
  map: mapboxgl.Map,
  mapData: ReturnType<typeof activitiesToGeoJson>,
  dark: boolean,
  animate: boolean,
) {
  const source = map.getSource(SOURCE_ID)
  if (source && source.type === 'geojson') {
    source.setData(mapData.geojson)
  } else {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: mapData.geojson,
    })
    paintRoute(map, dark)
  }
  if (mapData.bounds) {
    map.fitBounds(mapData.bounds, {
      ...FIT,
      duration: animate ? motionDuration() : 0,
    })
  }
}

export function RideRoutePreview({ activity, token }: RideRoutePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const t = useTranslations('map')
  const { resolvedTheme } = useTheme()
  const mapData = useMemo(() => activitiesToGeoJson([activity]), [activity])
  const mapDataRef = useRef(mapData)
  mapDataRef.current = mapData
  const dark = resolvedTheme === 'dark'

  useEffect(() => {
    const container = containerRef.current
    if (!container || !token) return

    mapboxgl.accessToken = token
    const bounds = mapDataRef.current.bounds
    const map = new mapboxgl.Map({
      container,
      style: dark ? mapboxStyles.dark : mapboxStyles.light,
      projection: 'mercator',
      ...(bounds
        ? { bounds, fitBoundsOptions: { ...FIT, duration: 0 } }
        : { center: [105, 30] as [number, number], zoom: 4 }),
      interactive: true,
      attributionControl: false,
    })
    mapRef.current = map

    map.on('style.load', () => {
      applyRoute(map, mapDataRef.current, dark, false)
    })

    return () => {
      mapRef.current = null
      map.remove()
    }
  }, [dark, token])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    applyRoute(map, mapData, dark, true)
  }, [dark, mapData])

  const zoomBy = useCallback((delta: number) => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ zoom: map.getZoom() + delta, duration: 200 })
  }, [])

  if (!token) {
    return <div className='bg-muted h-64 w-full sm:h-80' />
  }

  return (
    <div className='relative h-64 w-full sm:h-80'>
      <div ref={containerRef} className='ride-route-preview h-full w-full' />
      <div className='absolute right-5 bottom-5 z-10 flex flex-col overflow-hidden rounded-full bg-white/85 shadow-lg backdrop-blur-md dark:bg-black/70'>
        <button
          type='button'
          onClick={() => zoomBy(1)}
          aria-label={t('zoomIn')}
          data-umami-event='ride-zoom-in'
          className='grid size-11 cursor-pointer place-items-center transition-colors hover:bg-black/7 active:bg-black/12 dark:hover:bg-white/12 dark:active:bg-white/18'
        >
          <Plus size={20} strokeWidth={2.25} />
        </button>
        <button
          type='button'
          onClick={() => zoomBy(-1)}
          aria-label={t('zoomOut')}
          data-umami-event='ride-zoom-out'
          className='grid size-11 cursor-pointer place-items-center transition-colors hover:bg-black/7 active:bg-black/12 dark:hover:bg-white/12 dark:active:bg-white/18'
        >
          <Minus size={20} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  )
}
