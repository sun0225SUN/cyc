import { afterEach, expect, test } from 'vitest'
import { currentSearchQuery, hrefWithCurrentQuery } from './index'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

test('returns undefined when the address bar has no query', () => {
  window.history.replaceState(null, '', '/')
  expect(currentSearchQuery()).toBeUndefined()
  expect(hrefWithCurrentQuery('/zh')).toBe('/zh')
})

test('keeps the current query when building a locale href', () => {
  window.history.replaceState(null, '', '/?ride=3515857')
  expect(currentSearchQuery()).toEqual({ ride: '3515857' })
  expect(hrefWithCurrentQuery('/')).toEqual({
    pathname: '/',
    query: { ride: '3515857' },
  })
})
