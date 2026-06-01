import {
  GROUP_BY_OPTIONS,
  SORT_FIELD_OPTIONS,
  getGroupByLabel,
  getSortFieldLabel,
} from 'root/features/passmanager/components/list/sort-options'
import type {SearchFilters, SortOption, ViewMode} from 'root/shared/contracts/file-manager'
import {i18n} from 'root/i18n'
import type {FileManagerCommand} from './file-manager-commands'

import {
  type Command,
  type PasswordQuickFilter,
  type PasswordsMobileCommandContext,
} from '../components/command-bar.types'

export interface NavCommandsRuntime {
  setShowFiles: () => void
  setShowNotes: () => void
  setShowPasswords: () => void
  closePalette: () => void
}

export interface FilesCommandsRuntime {
  getSearchFilters: () => SearchFilters
  updateSearchFilters: (updater: (prev: SearchFilters) => SearchFilters) => void
  setSearchFilters: (next: SearchFilters) => void
  toggleFileType: (type: string) => void
  openUpload: () => void
  dispatchCommand: (command: FileManagerCommand) => void
  closePalette: () => void
}

export interface PasswordCommandsRuntime {
  getMobileContext: () => PasswordsMobileCommandContext
  executeMobileCommand: (actionId: string, payload?: {query?: string}) => boolean
  closePalette: () => void
}

const getQuickFilterLabel = (filter: PasswordQuickFilter): string => {
  switch (filter) {
    case 'recent':
      return i18n('command-bar:quick-filter:recent')
    case 'otp':
      return i18n('command-bar:quick-filter:otp')
    case 'ssh':
      return i18n('command-bar:quick-filter:ssh')
    case 'card':
      return i18n('command-bar:quick-filter:card')
  }
}

