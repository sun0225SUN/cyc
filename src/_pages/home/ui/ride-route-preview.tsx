'use client'

import { Expand, Layers, Shrink, ZoomIn, ZoomOut } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Activity, LngLatBounds, RideLap } from '@/entities/activity'
import { type RideMapStyleId, rideMapStyle } from '@/shared/config/mapbox'
import { accentColor, appearanceFromDocument } from '@/shared/config/theme'
import {
  coordinatesBounds,
  type LapPath,
  routeCoordinates,
  splitLapPaths,
} from '../model/lap-route'
import { RideMapLayers } from './ride-map-layers'
import './ride-route-preview.css'

const MAP_CONTROL =
  'grid size-11 cursor-pointer place-items-center transition-colors hover:bg-white active:bg-white dark:hover:bg-black/85 dark:active:bg-black/85'
const MAP_CONTROL_CHIP = `${MAP_CONTROL} rounded-2xl bg-white/85 shadow-lg backdrop-blur-md dark:bg-black/70`

const SOURCE_ID = 'detail-laps'
const LAYER_ID = 'detail-laps'
const CASING_ID = 'detail-laps-casing'

function styleUsesSlot(id: RideMapStyleId) {
  return id === 'standard' || id === 'standardSatellite'
}

const FIT = {
  padding: { top: 40, right: 72, bottom: 40, left: 40 },
  maxZoom: 18,
} as const

function fitMap(
  map: mapboxgl.Map,
  bounds: LngLatBounds | null | undefined,
  duration: number,
) {
  if (!bounds) return
  const { clientWidth, clientHeight } = map.getContainer()
  if (clientWidth < 32 || clientHeight < 32) return
  map.fitBounds(bounds, { ...FIT, duration })
}

type RideRoutePreviewProps = {
  activity: Activity
  laps?: RideLap[]
  selectedLap?: number | null
  token: string
  onSelectLap?: (index: number | null) => void
}

function motionDuration() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450
}

function lapCollection(
  paths: LapPath[],
): GeoJSON.FeatureCollection<GeoJSON.LineString, { index: number }> {
  return {
    type: 'FeatureCollection',
    features: paths.map((path) => ({
      type: 'Feature',
      id: path.index,
      properties: { index: path.index },
      geometry: { type: 'LineString', coordinates: path.coordinates },
    })),
  }
}

function selectedExpr(
  selected: number | null,
  on: number,
  off: number,
): number | mapboxgl.ExpressionSpecification {
  if (selected == null) return off
  return ['case', ['==', ['get', 'index'], selected], on, off]
}

function styleReady(map: mapboxgl.Map) {
  try {
    return Boolean(map.getStyle())
  } catch {
    return false
  }
}

function syncLapSource(map: mapboxgl.Map, paths: LapPath[]) {
  if (!styleReady(map) || paths.length === 0) return
  const data = lapCollection(paths)
  const source = map.getSource(SOURCE_ID)
  if (source && source.type === 'geojson') {
    source.setData(data)
    return
  }
  map.addSource(SOURCE_ID, { type: 'geojson', data, promoteId: 'index' })
}

function styleLaps(
  map: mapboxgl.Map,
  selected: number | null,
  color: string,
  slotted: boolean,
) {
  if (!styleReady(map) || !map.getSource(SOURCE_ID)) return
  const slot = slotted ? ('top' as const) : undefined
  const line = {
    type: 'line' as const,
    source: SOURCE_ID,
    ...(slot ? { slot } : {}),
    layout: { 'line-join': 'round' as const, 'line-cap': 'round' as const },
  }
  if (!map.getLayer(CASING_ID)) {
    map.addLayer({
      ...line,
      id: CASING_ID,
      paint: {
        'line-color': color,
        'line-width': 11,
        'line-opacity': 0.28,
      },
    })
  }
  if (!map.getLayer(LAYER_ID)) {
    map.addLayer({
      ...line,
      id: LAYER_ID,
      paint: {
        'line-color': color,
        'line-width': 4,
        'line-opacity': 0.95,
      },
    })
  }
  map.setFilter(
    CASING_ID,
    selected == null
      ? ['==', ['get', 'index'], -1]
      : ['==', ['get', 'index'], selected],
  )
  map.setPaintProperty(LAYER_ID, 'line-color', color)
  map.setPaintProperty(
    LAYER_ID,
    'line-width',
    selectedExpr(selected, 6.5, selected == null ? 4 : 2),
  )
  map.setPaintProperty(
    LAYER_ID,
    'line-opacity',
    selectedExpr(selected, 1, selected == null ? 0.95 : 0.18),
  )
  map.setLayoutProperty(LAYER_ID, 'line-sort-key', selectedExpr(selected, 2, 0))
  map.setPaintProperty(CASING_ID, 'line-color', color)
  map.moveLayer(LAYER_ID)
}

