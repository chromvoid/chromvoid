import {type GroupBy, type SortDirection, type SortField} from 'root/features/passmanager/components/list/sort-controls'
import type {KeyboardShortcutId} from 'root/shared/keyboard'

export type CommandCategory = 'navigation' | 'actions' | 'filters' | 'search'
export type CommandContext = 'files' | 'notes' | 'passwords-list' | 'passwords-entry' | 'none'

export type PasswordQuickFilter = 'recent' | 'otp' | 'ssh' | 'card'

export type PasswordsMobileCommandContext = {
  kind: 'passwords-list' | 'passwords-entry' | 'none'
  readOnly: boolean
  hasActiveFilters: boolean
  query: string
  quickFilters: string[]
  sortField: SortField
  sortDirection: SortDirection
  groupBy: GroupBy
}

export type Command = {
  id: string
  icon: string
  label: string
  category: CommandCategory
  shortcutId?: KeyboardShortcutId
  keywords?: string[]
  disabled?: boolean
  action: () => void
}
