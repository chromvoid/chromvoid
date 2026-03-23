import {type GroupBy, type SortField} from 'root/features/passmanager/components/list/sort-controls'
import type {SearchFilters, SortOption, ViewMode} from 'root/shared/contracts/file-manager'

import {
  type Command,
  type PasswordQuickFilter,
  type PasswordsMobileCommandContext,
} from '../components/command-bar.types'

export interface NavCommandsRuntime {
  setShowFiles: () => void
  setShowPasswords: () => void
  closePalette: () => void
}

export interface FilesCommandsRuntime {
  getSearchFilters: () => SearchFilters
  updateSearchFilters: (updater: (prev: SearchFilters) => SearchFilters) => void
  setSearchFilters: (next: SearchFilters) => void
  toggleFileType: (type: string) => void
  openUpload: () => void
  closePalette: () => void
}

export interface PasswordCommandsRuntime {
  getMobileContext: () => PasswordsMobileCommandContext
  executeMobileCommand: (actionId: string, payload?: {query?: string}) => boolean
  closePalette: () => void
}

export function getNavCommands(runtime: NavCommandsRuntime): Command[] {
  return [
    {
      id: 'nav-files',
      icon: 'folder',
      label: 'Go to Files',
      shortcut: '⌘1',
      category: 'navigation',
      keywords: ['files', 'catalog'],
      action: () => {
        runtime.setShowFiles()
        runtime.closePalette()
      },
    },
    {
      id: 'nav-passwords',
      icon: 'key',
      label: 'Go to Passwords',
      shortcut: '⌘2',
      category: 'navigation',
      keywords: ['passwords', 'vault'],
      action: () => {
        runtime.setShowPasswords()
        runtime.closePalette()
      },
    },
  ]
}

export function getFilesCommands(runtime: FilesCommandsRuntime): Command[] {
  const filters = runtime.getSearchFilters()

  const typeCommands: Array<{id: string; label: string; icon: string}> = [
    {id: 'images', label: 'Images', icon: 'image'},
    {id: 'documents', label: 'Documents', icon: 'file-text'},
    {id: 'videos', label: 'Videos', icon: 'video'},
    {id: 'audio', label: 'Audio', icon: 'music'},
    {id: 'archives', label: 'Archives', icon: 'archive'},
    {id: 'code', label: 'Code', icon: 'code'},
  ]

  const sortCommands: Array<{id: SortOption; label: string}> = [
    {id: 'name', label: 'Sort by Name'},
    {id: 'size', label: 'Sort by Size'},
    {id: 'date', label: 'Sort by Date'},
    {id: 'type', label: 'Sort by Type'},
  ]

  const viewCommands: Array<{id: ViewMode; label: string; icon: string}> = [
    {id: 'list', label: 'View: List', icon: 'list'},
    {id: 'grid', label: 'View: Grid', icon: 'grid'},
    {id: 'table', label: 'View: Table', icon: 'table'},
  ]

  const actionCommands: Command[] = [
    {
      id: 'action-new-folder',
      icon: 'folder-plus',
      label: 'New Folder',
      shortcut: '⌘⇧N',
      category: 'actions',
      keywords: ['create', 'mkdir'],
      action: () => {
        runtime.closePalette()
        window.dispatchEvent(
          new CustomEvent('command-bar:command', {
            detail: {action: 'new-folder'},
          }),
        )
      },
    },
    {
      id: 'action-upload',
      icon: 'upload',
      label: 'Upload Files',
      shortcut: '⌘U',
      category: 'actions',
      keywords: ['upload', 'import'],
      action: () => {
        runtime.openUpload()
      },
    },
  ]

  const filterCommands: Command[] = [
    {
      id: 'filters-clear-query',
      icon: 'x',
      label: 'Clear Search Query',
      category: 'filters',
      keywords: ['clear', 'search', 'query'],
      action: () => {
        runtime.updateSearchFilters((prev) => ({...prev, query: ''}))
        runtime.closePalette()
      },
    },
    {
      id: 'filters-toggle-hidden',
      icon: filters.showHidden ? 'eye' : 'eye-off',
      label: filters.showHidden ? 'Hide Hidden Files' : 'Show Hidden Files',
      category: 'filters',
      keywords: ['hidden', 'dotfiles'],
      action: () => {
        runtime.updateSearchFilters((prev) => ({...prev, showHidden: !prev.showHidden}))
        runtime.closePalette()
      },
    },
    {
      id: 'filters-toggle-sort-direction',
      icon: 'arrow-up-down',
      label: filters.sortDirection === 'asc' ? 'Sort Descending' : 'Sort Ascending',
      category: 'filters',
      keywords: ['sort', 'direction'],
      action: () => {
        runtime.updateSearchFilters((prev) => ({...prev, sortDirection: prev.sortDirection === 'asc' ? 'desc' : 'asc'}))
        runtime.closePalette()
      },
    },
    {
      id: 'filters-reset',
      icon: 'refresh-cw',
      label: 'Reset Filters',
      category: 'filters',
      keywords: ['reset', 'filters'],
      action: () => {
        runtime.setSearchFilters({
          query: '',
          sortBy: 'name',
          sortDirection: 'asc',
          viewMode: 'list',
          showHidden: false,
          fileTypes: [],
        })
        runtime.closePalette()
      },
    },
    ...viewCommands.map((v) => ({
      id: `filters-view-${v.id}`,
      icon: v.icon,
      label: v.label,
      category: 'filters' as const,
      keywords: ['view', v.id],
      action: () => {
        runtime.updateSearchFilters((prev) => ({...prev, viewMode: v.id}))
        runtime.closePalette()
      },
    })),
    ...sortCommands.map((s) => ({
      id: `filters-sort-${s.id}`,
      icon: 'arrow-up-down',
      label: s.label,
      category: 'filters' as const,
      keywords: ['sort', s.id],
      action: () => {
        runtime.updateSearchFilters((prev) => ({...prev, sortBy: s.id}))
        runtime.closePalette()
      },
    })),
    ...typeCommands.map((t) => ({
      id: `filters-type-${t.id}`,
      icon: t.icon,
      label: (filters.fileTypes.includes(t.id) ? 'Remove type: ' : 'Filter type: ') + t.label,
      category: 'filters' as const,
      keywords: ['type', t.id, t.label.toLowerCase()],
      action: () => {
        runtime.toggleFileType(t.id)
        runtime.closePalette()
      },
    })),
  ]

  return actionCommands.concat(filterCommands)
}

