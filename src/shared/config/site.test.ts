import { afterEach, expect, test } from 'vitest'
import { githubRepositoryUrl, productionSiteUrl, siteUrl } from './site'

const keys = [
  'NEXT_PUBLIC_SITE_URL',
  'VERCEL_ENV',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
] as const

const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of keys) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function clearSiteEnv() {
  for (const key of keys) delete process.env[key]
}

test('keeps the github and production origins on cyc.earth', () => {
  expect(githubRepositoryUrl).toBe('https://github.com/sun0225SUN/cyc.earth')
  expect(productionSiteUrl).toBe('https://cyc.earth')
})

test('prefers NEXT_PUBLIC_SITE_URL', () => {
  clearSiteEnv()
  process.env.NEXT_PUBLIC_SITE_URL = 'https://cyc.earth/'
  process.env.VERCEL_ENV = 'production'
  expect(siteUrl()).toBe('https://cyc.earth')
})

test('uses the production domain on Vercel production', () => {
  clearSiteEnv()
  process.env.VERCEL_ENV = 'production'
  process.env.VERCEL_URL = 'cyc-earth.vercel.app'
  expect(siteUrl()).toBe('https://cyc.earth')
})

test('uses the preview host on Vercel previews', () => {
  clearSiteEnv()
  process.env.VERCEL_URL = 'cyc-git-main.vercel.app'
  expect(siteUrl()).toBe('https://cyc-git-main.vercel.app')
})

test('falls back to localhost', () => {
  clearSiteEnv()
  expect(siteUrl()).toBe('http://localhost:3000')
})
