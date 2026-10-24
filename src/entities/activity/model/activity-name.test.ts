import { expect, test } from 'vitest'
import { activityNameKey } from './activity-name'

test('resolves generated ride name keys without treating source names as keys', () => {
  expect(activityNameKey('afternoon')).toBe('afternoon')
  expect(activityNameKey('周末长途')).toBeNull()
  expect(activityNameKey('unknown')).toBeNull()
})
