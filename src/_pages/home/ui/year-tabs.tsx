'use client'

import { useTranslations } from 'next-intl'
import type { HeatmapYear } from '@/widgets/ride-heatmap'
import './year-tabs.css'

type YearTabsProps = {
  years: number[]
  selectedYear: HeatmapYear
  onYearChange: (year: HeatmapYear) => void
}

export function YearTabs({ years, selectedYear, onYearChange }: YearTabsProps) {
  const t = useTranslations('heatmap')
  return (
    <fieldset className='year-tabs flex flex-wrap gap-2 border-0 p-0'>
      <legend className='sr-only'>{t('yearSelection')}</legend>
      {(['all', ...years] as HeatmapYear[]).map((year) => (
        <button
          type='button'
          key={year}
          onClick={() => onYearChange(year)}
          aria-pressed={selectedYear === year}
          className='year-tab cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition-[color,background-color,border-color,transform] active:scale-95'
        >
          {year === 'all' ? t('all') : year}
        </button>
      ))}
    </fieldset>
  )
}
