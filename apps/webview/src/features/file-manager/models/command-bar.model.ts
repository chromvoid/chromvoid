import {state} from '@statx/core'
import {open} from '@tauri-apps/plugin-dialog'

import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {getAppContext} from 'root/shared/services/app-context'
import {navigationModel} from 'root/app/navigation/navigation.model'
import type {CommandPaletteMode} from 'root/shared/services/command-palette'
import type {SearchFilters} from 'root/shared/contracts/file-manager'
import {type GroupBy, type SortField} from 'root/features/passmanager/components/list/sort-controls'

import {
  type Command,
  type CommandCategory,
  type CommandContext,
  type PasswordsMobileCommandContext,
  type PasswordsMobileCommandProvider,
} from '../components/command-bar.types'
import {
  getFilesCommands,
  getNavCommands,
  getPasswordsEntryCommands,
  getPasswordsListCommands,
  type FilesCommandsRuntime,
  type NavCommandsRuntime,
  type PasswordCommandsRuntime,
} from '../services/command-bar-commands'

export interface CommandBarRuntime {
  requestOpen: () => void
  requestClose: () => void
  focusSearchInput: () => void
  openFileInput: () => void
  dispatchCommand: (detail: {action: string; paths?: string[]; files?: FileList | null}) => void
  getPasswordsMobileCommandProvider: () => PasswordsMobileCommandProvider | null
}

export class CommandBarModel {
  readonly query = state('')
  readonly selectedIndex = state(0)
  readonly openMode = state<CommandPaletteMode>('all')
  readonly isOpenState = state(false)

  private readonly navCommands: Command[]

  constructor(private readonly runtime: CommandBarRuntime) {
    this.navCommands = getNavCommands(this.getNavRuntime())
  }

  open(mode: CommandPaletteMode = 'all') {
    this.isOpenState.set(true)
    this.query.set('')
    this.selectedIndex.set(0)
    this.openMode.set(mode)
    this.runtime.requestOpen()

    queueMicrotask(() => {
      this.runtime.focusSearchInput()
    })
  }

  close() {
    this.isOpenState.set(false)
    this.runtime.requestClose()
    this.openMode.set('all')
  }

  getDefaultSearchFilters(): SearchFilters {
    return {
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    }
  }

  updateSearchFilters(updater: (prev: SearchFilters) => SearchFilters) {
    const {store} = getAppContext()
    store.setSearchFilters(updater(store.searchFilters()))
  }

  toggleFileType(type: string) {
    this.updateSearchFilters((prev) => {
      const nextTypes = prev.fileTypes.includes(type)
        ? prev.fileTypes.filter((t) => t !== type)
        : [...prev.fileTypes, type]
      return {...prev, fileTypes: nextTypes}
    })
  }

  private async openUpload() {
    if (
      isTauriRuntime() &&
      getRuntimeCapabilities().supports_native_path_io &&
      getAppContext().store.remoteSessionState() === 'inactive'
    ) {
      try {
        const selected = await open({multiple: true, directory: false})
        const paths = Array.isArray(selected) ? selected : selected ? [selected] : []
        if (paths.length > 0) {
          this.runtime.dispatchCommand({action: 'upload-paths', paths})
        }
      } catch {
        this.runtime.openFileInput()
      }
      this.close()
      return
    }

    this.runtime.openFileInput()
  }

  onFileInputChange = (e: Event) => {
    const files = (e.target as HTMLInputElement).files
    if (files && files.length > 0) {
      this.runtime.dispatchCommand({action: 'upload-files', files})
      ;(e.target as HTMLInputElement).value = ''
      this.close()
    }
  }

  resolveCommandContext(): CommandContext {
    const {store} = getAppContext()

    if (store.layoutMode() !== 'mobile') {
      return 'files'
    }

    const surface = navigationModel.mobileCommandSurface()
    if (surface === 'none') {
      return 'none'
    }

    if (surface === 'files') {
      return 'files'
    }

    const provider = this.getPasswordsMobileCommandProvider()
    const context = provider?.getMobileCommandContext?.()
    if (!context) return 'passwords-list'
    return context.kind
  }

  private getPasswordsMobileCommandProvider(): PasswordsMobileCommandProvider | null {
    return this.runtime.getPasswordsMobileCommandProvider()
  }

  getPasswordsMobileCommandContext(): PasswordsMobileCommandContext {
    const provider = this.getPasswordsMobileCommandProvider()
    const context = provider?.getMobileCommandContext?.()
    return (
      context ?? {
        kind: 'none',
        readOnly: false,
        hasActiveFilters: false,
        query: '',
        quickFilters: [],
        sortField: 'name',
        sortDirection: 'asc',
        groupBy: 'none',
      }
    )
  }

  executePasswordsMobileCommand(actionId: string, payload?: {query?: string}): boolean {
    const provider = this.getPasswordsMobileCommandProvider()
    return provider?.executeMobileCommand?.(actionId, payload) ?? false
  }

  onOpenRequest = (e: Event) => {
    const detail = (e as CustomEvent<{mode?: CommandPaletteMode}> | undefined)?.detail
    this.openFromRequest(detail?.mode ?? 'all')
  }

  openFromRequest(mode: CommandPaletteMode) {
    const {store} = getAppContext()
    const context = this.resolveCommandContext()
    if (store.layoutMode() === 'mobile' && context === 'none') return

    let effectiveMode = mode
    const supportsSearchMode = context === 'files' || context === 'passwords-list'
    if (mode === 'search' && !supportsSearchMode) {
      effectiveMode = 'all'
    }

    this.open(effectiveMode)
  }

