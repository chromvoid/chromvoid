import {computed, state} from '@statx/core'

import {
  Entry,
  Group,
  ManagerRoot,
  filterValue,
  i18n,
  type QuickFilter,
  quickFilters,
  sortStorage,
} from '@project/passmanager'
import {defaultLogger} from 'root/core/logger'
import {openCommandPalette} from 'root/shared/services/command-palette'
import {pmModel} from '../../password-manager.model'
import {groupBy, sortDirection, sortField} from '../list/sort-controls'

const SIDEBAR_WIDTH_STORAGE_KEY = 'pm-sidebar-width'
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 500
const DEFAULT_SIDEBAR_WIDTH = 300
const ALLOWED_QUICK_FILTERS: QuickFilter[] = ['recent', 'otp', 'files', 'nopass', 'favorites']
const INTERACTIVE_TARGET_SELECTOR = [
  'cv-button',
  'cv-menu-button',
  'cv-menu-item',
  'cv-copy-button',
  'button',
  'a[href]',
  'summary',
  'input',
  'select',
  'option',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="treeitem"]',
  '[data-action]',
].join(', ')

function describeShowElement(showElement: PMShowElement): string {
  if (showElement instanceof Entry) return `entry:${showElement.id}`
  if (showElement instanceof Group) return `group:${showElement.id}`
  if (showElement instanceof ManagerRoot) return `root:${showElement.id}`
  if (
    typeof showElement === 'object' &&
    showElement !== null &&
    'showElement' in showElement &&
    'isEditMode' in showElement
  ) {
    return 'root-like'
  }
  if (showElement === undefined) return 'undefined'
  return String(showElement)
}

export type PMShowElement =
  | ManagerRoot
  | Group
  | Entry
  | 'createEntry'
  | 'createGroup'
  | 'importDialog'
  | undefined

export type PMGlobalShortcutAction =
  | 'none'
  | 'create-entry'
  | 'focus-search'
  | 'clear-search'
  | 'go-back'
  | 'open-first-search-result'
  | 'copy-password'

export type PMMobileToolbarContext = {
  title: string
  canGoBack: boolean
  backDisabled: boolean
  showCommand: boolean
}

export type PMMobileCommandKind = 'passwords-list' | 'passwords-entry' | 'none'

export type PMMobileCommandContext = {
  kind: PMMobileCommandKind
  readOnly: boolean
  hasActiveFilters: boolean
  query: string
  quickFilters: string[]
  sortField: ReturnType<typeof sortField>
  sortDirection: ReturnType<typeof sortDirection>
  groupBy: ReturnType<typeof groupBy>
}

type ExecuteMobileCommandInput = {
  isGroupEditActive: boolean
  onEntryEdit: () => void
  onEntryMove: () => void
  onEntryDelete: () => void
  onGroupEdit: () => void
  onGroupDelete: () => void
}

export class PasswordManagerLayoutModel {
  private readonly logger = defaultLogger

  readonly sidebarWidth = state(DEFAULT_SIDEBAR_WIDTH)
  readonly isSidebarDragging = state(false)
  readonly sidebarWidthCss = computed(() => `${this.sidebarWidth()}px`)
  readonly hasActiveFilters = computed(
    () =>
      filterValue().trim().length > 0 ||
      quickFilters().length > 0 ||
      sortField() !== 'name' ||
      sortDirection() !== 'asc' ||
      groupBy() !== 'none',
  )

  private sidebarResizeStartX = 0
  private sidebarResizeStartWidth = DEFAULT_SIDEBAR_WIDTH

  isLoading(): boolean {
    return window.passmanager?.isLoading?.() ?? false
  }

  isReadOnly(): boolean {
    return window.passmanager?.isReadOnly?.() ?? false
  }

  isEditingEntry(): boolean {
    return window.passmanager?.isEditMode?.() ?? false
  }

  shouldUseBrowserBackOnDesktop(): boolean {
    return Boolean(window.passmanager?.isShowRoot)
  }

