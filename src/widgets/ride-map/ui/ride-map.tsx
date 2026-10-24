'use client'

import MapboxLanguage from '@mapbox/mapbox-gl-language'
import mapboxgl from 'mapbox-gl'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Activity,
  activitiesToGeoJson,
  type RideMapData,
} from '@/entities/activity'
import {
  type MapAppearance,
  mapboxStyles,
  mapLanguage,
} from '@/shared/config/mapbox'
import { MapCameraBar, MapToolbar } from './map-toolbar'
import 'mapbox-gl/dist/mapbox-gl.css'
import './mapbox.css'

const lineColor: Record<MapAppearance, string> = {
  light: '#2563eb',
  dark: '#fb923c',
}

type RideMapProps = {
  activities: Activity[]
  locale: string
  token: string
}

function appearanceFromDocument(): MapAppearance {
  if (document.documentElement.classList.contains('dark')) return 'dark'
  return 'light'
}

export function RideMap({ activities, locale, token }: RideMapProps) {
  const t = useTranslations('map')
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const styleRef = useRef<string>('')
  const transitionTimer = useRef<number | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [isGlobe, setIsGlobe] = useState(true)
  const [isRotating, setIsRotating] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const mapData = useMemo(() => activitiesToGeoJson(activities), [activities])
  const appearance =
    resolvedTheme === 'dark' || resolvedTheme === 'light' ? resolvedTheme : null

  useEffect(() => {
    const container = containerRef.current
    if (!container || !token) return

    const initial = appearanceFromDocument()
    const style = mapboxStyles[initial]
    styleRef.current = style
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container,
      style,
      projection: 'globe',
      center: [105, 30],
      zoom: 1,
      attributionControl: false,
    })
    map.addControl(new MapboxLanguage({ defaultLanguage: mapLanguage(locale) }))
    map.on('dragstart', () => setIsRotating(false))
    let framed = false
    const frameOnce = () => {
      if (!framed) framed = frameWholeEarth(map, mapData.bounds)
    }
    map.on('style.load', () => {
      const theme = styleRef.current === mapboxStyles.dark ? 'dark' : 'light'
      drawRides(map, mapData, lineColor[theme])
      frameOnce()
    })
    map.once('idle', frameOnce)
    mapRef.current = map
    map.once('load', () => setMapReady(true))

    return () => {
      if (transitionTimer.current !== null) {
        window.clearTimeout(transitionTimer.current)
      }
      setMapReady(false)
      map.remove()
      mapRef.current = null
    }
  }, [locale, mapData, token])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const spin = () => {
      if (map.getZoom() >= 5) return
      const center = map.getCenter()
      center.lng -= 6
      map.easeTo({ center, duration: 1000, easing: (progress) => progress })
    }

    if (!isRotating) return
    map.on('moveend', spin)
    spin()
    return () => {
      map.off('moveend', spin)
    }
  }, [isRotating, mapReady])

  const stopSpin = useCallback(() => setIsRotating(false), [])

  const zoomBy = useCallback(
    (delta: number) => {
      const map = mapRef.current
      if (!map) return
      stopSpin()
      map.easeTo({ zoom: map.getZoom() + delta, duration: 200 })
    },
    [stopSpin],
  )

  const locate = useCallback(() => {
    const map = mapRef.current
    if (!map || !navigator.geolocation) return
    stopSpin()
    navigator.geolocation.getCurrentPosition((position) => {
      if (mapRef.current !== map) return
      map.flyTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: Math.max(map.getZoom(), 11),
        duration: 800,
      })
    })
  }, [stopSpin])

  const toggleProjection = useCallback(() => {
    const map = mapRef.current
    if (!map || !mapReady || isTransitioning) return
    setIsTransitioning(true)
    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current)
    }
    const view = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: 0,
    }
    map.setProjection({ name: isGlobe ? 'mercator' : 'globe' })
    setIsGlobe((current) => !current)
    map.easeTo({ ...view, duration: 600 })
    transitionTimer.current = window.setTimeout(() => {
      setIsTransitioning(false)
    }, 600)
  }, [isGlobe, isTransitioning, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !appearance) return
    const style = mapboxStyles[appearance]
    if (styleRef.current === style) return
    styleRef.current = style
    map.setStyle(style)
  }, [appearance])

  return (
    <div className='ride-map relative h-svh w-full'>
      {token ? (
        <div ref={containerRef} className='h-svh w-full' />
      ) : (
        <div className='bg-muted text-muted-foreground flex h-svh items-center justify-center px-6 text-center text-sm'>
          {t('missingToken')}
        </div>
      )}
      <MapToolbar
        showMapTools={Boolean(token)}
        isGlobe={isGlobe}
        isRotating={isRotating}
        isTransitioning={isTransitioning}
        onToggleProjection={toggleProjection}
        onToggleRotate={() => setIsRotating((current) => !current)}
      />
      {token ? (
        <MapCameraBar
          onZoomIn={() => zoomBy(1)}
          onZoomOut={() => zoomBy(-1)}
          onLocate={locate}
        />
      ) : null}
    </div>
  )
}

function frameWholeEarth(map: mapboxgl.Map, bounds: RideMapData['bounds']) {
  const canvas = map.getCanvas()
  const size = Math.min(canvas.clientWidth, canvas.clientHeight)
  if (size < 64) return false
  // At zoom z the mercator world is 512 * 2^z pixels around, which is the
  // globe circumference. Size the sphere so it just fits the shorter side.
  const zoom = Math.log2((size * 0.9 * Math.PI) / 512)
  const center: [number, number] = bounds
    ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
    : [105, 30]
  map.jumpTo({ center, zoom, bearing: 0, pitch: 0 })
  return true
}

function drawRides(map: mapboxgl.Map, mapData: RideMapData, color: string) {
  const existing = map.getSource('rides')
  if (existing?.type === 'geojson') {
    existing.setData(mapData.geojson)
    map.setPaintProperty('rides', 'line-color', color)
  } else {
    map.addSource('rides', { type: 'geojson', data: mapData.geojson })
    map.addLayer({
      id: 'rides',
      type: 'line',
      source: 'rides',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.9 },
    })
  }
}
