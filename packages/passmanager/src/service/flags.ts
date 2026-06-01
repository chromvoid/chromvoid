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

/**Synchronizes the UI mode with the query parameter pmui=new|old.
If the parameter is present, save it to localStorage.
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
