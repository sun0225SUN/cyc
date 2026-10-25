'use client'

import MapboxLanguage from '@mapbox/mapbox-gl-language'
import mapboxgl from 'mapbox-gl'
import { useTranslations } from 'next-intl'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import {
  type Activity,
  activitiesNewestFirst,
  activityToFeature,
  type RideFeatureCollection,
  type RideMapData,
} from '@/entities/activity'
import {
  type MapAppearance,
  mapLanguage,
  type RideMapStyleId,
  rideMapStyle,
} from '@/shared/config/mapbox'
import { accentColor, appearanceFromDocument } from '@/shared/config/theme'
import { useThemeAppearance } from '@/shared/lib/use-theme-appearance'
import { MapToolbar } from './map-toolbar'
import 'mapbox-gl/dist/mapbox-gl.css'
import './mapbox.css'

export type RideMapCamera = {
  bearing: number
  zoomIn: () => void
  zoomOut: () => void
  resetNorth: () => void
}

export type RideSpeedLine = {
  id: number
  coordinates: [number, number][]
  stops: Array<number | string>
}

const RIDE_LINE = 4
const RIDE_LINE_HOVER = 6
const RIDE_DRAW_CHUNK = 100

type RideMapProps = {
  activities: Activity[]
  locale: string
  token: string
  brand?: ReactNode
  onSelect?: (activity: Activity) => void
  onCameraReady?: (camera: RideMapCamera | null) => void
  colorBySpeed?: boolean
  styleId?: RideMapStyleId
  speedLines?: RideSpeedLine[]
}

