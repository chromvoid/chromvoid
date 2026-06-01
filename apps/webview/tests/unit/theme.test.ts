import {afterEach, describe, expect, it, vi} from 'vitest'

import {bindTheme, type AppTheme} from '../../src/shared/services/theme'

type ThemeSignal = (() => AppTheme | undefined) & {
  set(value: AppTheme): void
  emit(): void
  subscribe(listener: () => void): () => void
}

function createThemeSignal(initial: AppTheme, options: {emitOnSubscribe?: boolean} = {}): ThemeSignal {
  let value: AppTheme = initial
  const listeners = new Set<() => void>()

  return Object.assign(
    () => value,
    {
      set(next: AppTheme) {
        value = next
        for (const listener of listeners) listener()
      },
      emit() {
        for (const listener of listeners) listener()
      },
      subscribe(listener: () => void) {
        listeners.add(listener)
        if (options.emitOnSubscribe) listener()
        return () => {
          listeners.delete(listener)
        }
      },
    },
  )
}

describe('bindTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('theme')
    vi.restoreAllMocks()
  })

  it('suppresses subscribe-time callbacks after explicit initial apply', () => {
    const setAttribute = vi.spyOn(document.documentElement, 'setAttribute')
    const theme = createThemeSignal('dark', {emitOnSubscribe: true})

    const unbind = bindTheme(theme)
    try {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(document.documentElement.getAttribute('theme')).toBe('dark')
      expect(setAttribute).toHaveBeenCalledTimes(2)

      theme.emit()
      expect(setAttribute).toHaveBeenCalledTimes(2)

      theme.set('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
      expect(setAttribute).toHaveBeenCalledTimes(4)
    } finally {
      unbind()
    }
  })
})
