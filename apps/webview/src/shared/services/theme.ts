import {subscribeToSignalChanges} from './subscribed-signal'

export type AppTheme = 'light' | 'dark' | 'system'

type ThemeSignal = (() => AppTheme | undefined) & {
  subscribe: (listener: () => void) => () => void
}

/*** Identifies a real theme based on customization and system preferences
*/
function resolveTheme(theme: AppTheme | undefined): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') {
    return theme
  }
  // system or undefined – use system preferences
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**Links the theme to the root of the application through data/theme attributes.
* Responds to system theme changes if 'system' mode is selected. Brings back the cleanup.
*/
export function bindTheme(themeSignal: ThemeSignal): () => void {
  const apply = () => {
    const themeSetting = themeSignal()
    const resolvedTheme = resolveTheme(themeSetting)
    const root = document.documentElement

    root.setAttribute('data-theme', resolvedTheme)
    root.setAttribute('theme', resolvedTheme)
  }
  apply()

  // Subscribe to change the theme setting
  const unsubscribe = subscribeToSignalChanges(themeSignal, apply)

  // Subscribe to Systemic Changes to the Theme
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleSystemChange = () => {
    if (themeSignal() === 'system') {
      apply()
    }
  }
  mediaQuery.addEventListener('change', handleSystemChange)

  return () => {
    unsubscribe()
    mediaQuery.removeEventListener('change', handleSystemChange)
  }
}
