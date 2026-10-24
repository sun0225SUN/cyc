'use client'

import { Expand, Layers, Shrink, ZoomIn, ZoomOut } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Activity,
  activitiesToGeoJson,
  type RideLap,
} from '@/entities/activity'
import { type RideMapStyleId, rideMapStyle } from '@/shared/config/mapbox'
import { accentColor, appearanceFromDocument } from '@/shared/config/theme'
import {
  coordinatesBounds,
  lapCoordinates,
  routeCoordinates,
} from '../model/lap-route'
import { RideMapLayers } from './ride-map-layers'
import './ride-route-preview.css'

const MAP_CONTROL =
  'grid size-11 cursor-pointer place-items-center transition-colors hover:bg-white active:bg-white dark:hover:bg-black/85 dark:active:bg-black/85'
const MAP_CONTROL_CHIP = `${MAP_CONTROL} rounded-2xl bg-white/85 shadow-lg backdrop-blur-md dark:bg-black/70`

const SOURCE_ID = 'detail-ride'
const LAYER_ID = 'detail-ride'
const LAP_SOURCE_ID = 'detail-ride-lap'
const LAP_LAYER_ID = 'detail-ride-lap'
const FIT = { padding: 48, maxZoom: 16 } as const

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

function lineLayer(
  id: string,
  source: string,
  color: string,
  width: number,
  opacity: number,
): mapboxgl.LineLayerSpecification {
  return {
    id,
    type: 'line',
    source,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': color,
      'line-width': width,
      'line-opacity': opacity,
    },
  }
}

function setLine(
  map: mapboxgl.Map,
  sourceId: string,
  layerId: string,
  coordinates: [number, number][],
  color: string,
  width: number,
  opacity: number,
) {
  if (!map.isStyleLoaded() || coordinates.length < 2) return
  const data: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  }
  const source = map.getSource(sourceId)
  if (source && source.type === 'geojson') {
    source.setData(data)
  } else {
    map.addSource(sourceId, { type: 'geojson', data })
  }
  if (map.getLayer(layerId)) {
    map.setPaintProperty(layerId, 'line-color', color)
    map.setPaintProperty(layerId, 'line-width', width)
    map.setPaintProperty(layerId, 'line-opacity', opacity)
    return
  }
  map.addLayer(lineLayer(layerId, sourceId, color, width, opacity))
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
  const mapData = useMemo(() => activitiesToGeoJson([activity]), [activity])
  const selectedPath = useMemo(
    () =>
      selectedLap == null
        ? []
        : lapCoordinates(activity.summary_polyline, laps, selectedLap),
    [activity.summary_polyline, laps, selectedLap],
  )
  const focus = useMemo(
    () =>
      selectedPath.length >= 2
        ? coordinatesBounds(selectedPath)
        : mapData.bounds,
    [mapData.bounds, selectedPath],
  )
  const mapDataRef = useRef({ mapData, selectedPath, focus, selectedLap })
  mapDataRef.current = { mapData, selectedPath, focus, selectedLap }
  const labels = useMemo(
    () => ({
      start: tDetail('start'),
      end: tDetail('end'),
      lap: tDetail('lap'),
    }),
    [tDetail],
  )
  const markerStateRef = useRef({
    activity,
    laps,
    labels,
    selectedLap,
    onSelectLap,
    showLaps,
    showEnds,
  })
  markerStateRef.current = {
    activity,
    laps,
    labels,
    selectedLap,
    onSelectLap,
    showLaps,
    showEnds,
  }
  const dark = resolvedTheme === 'dark'
  const appearance = dark ? 'dark' : 'light'
  const darkRef = useRef(dark)
  darkRef.current = dark
  const center = routeCoordinates(activity.summary_polyline)[0] ?? [
    120.15, 30.28,
  ]

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
      const markers = markerStateRef.current
      applyFocus(map, next.mapData, next.selectedPath, darkRef.current)
      paintMarkers(map, markersRef, markers)
    }

    map.on('style.load', draw)
    map.on('load', draw)
    const resize = new ResizeObserver(() => map.resize())
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
        route:
          mapDataRef.current.mapData.geojson.features[0]?.geometry
            .coordinates ?? [],
        color: accentColor(appearance),
      }) as string | mapboxgl.StyleSpecification,
    )
  }, [appearance, dark, styleId])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    applyFocus(map, mapData, selectedPath, dark)
  }, [dark, mapData, selectedPath])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    paintMarkers(map, markersRef, {
      activity,
      laps,
      labels,
      selectedLap,
      onSelectLap,
      showLaps,
      showEnds,
    })
  }, [activity, labels, laps, onSelectLap, selectedLap, showEnds, showLaps])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded() || !focus) return
    map.fitBounds(focus, {
      ...FIT,
      duration: motionDuration(),
    })
  }, [focus])

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