export function getNavCommands(runtime: NavCommandsRuntime): Command[] {
  return [
    {
      id: 'nav-files',
      icon: 'folder',
      label: i18n('command-bar:go-to-files'),
      shortcutId: 'nav.files',
      category: 'navigation',
      keywords: ['files', 'catalog'],
      action: () => {
        runtime.setShowFiles()
        runtime.closePalette()
      },
    },
    {
      id: 'nav-notes',
      icon: 'file-text',
      label: i18n('command-bar:go-to-notes' as never),
      category: 'navigation',
      keywords: ['notes', 'markdown', 'md'],
      action: () => {
        runtime.setShowNotes()
        runtime.closePalette()
      },
    },
    {
      id: 'nav-passwords',
      icon: 'key',
      label: i18n('command-bar:go-to-passwords'),
      shortcutId: 'nav.passwords',
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
    {id: 'images', label: i18n('file-manager:type:images'), icon: 'image'},
    {id: 'documents', label: i18n('file-manager:type:documents'), icon: 'file-text'},
    {id: 'videos', label: i18n('file-manager:type:videos'), icon: 'video'},
    {id: 'audio', label: i18n('file-manager:type:audio'), icon: 'music'},
    {id: 'archives', label: i18n('file-manager:type:archives'), icon: 'archive'},
    {id: 'code', label: i18n('file-manager:type:code'), icon: 'code'},
  ]

  const sortCommands: Array<{id: SortOption; label: string}> = [
    {id: 'name', label: i18n('command-bar:sort-by', {label: i18n('file-manager:name')})},
    {id: 'size', label: i18n('command-bar:sort-by', {label: i18n('file-manager:size')})},
    {id: 'date', label: i18n('command-bar:sort-by', {label: i18n('file-manager:modified')})},
    {id: 'type', label: i18n('command-bar:sort-by', {label: i18n('file-manager:type')})},
  ]

  const viewCommands: Array<{id: ViewMode; label: string; icon: string}> = [
    {id: 'list', label: i18n('command-bar:view:list'), icon: 'list'},
    {id: 'grid', label: i18n('command-bar:view:grid'), icon: 'grid'},
    {id: 'table', label: i18n('command-bar:view:table'), icon: 'table'},
  ]

  const actionCommands: Command[] = [
    {
      id: 'action-new-note',
      icon: 'book-plus',
      label: i18n('command-bar:new-note'),
      category: 'actions',
      keywords: ['create', 'note', 'markdown', 'md'],
      action: () => {
        runtime.closePalette()
        runtime.dispatchCommand({kind: 'create-markdown-note'})
      },
    },
    {
      id: 'action-new-folder',
      icon: 'folder-plus',
      label: i18n('command-bar:new-folder'),
      shortcutId: 'files.newFolder',
      category: 'actions',
      keywords: ['create', 'mkdir'],
      action: () => {
        runtime.closePalette()
        runtime.dispatchCommand({kind: 'create-dir'})
      },
    },
    {
      id: 'action-upload',
      icon: 'upload',
      label: i18n('command-bar:upload-files'),
      shortcutId: 'files.upload',
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
      label: i18n('command-bar:clear-search-query'),
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
      label: filters.showHidden
        ? i18n('command-bar:hide-hidden-files')
        : i18n('command-bar:show-hidden-files'),
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
      label:
        filters.sortDirection === 'asc'
          ? i18n('command-bar:sort-descending')
          : i18n('command-bar:sort-ascending'),
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
      label: i18n('command-bar:reset-filters'),
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
      label: filters.fileTypes.includes(t.id)
        ? i18n('command-bar:remove-type', {label: t.label})
        : i18n('command-bar:filter-type', {label: t.label}),
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
  return {
    id: `pm-filter-${filter}`,
    icon: active ? 'check-circle' : 'circle',
    label: i18n(
      active ? 'command-bar:disable-quick-filter' : 'command-bar:enable-quick-filter',
      {label: getQuickFilterLabel(filter)},
    ),
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

  const passwordQuickFilterOptions: PasswordQuickFilter[] = ['recent', 'otp', 'ssh', 'card']

  const actionCommands: Command[] = [
    {
      id: 'pm-create-entry',
      icon: 'plus-lg',
      label: i18n('command-bar:create-entry'),
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
      label: i18n('command-bar:create-group'),
      category: 'actions',
      keywords: ['passwords', 'create', 'group'],
      disabled: isReadOnly,
      action: () => {
        if (runtime.executeMobileCommand('pm-create-group')) runtime.closePalette()
      },
    },
  ]

  const filterCommands: Command[] = [
    {
      id: 'pm-search-clear',
      icon: 'x',
      label: i18n('command-bar:clear-password-search'),
      category: 'filters',
      keywords: ['passwords', 'search', 'clear', 'query'],
      action: () => {
        if (runtime.executeMobileCommand('pm-search-clear-query')) runtime.closePalette()
      },
    },
    ...passwordQuickFilterOptions.map((filter) =>
      buildPasswordQuickFilterCommand(
        filter,
        quickFilters.includes(filter),
        runtime.executeMobileCommand,
        runtime.closePalette,
      ),
    ),
    {
      id: 'pm-sort-direction-toggle',
      icon: 'arrow-up-down',
      label:
        context.sortDirection === 'asc'
          ? i18n('command-bar:sort-descending')
          : i18n('command-bar:sort-ascending'),
      category: 'filters',
      keywords: ['passwords', 'sort', 'direction'],
      action: () => {
        if (runtime.executeMobileCommand('pm-sort-direction-toggle')) runtime.closePalette()
      },
    },
    ...SORT_FIELD_OPTIONS.map((option) => ({
      id: `pm-sort-field-${option.value}`,
      icon: context.sortField === option.value ? 'check-circle' : 'circle',
      label: i18n('command-bar:sort-by', {label: getSortFieldLabel(option.value)}),
      category: 'filters' as const,
      keywords: ['passwords', 'sort', option.value],
      action: () => {
        if (runtime.executeMobileCommand(`pm-sort-field-${option.value}`)) runtime.closePalette()
      },
    })),
    ...GROUP_BY_OPTIONS.map((option) => ({
      id: `pm-group-by-${option.value}`,
      icon: context.groupBy === option.value ? 'check-circle' : 'circle',
      label: i18n('command-bar:group-by', {label: getGroupByLabel(option.value)}),
      category: 'filters' as const,
      keywords: ['passwords', 'group', option.value],
      action: () => {
        if (runtime.executeMobileCommand(`pm-group-by-${option.value}`)) runtime.closePalette()
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
      id: 'pm-entry-copy-all',
      icon: 'cloud-download',
      label: i18n('command-bar:copy-all-entry'),
      category: 'actions',
      keywords: ['passwords', 'entry', 'copy', 'export'],
      action: () => {
        if (runtime.executeMobileCommand('pm-entry-copy-all')) runtime.closePalette()
      },
    },
    {
      id: 'pm-entry-edit',
      icon: 'pencil-square',
      label: i18n('command-bar:edit-entry'),
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
      label: i18n('command-bar:move-entry'),
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
      label: i18n('command-bar:delete-entry'),
      category: 'actions',
      keywords: ['passwords', 'entry', 'delete'],
      disabled: isReadOnly,
      action: () => {
        if (runtime.executeMobileCommand('pm-entry-delete')) runtime.closePalette()
      },
    },
  ]

  return actionCommands
}
