import { expect, test } from 'vitest'
import { formatActivityDate } from './format-activity-date'

test('formats English local activity dates deterministically', () => {
  expect(formatActivityDate('2026-09-12 16:07:19', 'en')).toBe('Sep 12, 2026')
  expect(formatActivityDate('2026-01-01 00:05:00', 'en-US')).toBe('Jan 1, 2026')
})

test('formats Chinese local activity dates without timezone conversion', () => {
  expect(formatActivityDate('2026-09-12 16:07:19', 'zh-CN')).toBe(
    '2026年9月12日',
  )
})

test('keeps unsupported date values intact', () => {
  expect(formatActivityDate('unknown', 'en')).toBe('unknown')
})