function paintLaps(
  map: mapboxgl.Map,
  paths: LapPath[],
  selected: number | null,
  color: string,
  slotted: boolean,
) {
  syncLapSource(map, paths)
  styleLaps(map, selected, color, slotted)
}

export function RideRoutePreview({
  activity,
  laps = [],
  selectedLap = null,
  token,
  onSelectLap,
}: RideRoutePreviewProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const appliedStyleRef = useRef('')
  const t = useTranslations('map')
  const tDetail = useTranslations('rideDetail')
  const { resolvedTheme } = useTheme()
  const [styleId, setStyleId] = useState<RideMapStyleId>(() =>
    appearanceFromDocument() === 'dark' ? 'dark' : 'light',
  )
  const [showLaps, setShowLaps] = useState(true)
  const [showEnds, setShowEnds] = useState(true)
  const [layersOpen, setLayersOpen] = useState(false)
  const route = useMemo(
    () => routeCoordinates(activity.summary_polyline),
    [activity.summary_polyline],
  )
  const paths = useMemo(() => splitLapPaths(route, laps), [laps, route])
  const selectedPath = useMemo(() => {
    if (selectedLap == null) return null
    return paths.find((path) => path.index === selectedLap)?.coordinates ?? null
  }, [paths, selectedLap])
  const focus = useMemo(
    () =>
      selectedPath && selectedPath.length >= 2
        ? coordinatesBounds(selectedPath)
        : coordinatesBounds(route),
    [route, selectedPath],
  )
  const slot = styleUsesSlot(styleId)
  const mapDataRef = useRef({
    paths,
    focus,
    selectedLap,
    slot,
  })
  mapDataRef.current = { paths, focus, selectedLap, slot }
  const labels = useMemo(
    () => ({
      start: tDetail('start'),
      end: tDetail('end'),
      lap: tDetail('lap'),
    }),
    [tDetail],
  )
  const selectedLapRef = useRef(selectedLap)
  selectedLapRef.current = selectedLap
  const markerStateRef = useRef({
    laps,
    labels,
    paths,
    route,
    selectedLapRef,
    onSelectLap,
    showLaps,
    showEnds,
  })
  markerStateRef.current = {
    laps,
    labels,
    paths,
    route,
    selectedLapRef,
    onSelectLap,
    showLaps,
    showEnds,
  }
  const dark = resolvedTheme === 'dark'
  const appearance = dark ? 'dark' : 'light'
  const darkRef = useRef(dark)
  darkRef.current = dark
  const center = route[0] ?? [120.15, 30.28]

  useEffect(() => {
    const container = containerRef.current
    if (!container || !token) return

    mapboxgl.accessToken = token
    const bounds = mapDataRef.current.focus
    const initialStyle: RideMapStyleId =
      appearanceFromDocument() === 'dark' ? 'dark' : 'light'
    appliedStyleRef.current = initialStyle
    const map = new mapboxgl.Map({
      container,
      style: rideMapStyle(initialStyle) as string | mapboxgl.StyleSpecification,
      projection: 'mercator',
      ...(bounds
        ? { bounds, fitBoundsOptions: { ...FIT, duration: 0 } }
        : { center: [105, 30] as [number, number], zoom: 4 }),
      interactive: true,
      attributionControl: false,
    })
    mapRef.current = map

    const draw = () => {
      const next = mapDataRef.current
      paintLaps(
        map,
        next.paths,
        next.selectedLap,
        accentColor(darkRef.current ? 'dark' : 'light'),
        next.slot,
      )
      paintMarkers(map, markersRef, markerStateRef.current)
      fitMap(map, next.focus, 0)
    }

    map.on('style.load', draw)
    map.on('load', draw)
    if (styleReady(map)) draw()
    let width = 0
    let height = 0
    const resize = new ResizeObserver(() => {
      const nextWidth = container.clientWidth
      const nextHeight = container.clientHeight
      if (nextWidth === width && nextHeight === height) return
      const first = width < 32 || height < 32
      width = nextWidth
      height = nextHeight
      map.resize()
      if (first) fitMap(map, mapDataRef.current.focus, 0)
    })
    resize.observe(container)

    return () => {
      resize.disconnect()
      clearMarkers(markersRef.current)
      markersRef.current = []
      mapRef.current = null
      map.remove()
    }
  }, [token])

  useEffect(() => {
    const map = mapRef.current
    const key = styleId === 'privacy' ? `privacy:${dark}` : styleId
    if (!map || appliedStyleRef.current === key) return
    appliedStyleRef.current = key
    map.setStyle(
      rideMapStyle(styleId, appearance, {
        route: [],
        color: accentColor(appearance),
      }) as string | mapboxgl.StyleSpecification,
    )
  }, [appearance, dark, styleId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    syncLapSource(map, paths)
  }, [paths])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    styleLaps(map, selectedLap, accentColor(appearance), slot)
  }, [appearance, selectedLap, slot])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const frame = requestAnimationFrame(() => {
      fitMap(map, focus, motionDuration())
    })
    return () => cancelAnimationFrame(frame)
  }, [focus])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    paintMarkers(map, markersRef, {
      laps,
      labels,
      paths,
      route,
      selectedLapRef,
      onSelectLap,
      showLaps,
      showEnds,
    })
  }, [labels, laps, onSelectLap, paths, route, showEnds, showLaps])

  useEffect(() => {
    const sync = () => setFullscreen(isFullscreen(frameRef.current))
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const zoomBy = useCallback((delta: number) => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ zoom: map.getZoom() + delta, duration: 200 })
  }, [])

  const toggleFullscreen = useCallback(() => {
    const frame = frameRef.current
    if (!frame) return
    if (isFullscreen(frame)) {
      void exitFullscreen()
      return
    }
    void requestFullscreen(frame)
  }, [])

  if (!token) {
    return <div className='bg-muted h-full w-full' />
  }

  return (
    <div
      ref={frameRef}
      className='bg-background relative h-full w-full overflow-hidden'
    >
      <div ref={containerRef} className='ride-route-preview h-full w-full' />
      <div
        data-ride-map-controls
        className='absolute right-5 bottom-5 z-10 flex flex-col items-end gap-3'
      >
        <button
          type='button'
          onClick={() => setLayersOpen((value) => !value)}
          aria-label={t('layers')}
          aria-expanded={layersOpen}
          data-umami-event='ride-map-layers'
          className={MAP_CONTROL_CHIP}
        >
          <Layers size={20} strokeWidth={2.25} />
        </button>
        <div className='flex flex-col overflow-hidden rounded-full bg-white/85 shadow-lg backdrop-blur-md dark:bg-black/70'>
          <button
            type='button'
            onClick={() => zoomBy(1)}
            aria-label={t('zoomIn')}
            data-umami-event='ride-zoom-in'
            className={MAP_CONTROL}
          >
            <ZoomIn size={20} strokeWidth={2.25} />
          </button>
          <button
            type='button'
            onClick={() => zoomBy(-1)}
            aria-label={t('zoomOut')}
            data-umami-event='ride-zoom-out'
            className={MAP_CONTROL}
          >
            <ZoomOut size={20} strokeWidth={2.25} />
          </button>
        </div>
        <button
          type='button'
          onClick={toggleFullscreen}
          aria-label={t(fullscreen ? 'exitFullscreen' : 'fullscreen')}
          aria-pressed={fullscreen}
          data-umami-event='ride-map-fullscreen'
          className={MAP_CONTROL_CHIP}
        >
          {fullscreen ? (
            <Shrink size={20} strokeWidth={2.25} />
          ) : (
            <Expand size={20} strokeWidth={2.25} />
          )}
        </button>
      </div>
      <RideMapLayers
        token={token}
        center={center}
        styleId={styleId}
        onStyleId={setStyleId}
        showLaps={showLaps}
        onShowLaps={setShowLaps}
        showEnds={showEnds}
        onShowEnds={setShowEnds}
        open={layersOpen}
        onOpenChange={setLayersOpen}
      />
    </div>
  )
}

