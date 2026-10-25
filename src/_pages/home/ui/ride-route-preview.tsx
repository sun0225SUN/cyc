'use client'

import { Expand, Layers, Shrink, ZoomIn, ZoomOut } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Activity,
  type LngLatBounds,
  presentLaps,
  privacyCut,
  type RideLap,
  type RideStreams,
} from '@/entities/activity'
import { type RideMapStyleId, rideMapStyle } from '@/shared/config/mapbox'
import { privacyMode } from '@/shared/config/privacy'
import {
  accentColor,
  appearanceFromDocument,
  themeAccentOn,
} from '@/shared/config/theme'
import { useThemeAppearance } from '@/shared/lib/use-theme-appearance'
import {
  coordinatesBounds,
  type LapPath,
  routeCoordinates,
  routeDistances,
  splitLapPaths,
} from '../model/lap-route'
import {
  hasSpeedValues,
  lapOrigins,
  SPEED_GRADIENT,
  SPEED_MAX_KMH,
  speedLineStops,
} from '../model/speed-route'
import { RideMapLayers } from './ride-map-layers'
import './ride-route-preview.css'

const MAP_CONTROL =
  'grid size-11 cursor-pointer place-items-center transition-colors hover:bg-white active:bg-white dark:hover:bg-black/85 dark:active:bg-black/85'
const MAP_CONTROL_CHIP = `${MAP_CONTROL} rounded-2xl bg-white/85 shadow-lg backdrop-blur-md dark:bg-black/70`

const SOURCE_ID = 'detail-laps'
const LAYER_ID = 'detail-laps'
const CASING_ID = 'detail-laps-casing'
const HIT_ID = 'detail-laps-hit'
const SPEED_SOURCE = 'detail-speed'
const SPEED_LAYER = 'detail-speed'
const SPEED_FOCUS_SOURCE = 'detail-speed-focus'
const SPEED_FOCUS_LAYER = 'detail-speed-focus'
const HIT_PAD = 10

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
  streams?: RideStreams
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

function lineCollection(
  coordinates: [number, number][],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features:
      coordinates.length < 2
        ? []
        : [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates },
            },
          ],
  }
}

function speedGradient(
  stops: Array<number | string>,
): mapboxgl.ExpressionSpecification {
  return ['interpolate', ['linear'], ['line-progress'], ...stops]
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

function syncLapSource(
  map: mapboxgl.Map,
  data: GeoJSON.FeatureCollection<GeoJSON.LineString>,
) {
  if (!styleReady(map) || data.features.length === 0) return
  const source = map.getSource(SOURCE_ID)
  if (source && source.type === 'geojson') {
    source.setData(data)
    return
  }
  map.addSource(SOURCE_ID, { type: 'geojson', data })
}

function syncSpeedSource(
  map: mapboxgl.Map,
  id: string,
  coordinates: [number, number][],
) {
  if (!styleReady(map)) return
  const data = lineCollection(coordinates)
  const source = map.getSource(id)
  if (source && source.type === 'geojson') {
    source.setData(data)
    return
  }
  if (data.features.length === 0) return
  map.addSource(id, { type: 'geojson', data, lineMetrics: true })
}

function ensureSpeedLayer(
  map: mapboxgl.Map,
  id: string,
  source: string,
  slotted: boolean,
  width: number,
  opacity: number,
  stops: Array<number | string>,
) {
  if (stops.length < 4 || !map.getSource(source)) return
  const slot = slotted ? ('top' as const) : undefined
  if (!map.getLayer(id)) {
    map.addLayer({
      id,
      type: 'line',
      source,
      ...(slot ? { slot } : {}),
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-width': width,
        'line-opacity': opacity,
        'line-gradient': speedGradient(stops),
      },
    })
    return
  }
  map.setPaintProperty(id, 'line-gradient', speedGradient(stops))
  map.setPaintProperty(id, 'line-width', width)
  map.setPaintProperty(id, 'line-opacity', opacity)
  map.setLayoutProperty(id, 'visibility', 'visible')
}

function hideLayer(map: mapboxgl.Map, id: string) {
  if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
}

