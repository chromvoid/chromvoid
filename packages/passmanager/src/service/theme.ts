import {atom} from '@reatom/core'

export type PMTheme = 'light' | 'dark'

const STORAGE_KEY = 'pm-theme'

export const pmTheme = atom<PMTheme>(readInitialTheme(), 'passmanager.theme')

function readInitialTheme(): PMTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as PMTheme | null
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  return 'dark'
}

export function applyThemeToDocument(theme: PMTheme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.setAttribute('theme', theme)
}

export function bindPMTheme() {
  // Initialization
  const initialTheme = pmTheme()
  applyThemeToDocument(initialTheme)
  try {
    localStorage.setItem(STORAGE_KEY, initialTheme)
  } catch {}

  // Subscription
  let suppressInitialDuplicate = true
  queueMicrotask(() => {
    suppressInitialDuplicate = false
  })
  return pmTheme.subscribe((next: PMTheme) => {
    if (suppressInitialDuplicate && next === initialTheme) {
      return
    }
    applyThemeToDocument(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
  })
}

export function toggleTheme() {
  pmTheme.set(pmTheme() === 'dark' ? 'light' : 'dark')
}
