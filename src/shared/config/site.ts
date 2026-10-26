export const githubRepositoryUrl = 'https://github.com/sun0225SUN/cyc.earth'
export const productionSiteUrl = 'https://cyc.earth'

export function siteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (process.env.VERCEL_ENV === 'production') return productionSiteUrl
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim()
  if (vercel) {
    return vercel.startsWith('http')
      ? vercel.replace(/\/$/, '')
      : `https://${vercel}`
  }
  return 'http://localhost:3000'
}
