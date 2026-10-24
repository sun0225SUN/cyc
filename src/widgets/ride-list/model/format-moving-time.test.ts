import { expect, test } from 'vitest'
import { formatMovingTime } from './format-moving-time'

test('converts day durations to cumulative hours', () => {
  expect(formatMovingTime('1 day, 21:24:11')).toBe('45:24:11')
  expect(formatMovingTime('2 days, 03:04:05')).toBe('51:04:05')
})

test('normalizes regular durations and strips fractional seconds', () => {
  expect(formatMovingTime('04:04:41')).toBe('4:04:41')
  expect(formatMovingTime('26:12:03.500000')).toBe('26:12:03')
})

test('keeps unknown duration formats intact', () => {
  expect(formatMovingTime('unknown')).toBe('unknown')
})
