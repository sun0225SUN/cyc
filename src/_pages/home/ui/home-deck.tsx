'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { Activity } from '@/entities/activity'
import { mapboxToken } from '@/shared/config/mapbox'
import { RideMap, Starfield } from '@/widgets/ride-map'
import { PageSwitch } from './page-switch'

type HomeDeckProps = {
  activities: Activity[]
  locale: string
  brand: ReactNode
  list: ReactNode
}

export function HomeDeck({ activities, locale, brand, list }: HomeDeckProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const updatePage = () => {
      const next = scroller.scrollTop >= scroller.clientHeight * 0.5 ? 1 : 0
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
      if (event.key === 'PageDown' && page === 0) {
        event.preventDefault()
        scrollToPage(1)
      }
      if (event.key === 'PageUp' && page === 1) {
        event.preventDefault()
        scrollToPage(0)
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
          />
          <div className='pointer-events-none absolute top-4 left-4 z-10'>
            {brand}
          </div>
        </section>
        <section className='h-svh snap-start snap-always overflow-hidden'>
          {list}
        </section>
      </div>
      <PageSwitch
        page={page}
        onPrevious={() => scrollToPage(0)}
        onNext={() => scrollToPage(1)}
      />
    </div>
  )
}