export function buildPasswordQuickFilterCommand(
  filter: PasswordQuickFilter,
  active: boolean,
  execute: (actionId: string, payload?: {query?: string}) => boolean,
  close: () => void,
): Command {
  const labels: Record<PasswordQuickFilter, string> = {
    recent: 'Recent',
    otp: 'OTP',
    files: 'With files',
    nopass: 'No password',
    favorites: 'Favorites',
  }

  return {
    id: `pm-filter-${filter}`,
    icon: active ? 'check-circle' : 'circle',
    label: `${active ? 'Disable' : 'Enable'} quick filter: ${labels[filter]}`,
    category: 'filters',
    keywords: ['passwords', 'quick', 'filter', filter],
    action: () => {
      execute('pm-toggle-quick-filter', {query: filter})
      close()
    },
  }
}

export function getPasswordsListCommands(runtime: PasswordCommandsRuntime): Command[] {
  const context = runtime.getMobileContext()
  const quickFilters = context.quickFilters
  const isReadOnly = context.readOnly

  const sortFieldOptions: SortField[] = ['name', 'username', 'modified', 'created', 'website']
  const groupByOptions: GroupBy[] = ['none', 'folder', 'website', 'modified', 'security']

  const actionCommands: Command[] = [
    {
      id: 'pm-create-entry',
      icon: 'plus-lg',
      label: 'Create Entry',
      category: 'actions',
      keywords: ['passwords', 'create', 'entry'],
      disabled: isReadOnly,
      action: () => {
        if (runtime.executeMobileCommand('pm-create-entry')) runtime.closePalette()
      },
    },
    {
      id: 'pm-create-group',
      icon: 'folder-plus',
      label: 'Create Group',
      category: 'actions',
      keywords: ['passwords', 'create', 'group'],
      disabled: isReadOnly,
      action: () => {
        if (runtime.executeMobileCommand('pm-create-group')) runtime.closePalette()
      },
    },
    {
      id: 'pm-export',
      icon: 'cloud-download',
      label: 'Export',
      category: 'actions',
      keywords: ['passwords', 'export'],
      action: () => {
        if (runtime.executeMobileCommand('pm-export')) runtime.closePalette()
      },
    },
    {
      id: 'pm-import',
      icon: 'cloud-upload',
      label: 'Import',
      category: 'actions',
      keywords: ['passwords', 'import'],
      action: () => {
        if (runtime.executeMobileCommand('pm-import')) runtime.closePalette()
      },
    },
    {
      id: 'pm-clean',
      icon: 'trash',
      label: 'Clean',
      category: 'actions',
      keywords: ['passwords', 'clean'],
      action: () => {
        if (runtime.executeMobileCommand('pm-clean')) runtime.closePalette()
      },
    },
  ]

  const filterCommands: Command[] = [
    {
      id: 'pm-search-clear',
      icon: 'x',
      label: 'Clear Password Search',
      category: 'filters',
      keywords: ['passwords', 'search', 'clear', 'query'],
      action: () => {
        if (runtime.executeMobileCommand('pm-search-clear-query')) runtime.closePalette()
      },
    },
    buildPasswordQuickFilterCommand('recent', quickFilters.includes('recent'), runtime.executeMobileCommand, runtime.closePalette),
    buildPasswordQuickFilterCommand('otp', quickFilters.includes('otp'), runtime.executeMobileCommand, runtime.closePalette),
    buildPasswordQuickFilterCommand('files', quickFilters.includes('files'), runtime.executeMobileCommand, runtime.closePalette),
    buildPasswordQuickFilterCommand('nopass', quickFilters.includes('nopass'), runtime.executeMobileCommand, runtime.closePalette),
    buildPasswordQuickFilterCommand('favorites', quickFilters.includes('favorites'), runtime.executeMobileCommand, runtime.closePalette),
    {
      id: 'pm-sort-direction-toggle',
      icon: 'arrow-up-down',
      label: context.sortDirection === 'asc' ? 'Sort Descending' : 'Sort Ascending',
      category: 'filters',
      keywords: ['passwords', 'sort', 'direction'],
      action: () => {
        if (runtime.executeMobileCommand('pm-sort-direction-toggle')) runtime.closePalette()
      },
    },
    ...sortFieldOptions.map((item) => ({
      id: `pm-sort-field-${item}`,
      icon: context.sortField === item ? 'check-circle' : 'circle',
      label: `Sort by ${item}`,
      category: 'filters' as const,
      keywords: ['passwords', 'sort', item],
      action: () => {
        if (runtime.executeMobileCommand(`pm-sort-field-${item}`)) runtime.closePalette()
      },
    })),
    ...groupByOptions.map((item) => ({
      id: `pm-group-by-${item}`,
      icon: context.groupBy === item ? 'check-circle' : 'circle',
      label: `Group by ${item}`,
      category: 'filters' as const,
      keywords: ['passwords', 'group', item],
      action: () => {
        if (runtime.executeMobileCommand(`pm-group-by-${item}`)) runtime.closePalette()
      },
    })),
  ]

  return actionCommands.concat(filterCommands)
}