type MarkerState = {
  laps: RideLap[]
  labels: { start: string; end: string; lap: string }
  paths: LapPath[]
  route: [number, number][]
  selectedLapRef: { current: number | null }
  onSelectLap?: (index: number | null) => void
  showLaps: boolean
  showEnds: boolean
}

function paintMarkers(
  map: mapboxgl.Map,
  markersRef: { current: mapboxgl.Marker[] },
  state: MarkerState,
) {
  clearMarkers(markersRef.current)
  markersRef.current = placeMarkers(map, state)
}

function placeMarkers(map: mapboxgl.Map, state: MarkerState) {
  const markers: mapboxgl.Marker[] = []
  const start = state.route[0]
  const end = state.route.at(-1)
  if (state.showEnds && start) {
    markers.push(
      marker(map, start, 'ride-marker ride-marker-start', state.labels.start),
    )
  }
  if (state.showEnds && end) {
    markers.push(
      marker(map, end, 'ride-marker ride-marker-end', state.labels.end),
    )
  }
  if (!state.showLaps) return markers
  for (const lap of state.laps) {
    const at = lapMarkerPoint(lap, state.paths)
    if (!at) continue
    const item = marker(
      map,
      at,
      'ride-marker ride-marker-lap',
      String(lap.index),
      `${state.labels.lap} ${lap.index}`,
    )
    item.getElement().style.cursor = 'pointer'
    item.getElement().addEventListener('click', (event) => {
      event.stopPropagation()
      const selected = state.selectedLapRef.current
      state.onSelectLap?.(lap.index === selected ? null : lap.index)
    })
    markers.push(item)
  }
  return markers
}

