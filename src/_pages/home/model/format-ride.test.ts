import { expect, test } from 'vitest'
import {
  formatClock,
  formatHoursMinutes,
  formatNumber,
  formatPair,
  metersPerSecondToKmh,
  verticalMetersPerHour,
} from './format-ride'

test('formats a clock from seconds', () => {
  expect(formatClock(26144)).toBe('07:15:44')
  expect(formatClock(null)).toBe('--')
})

test('formats hours and minutes without seconds or days', () => {
  expect(formatHoursMinutes(18055)).toBe('05:00')
  expect(formatHoursMinutes(90000)).toBe('25:00')
})

test('formats missing stats as a dash pair', () => {
  expect(formatPair('--', '--')).toBe('-- / --')
  expect(formatNumber(null, 'en')).toBe('--')
})

test('converts speed and vertical speed units', () => {
  expect(metersPerSecondToKmh(11.868)).toBeCloseTo(42.7248)
  expect(verticalMetersPerHour(0.032)).toBeCloseTo(115.2)
})
