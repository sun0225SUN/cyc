import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { useHomeQuery } from './use-home-query'

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

test('reads ride from the address bar after mount', () => {
  window.history.replaceState(null, '', '/?ride=3515857')
  const { result } = renderHook(() => useHomeQuery())

  expect(result.current.query).toEqual({ ride: 3515857 })
})

test('writes a ride into the query string without a navigation', () => {
  const { result } = renderHook(() => useHomeQuery())

  act(() => {
    result.current.setQuery({ ride: 3515857 })
  })

  expect(result.current.query.ride).toBe(3515857)
  expect(window.location.search).toBe('?ride=3515857')
})

test('clears a ride from the query string', () => {
  window.history.replaceState(null, '', '/?ride=9')
  const { result } = renderHook(() => useHomeQuery())

  act(() => {
    result.current.setQuery({ ride: null })
  })

  expect(result.current.query).toEqual({ ride: null })
  expect(window.location.search).toBe('')
})
