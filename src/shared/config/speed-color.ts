export const SPEED_MIN_KMH = 0
export const SPEED_MAX_KMH = 40

export const SPEED_STOPS = [
  [0, '#14d45a'],
  [10, '#86e04a'],
  [20, '#f0dc1e'],
  [30, '#f08a22'],
  [40, '#e02424'],
] as const

export const SPEED_GRADIENT = SPEED_STOPS.map(
  ([kmh, color]) => `${color} ${(kmh / SPEED_MAX_KMH) * 100}%`,
).join(', ')

export function speedLineColor(fallback: string, colorBySpeed: boolean) {
  if (!colorBySpeed) return fallback
  return [
    'interpolate',
    ['linear'],
    [
      'min',
      SPEED_MAX_KMH,
      ['max', SPEED_MIN_KMH, ['coalesce', ['get', 'speed'], 0]],
    ],
    ...SPEED_STOPS.flat(),
  ]
}
