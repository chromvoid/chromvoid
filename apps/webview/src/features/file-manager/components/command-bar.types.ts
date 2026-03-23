import {type GroupBy, type SortDirection, type SortField} from 'root/features/passmanager/components/list/sort-controls'

export type CommandCategory = 'navigation' | 'actions' | 'filters' | 'search'
export type CommandContext = 'files' | 'passwords-list' | 'passwords-entry' | 'none'

export type PasswordQuickFilter = 'recent' | 'otp' | 'files' | 'nopass' | 'favorites'

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

export type PasswordsMobileCommandProvider = HTMLElement & {
  getMobileCommandContext?: () => PasswordsMobileCommandContext
  executeMobileCommand?: (actionId: string, payload?: {query?: string}) => boolean
}

export type Command = {
  id: string
  icon: string
  label: string
  category: CommandCategory
  shortcut?: string
  keywords?: string[]
  disabled?: boolean
  action: () => void
}
