import { encode } from '@mapbox/polyline'
import { expect, test } from 'vitest'
import { clusterTracks } from './cluster-tracks'

function line(from: [number, number], to: [number, number]) {
  return encode([from, to])
}

test('merges rides that share start, end, and distance bucket', () => {
  const polyline = line([22.5, 113.4], [22.6, 113.5])
  const clusters = clusterTracks([
    {
      summary_polyline: polyline,
      start_date_local: '2026-01-01 08:00:00',
      distance: 20_000,
    },
    {
      summary_polyline: line([22.508, 113.408], [22.608, 113.508]),
      start_date_local: '2026-02-01 08:00:00',
      distance: 21_000,
    },
  ])

  expect(clusters).toEqual([{ index: 1, count: 2, indexes: [1, 0] }])
})

test('keeps distant routes as separate clusters', () => {
  const clusters = clusterTracks([
    {
      summary_polyline: line([22.5, 113.4], [22.6, 113.5]),
      start_date_local: '2026-01-01 08:00:00',
      distance: 21_000,
    },
    {
      summary_polyline: line([31.2, 121.5], [31.3, 121.6]),
      start_date_local: '2026-02-01 08:00:00',
      distance: 21_000,
    },
  ])

  expect(clusters).toEqual([
    { index: 1, count: 1, indexes: [1] },
    { index: 0, count: 1, indexes: [0] },
  ])
})

test('skips tracks without a usable polyline', () => {
  expect(
    clusterTracks([
      {
        summary_polyline: '',
        start_date_local: '2026-01-01 08:00:00',
        distance: 10_000,
      },
    ]),
  ).toEqual([])
})
