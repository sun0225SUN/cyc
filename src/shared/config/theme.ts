/** Light = blue. Dark = green */
export const themeAccent = {
  light: '#2563eb',
  dark: '#ceff00',
} as const

export const themeAccentOn = {
  light: '#ffffff',
  dark: '#111111',
} as const

export type ThemeAppearance = keyof typeof themeAccent

export function appearanceFromDocument(): ThemeAppearance {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function accentColor(
  appearance: ThemeAppearance = appearanceFromDocument(),
) {
  return themeAccent[appearance]
}
