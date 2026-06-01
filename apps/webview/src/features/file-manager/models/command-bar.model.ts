import {open} from '@tauri-apps/plugin-dialog'

import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {getAppContext, tryGetAppContext} from 'root/shared/services/app-context'
import {beginMobileFilePickerSession} from 'root/shared/services/mobile-file-picker-session'
import {keyboardShortcutsModel} from 'root/shared/keyboard'
import {atom, wrap} from '@reatom/core'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {pmMobileChromeModel} from 'root/features/passmanager/models/pm-mobile-chrome.model'
import type {CommandPaletteMode} from 'root/shared/services/command-palette'
import type {SearchFilters} from 'root/shared/contracts/file-manager'
import {transientBackModel} from 'root/shared/services/transient-back.model'
import {subscribeToSignalChanges} from 'root/shared/services/subscribed-signal'

import {
  type Command,
  type CommandCategory,
  type CommandContext,
  type PasswordsMobileCommandContext,
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
import type {FileManagerCommand} from '../services/file-manager-commands'

export interface CommandBarRuntime {
  requestOpen: () => void
  requestClose: () => void
  focusSearchInput: () => void
  openFileInput: () => void
  endFilePickerSession?: () => void
  dispatchCommand: (command: FileManagerCommand) => void
}

export type CommandBarActionSnapshot = {
  id: string
  label: string
  category: CommandCategory
  context: CommandContext | 'unavailable'
  disabled: boolean
  shortcutId?: string
  executableViaWebMcp: boolean
  nonExecutableReason?: string
}

export type CommandBarAgentState = {
  available: boolean
  isOpen: boolean
  mode: CommandPaletteMode
  query: string
  selectedIndex: number
  context: CommandContext | 'unavailable'
  commandCount: number
  safeActionCount: number
  unavailableReason?: string
}

export type CommandBarExecuteResult =
  | {ok: true; command: CommandBarActionSnapshot}
  | {ok: false; error: {code: string; message: string}}

const noopCommandBarRuntime: CommandBarRuntime = {
  requestOpen: () => {},
  requestClose: () => {},
  focusSearchInput: () => {},
  openFileInput: () => {},
  dispatchCommand: () => {},
}

export class CommandBarModel {
  readonly query = atom('')
  readonly selectedIndex = atom(0)
  readonly openMode = atom<CommandPaletteMode>('all')
  readonly isOpenState = atom(false)

  private readonly navCommands: Command[]
  private connected = false
  private connectionCount = 0
  private lastCloseBoundaryKey: string | null = null
  private unregisterTransientBack?: () => void
  private readonly unsubscribers: Array<() => void> = []
  private runtimeToken = 0

  constructor(private runtime: CommandBarRuntime = noopCommandBarRuntime) {
    this.navCommands = getNavCommands(this.getNavRuntime())
  }

  attachRuntime(runtime: CommandBarRuntime): () => void {
    const token = ++this.runtimeToken
    this.runtime = runtime

    if (this.isOpen) {
      this.runtime.requestOpen()
    }

    return () => {
      if (this.runtimeToken !== token) {
        return
      }

      if (this.isOpen) {
        this.runtime.requestClose()
      }
      this.runtime = noopCommandBarRuntime
    }
  }

  connect() {
    this.connectionCount += 1
    if (this.connected) return
    this.connected = true
    this.lastCloseBoundaryKey = this.getCloseBoundaryKey()
    this.unregisterTransientBack = transientBackModel.register(() => this.consumeBack(), {priority: 60})

    this.unsubscribers.push(
      subscribeToSignalChanges(navigationModel.snapshot, () => {
        this.handleCloseBoundaryChange()
      }),
    )

    const ctx = tryGetAppContext()
    const layoutMode = ctx?.store?.layoutMode
    if (layoutMode && typeof layoutMode.subscribe === 'function') {
      this.unsubscribers.push(
        subscribeToSignalChanges(layoutMode, () => {
          this.handleCloseBoundaryChange()
        }),
      )
    }
  }

  disconnect() {
    if (this.connectionCount > 0) {
      this.connectionCount -= 1
    }

    if (this.connectionCount > 0) {
      return
    }

    if (!this.connected) return
    this.connected = false
    this.close()
    this.query.set('')
    this.selectedIndex.set(0)
    this.lastCloseBoundaryKey = null
    this.unregisterTransientBack?.()
    this.unregisterTransientBack = undefined

    while (this.unsubscribers.length > 0) {
      const unsubscribe = this.unsubscribers.pop()
      try {
        unsubscribe?.()
      } catch {
        // best-effort cleanup
      }
    }
  }

  open(mode: CommandPaletteMode = 'all') {
    this.isOpenState.set(true)
    this.query.set(this.getInitialQuery(mode))
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

  private consumeBack(): boolean {
    if (!this.isOpenState()) {
      return false
    }

    this.close()
    return true
  }

  private closeOnContextChange() {
    if (!this.isOpenState()) return
    this.close()
  }

  private handleCloseBoundaryChange() {
    const nextKey = this.getCloseBoundaryKey()
    if (nextKey === this.lastCloseBoundaryKey) {
      return
    }

    const hasPreviousBoundary = this.lastCloseBoundaryKey !== null
    this.lastCloseBoundaryKey = nextKey
    if (hasPreviousBoundary) {
      this.closeOnContextChange()
    }
  }

  private getCloseBoundaryKey(): string {
    const layoutMode = tryGetAppContext()?.store?.layoutMode?.() ?? 'unknown'
    const snapshot = navigationModel.snapshot()
    const overlay = JSON.stringify(snapshot.overlay ?? {kind: 'none'})

    if (snapshot.surface === 'files') {
      return `${layoutMode}|files|${snapshot.files?.path || '/'}|overlay:${overlay}`
    }

    if (snapshot.surface === 'passwords') {
      return `${layoutMode}|passwords|${JSON.stringify(snapshot.passwords ?? {kind: 'root'})}|overlay:${overlay}`
    }

    if (snapshot.surface === 'remote') {
      return `${layoutMode}|remote|${snapshot.remote?.panel ?? 'hosts'}|overlay:${overlay}`
    }

    return `${layoutMode}|${snapshot.surface}|overlay:${overlay}`
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

  private canUseNativeUpload(): boolean {
    return (
      isTauriRuntime() &&
      getRuntimeCapabilities().supports_native_file_upload &&
      getAppContext().store.remoteSessionState() === 'inactive'
    )
  }

  private async openUpload() {
    if (this.canUseNativeUpload()) {
      this.runtime.dispatchCommand({kind: 'native-upload'})
      this.close()
      return
    }

    if (
      isTauriRuntime() &&
      getRuntimeCapabilities().supports_native_path_io &&
      getAppContext().store.remoteSessionState() === 'inactive'
    ) {
      const filePickerSession = beginMobileFilePickerSession()
      try {
        const selected = await wrap(open({multiple: true, directory: false}))
        filePickerSession.end()
        const paths = Array.isArray(selected) ? selected : selected ? [selected] : []
        if (paths.length > 0) {
          this.runtime.dispatchCommand({kind: 'upload-paths', paths})
        }
      } catch {
        filePickerSession.end()
        this.runtime.openFileInput()
      }
      this.close()
      return
    }

    this.runtime.openFileInput()
  }

  onFileInputChange = (e: Event) => {
    this.runtime.endFilePickerSession?.()
    const files = (e.target as HTMLInputElement).files
    if (files && files.length > 0) {
      this.runtime.dispatchCommand({kind: 'upload-files', files})
      ;(e.target as HTMLInputElement).value = ''
      this.close()
    }
  }

  resolveCommandContext(): CommandContext {
    const {store} = getAppContext()

    if (store.layoutMode() !== 'mobile') {
      if (navigationModel.currentSurface() === 'notes') {
        return 'notes'
      }
      return 'files'
    }

    const surface = navigationModel.mobileCommandSurface()
    if (surface === 'none') {
      return 'none'
    }

    if (surface === 'files') {
      return 'files'
    }

    if (surface === 'notes') {
      return 'notes'
    }

    const context = this.getPasswordsMobileCommandContext()
    if (!context) return 'passwords-list'
    return context.kind
  }

  getPasswordsMobileCommandContext(): PasswordsMobileCommandContext {
    const context = pmMobileChromeModel.getCommandContext()
    if (context.kind === 'passwords-selection') {
      return {
        kind: 'none',
        readOnly: context.readOnly,
        hasActiveFilters: context.hasActiveFilters,
        query: context.query,
        quickFilters: context.quickFilters,
        sortField: context.sortField,
        sortDirection: context.sortDirection,
        groupBy: context.groupBy,
      }
    }

    if (context.kind === 'passwords-list' || context.kind === 'passwords-entry' || context.kind === 'none') {
      return {
        kind: context.kind,
        readOnly: context.readOnly,
        hasActiveFilters: context.hasActiveFilters,
        query: context.query,
        quickFilters: context.quickFilters,
        sortField: context.sortField,
        sortDirection: context.sortDirection,
        groupBy: context.groupBy,
      }
    }

    return {
      kind: 'none',
      readOnly: false,
      hasActiveFilters: false,
      query: '',
      quickFilters: [],
      sortField: 'name',
      sortDirection: 'asc',
      groupBy: 'none',
    }
  }

  executePasswordsMobileCommand(actionId: string, payload?: {query?: string}): boolean {
    return pmMobileChromeModel.executeCommand(actionId, payload)
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
      if (keyboardShortcutsModel.matches('app.commandPalette.open', e)) {
        e.preventDefault()
        this.openFromRequest('all')
        return
      }
      this.executeShortcutCommand(e)
      return
    }

    if (this.executeShortcutCommand(e)) return

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

  private executeShortcutCommand(e: KeyboardEvent): boolean {
    const context = this.resolveCommandContext()
    const command = this.getContextCommands(context).find(
      (cmd) => cmd.shortcutId && !cmd.disabled && keyboardShortcutsModel.matches(cmd.shortcutId, e),
    )
    if (!command) return false

    e.preventDefault()
    command.action()
    return true
  }

  private getFilesRuntime(): FilesCommandsRuntime {
    return {
      getSearchFilters: () => getAppContext().store.searchFilters(),
      updateSearchFilters: this.updateSearchFilters.bind(this),
      setSearchFilters: (next) => getAppContext().store.setSearchFilters(next),
      toggleFileType: this.toggleFileType.bind(this),
      openUpload: this.openUpload.bind(this),
      dispatchCommand: this.runtime.dispatchCommand,
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
      setShowNotes: () => {
        navigationModel.navigateToSurface('notes')
      },
      setShowPasswords: () => {
        navigationModel.navigateToSurface('passwords')
      },
      closePalette: this.close.bind(this),
    }
  }

  private getInitialQuery(mode: CommandPaletteMode): string {
    if (mode !== 'search') {
      return ''
    }

    const context = this.resolveCommandContext()
    if (context === 'files') {
      return getAppContext().store.searchFilters().query
    }

    if (context === 'passwords-list') {
      return this.getPasswordsMobileCommandContext().query
    }

    return ''
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
    if (context === 'notes') return this.navCommands
    if (context === 'passwords-list') return [...this.navCommands, ...this.getPasswordsListCommands()]
    if (context === 'passwords-entry') return [...this.navCommands, ...this.getPasswordsEntryCommands()]
    return []
  }

  getAgentState(): CommandBarAgentState {
    const context = this.tryResolveCommandContext()
    const commands = context.ok ? this.getCommandsForAgent(context.context) : []
    const safeCommands = commands.filter((command) => this.commandCanExecuteViaWebMcp(command))

    return {
      available: context.ok,
      isOpen: this.isOpen,
      mode: this.openMode(),
      query: this.query(),
      selectedIndex: this.selectedIndex(),
      context: context.ok ? context.context : 'unavailable',
      commandCount: commands.length,
      safeActionCount: safeCommands.length,
      ...(context.ok ? {} : {unavailableReason: context.error}),
    }
  }

  getAgentActions(): CommandBarActionSnapshot[] {
    const context = this.tryResolveCommandContext()
    if (!context.ok) {
      return []
    }

    return this.getCommandsForAgent(context.context).map((command) => this.describeCommandForAgent(command, context.context))
  }

  executeCommandById(id: string, payload: Record<string, unknown> = {}): CommandBarExecuteResult {
    const context = this.tryResolveCommandContext()
    if (!context.ok) {
      return {
        ok: false,
        error: {code: 'command_context_unavailable', message: context.error},
      }
    }

    const command = this.getCommandsForAgent(context.context, payload).find((item) => item.id === id)
    if (!command) {
      return {
        ok: false,
        error: {code: 'command_not_found', message: `Unknown command: ${id}`},
      }
    }

    const snapshot = this.describeCommandForAgent(command, context.context)
    if (!snapshot.executableViaWebMcp) {
      return {
        ok: false,
        error: {
          code: 'command_not_allowed',
          message: snapshot.nonExecutableReason ?? `Command is not executable via WebMCP: ${id}`,
        },
      }
    }

    command.action()
    return {ok: true, command: snapshot}
  }

  private tryResolveCommandContext(): {ok: true; context: CommandContext} | {ok: false; error: string} {
    try {
      return {ok: true, context: this.resolveCommandContext()}
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Command context is unavailable',
      }
    }
  }

  private getCommandsForAgent(context: CommandContext, payload: Record<string, unknown> = {}): Command[] {
    const commands = this.getContextCommands(context)
    const query = typeof payload['query'] === 'string' ? payload['query'] : this.query().trim()
    const searchCommand = this.getContextSearchCommand(context, query)
    if (!searchCommand) {
      return commands
    }

    if (commands.some((command) => command.id === searchCommand.id)) {
      return commands
    }

    return [...commands, searchCommand]
  }

  private describeCommandForAgent(command: Command, context: CommandContext): CommandBarActionSnapshot {
    const executableViaWebMcp = this.commandCanExecuteViaWebMcp(command)
    return {
      id: command.id,
      label: command.label,
      category: command.category,
      context,
      disabled: Boolean(command.disabled),
      ...(command.shortcutId ? {shortcutId: command.shortcutId} : {}),
      executableViaWebMcp,
      ...(executableViaWebMcp
        ? {}
        : {nonExecutableReason: this.getWebMcpNonExecutableReason(command)}),
    }
  }

  private commandCanExecuteViaWebMcp(command: Command): boolean {
    if (command.disabled) {
      return false
    }

    return command.category === 'navigation' || command.category === 'filters' || command.category === 'search'
  }

  private getWebMcpNonExecutableReason(command: Command): string {
    if (command.disabled) {
      return 'Command is disabled in the current context'
    }

    return `Command category is not allowed via WebMCP: ${command.category}`
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

  get defaultSearchFilters(): SearchFilters {
    return this.getDefaultSearchFilters()
  }
}

export const commandBarModel = new CommandBarModel()
