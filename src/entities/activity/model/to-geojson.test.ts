import { encode } from '@mapbox/polyline'
import { expect, test } from 'vitest'
import type { Activity } from './activity'
import { activitiesToGeoJson } from './to-geojson'

function activity(polyline: string, id = 1): Activity {
  return {
    run_id: id,
    name: '',
    distance: 1000,
    moving_time: '0:10:00',
    type: 'cycling',
    subtype: 'road',
    start_date: '2024-01-01 00:00:00',
    start_date_local: '2024-01-01 08:00:00',
    location_country: '',
    summary_polyline: polyline,
    average_heartrate: null,
    average_speed: 5,
    elevation_gain: 10,
    streak: 1,
  }
}

test('decodes polylines into mapbox lines and bounds', () => {
  const encoded = encode([
    [22.5, 113.4],
    [22.6, 113.5],
  ])
  const { geojson, bounds } = activitiesToGeoJson([
    activity(''),
    activity(encoded, 7),
  ])

  expect(geojson.features).toHaveLength(1)
  expect(geojson.features[0]?.properties.id).toBe(7)
  expect(geojson.features[0]?.geometry.coordinates[0]).toEqual([113.4, 22.5])
  expect(bounds?.[0][0]).toBeCloseTo(113.4)
  expect(bounds?.[1][1]).toBeCloseTo(22.6)
})