function lapMarkerPoint(
  lap: RideLap,
  paths: LapPath[],
): [number, number] | null {
  if (lap.lng != null && lap.lat != null) return [lap.lng, lap.lat]
  return (
    paths.find((path) => path.index === lap.index)?.coordinates.at(-1) ?? null
  )
}

function marker(
  map: mapboxgl.Map,
  lngLat: [number, number],
  className: string,
  text: string,
  title = text,
) {
  const element = document.createElement('div')
  element.className = className
  element.textContent = text
  element.title = title
  return new mapboxgl.Marker({ element, anchor: 'center' })
    .setLngLat(lngLat)
    .addTo(map)
}

function clearMarkers(markers: mapboxgl.Marker[]) {
  for (const item of markers) item.remove()
}

type FullscreenNode = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

function fullscreenElement() {
  const doc = document as FullscreenDocument
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

function isFullscreen(element: Element | null) {
  return element != null && fullscreenElement() === element
}

function requestFullscreen(element: FullscreenNode) {
  if (element.requestFullscreen) return element.requestFullscreen()
  if (element.webkitRequestFullscreen) return element.webkitRequestFullscreen()
}

function exitFullscreen() {
  const doc = document as FullscreenDocument
  if (doc.exitFullscreen) return doc.exitFullscreen()
  if (doc.webkitExitFullscreen) return doc.webkitExitFullscreen()
}