export function RideMap({
  activities,
  locale,
  token,
  brand,
  onSelect,
  onCameraReady,
  colorBySpeed = false,
  styleId = 'dark',
  speedLines = [],
}: RideMapProps) {
  const t = useTranslations('map')
  const appearance = useThemeAppearance()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const languageControlRef = useRef<MapboxLanguage | null>(null)
  const styleRef = useRef<string>('')
  const transitionTimer = useRef<number | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [isGlobe, setIsGlobe] = useState(true)
  const [isRotating, setIsRotating] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [bearing, setBearing] = useState(0)
  const colorBySpeedRef = useRef(colorBySpeed)
  colorBySpeedRef.current = colorBySpeed
  const speedLinesRef = useRef(speedLines)
  speedLinesRef.current = speedLines
  const styleIdRef = useRef(styleId)
  styleIdRef.current = styleId
  const activitiesRef = useRef(activities)
  activitiesRef.current = activities
  const rideDrawRef = useRef<{ gen: number; frame: number | null }>({
    gen: 0,
    frame: null,
  })
  const speedDrawRef = useRef<{ gen: number; frame: number | null }>({
    gen: 0,
    frame: null,
  })
  useEffect(() => {
    const container = containerRef.current
    if (!container || !token) return

    const initial = appearanceFromDocument()
    const initialStyle = styleIdRef.current
    styleRef.current =
      initialStyle === 'privacy' ? `privacy:${initial}` : initialStyle
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container,
      style: rideMapStyle(initialStyle, initial) as
        | string
        | mapboxgl.StyleSpecification,
      projection: 'globe',
      center: [105, 30],
      zoom: 1,
      attributionControl: false,
    })
    const languageControl = new MapboxLanguage({
      defaultLanguage: mapLanguage(locale),
    })
    languageControlRef.current = languageControl
    map.addControl(languageControl)
    map.on('dragstart', () => setIsRotating(false))
    map.on('rotate', () => setBearing(map.getBearing()))
    let hoveredRideId: string | number | null = null
    map.on('mouseenter', 'rides-hit', () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mousemove', 'rides-hit', (event) => {
      const id = event.features?.[0]?.id
      if (id === undefined || id === hoveredRideId) return
      hoverRide(map, hoveredRideId, false)
      hoveredRideId = id
      hoverRide(map, id, true)
    })
    map.on('mouseleave', 'rides-hit', () => {
      map.getCanvas().style.cursor = ''
      hoverRide(map, hoveredRideId, false)
      hoveredRideId = null
    })
    map.on('click', 'rides-hit', (event) => {
      const id = Number(event.features?.[0]?.properties?.id)
      const activity = activitiesRef.current.find((item) => item.run_id === id)
      if (activity) {
        setIsRotating(false)
        // Umami injects window.umami in production.
        ;(
          window as unknown as {
            umami?: { track: (name: string, data?: object) => void }
          }
        ).umami?.track('open-ride', {
          ride: activity.run_id,
          source: 'map',
        })
        onSelect?.(activity)
      }
    })
    let framed = false
    const frameOnce = (bounds: RideMapData['bounds']) => {
      if (!framed) framed = frameWholeEarth(map, bounds)
    }
    map.on('style.load', () => {
      const theme = appearanceFromDocument()
      paintSpace(map, theme)
      queueRideTracks(
        map,
        rideDrawRef,
        activitiesRef.current,
        accentColor(theme),
        colorBySpeedRef.current,
        (bounds) => frameOnce(bounds),
      )
      queueSpeedLines(
        map,
        speedDrawRef,
        speedLinesRef.current,
        false,
        colorBySpeedRef.current,
      )
    })
    mapRef.current = map
    map.once('load', () => setMapReady(true))

    return () => {
      if (transitionTimer.current !== null) {
        window.clearTimeout(transitionTimer.current)
      }
      cancelDrawQueue(rideDrawRef)
      cancelDrawQueue(speedDrawRef)
      setMapReady(false)
      languageControlRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [locale, onSelect, token])

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

  const resetNorth = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    stopSpin()
    map.easeTo({ bearing: 0, pitch: 0, duration: 350 })
  }, [stopSpin])

  useEffect(() => {
    if (!token) {
      onCameraReady?.(null)
      return
    }
    onCameraReady?.({
      bearing,
      zoomIn: () => zoomBy(1),
      zoomOut: () => zoomBy(-1),
      resetNorth,
    })
  }, [bearing, onCameraReady, resetNorth, token, zoomBy])

  useEffect(() => () => onCameraReady?.(null), [onCameraReady])

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
    if (!map) return
    const key = styleId === 'privacy' ? `privacy:${appearance}` : styleId
    if (styleRef.current === key) return
    styleRef.current = key
    const languageControl = languageControlRef.current
    if (languageControl && map.hasControl(languageControl)) {
      map.removeControl(languageControl)
    }
    map.setStyle(
      rideMapStyle(styleId, appearance) as string | mapboxgl.StyleSpecification,
    )
    if (languageControl && styleSupportsLanguage(styleId)) {
      map.once('style.load', () => {
        if (
          mapRef.current === map &&
          styleSupportsLanguage(styleIdRef.current) &&
          !map.hasControl(languageControl)
        ) {
          map.addControl(languageControl)
        }
      })
    }
  }, [appearance, styleId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    queueRideTracks(
      map,
      rideDrawRef,
      activities,
      accentColor(appearanceFromDocument()),
      colorBySpeedRef.current,
    )
  }, [activities, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    queueSpeedLines(map, speedDrawRef, speedLines, false, colorBySpeed)
    if (map.getLayer('rides')) {
      map.setPaintProperty(
        'rides',
        'line-opacity',
        rideLineOpacity(colorBySpeed),
      )
      map.setPaintProperty(
        'rides',
        'line-color',
        accentColor(appearance ?? 'dark'),
      )
    }
  }, [appearance, colorBySpeed, mapReady, speedLines])

  return (
    <div className='ride-map relative h-svh w-full bg-transparent'>
      {token ? (
        <div ref={containerRef} className='relative z-10 h-svh w-full' />
      ) : (
        <div className='bg-muted text-muted-foreground flex h-svh items-center justify-center px-6 text-center text-sm'>
          {t('missingToken')}
        </div>
      )}
      <div className='pointer-events-none absolute inset-x-4 top-4 z-20 flex items-center justify-between'>
        {brand}
        <MapToolbar
          showMapTools={Boolean(token)}
          isGlobe={isGlobe}
          isRotating={isRotating}
          isTransitioning={isTransitioning}
          onToggleProjection={toggleProjection}
          onToggleRotate={() => setIsRotating((current) => !current)}
        />
      </div>
    </div>
  )
}

