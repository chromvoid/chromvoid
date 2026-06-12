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
  let previousTheme = pmTheme()
  applyThemeToDocument(previousTheme)
  try {
    localStorage.setItem(STORAGE_KEY, previousTheme)
  } catch {}

  return pmTheme.subscribe((next: PMTheme) => {
    if (next === previousTheme) {
      return
    }

    previousTheme = next
    applyThemeToDocument(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
  })
}

export function toggleTheme() {
  pmTheme.set(pmTheme() === 'dark' ? 'light' : 'dark')
}
