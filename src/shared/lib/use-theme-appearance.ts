'use client'

import { useSyncExternalStore } from 'react'
import {
  appearanceFromDocument,
  type ThemeAppearance,
} from '@/shared/config/theme'

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
  return () => observer.disconnect()
}

function getSnapshot(): ThemeAppearance {
  return appearanceFromDocument()
}

function getServerSnapshot(): ThemeAppearance {
  return 'light'
}

export function useThemeAppearance() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