function applyFocus(
  map: mapboxgl.Map,
  mapData: ReturnType<typeof activitiesToGeoJson>,
  selectedPath: [number, number][],
  dark: boolean,
) {
  const color = accentColor(dark ? 'dark' : 'light')
  const full = mapData.geojson.features[0]?.geometry.coordinates ?? []
  const focused = selectedPath.length >= 2
  setLine(
    map,
    SOURCE_ID,
    LAYER_ID,
    full,
    color,
    focused ? 3 : 4,
    focused ? 0.28 : 0.95,
  )
  if (focused) {
    setLine(map, LAP_SOURCE_ID, LAP_LAYER_ID, selectedPath, color, 5, 1)
    return
  }
  if (map.getLayer(LAP_LAYER_ID)) map.removeLayer(LAP_LAYER_ID)
  if (map.getSource(LAP_SOURCE_ID)) map.removeSource(LAP_SOURCE_ID)
}

function paintMarkers(
  map: mapboxgl.Map,
  markersRef: { current: mapboxgl.Marker[] },
  state: {
    activity: Activity
    laps: RideLap[]
    labels: { start: string; end: string; lap: string }
    selectedLap: number | null
    onSelectLap?: (index: number | null) => void
    showLaps: boolean
    showEnds: boolean
  },
) {
  clearMarkers(markersRef.current)
  markersRef.current = placeMarkers(
    map,
    state.activity,
    state.laps,
    state.labels,
    state.selectedLap,
    state.onSelectLap,
    state.showLaps,
    state.showEnds,
  )
}

function placeMarkers(
  map: mapboxgl.Map,
  activity: Activity,
  laps: RideLap[],
  labels: { start: string; end: string; lap: string },
  selectedLap: number | null,
  onSelectLap: ((index: number | null) => void) | undefined,
  showLaps: boolean,
  showEnds: boolean,
) {
  const markers: mapboxgl.Marker[] = []
  const route = routeCoordinates(activity.summary_polyline)
  const start = route[0]
  const end = route.at(-1)
  if (showEnds && start) {
    markers.push(
      marker(map, start, 'ride-marker ride-marker-start', labels.start),
    )
  }
  if (showEnds && end) {
    markers.push(marker(map, end, 'ride-marker ride-marker-end', labels.end))
  }
  if (!showLaps) return markers
  for (const lap of laps) {
    const at = lapPoint(activity.summary_polyline, laps, lap)
    if (!at) continue
    const item = marker(
      map,
      at,
      [
        'ride-marker ride-marker-lap',
        lap.index === selectedLap ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' '),
      String(lap.index),
      `${labels.lap} ${lap.index}`,
    )
    item.getElement().style.cursor = 'pointer'
    item.getElement().addEventListener('click', (event) => {
      event.stopPropagation()
      onSelectLap?.(lap.index === selectedLap ? null : lap.index)
    })
    markers.push(item)
  }
  return markers
}

function lapPoint(
  polyline: string,
  laps: RideLap[],
  lap: RideLap,
): [number, number] | null {
  if (lap.lng != null && lap.lat != null) return [lap.lng, lap.lat]
  return lapCoordinates(polyline, laps, lap.index).at(-1) ?? null
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