function styleLaps(
  map: mapboxgl.Map,
  selected: number | null,
  color: string,
  slotted: boolean,
  colorBySpeed: boolean,
  speedStops: Array<number | string>,
  focusLine: [number, number][],
  focusStops: Array<number | string>,
) {
  if (!styleReady(map) || !map.getSource(SOURCE_ID)) return
  const slot = slotted ? ('top' as const) : undefined
  const line = {
    type: 'line' as const,
    source: SOURCE_ID,
    ...(slot ? { slot } : {}),
    layout: { 'line-join': 'round' as const, 'line-cap': 'round' as const },
  }
  if (!map.getLayer(HIT_ID)) {
    map.addLayer({
      ...line,
      id: HIT_ID,
      paint: {
        'line-color': color,
        'line-width': 18,
        'line-opacity': 0,
      },
    })
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
    colorBySpeed
      ? 0
      : selectedExpr(selected, 1, selected == null ? 0.95 : 0.18),
  )
  map.setLayoutProperty(LAYER_ID, 'line-sort-key', selectedExpr(selected, 2, 0))
  map.setPaintProperty(CASING_ID, 'line-color', color)
  if (colorBySpeed && speedStops.length >= 4) {
    ensureSpeedLayer(
      map,
      SPEED_LAYER,
      SPEED_SOURCE,
      slotted,
      selected == null ? 4 : 2.5,
      selected == null ? 0.95 : 0.22,
      speedStops,
    )
    if (selected != null && focusLine.length >= 2 && focusStops.length >= 4) {
      syncSpeedSource(map, SPEED_FOCUS_SOURCE, focusLine)
      ensureSpeedLayer(
        map,
        SPEED_FOCUS_LAYER,
        SPEED_FOCUS_SOURCE,
        slotted,
        6.5,
        1,
        focusStops,
      )
      map.moveLayer(SPEED_FOCUS_LAYER)
    } else {
      hideLayer(map, SPEED_FOCUS_LAYER)
    }
    map.moveLayer(SPEED_LAYER)
    if (map.getLayer(SPEED_FOCUS_LAYER)) map.moveLayer(SPEED_FOCUS_LAYER)
  } else {
    hideLayer(map, SPEED_LAYER)
    hideLayer(map, SPEED_FOCUS_LAYER)
  }
  map.moveLayer(LAYER_ID)
}

function lapIndexAt(map: mapboxgl.Map, point: mapboxgl.Point) {
  if (!styleReady(map)) return null
  const layers = [HIT_ID, LAYER_ID, CASING_ID].filter((id) => map.getLayer(id))
  if (layers.length === 0) return null
  const features = map.queryRenderedFeatures(
    [
      [point.x - HIT_PAD, point.y - HIT_PAD],
      [point.x + HIT_PAD, point.y + HIT_PAD],
    ],
    { layers },
  )
  const raw = features[0]?.properties?.index
  const index = typeof raw === 'number' ? raw : Number(raw)
  return Number.isInteger(index) && index > 0 ? index : null
}

function bindLapLineSelect(
  map: mapboxgl.Map,
  selectedLapRef: { current: number | null },
  onSelectLapRef: { current: RideRoutePreviewProps['onSelectLap'] },
) {
  const onClick = (event: mapboxgl.MapMouseEvent) => {
    const target = event.originalEvent.target
    if (
      target instanceof Element &&
      target.closest('[data-ride-map-controls], .ride-marker')
    ) {
      return
    }
    const index = lapIndexAt(map, event.point)
    if (index == null) return
    const selected = selectedLapRef.current
    onSelectLapRef.current?.(index === selected ? null : index)
  }
  const onMove = (event: mapboxgl.MapMouseEvent) => {
    map.getCanvas().style.cursor =
      lapIndexAt(map, event.point) == null ? '' : 'pointer'
  }
  map.on('click', onClick)
  map.on('mousemove', onMove)
  return () => {
    map.off('click', onClick)
    map.off('mousemove', onMove)
    map.getCanvas().style.cursor = ''
  }
}

function paintLaps(
  map: mapboxgl.Map,
  data: GeoJSON.FeatureCollection<GeoJSON.LineString>,
  selected: number | null,
  color: string,
  slotted: boolean,
  colorBySpeed: boolean,
  route: [number, number][],
  speedStops: Array<number | string>,
  focusLine: [number, number][],
  focusStops: Array<number | string>,
) {
  syncLapSource(map, data)
  if (colorBySpeed) syncSpeedSource(map, SPEED_SOURCE, route)
  styleLaps(
    map,
    selected,
    color,
    slotted,
    colorBySpeed,
    speedStops,
    focusLine,
    focusStops,
  )
}