  onKeyDown = (e: KeyboardEvent) => {
    if (!this.isOpen) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        this.openFromRequest('all')
      }
      return
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        this.close()
        return
      case 'ArrowDown':
        e.preventDefault()
        this.moveSelection(1)
        return
      case 'ArrowUp':
        e.preventDefault()
        this.moveSelection(-1)
        return
      case 'Enter':
        e.preventDefault()
        this.executeSelected()
        return
    }
  }

  private getFilesRuntime(): FilesCommandsRuntime {
    return {
      getSearchFilters: () => getAppContext().store.searchFilters(),
      updateSearchFilters: this.updateSearchFilters.bind(this),
      setSearchFilters: (next) => getAppContext().store.setSearchFilters(next),
      toggleFileType: this.toggleFileType.bind(this),
      openUpload: this.openUpload.bind(this),
      closePalette: this.close.bind(this),
    }
  }

  private getPasswordRuntime(): PasswordCommandsRuntime {
    return {
      getMobileContext: () => this.getPasswordsMobileCommandContext(),
      executeMobileCommand: this.executePasswordsMobileCommand.bind(this),
      closePalette: this.close.bind(this),
    }
  }

  private getNavRuntime(): NavCommandsRuntime {
    return {
      setShowFiles: () => {
        navigationModel.navigateToSurface('files')
      },
      setShowPasswords: () => {
        navigationModel.navigateToSurface('passwords')
      },
      closePalette: this.close.bind(this),
    }
  }

  getFilesCommands(): Command[] {
    return getFilesCommands(this.getFilesRuntime())
  }

  getPasswordsListCommands(): Command[] {
    return getPasswordsListCommands(this.getPasswordRuntime())
  }

  getPasswordsEntryCommands(): Command[] {
    return getPasswordsEntryCommands(this.getPasswordRuntime())
  }

  getContextCommands(context: CommandContext): Command[] {
    if (context === 'files') return [...this.navCommands, ...this.getFilesCommands()]
    if (context === 'passwords-list') return [...this.navCommands, ...this.getPasswordsListCommands()]
    if (context === 'passwords-entry') return [...this.navCommands, ...this.getPasswordsEntryCommands()]
    return []
  }

  getContextSearchCommand(context: CommandContext, query: string): Command | null {
    if (context === 'files') {
      return {
        id: 'search-files',
        icon: 'search',
        label: query ? `Search files: ${query}` : 'Search files',
        category: 'search',
        keywords: ['search', 'query', 'files'],
        action: () => {
          this.updateSearchFilters((prev) => ({...prev, query}))
          this.close()
        },
      }
    }

    if (context === 'passwords-list') {
      return {
        id: 'search-passwords',
        icon: 'search',
        label: query ? `Search passwords: ${query}` : 'Search passwords',
        category: 'search',
        keywords: ['search', 'query', 'passwords'],
        action: () => {
          this.executePasswordsMobileCommand('pm-search-set-query', {query})
          this.close()
        },
      }
    }

    return null
  }

  getFilteredCommands(): Command[] {
    const q = this.query().trim()
    const qLower = q.toLowerCase()
    const mode = this.openMode()
    const context = this.resolveCommandContext()
    const allContextCommands = this.getContextCommands(context)
    const modeCommands =
      mode === 'all'
        ? allContextCommands
        : allContextCommands.filter((command) =>
            mode === 'filters' ? command.category === 'filters' : command.category === 'search',
          )

    const matched =
      qLower.length === 0
        ? modeCommands
        : modeCommands.filter((cmd) => {
            const haystack = [cmd.label, ...(cmd.keywords ?? [])].join(' ').toLowerCase()
            return haystack.includes(qLower)
          })

    const searchCommand = this.getContextSearchCommand(context, q)
    if (mode === 'search') {
      if (!searchCommand) return matched
      if (qLower.length === 0) return [searchCommand]
      return matched.length > 0 ? [...matched, searchCommand] : [searchCommand]
    }

    if (qLower.length === 0 || !searchCommand || mode !== 'all') {
      return matched
    }

    return matched.length > 0 ? [...matched, searchCommand] : [searchCommand]
  }

  getSortedCommandGroups(): Record<CommandCategory, Command[]> {
    const list = this.getFilteredCommands()
    const groups: Record<CommandCategory, Command[]> = {
      navigation: [],
      actions: [],
      filters: [],
      search: [],
    }

    for (const cmd of list) {
      groups[cmd.category].push(cmd)
    }

    return groups
  }

  moveSelection(delta: number) {
    const list = this.getFilteredCommands()
    if (list.length === 0) return
    const next = Math.max(0, Math.min(list.length - 1, this.selectedIndex() + delta))
    this.selectedIndex.set(next)
  }

  executeSelected() {
    const list = this.getFilteredCommands()
    const cmd = list[this.selectedIndex()]
    if (!cmd || cmd.disabled) return
    cmd.action()
  }

  onInput = (e: Event) => {
    this.query.set((e.target as HTMLInputElement).value)
    this.selectedIndex.set(0)
  }

  onBackdropClick = () => {
    this.close()
  }

  get isOpen() {
    return this.isOpenState()
  }

  get categoryOrder(): CommandCategory[] {
    return ['actions', 'navigation', 'filters', 'search']
  }

  get categoryLabels(): Record<CommandCategory, string> {
    return {
      navigation: 'Navigation',
      actions: 'Actions',
      filters: 'Filters',
      search: 'Search',
    }
  }

  commandIsSelected(index: number) {
    return this.selectedIndex() === index
  }

  get commandListLength() {
    return this.getFilteredCommands().length
  }

  get commandList() {
    return this.getFilteredCommands()
  }

  get selectedCommandIndex() {
    return this.selectedIndex()
  }

  private getCommandList(): Command[] {
    return this.getFilteredCommands()
  }

  get defaultSearchFilters(): SearchFilters {
    return this.getDefaultSearchFilters()
  }
}
