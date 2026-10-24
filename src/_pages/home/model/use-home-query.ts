'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  emptyHomeQuery,
  type HomeQuery,
  isHomeHash,
  readHomeQuery,
  writeHomeQuery,
} from './home-query'

export function useHomeQuery() {
  const [query, setQueryState] = useState<HomeQuery>(emptyHomeQuery)

  useEffect(() => {
    const sync = () =>
      setQueryState(readHomeQuery(window.location.search, window.location.hash))
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const setQuery = useCallback((patch: Partial<HomeQuery>) => {
    setQueryState((current) => {
      const next = { ...current, ...patch }
      if (next.ride === current.ride) return current
      const url = new URL(window.location.href)
      writeHomeQuery(url.searchParams, next)
      const search = url.searchParams.toString()
      const hash = isHomeHash(url.hash) ? '' : url.hash
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${search ? `?${search}` : ''}${hash}`,
      )
      return next
    })
  }, [])

  return { query, setQuery }
}