export function RideRoutePreview({
  activity,
  laps = [],
  streams,
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
  const appearance = useThemeAppearance()
  const [styleId, setStyleId] = useState<RideMapStyleId>(() =>
    appearanceFromDocument() === 'dark' ? 'dark' : 'light',
  )
  const [showLaps, setShowLaps] = useState(true)
  const [showEnds, setShowEnds] = useState(true)
  const [colorBySpeed, setColorBySpeed] = useState(true)
  const [layersOpen, setLayersOpen] = useState(false)

  useEffect(() => {
    setStyleId((current) =>
      current === 'light' || current === 'dark' ? appearance : current,
    )
  }, [appearance])

  const route = useMemo(
    () => routeCoordinates(activity.summary_polyline),
    [activity.summary_polyline],
  )
  const cut = useMemo(
    () => privacyCut(routeDistances(route).at(-1) ?? 0),
    [route],
  )
  const visibleLaps = useMemo(
    () => presentLaps(laps, cut.originMeters, cut.totalMeters),
    [cut.originMeters, cut.totalMeters, laps],
  )
  const showEndMarkers = !privacyMode && showEnds
  const paths = useMemo(
    () => splitLapPaths(route, visibleLaps),
    [route, visibleLaps],
  )
  const canColorBySpeed = hasSpeedValues(streams?.speed)
  const lapMarkerAppearance =
    canColorBySpeed && colorBySpeed ? 'dark' : appearance
  const lapMarkerColor = accentColor(lapMarkerAppearance)
  const lapMarkerTextColor = themeAccentOn[lapMarkerAppearance]
  const track = useMemo(() => lapCollection(paths), [paths])
  const speedStops = useMemo(
    () =>
      canColorBySpeed
        ? speedLineStops(
            route,
            streams?.distance,
            streams?.speed,
            cut.originMeters > 0
              ? {
                  origin: cut.originMeters,
                  routeTotal: cut.totalMeters,
                }
              : undefined,
          )
        : [],
    [
      canColorBySpeed,
      cut.originMeters,
      cut.totalMeters,
      route,
      streams?.distance,
      streams?.speed,
    ],
  )
  const selectedPath = useMemo(() => {
    if (selectedLap == null) return null
    return paths.find((path) => path.index === selectedLap)?.coordinates ?? null
  }, [paths, selectedLap])
  const focusStops = useMemo(() => {
    if (!canColorBySpeed || !selectedPath || selectedLap == null) return []
    const total = routeDistances(route).at(-1) ?? 0
    const lapOrigin = lapOrigins(visibleLaps, total).get(selectedLap) ?? 0
    return speedLineStops(selectedPath, streams?.distance, streams?.speed, {
      origin: cut.originMeters + lapOrigin,
      routeTotal: cut.originMeters > 0 ? cut.totalMeters : total,
    })
  }, [
    canColorBySpeed,
    cut.originMeters,
    cut.totalMeters,
    route,
    selectedLap,
    selectedPath,
    streams?.distance,
    streams?.speed,
    visibleLaps,
  ])
  const focus = useMemo(
    () =>
      selectedPath && selectedPath.length >= 2
        ? coordinatesBounds(selectedPath)
        : coordinatesBounds(route),
    [route, selectedPath],
  )
  const mapDataRef = useRef({
    track,
    colorBySpeed,
    focus,
    selectedLap,
    slot: false,
    route,
    speedStops,
    selectedPath,
    focusStops,
  })
  mapDataRef.current = {
    track,
    colorBySpeed,
    focus,
    selectedLap,
    slot: false,
    route,
    speedStops,
    selectedPath,
    focusStops,
  }
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
  const onSelectLapRef = useRef(onSelectLap)
  onSelectLapRef.current = onSelectLap
  const markerStateRef = useRef({
    laps: visibleLaps,
    labels,
    paths,
    route,
    selectedLapRef,
    onSelectLap,
    lapMarkerColor,
    lapMarkerTextColor,
    showLaps,
    showEnds: showEndMarkers,
  })
  markerStateRef.current = {
    laps: visibleLaps,
    labels,
    paths,
    route,
    selectedLapRef,
    onSelectLap,
    lapMarkerColor,
    lapMarkerTextColor,
    showLaps,
    showEnds: showEndMarkers,
  }
  const dark = appearance === 'dark'
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
        next.track,
        next.selectedLap,
        accentColor(darkRef.current ? 'dark' : 'light'),
        next.slot,
        next.colorBySpeed,
        next.route,
        next.speedStops,
        next.selectedPath ?? [],
        next.focusStops,
      )
      paintMarkers(map, markersRef, markerStateRef.current)
      fitMap(map, next.focus, 0)
    }

    map.on('style.load', draw)
    map.on('load', draw)
    if (styleReady(map)) draw()
    const unbindLaps = bindLapLineSelect(map, selectedLapRef, onSelectLapRef)
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
      unbindLaps()
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
    syncLapSource(map, track)
    if (colorBySpeed) syncSpeedSource(map, SPEED_SOURCE, route)
  }, [colorBySpeed, route, track])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    styleLaps(
      map,
      selectedLap,
      accentColor(appearance),
      false,
      colorBySpeed,
      speedStops,
      selectedPath ?? [],
      focusStops,
    )
  }, [
    appearance,
    colorBySpeed,
    focusStops,
    selectedLap,
    selectedPath,
    speedStops,
  ])

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
      laps: visibleLaps,
      labels,
      paths,
      route,
      selectedLapRef,
      onSelectLap,
      lapMarkerColor,
      lapMarkerTextColor,
      showLaps,
      showEnds: showEndMarkers,
    })
  }, [
    labels,
    lapMarkerColor,
    lapMarkerTextColor,
    onSelectLap,
    paths,
    route,
    showEndMarkers,
    showLaps,
    visibleLaps,
  ])

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
      {colorBySpeed && speedStops.length > 0 ? (
        <SpeedLegend slow={t('slow')} fast={t('fast')} />
      ) : null}
      <RideMapLayers
        token={token}
        center={center}
        styleId={styleId}
        onStyleId={setStyleId}
        showLaps={showLaps}
        onShowLaps={setShowLaps}
        showEnds={showEnds}
        onShowEnds={setShowEnds}
        colorBySpeed={canColorBySpeed ? colorBySpeed : undefined}
        onColorBySpeed={canColorBySpeed ? setColorBySpeed : undefined}
        open={layersOpen}
        onOpenChange={setLayersOpen}
      />
    </div>
  )
}

