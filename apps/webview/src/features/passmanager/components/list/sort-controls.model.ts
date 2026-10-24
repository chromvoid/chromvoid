import {MAX_SAFE_TIMEOUT, atom, withLocalStorage} from '@reatom/core'

// Types of sorting
export type SortField = 'name' | 'username' | 'modified' | 'created' | 'website'
export type SortDirection = 'asc' | 'desc'
export type GroupBy = 'none' | 'website' | 'modified' | 'security'
export type ViewMode = 'default' | 'compact' | 'dense'

const GROUP_BY_VALUES: readonly GroupBy[] = ['none', 'website', 'modified', 'security']
const VIEW_MODE_VALUES: readonly ViewMode[] = ['default', 'compact', 'dense']

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStoredEnumValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

function readPersistedEnumValue<T extends string>(value: string, values: readonly T[]): T | null {
  try {
    const record: unknown = JSON.parse(value)
    if (!isObjectRecord(record)) {
      return null
    }

    const data = record['data']
    const id = record['id']
    const timestamp = record['timestamp']
    const version = record['version']
    const to = record['to']

    if (
      !isStoredEnumValue(data, values) ||
      typeof id !== 'number' ||
      typeof timestamp !== 'number' ||
      version !== 0 ||
      typeof to !== 'number' ||
      to < Date.now()
    ) {
      return null
    }

    return data
  } catch {
    return null
  }
}

function readStoredEnumValue<T extends string>(value: string | null, values: readonly T[]): T | null {
  if (value === null) {
    return null
  }

  return isStoredEnumValue(value, values) ? value : readPersistedEnumValue(value, values)
}

function serializePersistedEnumValue<T extends string>(value: T): string {
  const now = Date.now()
  return JSON.stringify({
    data: value,
    id: now,
    timestamp: now,
    to: now + MAX_SAFE_TIMEOUT,
    version: 0,
  })
}

function normalizePersistedEnumKey<T extends string>(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  currentValue: string | null,
  nextValue: T,
  values: readonly T[],
  writeMissing = false,
): void {
  if (currentValue === null && !writeMissing) {
    return
  }

  if (currentValue !== null && readPersistedEnumValue(currentValue, values) === nextValue) {
    return
  }

  storage.setItem(key, serializePersistedEnumValue(nextValue))
}

function normalizeRawEnumKey<T extends string>(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  currentValue: string | null,
  nextValue: T,
): void {
  if (currentValue !== null && currentValue !== nextValue) {
    storage.setItem(key, nextValue)
  }
}

export function normalizeStoredGroupBy(storage?: Pick<Storage, 'getItem' | 'setItem'>): GroupBy {
  try {
    const storageApi = storage ?? localStorage
    const persistedKey = 'pm_group_by'
    const legacyKey = 'pm-group-by'
    const persistedValue = storageApi.getItem(persistedKey)
    const legacyValue = storageApi.getItem(legacyKey)
    const next =
      readStoredEnumValue(persistedValue, GROUP_BY_VALUES) ??
      readStoredEnumValue(legacyValue, GROUP_BY_VALUES) ??
      'none'

    normalizePersistedEnumKey(
      storageApi,
      persistedKey,
      persistedValue,
      next,
      GROUP_BY_VALUES,
      legacyValue !== null,
    )
    normalizeRawEnumKey(storageApi, legacyKey, legacyValue, next)

    return next
  } catch {
    return 'none'
  }
}

export function normalizeStoredViewMode(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): ViewMode {
  try {
    const storageApi = storage ?? localStorage
    const persistedKey = 'pm_view_mode'
    const legacyKey = 'pm-view-mode'
    const persistedValue = storageApi.getItem(persistedKey)
    const legacyValue = storageApi.getItem(legacyKey)
    const next =
      readStoredEnumValue(persistedValue, VIEW_MODE_VALUES) ??
      readStoredEnumValue(legacyValue, VIEW_MODE_VALUES) ??
      'default'

    normalizePersistedEnumKey(
      storageApi,
      persistedKey,
      persistedValue,
      next,
      VIEW_MODE_VALUES,
      legacyValue !== null,
    )
    if (legacyValue !== null) {
      storageApi.removeItem(legacyKey)
    }

    return next
  } catch {
    return 'default'
  }
}

// Global status of sorting and grouping
export const sortField = atom<SortField>('name', 'pm_sort_field').extend(
  withLocalStorage({key: 'pm_sort_field'}),
)
export const sortDirection = atom<SortDirection>('asc', 'pm_sort_direction').extend(
  withLocalStorage({key: 'pm_sort_direction'}),
)
export const groupBy = atom<GroupBy>(normalizeStoredGroupBy(), 'pm_group_by').extend(
  withLocalStorage({key: 'pm_group_by'}),
)
export const viewMode = atom<ViewMode>(normalizeStoredViewMode(), 'pm_view_mode').extend(
  withLocalStorage({key: 'pm_view_mode'}),
)
