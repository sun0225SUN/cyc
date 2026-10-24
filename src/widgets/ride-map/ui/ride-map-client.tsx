'use client'

import dynamic from 'next/dynamic'

export const RideMap = dynamic(
  () => import('./ride-map').then((mod) => mod.RideMap),
  { ssr: false },
)
