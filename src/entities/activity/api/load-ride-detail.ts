'use server'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { privacyHideMeters, privacyMode } from '@/shared/config/privacy'
import { redactHiddenLapMarkers } from '../model/present-route'
import type { RideDetailData } from '../model/ride-detail'

export async function loadRideDetail(
  id: number,
): Promise<RideDetailData | null> {
  if (!Number.isInteger(id) || id < 1) return null
  const file = path.join(process.cwd(), 'data', 'rides', `${id}.json`)
  try {
    const text = await readFile(file, 'utf8')
    const detail = JSON.parse(text) as RideDetailData
    if (!privacyMode) return detail
    return {
      ...detail,
      laps: redactHiddenLapMarkers(
        detail.laps,
        privacyHideMeters,
        detail.distance,
      ),
    }
  } catch {
    return null
  }
}