function paintSpace(map: mapboxgl.Map, theme: MapAppearance) {
  const space = theme === 'dark' ? 'rgba(0, 0, 0, 0)' : '#f4f7fb'
  map.setFog({
    color: space,
    'high-color': space,
    'horizon-blend': 0,
    'space-color': space,
    'star-intensity': 0,
  })
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

function hoverRide(
  map: mapboxgl.Map,
  id: string | number | null,
  hover: boolean,
) {
  if (id == null) return
  if (map.getSource('rides')) {
    map.setFeatureState({ source: 'rides', id }, { hover })
  }
  const layerId = `ride-speed-${id}`
  if (!map.getLayer(layerId)) return
  map.setPaintProperty(
    layerId,
    'line-width',
    hover ? RIDE_LINE_HOVER : RIDE_LINE,
  )
  if (hover) map.moveLayer(layerId)
}

function styleReady(map: mapboxgl.Map) {
  try {
    return Boolean(map.getStyle())
  } catch {
    return false
  }
}

function styleSupportsLanguage(id: RideMapStyleId) {
  return id !== 'privacy' && id !== 'satellite'
}

function rideLineOpacity(hide: boolean) {
  return hide ? 0 : 0.9
}

function drawRides(
  map: mapboxgl.Map,
  mapData: RideMapData,
  color: string,
  hide: boolean,
) {
  const existing = map.getSource('rides')
  if (existing?.type === 'geojson') {
    existing.setData(mapData.geojson)
    map.setPaintProperty('rides', 'line-color', color)
    map.setPaintProperty('rides', 'line-opacity', rideLineOpacity(hide))
    return
  }
  map.addSource('rides', { type: 'geojson', data: mapData.geojson })
  map.addLayer({
    id: 'rides-hit',
    type: 'line',
    source: 'rides',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': color, 'line-width': 14, 'line-opacity': 0 },
  })
  map.addLayer({
    id: 'rides',
    type: 'line',
    source: 'rides',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': color,
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        RIDE_LINE_HOVER,
        RIDE_LINE,
      ],
      'line-width-transition': { duration: 150 },
      'line-opacity': rideLineOpacity(hide),
    },
  })
}

type DrawQueueState = {
  current: { gen: number; frame: number | null }
}

function cancelDrawQueue(state: DrawQueueState) {
  state.current.gen += 1
  if (state.current.frame == null) return
  cancelAnimationFrame(state.current.frame)
  state.current.frame = null
}

function queueRideTracks(
  map: mapboxgl.Map,
  state: DrawQueueState,
  activities: Activity[],
  color: string,
  hide: boolean,
  onBounds?: (bounds: RideMapData['bounds']) => void,
) {
  cancelDrawQueue(state)
  const gen = state.current.gen
  const ordered = activitiesNewestFirst(activities)
  const features: RideFeatureCollection['features'] = []
  let west = Number.POSITIVE_INFINITY
  let south = Number.POSITIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY
  let offset = 0
  const step = () => {
    if (state.current.gen !== gen || !styleReady(map)) return
    const slice = ordered.slice(offset, offset + RIDE_DRAW_CHUNK)
    for (const activity of slice) {
      const feature = activityToFeature(activity)
      if (!feature) continue
      features.push(feature)
      for (const [longitude, latitude] of feature.geometry.coordinates) {
        west = Math.min(west, longitude)
        south = Math.min(south, latitude)
        east = Math.max(east, longitude)
        north = Math.max(north, latitude)
      }
    }
    offset += slice.length
    const bounds =
      features.length === 0
        ? null
        : ([
            [west, south],
            [east, north],
          ] as RideMapData['bounds'])
    drawRides(
      map,
      {
        geojson: { type: 'FeatureCollection', features: features.slice() },
        bounds,
      },
      color,
      hide,
    )
    onBounds?.(bounds)
    if (offset < ordered.length) {
      state.current.frame = requestAnimationFrame(() => {
        state.current.frame = null
        if (state.current.gen !== gen) return
        step()
      })
    }
  }
  step()
}

