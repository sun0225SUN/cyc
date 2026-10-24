'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslations } from 'next-intl'

const pill =
  'flex flex-col items-center rounded-full bg-white/20 p-1.5 shadow-lg shadow-black/10 backdrop-blur-md dark:bg-black/20'
const iconButton =
  'grid size-10 cursor-pointer place-items-center rounded-full transition-[color,background-color,transform,opacity] duration-200 hover:bg-white/35 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/10'

type PageSwitchProps = {
  page: number
  onPrevious: () => void
  onNext: () => void
}

export function PageSwitch({ page, onPrevious, onNext }: PageSwitchProps) {
  const t = useTranslations('rides')

  return (
    <nav
      className='pointer-events-auto fixed bottom-4 left-4 z-30'
      aria-label={page === 0 ? t('next') : t('previous')}
    >
      <div className={pill}>
        <button
          type='button'
          onClick={onPrevious}
          disabled={page === 0}
          aria-label={t('previous')}
          className={iconButton}
        >
          <ChevronUp size={21} strokeWidth={2.25} nonScalingStroke />
        </button>
        <button
          type='button'
          onClick={onNext}
          disabled={page === 1}
          aria-label={t('next')}
          className={iconButton}
        >
          <ChevronDown size={21} strokeWidth={2.25} nonScalingStroke />
        </button>
      </div>
    </nav>
  )
}