function SpeedLegend({ slow, fast }: { slow: string; fast: string }) {
  return (
    <div
      className='pointer-events-none absolute bottom-5 left-5 z-10 w-64'
      role='img'
      aria-label={`${slow} 0 km/h – ${fast} ${SPEED_MAX_KMH} km/h`}
    >
      <div className='speed-legend'>
        <span className='speed-legend-cap is-slow' />
        <span className='speed-legend-label is-slow'>{slow}</span>
        <span
          className='speed-legend-bar'
          style={{
            backgroundImage: `linear-gradient(90deg, ${SPEED_GRADIENT})`,
          }}
        />
        <span className='speed-legend-label is-fast'>{fast}</span>
        <span className='speed-legend-cap is-fast' />
      </div>
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
  lapMarkerColor: string
  lapMarkerTextColor: string
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
    markers.push(pinMarker(map, start, 'start', state.labels.start))
  }
  if (state.showEnds && end) {
    markers.push(pinMarker(map, end, 'end', state.labels.end))
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
    const element = item.getElement()
    element.style.cursor = 'pointer'
    element.style.setProperty('--ride-marker-color', state.lapMarkerColor)
    element.style.setProperty('--ride-marker-on', state.lapMarkerTextColor)
    element.addEventListener('click', (event) => {
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

function pinMarker(
  map: mapboxgl.Map,
  lngLat: [number, number],
  kind: 'start' | 'end',
  title: string,
) {
  const element = document.createElement('div')
  element.className = `ride-marker ride-marker-pin is-${kind}`
  element.title = title
  element.setAttribute('aria-label', title)
  element.innerHTML =
    '<svg viewBox="0 0 24 36" aria-hidden="true"><path d="M12 35.4S22.8 22.6 22.8 13.4C22.8 6.6 17.9 1.6 12 1.6S1.2 6.6 1.2 13.4C1.2 22.6 12 35.4 12 35.4Z"/><circle cx="12" cy="13.4" r="5.1" fill="#fff"/></svg>'
  return new mapboxgl.Marker({ element, anchor: 'bottom' })
    .setLngLat(lngLat)
    .addTo(map)
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
