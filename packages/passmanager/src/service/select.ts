import {state} from '@statx/core'

import type {Entry} from './entry'

export const filterValue = state('', {name: 'filter_value'})

export type QuickFilter = 'recent' | 'otp' | 'nopass' | 'files' | 'favorites'
export const quickFilters = state<QuickFilter[]>([], {name: 'quick_filters'})

export const filterRule = (entry: Entry, filterValue: string) => {
  const search = filterValue.toLowerCase()
  const v1 = entry.title?.toLowerCase().includes(search) ?? false
  const v2 = entry.username?.toLowerCase().includes(search) ?? false

  const active = quickFilters()
  if (active.length > 0) {
    // recent: последние 14 дней по updatedTs
    const now = Date.now()
    const recentThreshold = 14 * 24 * 60 * 60 * 1000
    if (active.includes('recent')) {
      if (now - entry.updatedTs > recentThreshold) return false
    }
    if (active.includes('otp')) {
      if (entry.otps().length === 0) return false
    }

    if (active.includes('nopass')) {
      // Недоступно без асинхронного чтения пароля; пока пропускаем условие
    }
  }

  return v1 || v2
}
