import { encode } from '@mapbox/polyline'
import { expect, test } from 'vitest'
import { decodeTrack, trackSvgPoints } from './track-path'

test('projects a polyline into a padded svg point string', () => {
  const points = trackSvgPoints(
    [
      [0, 0],
      [1, 1],
    ],
    80,
  )
  expect(points).toBe('4.0,76.0 76.0,4.0')
})

test('decodes usable polylines and ignores empty ones', () => {
  const encoded = encode([
    [22.5, 113.4],
    [22.6, 113.5],
  ])
  expect(decodeTrack('')).toEqual([])
  expect(decodeTrack(encoded)).toEqual([
    [22.5, 113.4],
    [22.6, 113.5],
  ])
})

test('returns no svg points for a single coordinate', () => {
  expect(trackSvgPoints([[22.5, 113.4]])).toBe('')
})
