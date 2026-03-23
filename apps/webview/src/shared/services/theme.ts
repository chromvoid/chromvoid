export type AppTheme = 'light' | 'dark' | 'system'

type ThemeSignal = (() => AppTheme | undefined) & {
  subscribe: (listener: (value: AppTheme) => void) => () => void
}

/**
 * Определяет реальную тему на основе настройки и системных предпочтений
 */
function resolveTheme(theme: AppTheme | undefined): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') {
    return theme
  }
  // system или undefined — используем системные предпочтения
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Привязывает тему к корню приложения через data/theme атрибуты.
 * Реагирует на изменение системной темы, если выбран режим 'system'. Возвращает cleanup.
 */
export function bindTheme(themeSignal: ThemeSignal): () => void {
  setTimeout(() => {
    document.querySelector('html')?.removeAttribute('loading')
  }, 500)

  const apply = () => {
    const themeSetting = themeSignal()
    const resolvedTheme = resolveTheme(themeSetting)
    const root = document.documentElement

    root.setAttribute('data-theme', resolvedTheme)
    root.setAttribute('theme', resolvedTheme)
  }
  apply()

  // Подписываемся на изменение настройки темы
  const unsubscribe = themeSignal.subscribe(apply)

  // Подписываемся на системные изменения темы
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
