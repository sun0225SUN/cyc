'use server'

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { cacheLife } from 'next/cache'
import type { RideDetailData, RideProfile } from '../model/ride-detail'

const SAMPLES = 48

export async function loadRideProfiles(
  ids?: number[],
): Promise<Record<number, RideProfile>> {
  'use cache'
  cacheLife('max')

  const dir = path.join(process.cwd(), 'data', 'rides')
  let names: string[]
  if (ids) {
    names = ids.filter((id) => Number.isInteger(id)).map((id) => `${id}.json`)
  } else {
    try {
      names = await readdir(dir)
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return {}
      }
      throw error
    }
  }
  const files = names.filter((file) => file.endsWith('.json'))
  const next: Record<number, RideProfile> = {}
  await Promise.all(
    files.map(async (file) => {
      if (!file.endsWith('.json')) return
      const id = Number(file.slice(0, -5))
      if (!Number.isInteger(id)) return
      try {
        const detail = JSON.parse(
          await readFile(path.join(dir, file), 'utf8'),
        ) as RideDetailData
        const profile = downsample(detail, SAMPLES)
        if (profile) next[id] = profile
      } catch {
        return
      }
    }),
  )
  return next
}

function downsample(detail: RideDetailData, count: number) {
  const distances = detail.streams.distance ?? []
  const speeds = detail.streams.speed ?? []
  const samples: Array<{ distance: number; speed: number }> = []
  const length = Math.max(distances.length, speeds.length)
  for (let index = 0; index < length; index += 1) {
    const speed = speeds[index]
    if (speed == null || !Number.isFinite(speed)) continue
    const distance = distances[index]
    samples.push({
      distance:
        distance != null && Number.isFinite(distance)
          ? distance
          : samples.length,
      speed,
    })
  }
  if (samples.length < 2) return null
  const start = samples[0]?.distance ?? 0
  const end = samples[samples.length - 1]?.distance ?? start
  const distance: number[] = []
  const speed: number[] = []
  for (let index = 0; index <= count; index += 1) {
    const target = start + ((end - start) * index) / count
    distance.push(target)
    speed.push(lookup(samples, target))
  }
  return { distance, speed }
}

function lookup(
  samples: Array<{ distance: number; speed: number }>,
  target: number,
) {
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (!first || !last) return 0
  if (target <= first.distance) return first.speed
  if (target >= last.distance) return last.speed
  let low = 0
  let high = samples.length - 1
  while (low < high - 1) {
    const mid = (low + high) >> 1
    if ((samples[mid]?.distance ?? 0) <= target) low = mid
    else high = mid
  }
  const from = samples[low]
  const to = samples[high]
  if (!from || !to) return from?.speed ?? to?.speed ?? 0
  const span = to.distance - from.distance
  const ratio = span === 0 ? 0 : (target - from.distance) / span
  return from.speed + (to.speed - from.speed) * ratio
}
