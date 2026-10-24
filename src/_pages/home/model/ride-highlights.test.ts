import { expect, test } from 'vitest'
import { pickHighlights } from './ride-highlights'

test('keeps the eight most important metrics that have values', () => {
  const picked = pickHighlights([
    { key: 'maxClimb', value: '10 m/h' },
    { key: 'calories', value: '1716 kcal' },
    { key: 'time', value: '07:15:44' },
    { key: 'averageHeartRate', value: '148 bpm' },
    { key: 'distance', value: '70.4 km' },
    { key: 'averageSpeed', value: '17.3 km/h' },
    { key: 'temperature', value: '24 °C' },
    { key: 'ascent', value: '169 m' },
    { key: 'averagePower', value: '180 W' },
    { key: 'maxSpeed', value: '42.7 km/h' },
    { key: 'moving', value: '04:04:41' },
    { key: 'averageCadence', value: '50 rpm' },
  ])

  expect(picked.map((item) => item.key)).toEqual([
    'time',
    'distance',
    'averageSpeed',
    'moving',
    'averageHeartRate',
    'averagePower',
    'ascent',
    'calories',
  ])
})

test('skips empty values and fills with the next metrics', () => {
  const picked = pickHighlights([
    { key: 'time', value: '01:00:00' },
    { key: 'distance', value: '20 km' },
    { key: 'averageSpeed', value: '20 km/h' },
    { key: 'moving', value: null },
    { key: 'averageHeartRate', value: null },
    { key: 'averagePower', value: null },
    { key: 'ascent', value: '100 m' },
    { key: 'calories', value: '400 kcal' },
    { key: 'averageCadence', value: '80 rpm' },
    { key: 'maxSpeed', value: '40 km/h' },
    { key: 'descent', value: '90 m' },
  ])

  expect(picked.map((item) => item.key)).toEqual([
    'time',
    'distance',
    'averageSpeed',
    'ascent',
    'calories',
    'averageCadence',
    'maxSpeed',
    'descent',
  ])
})
