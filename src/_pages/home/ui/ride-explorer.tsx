'use client'

import { useMemo, useState } from 'react'
import type { Activity } from '@/entities/activity'
import { type HeatmapYear, RideHeatmap } from '@/widgets/ride-heatmap'
import { RideList } from '@/widgets/ride-list'

type RideExplorerProps = {
  activities: Activity[]
  locale: string
  onSelect: (activity: Activity) => void
}

export function RideExplorer({
  activities,
  locale,
  onSelect,
}: RideExplorerProps) {
  const availableYears = useMemo(
    () =>
      new Set(
        activities.map((activity) =>
          Number(activity.start_date_local.slice(0, 4)),
        ),
      ),
    [activities],
  )
  const latestYear =
    availableYears.size > 0 ? Math.max(...availableYears) : 1970
  const [selectedYear, setSelectedYear] = useState<HeatmapYear>(latestYear)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const yearActivities = useMemo(
    () =>
      selectedYear === 'all'
        ? activities
        : activities.filter((activity) =>
            activity.start_date_local.startsWith(String(selectedYear)),
          ),
    [activities, selectedYear],
  )
  return (
    <div>
      <RideHeatmap
        activities={activities}
        selectedYear={selectedYear}
        selectedDate={selectedDate}
        onYearChange={(year) => {
          setSelectedYear(year)
          setSelectedDate(null)
        }}
        onDateChange={setSelectedDate}
      />
      <RideList
        key={`${selectedYear}:${selectedDate ?? ''}`}
        activities={yearActivities}
        locale={locale}
        selectedDate={selectedDate}
        onSelect={onSelect}
      />
    </div>
  )
}