  getCurrentShowElement(): PMShowElement {
    return window.passmanager?.showElement?.() as PMShowElement
  }

  createEntry(): void {
    pmModel.onCreateEntry()
  }

  createGroup(): void {
    pmModel.onCreateGroup()
  }

  exportEntries(): void {
    pmModel.onExport()
  }

  fullClean(): void {
    pmModel.onFullClean()
  }

  importEntries(): void {
    void pmModel.onImport()
  }

  handleImportComplete(event: Event): void {
    void pmModel.handleImportComplete(event)
  }

  handleImportClose(): void {
    pmModel.handleImportClose()
  }

  goBackFromCurrent(): boolean {
    return pmModel.goBackFromCurrent()
  }

  copyCurrentPassword(): Promise<void> {
    return pmModel.copyCurrentPassword()
  }

  openSearchPalette(): void {
    openCommandPalette({mode: 'search', source: 'keyboard'})
  }

  openFiltersPalette(): void {
    openCommandPalette({mode: 'filters', source: 'fab'})
  }

  isShortcutBlocked(event: KeyboardEvent): boolean {
    const composedPath = event.composedPath()
    const deepTarget = composedPath[0] as EventTarget | null

    return (
      this.isInputLike(deepTarget) ||
      this.isInputLike(event.target) ||
      composedPath.some((target) => this.isInteractiveTarget(target)) ||
      this.isInteractiveTarget(event.target)
    )
  }

  resolveGlobalShortcut(event: KeyboardEvent, shortcutBlocked: boolean): PMGlobalShortcutAction {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && !shortcutBlocked) {
      return 'create-entry'
    }

    if (event.key === '/' && !shortcutBlocked) {
      return 'focus-search'
    }

    if (event.key === 'Escape') {
      return 'clear-search'
    }

    if (event.key === 'Backspace' && !shortcutBlocked) {
      const current = this.getCurrentShowElement()
      if (current && !(current instanceof ManagerRoot)) {
        return 'go-back'
      }
    }

    if (event.key === 'Enter' && !shortcutBlocked && this.getFirstSearchResult()) {
      return 'open-first-search-result'
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && !shortcutBlocked) {
      return 'copy-password'
    }

