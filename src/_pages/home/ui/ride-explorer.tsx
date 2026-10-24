'use client'

import { useMemo, useState } from 'react'
import type { Activity } from '@/entities/activity'
import {
  activityYears,
  type HeatmapYear,
  RideHeatmap,
} from '@/widgets/ride-heatmap'
import { RideList } from '@/widgets/ride-list'
import { RideSummary } from '@/widgets/ride-summary'
import { RideTracks } from '@/widgets/ride-tracks'
import { YearTabs } from './year-tabs'

type RideExplorerProps = {
  activities: Activity[]
  locale: string
  selectedRideId?: number | null
  onSelect: (activity: Activity, occurrences?: Activity[]) => void
}

function activitiesInYear(activities: Activity[], year: HeatmapYear) {
  if (year === 'all') return activities
  return activities.filter((activity) =>
    activity.start_date_local.startsWith(String(year)),
  )
}

export function RideExplorer({
  activities,
  locale,
  selectedRideId,
  onSelect,
}: RideExplorerProps) {
  const years = useMemo(() => activityYears(activities), [activities])
  const latestYear = years[0] ?? 1970
  const [heatmapYear, setHeatmapYear] = useState<HeatmapYear>(latestYear)
  const [listYear, setListYear] = useState<HeatmapYear>(latestYear)
  const [tracksYear, setTracksYear] = useState<HeatmapYear>(latestYear)
  const [summaryYear, setSummaryYear] = useState<HeatmapYear>(latestYear)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const listActivities = useMemo(
    () => activitiesInYear(activities, listYear),
    [activities, listYear],
  )
  const trackActivities = useMemo(
    () => activitiesInYear(activities, tracksYear),
    [activities, tracksYear],
  )

  return (
    <div>
      <RideHeatmap
        activities={activities}
        selectedYear={heatmapYear}
        selectedDate={selectedDate}
        yearTabs={
          <YearTabs
            years={years}
            selectedYear={heatmapYear}
            onYearChange={(next) => {
              setHeatmapYear(next)
              setSelectedDate(null)
            }}
          />
        }
        onDateChange={(date) => {
          setSelectedDate(date)
          if (date) setListYear(Number(date.slice(0, 4)))
        }}
      />
      <RideList
        key={`${listYear}:${selectedDate ?? ''}`}
        activities={listActivities}
        locale={locale}
        selectedDate={selectedDate}
        selectedRideId={selectedRideId}
        yearTabs={
          <YearTabs
            years={years}
            selectedYear={listYear}
            onYearChange={(next) => {
              setListYear(next)
              if (
                selectedDate &&
                next !== 'all' &&
                !selectedDate.startsWith(String(next))
              ) {
                setSelectedDate(null)
              }
            }}
          />
        }
        onSelect={onSelect}
      />
      <RideTracks
        activities={trackActivities}
        locale={locale}
        yearTabs={
          <YearTabs
            years={years}
            selectedYear={tracksYear}
            onYearChange={setTracksYear}
          />
        }
        onSelect={onSelect}
      />
      <RideSummary
        activities={activities}
        locale={locale}
        selectedYear={summaryYear}
        yearTabs={
          <YearTabs
            years={years}
            selectedYear={summaryYear}
            onYearChange={setSummaryYear}
          />
        }
      />
    </div>
  )
}
