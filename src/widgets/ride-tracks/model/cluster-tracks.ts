import { decodeTrack } from './track-path'

export type ClusterableTrack = {
  summary_polyline: string
  start_date_local: string
  distance: number
}

const START_END_DEG = 0.01
const DIST_BUCKET_M = 4000

/**
 * Collapse near-duplicate routes (start/end within ~1.1km, ~4km distance buckets).
 * Fast enough to run synchronously for typical track-wall sizes.
 */
export function clusterTracks<T extends ClusterableTrack>(
  tracks: T[],
): { index: number; count: number; indexes: number[] }[] {
  const ordered = tracks
    .map((track, index) => ({ ...track, index }))
    .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))

  const decoded = ordered.map((track) => {
    const coords = decodeTrack(track.summary_polyline)
    if (coords.length < 2) return null
    return {
      start: coords[0],
      end: coords[coords.length - 1],
      distBucket: Math.round(track.distance / DIST_BUCKET_M),
    }
  })

  const clusters: { index: number; count: number; indexes: number[] }[] = []
  const used = new Set<number>()
  for (let i = 0; i < ordered.length; i++) {
    if (used.has(i)) continue
    const current = decoded[i]
    if (!current) continue
    const indexes = [ordered[i].index]
    for (let j = i + 1; j < ordered.length; j++) {
      if (used.has(j)) continue
      const candidate = decoded[j]
      if (!candidate || current.distBucket !== candidate.distBucket) continue
      const startClose =
        Math.abs(current.start[0] - candidate.start[0]) < START_END_DEG &&
        Math.abs(current.start[1] - candidate.start[1]) < START_END_DEG
      const endClose =
        Math.abs(current.end[0] - candidate.end[0]) < START_END_DEG &&
        Math.abs(current.end[1] - candidate.end[1]) < START_END_DEG
      if (startClose && endClose) {
        used.add(j)
        indexes.push(ordered[j].index)
      }
    }
    used.add(i)
    clusters.push({
      index: ordered[i].index,
      count: indexes.length,
      indexes,
    })
  }
  return clusters
}
