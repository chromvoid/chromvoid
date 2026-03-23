import {state} from '@statx/core'

export type PMTheme = 'light' | 'dark'

const STORAGE_KEY = 'pm-theme'

export const pmTheme = state<PMTheme>(readInitialTheme())

function readInitialTheme(): PMTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as PMTheme | null
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  return 'dark'
}

export function applyThemeToDocument(theme: PMTheme) {
  const root = document.documentElement
  root.setAttribute('theme', theme)
}

export function bindPMTheme() {
  // Инициализация
  applyThemeToDocument(pmTheme())
  try {
    localStorage.setItem(STORAGE_KEY, pmTheme())
  } catch {}

  // Подписка
  return pmTheme.subscribe((next) => {
    applyThemeToDocument(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
  })
}

export function toggleTheme() {
  pmTheme.set(pmTheme() === 'dark' ? 'light' : 'dark')
}
