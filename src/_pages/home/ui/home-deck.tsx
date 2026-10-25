'use client'

import { Layers } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type Activity,
  privacyCut,
  type RideProfile,
} from '@/entities/activity'
import { loadRideProfiles } from '@/entities/activity/api/load-ride-profiles'
import { mapboxToken, type RideMapStyleId } from '@/shared/config/mapbox'
import { appearanceFromDocument } from '@/shared/config/theme'
import {
  MapCameraBar,
  RideMap,
  type RideMapCamera,
  type RideSpeedLine,
  Starfield,
} from '@/widgets/ride-map'
import { routeCoordinates, routeDistances } from '../model/lap-route'
import {
  nextRideBatchIds,
  RIDE_MAP_BATCH,
  rideIdsNewestFirst,
} from '../model/ride-batch'
import { speedLineStops } from '../model/speed-route'
import { useHomeQuery } from '../model/use-home-query'
import { MapLayersDialog } from './map-layers-dialog'
import { PageSwitch } from './page-switch'
import { RideDetail } from './ride-detail'
import { RideExplorer } from './ride-explorer'

type HomeDeckProps = {
  activities: Activity[]
  rideProfiles: Record<number, RideProfile>
  locale: string
  brand: ReactNode
}

export function HomeDeck({
  activities,
  rideProfiles: initialRideProfiles,
  locale,
  brand,
}: HomeDeckProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const [camera, setCamera] = useState<RideMapCamera | null>(null)
  const [colorBySpeed, setColorBySpeed] = useState(true)
  const [layersOpen, setLayersOpen] = useState(false)
  const [styleId, setStyleId] = useState<RideMapStyleId>(() =>
    appearanceFromDocument() === 'dark' ? 'dark' : 'light',
  )
  const [rideProfiles, setRideProfiles] = useState(initialRideProfiles)
  const rideIds = useMemo(() => rideIdsNewestFirst(activities), [activities])
  const [rideCursor, setRideCursor] = useState(
    Math.min(RIDE_MAP_BATCH, rideIds.length),
  )
  const tMap = useTranslations('map')
  const token = mapboxToken()
  const mapCenter = useMemo<[number, number]>(() => {
    for (const activity of activities) {
      const point = routeCoordinates(activity.summary_polyline)[0]
      if (point) return point
    }
    return [120.15, 30.28]
  }, [activities])
  const activitiesById = useMemo(
    () => new Map(activities.map((activity) => [activity.run_id, activity])),
    [activities],
  )
  const speedLines = useMemo<RideSpeedLine[]>(() => {
    return rideIds.flatMap((id) => {
      const activity = activitiesById.get(id)
      const profile = rideProfiles[id]
      if (!activity || !profile) return []
      const coordinates = routeCoordinates(activity.summary_polyline)
      const cut = privacyCut(routeDistances(coordinates).at(-1) ?? 0)
      const stops = speedLineStops(
        coordinates,
        profile.distance,
        profile.speed,
        cut.originMeters > 0
          ? {
              origin: cut.originMeters,
              routeTotal: cut.totalMeters,
            }
          : undefined,
      )
      if (coordinates.length < 2 || stops.length < 4) return []
      return [{ id, coordinates, stops }]
    })
  }, [activitiesById, rideIds, rideProfiles])

  useEffect(() => {
    if (rideCursor >= rideIds.length) return
    const ids = nextRideBatchIds(rideIds, rideCursor)
    if (ids.length === 0) return
    let cancelled = false
    void loadRideProfiles(ids).then((next) => {
      if (cancelled) return
      setRideProfiles((current) => ({ ...current, ...next }))
      setRideCursor((current) => current + ids.length)
    })
    return () => {
      cancelled = true
    }
  }, [rideCursor, rideIds])
  const { query, setQuery } = useHomeQuery()
  const [detail, setDetail] = useState<{
    activity: Activity
    occurrences: Activity[]
  } | null>(null)

  const openDetail = useCallback(
    (activity: Activity, occurrences?: Activity[]) => {
      setQuery({ ride: activity.run_id })
      setDetail({
        activity,
        occurrences:
          occurrences && occurrences.length > 0 ? occurrences : [activity],
      })
    },
    [setQuery],
  )

  const closeDetail = useCallback(() => {
    setQuery({ ride: null })
    setDetail(null)
  }, [setQuery])

  useEffect(() => {
    if (query.ride == null) {
      setDetail((current) => (current ? null : current))
      return
    }

    const activity = activities.find((item) => item.run_id === query.ride)
    if (!activity) {
      setQuery({ ride: null })
      return
    }

    setDetail((current) => {
      if (current?.activity.run_id === activity.run_id) return current
      const occurrences = current?.occurrences.some(
        (item) => item.run_id === activity.run_id,
      )
        ? current.occurrences
        : [activity]
      return { activity, occurrences }
    })
  }, [activities, query.ride, setQuery])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const updatePage = () => {
      const next = Math.min(
        1,
        Math.max(0, Math.round(scroller.scrollTop / scroller.clientHeight)),
      )
      setPage(next)
    }

    scroller.addEventListener('scroll', updatePage, { passive: true })
    return () => scroller.removeEventListener('scroll', updatePage)
  }, [])

  const scrollToPage = useCallback((next: number) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollTo({
      top: next * scroller.clientHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        detail
      )
        return
      if (event.key === 'PageDown' && page < 1) {
        event.preventDefault()
        scrollToPage(page + 1)
      }
      if (event.key === 'PageUp' && page > 0) {
        event.preventDefault()
        scrollToPage(page - 1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detail, page, scrollToPage])

  return (
    <div className='relative h-svh overflow-hidden bg-[#f4f7fb] dark:bg-black'>
      <div inert={detail ? true : undefined}>
        <div className='pointer-events-none fixed inset-0 hidden dark:block'>
          <Starfield />
        </div>
        <div
          ref={scrollerRef}
          className='relative z-10 h-svh snap-y snap-mandatory scrollbar-none overflow-y-auto overscroll-y-none scroll-smooth [&::-webkit-scrollbar]:hidden'
        >
          <section
            id='ride-map'
            className='relative h-svh snap-start snap-always'
          >
            <RideMap
              activities={activities}
              locale={locale}
              token={token}
              brand={brand}
              onSelect={openDetail}
              onCameraReady={setCamera}
              colorBySpeed={colorBySpeed}
              styleId={styleId}
              speedLines={speedLines}
            />
          </section>
          <section
            data-data-page
            className='h-svh snap-start snap-always overflow-y-auto overscroll-y-contain'
          >
            <RideExplorer
              activities={activities}
              locale={locale}
              selectedRideId={query.ride}
              onSelect={openDetail}
            />
          </section>
        </div>
        <div className='pointer-events-none fixed inset-x-4 bottom-4 z-30'>
          <div className='absolute bottom-0 left-0'>
            <PageSwitch
              page={page}
              pageCount={2}
              onPrevious={() => scrollToPage(Math.max(0, page - 1))}
              onNext={() => scrollToPage(Math.min(1, page + 1))}
            />
          </div>
          {page === 0 && camera ? (
            <div className='absolute right-0 bottom-0 flex flex-col items-end gap-3'>
              <div className='pointer-events-auto'>
                <button
                  type='button'
                  onClick={() => setLayersOpen(true)}
                  aria-label={tMap('layers')}
                  aria-expanded={layersOpen}
                  data-umami-event='map-layers'
                  className='grid size-11 cursor-pointer place-items-center rounded-full bg-white/20 shadow-lg backdrop-blur-md dark:bg-black/20'
                >
                  <Layers size={22} strokeWidth={2.25} />
                </button>
              </div>
              <MapCameraBar
                bearing={camera.bearing}
                onZoomIn={camera.zoomIn}
                onZoomOut={camera.zoomOut}
                onResetNorth={camera.resetNorth}
              />
            </div>
          ) : null}
        </div>
        {layersOpen ? (
          <MapLayersDialog
            token={token}
            center={mapCenter}
            styleId={styleId}
            onStyleId={setStyleId}
            colorBySpeed={colorBySpeed}
            onColorBySpeed={setColorBySpeed}
            onClose={() => setLayersOpen(false)}
          />
        ) : null}
      </div>
      {detail && (
        <RideDetail
          activity={detail.activity}
          occurrences={detail.occurrences}
          locale={locale}
          token={token}
          onSelectOccurrence={(activity) => {
            setQuery({ ride: activity.run_id })
            setDetail({ activity, occurrences: detail.occurrences })
          }}
          onBack={closeDetail}
        />
      )}
    </div>
  )
}
