export const mapboxStyles = {
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
} as const

export type MapAppearance = keyof typeof mapboxStyles

export function mapboxToken() {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? ''
}

export function mapLanguage(locale: string) {
  return locale === 'zh' ? 'zh-Hans' : 'en'
}
