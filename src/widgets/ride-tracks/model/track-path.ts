import { decode } from '@mapbox/polyline'

export const TRACK_THUMB_SIZE = 80
const TRACK_THUMB_PAD = 8

export type LatLng = readonly [number, number]

export function decodeTrack(summaryPolyline: string): LatLng[] {
  if (!summaryPolyline) return []
  try {
    const coords = decode(summaryPolyline)
    return coords.length >= 2 ? coords : []
  } catch {
    return []
  }
}

export function trackSvgPoints(
  coords: readonly LatLng[],
  size = TRACK_THUMB_SIZE,
): string {
  if (coords.length < 2) return ''

  const lats = coords.map(([lat]) => lat)
  const lngs = coords.map(([, lng]) => lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latRange = maxLat - minLat || 0.001
  const lngRange = maxLng - minLng || 0.001
  const scale = Math.min(
    (size - TRACK_THUMB_PAD) / lngRange,
    (size - TRACK_THUMB_PAD) / latRange,
  )
  const offsetX = (size - lngRange * scale) / 2
  const offsetY = (size - latRange * scale) / 2

  return coords
    .map(([lat, lng]) => {
      const x = (lng - minLng) * scale + offsetX
      const y = size - ((lat - minLat) * scale + offsetY)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}
