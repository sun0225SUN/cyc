'use server'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { RideDetailData } from '../model/ride-detail'

export async function loadRideDetail(
  id: number,
): Promise<RideDetailData | null> {
  if (!Number.isInteger(id) || id < 1) return null
  const file = path.join(process.cwd(), 'data', 'rides', `${id}.json`)
  try {
    const text = await readFile(file, 'utf8')
    return JSON.parse(text) as RideDetailData
  } catch {
    return null
  }
}
