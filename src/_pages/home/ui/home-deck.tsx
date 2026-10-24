'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { Activity } from '@/entities/activity'
import { mapboxToken } from '@/shared/config/mapbox'
import { RideMap, Starfield } from '@/widgets/ride-map'
import { PageSwitch } from './page-switch'
import { RideDetail } from './ride-detail'
import { RideExplorer } from './ride-explorer'

type HomeDeckProps = {
  activities: Activity[]
  locale: string
  brand: ReactNode
}

export function HomeDeck({ activities, locale, brand }: HomeDeckProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<{
    activity: Activity
    occurrences: Activity[]
  } | null>(null)

  const openDetail = useCallback(
    (activity: Activity, occurrences?: Activity[]) => {
      setDetail({
        activity,
        occurrences:
          occurrences && occurrences.length > 0 ? occurrences : [activity],
      })
    },
    [],
  )

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
        event.altKey
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
  }, [page, scrollToPage])

  return (
    <div className='relative h-svh overflow-hidden bg-[#f4f7fb] dark:bg-black'>
      <div className='pointer-events-none fixed inset-0 hidden dark:block'>
        <Starfield />
      </div>
      <div
        ref={scrollerRef}
        className='relative z-10 h-svh snap-y snap-mandatory scrollbar-none overflow-y-auto overscroll-y-none scroll-smooth [&::-webkit-scrollbar]:hidden'
      >
        <section className='relative h-svh snap-start snap-always'>
          <RideMap
            activities={activities}
            locale={locale}
            token={mapboxToken()}
            onSelect={openDetail}
          />
          <div className='pointer-events-none absolute top-4 left-4 z-10'>
            {brand}
          </div>
        </section>
        <section
          data-data-page
          className='h-svh snap-start snap-always overflow-y-auto overscroll-y-contain'
        >
          <RideExplorer
            activities={activities}
            locale={locale}
            onSelect={openDetail}
          />
        </section>
      </div>
      <PageSwitch
        page={page}
        pageCount={2}
        onPrevious={() => scrollToPage(Math.max(0, page - 1))}
        onNext={() => scrollToPage(Math.min(1, page + 1))}
      />
      {detail && (
        <RideDetail
          activity={detail.activity}
          occurrences={detail.occurrences}
          locale={locale}
          token={mapboxToken()}
          onSelectOccurrence={(activity) =>
            setDetail({ activity, occurrences: detail.occurrences })
          }
          onBack={() => setDetail(null)}
        />
      )}
    </div>
  )
}