    return 'none'
  }

  openFirstSearchResult(): void {
    const first = this.getFirstSearchResult()
    if (first) {
      pmModel.openItem(first)
    }
  }

  initializeSidebarWidth(): void {
    const savedWidth = globalThis.localStorage?.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    const parsedWidth = savedWidth ? Number.parseInt(savedWidth, 10) : DEFAULT_SIDEBAR_WIDTH
    this.setSidebarWidth(Number.isFinite(parsedWidth) ? parsedWidth : DEFAULT_SIDEBAR_WIDTH)
  }

  beginSidebarResize(clientX: number): void {
    this.isSidebarDragging.set(true)
    this.sidebarResizeStartX = clientX
    this.sidebarResizeStartWidth = this.sidebarWidth()
  }

  updateSidebarResize(clientX: number): void {
    if (!this.isSidebarDragging()) {
      return
    }

    const deltaX = clientX - this.sidebarResizeStartX
    this.setSidebarWidth(this.sidebarResizeStartWidth + deltaX)
  }

  endSidebarResize(): void {
    this.isSidebarDragging.set(false)
  }

  getMobileToolbarContext(isGroupEditActive: boolean): PMMobileToolbarContext {
    const showElement = this.getCurrentShowElement()
    if (!showElement) {
      return {
        title: i18n('root:title'),
        canGoBack: false,
        backDisabled: false,
        showCommand: false,
      }
    }

    const isEntryEdit = this.isEditingEntry()
    const isListLike =
      (showElement instanceof ManagerRoot || showElement instanceof Group) && !isGroupEditActive
    const isEntryView = showElement instanceof Entry

    return {
      title: this.getContextTitle(showElement, isGroupEditActive),
      canGoBack: !(showElement instanceof ManagerRoot) || isEntryEdit || isGroupEditActive,
      backDisabled: false,
      showCommand: !isEntryEdit && !isGroupEditActive && (isListLike || isEntryView),
    }
  }

  handleMobileToolbarBack(input: {isGroupEditActive: boolean; onExitGroupEdit: () => void}): boolean {
    const showElement = this.getCurrentShowElement()
    this.logger.debug('[PassManager][MobileBack] provider begin', {
      showElement: describeShowElement(showElement),
      isEditingEntry: this.isEditingEntry(),
      isGroupEditActive: input.isGroupEditActive,
    })

    if (!showElement) {
      this.logger.debug('[PassManager][MobileBack] provider abort: no showElement')
      return false
    }

    if (input.isGroupEditActive) {
      input.onExitGroupEdit()
      this.logger.debug('[PassManager][MobileBack] provider exit group edit', {
        showElement: describeShowElement(showElement),
      })
      return true
    }

    this.logger.debug('[PassManager][MobileBack] provider fallthrough to navigation history', {
      showElement: describeShowElement(showElement),
    })
    return false
  }

  shouldShowListFabActions(isGroupEditActive: boolean): boolean {
    const showElement = this.getCurrentShowElement()
    return (
      !this.isEditingEntry() &&
      !isGroupEditActive &&
      (showElement instanceof ManagerRoot || showElement instanceof Group)
    )
  }

  shouldShowEntryFabActions(isGroupEditActive: boolean): boolean {
    const showElement = this.getCurrentShowElement()
    return !this.isEditingEntry() && !isGroupEditActive && showElement instanceof Entry
  }

  getMobileCommandContext(isGroupEditActive: boolean): PMMobileCommandContext {
    return {
      kind: this.getMobileCommandKind(isGroupEditActive),
      readOnly: this.isReadOnly(),
      hasActiveFilters: this.hasActiveFilters(),
      query: filterValue().trim(),
      quickFilters: [...quickFilters()],
      sortField: sortField(),
      sortDirection: sortDirection(),
      groupBy: groupBy(),
    }
  }

  executeMobileCommand(
    actionId: string,
    payload: {query?: string} | undefined,
    input: ExecuteMobileCommandInput,
  ): boolean {
    const commandContext = this.getMobileCommandContext(input.isGroupEditActive)
    const isListContext = commandContext.kind === 'passwords-list'
    const isEntryContext = commandContext.kind === 'passwords-entry'
    const isReadOnly = commandContext.readOnly

    switch (actionId) {
      case 'pm-create-entry':
        if (!isListContext || isReadOnly) return false
        this.createEntry()
        return true
      case 'pm-create-group':
        if (!isListContext || isReadOnly) return false
        this.createGroup()
        return true
      case 'pm-filters':
        if (!isListContext) return false
        this.openFiltersPalette()
        return true
      case 'pm-export':
        this.exportEntries()
        return true
      case 'pm-import':
        this.importEntries()
        return true
      case 'pm-clean':
        this.fullClean()
        return true
      case 'pm-search-set-query':
        if (!isListContext) return false
        filterValue.set((payload?.query ?? '').trim())
        return true
      case 'pm-search-clear-query':
        if (!isListContext) return false
        filterValue.set('')
        return true
      case 'pm-toggle-quick-filter': {
        if (!isListContext) return false
        const filter = payload?.query as QuickFilter | undefined
        if (!filter || !ALLOWED_QUICK_FILTERS.includes(filter)) {
          return false
        }

        this.toggleQuickFilter(filter)
        return true
      }
      case 'pm-sort-direction-toggle':
        if (!isListContext) return false
        sortDirection.set(sortDirection() === 'asc' ? 'desc' : 'asc')
        this.saveSortSettings()
        return true
      case 'pm-sort-field-name':
      case 'pm-sort-field-username':
      case 'pm-sort-field-modified':
      case 'pm-sort-field-created':
      case 'pm-sort-field-website': {
        if (!isListContext) return false
        const next = actionId.replace('pm-sort-field-', '') as ReturnType<typeof sortField>
        sortField.set(next)
        this.saveSortSettings()
        return true
      }
      case 'pm-group-by-none':
      case 'pm-group-by-folder':
      case 'pm-group-by-website':
      case 'pm-group-by-modified':
      case 'pm-group-by-security': {
        if (!isListContext) return false
        const next = actionId.replace('pm-group-by-', '') as ReturnType<typeof groupBy>
        groupBy.set(next)
        this.saveSortSettings()
        return true
      }
      case 'pm-entry-edit':
        if (!isEntryContext || isReadOnly) return false
        input.onEntryEdit()
        return true
      case 'pm-entry-move':
        if (!isEntryContext || isReadOnly) return false
        input.onEntryMove()
        return true
      case 'pm-entry-delete':
        if (!isEntryContext || isReadOnly) return false
        input.onEntryDelete()
        return true
      case 'pm-edit-group':
        if (!isListContext || isReadOnly || !this.isInNonRootGroup()) return false
        input.onGroupEdit()
        return true
      case 'pm-delete-group':
        if (!isListContext || isReadOnly || !this.isInNonRootGroup()) return false
        input.onGroupDelete()
        return true
      default:
        return false
    }
  }

  private isInputLike(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false
    }

    const tagName = target.tagName.toLowerCase()
    if (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'cv-input' ||
      tagName === 'cv-number' ||
      tagName === 'cv-textarea'
    ) {
      return true
    }

    const role = target.getAttribute('role')
    return role === 'textbox' || role === 'searchbox' || target.isContentEditable
  }

  private isInteractiveTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement
      ? this.isInputLike(target) || target.matches(INTERACTIVE_TARGET_SELECTOR)
      : false
  }

  private getFirstSearchResult(): Group | Entry | undefined {
    const current = this.getCurrentShowElement()
    if (!current) {
      return undefined
    }

    if (current instanceof ManagerRoot || current instanceof Group) {
      const list = current.searched()
      return (list?.[0] as Group | Entry) ?? undefined
    }

    if (window.passmanager) {
      return (window.passmanager.searched()?.[0] as Group | Entry) ?? undefined
    }

    return undefined
  }

  private setSidebarWidth(width: number): void {
    const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width))
    this.sidebarWidth.set(clampedWidth)
    globalThis.localStorage?.setItem(SIDEBAR_WIDTH_STORAGE_KEY, clampedWidth.toString())
  }

  private getContextTitle(
    showElement: Exclude<PMShowElement, undefined>,
    isGroupEditActive: boolean,
  ): string {
    if (showElement === 'createEntry') return i18n('entry:create:title')
    if (showElement === 'createGroup') return i18n('group:create:title')
    if (showElement === 'importDialog') return i18n('import:dialog:title')
    if (this.isEditingEntry()) return i18n('entry:edit:title')
    if (isGroupEditActive) return i18n('group:edit:title')
    if (showElement instanceof Entry) return showElement.title || i18n('no_title')
    if (showElement instanceof Group) return showElement.name || i18n('no_title')
    return 'Passwords'
  }

  isInNonRootGroup(): boolean {
    const showElement = this.getCurrentShowElement()
    return showElement instanceof Group
  }

  private getMobileCommandKind(isGroupEditActive: boolean): PMMobileCommandKind {
    const showElement = this.getCurrentShowElement()
    if (!showElement || this.isEditingEntry() || isGroupEditActive) {
      return 'none'
    }

    if (showElement instanceof Entry) {
      return 'passwords-entry'
    }

    if (showElement instanceof ManagerRoot || showElement instanceof Group) {
      return 'passwords-list'
    }

    return 'none'
  }

  private saveSortSettings(): void {
    sortStorage.saveSettings({
      sortField: sortField(),
      sortDirection: sortDirection(),
      groupBy: groupBy(),
    })
  }

  private toggleQuickFilter(filter: QuickFilter): void {
    const activeFilters = quickFilters()
    if (activeFilters.includes(filter)) {
      quickFilters.set(activeFilters.filter((item) => item !== filter))
      return
    }

    quickFilters.set([...activeFilters, filter])
  }
}
