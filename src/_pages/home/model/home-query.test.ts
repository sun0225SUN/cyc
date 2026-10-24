import { expect, test } from 'vitest'
import {
  isHomeHash,
  parseHomeHash,
  parseHomeQuery,
  readHomeQuery,
  writeHomeQuery,
} from './home-query'

test('reads a ride id from the query string', () => {
  expect(parseHomeQuery('?ride=3515857')).toEqual({ ride: 3515857 })
})

test('drops invalid ride values', () => {
  expect(parseHomeQuery('ride=abc')).toEqual({ ride: null })
  expect(parseHomeQuery('ride=0')).toEqual({ ride: null })
})

test('reads ride from a hash when the query is empty', () => {
  expect(parseHomeHash('#3515857')).toEqual({ ride: 3515857 })
  expect(parseHomeHash('#ride=3515857')).toEqual({ ride: 3515857 })
  expect(readHomeQuery('', '#3515857')).toEqual({ ride: 3515857 })
  expect(readHomeQuery('?ride=1', '#ride=2')).toEqual({ ride: 1 })
})

test('writes ride back onto search params and leaves others alone', () => {
  const params = new URLSearchParams('utm=keep')
  writeHomeQuery(params, { ride: 3515857 })
  expect(params.toString()).toBe('utm=keep&ride=3515857')
  writeHomeQuery(params, { ride: null })
  expect(params.toString()).toBe('utm=keep')
})

test('detects share hashes so they can be cleared', () => {
  expect(isHomeHash('#3515857')).toBe(true)
  expect(isHomeHash('#ride=1')).toBe(true)
  expect(isHomeHash('#section')).toBe(false)
})