export function getPasswordsEntryCommands(runtime: PasswordCommandsRuntime): Command[] {
  const context = runtime.getMobileContext()
  const isReadOnly = context.readOnly
  const actionCommands: Command[] = [
    {
      id: 'pm-entry-edit',
      icon: 'pencil-square',
      label: 'Edit Entry',
      category: 'actions',
      keywords: ['passwords', 'entry', 'edit'],
      disabled: isReadOnly,
      action: () => {
        if (runtime.executeMobileCommand('pm-entry-edit')) runtime.closePalette()
      },
    },
    {
      id: 'pm-entry-move',
      icon: 'folder-symlink',
      label: 'Move Entry',
      category: 'actions',
      keywords: ['passwords', 'entry', 'move'],
      disabled: isReadOnly,
      action: () => {
        if (runtime.executeMobileCommand('pm-entry-move')) runtime.closePalette()
      },
    },
    {
      id: 'pm-entry-delete',
      icon: 'trash',
      label: 'Delete Entry',
      category: 'actions',
      keywords: ['passwords', 'entry', 'delete'],
      disabled: isReadOnly,
      action: () => {
        if (runtime.executeMobileCommand('pm-entry-delete')) runtime.closePalette()
      },
    },
    {
      id: 'pm-export',
      icon: 'cloud-download',
      label: 'Export',
      category: 'actions',
      keywords: ['passwords', 'export'],
      action: () => {
        if (runtime.executeMobileCommand('pm-export')) runtime.closePalette()
      },
    },
    {
      id: 'pm-import',
      icon: 'cloud-upload',
      label: 'Import',
      category: 'actions',
      keywords: ['passwords', 'import'],
      action: () => {
        if (runtime.executeMobileCommand('pm-import')) runtime.closePalette()
      },
    },
    {
      id: 'pm-clean',
      icon: 'trash',
      label: 'Clean',
      category: 'actions',
      keywords: ['passwords', 'clean'],
      action: () => {
        if (runtime.executeMobileCommand('pm-clean')) runtime.closePalette()
      },
    },
  ]

  return actionCommands
}