function queueSpeedLines(
  map: mapboxgl.Map,
  state: DrawQueueState,
  lines: RideSpeedLine[],
  slotted: boolean,
  visible: boolean,
) {
  cancelDrawQueue(state)
  const gen = state.current.gen
  drawSpeedLines(map, lines, slotted, visible, (next) => {
    if (state.current.gen !== gen) return
    state.current.frame = requestAnimationFrame(() => {
      state.current.frame = null
      if (state.current.gen !== gen) return
      next()
    })
  })
}

function speedLayerBeforeId(
  map: mapboxgl.Map,
  id: number,
  newestFirstIds: number[],
) {
  const index = newestFirstIds.indexOf(id)
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const newer = newestFirstIds[cursor]
    if (newer == null) continue
    const layerId = `ride-speed-${newer}`
    if (map.getLayer(layerId)) return layerId
  }
}

function drawSpeedLines(
  map: mapboxgl.Map,
  lines: RideSpeedLine[],
  slotted: boolean,
  visible: boolean,
  schedule: (next: () => void) => void,
) {
  if (!styleReady(map)) return
  const keep = new Set(lines.map((line) => line.id))
  for (const layer of map.getStyle()?.layers ?? []) {
    if (!layer.id.startsWith('ride-speed-')) continue
    const id = Number(layer.id.slice('ride-speed-'.length))
    if (keep.has(id)) continue
    map.removeLayer(layer.id)
    const source = `ride-speed-${id}`
    if (map.getSource(source)) map.removeSource(source)
  }
  const newestFirstIds = lines.map((line) => line.id)
  let offset = 0
  const step = () => {
    const slice = lines.slice(offset, offset + RIDE_DRAW_CHUNK)
    for (const line of slice) {
      upsertSpeedLine(map, line, newestFirstIds, slotted, visible)
    }
    offset += slice.length
    if (offset < lines.length) schedule(step)
  }
  step()
}

function upsertSpeedLine(
  map: mapboxgl.Map,
  line: RideSpeedLine,
  newestFirstIds: number[],
  slotted: boolean,
  visible: boolean,
) {
  const sourceId = `ride-speed-${line.id}`
  const layerId = `ride-speed-${line.id}`
  const data: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: { id: line.id },
    geometry: { type: 'LineString', coordinates: line.coordinates },
  }
  const source = map.getSource(sourceId)
  if (source && source.type === 'geojson') source.setData(data)
  else map.addSource(sourceId, { type: 'geojson', data, lineMetrics: true })
  const gradient: mapboxgl.ExpressionSpecification = [
    'interpolate',
    ['linear'],
    ['line-progress'],
    ...line.stops,
  ]
  if (!map.getLayer(layerId)) {
    const beforeId = speedLayerBeforeId(map, line.id, newestFirstIds)
    const layer = {
      id: layerId,
      type: 'line' as const,
      source: sourceId,
      ...(slotted ? { slot: 'top' as const } : {}),
      layout: { 'line-join': 'round' as const, 'line-cap': 'round' as const },
      paint: {
        'line-width': RIDE_LINE,
        'line-width-transition': { duration: 150 },
        'line-opacity': 0.9,
        'line-gradient': gradient,
      },
    }
    if (beforeId) map.addLayer(layer, beforeId)
    else map.addLayer(layer)
  } else {
    map.setPaintProperty(layerId, 'line-gradient', gradient)
  }
  map.setLayoutProperty(
    layerId,
    'visibility',
    visible && line.stops.length >= 4 ? 'visible' : 'none',
  )
}
