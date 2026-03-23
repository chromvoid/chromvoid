export type UiMode = 'new' | 'old'

const LOCAL_STORAGE_KEY = 'pm-ui-mode'

export function getUiMode(): UiMode {
  try {
    const value = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (value === 'new' || value === 'old') return value
  } catch {}
  return 'new'
}

export function setUiMode(mode: UiMode): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, mode)
  } catch {}
}

/**
 * Синхронизирует режим UI с query-параметром `pmui=new|old`.
 * Если параметр присутствует — сохраняем его в localStorage.
 */
export function syncUiModeWithQuery(): UiMode {
  try {
    const url = new URL(window.location.href)
    const param = url.searchParams.get('pmui')
    if (param === 'new' || param === 'old') {
      setUiMode(param)
      return param
    }
  } catch {}
  return getUiMode()
}
