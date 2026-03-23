export type LayoutMode = 'mobile' | 'desktop'
export type LayoutQueryParam = 'mobile' | 'desktop' | 'auto'

export const LAYOUT_STORAGE_KEY = 'layout-mode'

const VALID_MODES: ReadonlySet<string> = new Set(['mobile', 'desktop'])
const VALID_QUERY_VALUES: ReadonlySet<string> = new Set(['mobile', 'desktop', 'auto'])

export interface LayoutResolutionInput {
  isMobile: boolean
  matchesBreakpoint: boolean
  queryParam: string | null
  persisted: string | null
}

function isValidMode(value: string | null): value is LayoutMode {
  return value !== null && VALID_MODES.has(value)
}

function isValidQueryParam(value: string | null): value is LayoutQueryParam {
  return value !== null && VALID_QUERY_VALUES.has(value)
}

function resolveAuto(isMobile: boolean, matchesBreakpoint: boolean): LayoutMode {
  if (isMobile) return 'mobile'
  return matchesBreakpoint ? 'mobile' : 'desktop'
}

export function resolveLayoutMode(input: LayoutResolutionInput): LayoutMode {
  const {isMobile, matchesBreakpoint, queryParam, persisted} = input

  if (isValidQueryParam(queryParam)) {
    if (queryParam === 'auto') return resolveAuto(isMobile, matchesBreakpoint)
    return queryParam
  }

  if (isValidMode(persisted)) {
    return persisted
  }

  return resolveAuto(isMobile, matchesBreakpoint)
}

export function applyLayoutQueryParam(value: string): void {
  if (!isValidQueryParam(value)) return

  if (value === 'auto') {
    localStorage.removeItem(LAYOUT_STORAGE_KEY)
    return
  }

  localStorage.setItem(LAYOUT_STORAGE_KEY, value)
}

export function getPersistedLayoutMode(): LayoutMode | null {
  const stored = localStorage.getItem(LAYOUT_STORAGE_KEY)
  return isValidMode(stored) ? stored : null
}

export const MOBILE_BREAKPOINT_QUERY = '(max-width: 767px)'
