import {atom, computed} from '@reatom/core'

import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {filterValue, quickFilters} from '@project/passmanager/select'
import {defaultLogger} from 'root/core/logger'
import {keyboardShortcutsModel} from 'root/shared/keyboard'
import {openCommandPalette} from 'root/shared/services/command-palette'
import {prefersReducedMotion} from 'root/utils/view-transitions'
import {pmEntryEditorModel} from '../../models/pm-entry-editor.model'
import {pmMotionModel, type PassmanagerMotionIntent} from '../../models/pm-motion.model'
import {
  getPassmanagerRoot,
  getPassmanagerShowElement,
  isPassmanagerLoading,
  isPassmanagerReadOnly,
  type PMRootShowElement,
} from '../../models/pm-root.adapter'
import {pmModel} from '../../password-manager.model'
import type {PMDesktopToolbarActionSpec} from '../desktop-toolbar'
import {PMGroupModel} from '../group/group/group.model'
import {groupBy, sortDirection, sortField} from '../list/sort-controls'

const SIDEBAR_WIDTH_STORAGE_KEY = 'pm-sidebar-width'
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 500
const DEFAULT_SIDEBAR_WIDTH = 300
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

export type PMShowElement = PMRootShowElement

export type PMGlobalShortcutAction =
  | 'none'
  | 'create-entry'
  | 'focus-search'
  | 'clear-search'
  | 'go-back'
  | 'open-first-search-result'
  | 'copy-password'

export interface PMSearchElement {
  focusInput?(): void
  clear?(): void
}

export type PMDesktopToolbarContext = {
  readOnly: boolean
  canCreateGroup: boolean
  canCreateEntry: boolean
  canOpenOtpView: boolean
}

export type PMDesktopToolbarActionId =
  | 'pm-import'
  | 'pm-export'
  | 'pm-clean'
  | 'pm-otp-view'
  | 'pm-create-group'
  | 'pm-create-entry'

export type PMDesktopToolbarSection = {
  label: string
  state?: 'active' | 'inactive'
  actions: readonly PMDesktopToolbarActionSpec<PMDesktopToolbarActionId>[]
}

export type PasswordManagerMotionRenderState = {
  kind: PassmanagerMotionIntent['kind']
  direction: PassmanagerMotionIntent['direction']
  target: string | null
  reducedMotion: boolean
}

function describeDesktopToolbarContext(context: PMDesktopToolbarContext) {
  return {
    readOnly: context.readOnly,
    canCreateGroup: context.canCreateGroup,
    canCreateEntry: context.canCreateEntry,
    canOpenOtpView: context.canOpenOtpView,
  }
}

export class PasswordManagerLayoutModel {
  private readonly logger = defaultLogger
  private readonly groupActionsModel = new PMGroupModel()

  readonly sidebarWidth = atom(DEFAULT_SIDEBAR_WIDTH)
  readonly isSidebarDragging = atom(false)
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
  private desktopToolbarSearchElement: PMSearchElement | null = null

  isLoading(): boolean {
    return isPassmanagerLoading()
  }

  isReadOnly(): boolean {
    return isPassmanagerReadOnly()
  }

  isEditingEntry(): boolean {
    const showElement = this.getCurrentShowElement()
    return showElement instanceof Entry ? pmEntryEditorModel.isActiveForEntry(showElement.id) : false
  }

  handleTransientEntryBack(): boolean {
    const showElement = this.getCurrentShowElement()
    return showElement instanceof Entry ? pmEntryEditorModel.closeSurface(showElement.id) : false
  }

  shouldUseBrowserBackOnDesktop(): boolean {
    return Boolean(getPassmanagerRoot()?.isShowRoot)
  }

  getCurrentShowElement(): PMShowElement {
    return getPassmanagerShowElement()
  }

  getMotionRenderState(): PasswordManagerMotionRenderState {
    const intent = pmMotionModel.intent()
    return {
      kind: intent.kind,
      direction: intent.direction,
      target: intent.target,
      reducedMotion: prefersReducedMotion(),
    }
  }

  getGroupViewKey(): string {
    const showElement = this.getCurrentShowElement()
    if (showElement instanceof ManagerRoot) {
      return `pm-group-view:root:${showElement.id}`
    }

    if (showElement instanceof Group) {
      return `pm-group-view:group:${showElement.id}`
    }

    return 'pm-group-view:none'
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

  openOtpView(): void {
    pmModel.openOtpView()
  }

  isDesktopToolbarAction(value: string | undefined): value is PMDesktopToolbarActionId {
    return (
      value === 'pm-import' ||
      value === 'pm-export' ||
      value === 'pm-clean' ||
      value === 'pm-otp-view' ||
      value === 'pm-create-group' ||
      value === 'pm-create-entry'
    )
  }

  executeDesktopToolbarAction(actionId: PMDesktopToolbarActionId): void {
    this.logger.debug('[PassManager][DesktopToolbar] dispatch', {
      actionId,
      context: this.getDesktopToolbarContext(),
      showElement: describeShowElement(this.getCurrentShowElement()),
    })

    switch (actionId) {
      case 'pm-import':
        this.importEntries()
        return
      case 'pm-export':
        this.exportEntries()
        return
      case 'pm-clean':
        this.fullClean()
        return
      case 'pm-otp-view':
        this.openOtpView()
        return
      case 'pm-create-group':
        this.createGroup()
        return
      case 'pm-create-entry':
        this.createEntry()
        return
    }
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

  registerDesktopToolbarSearchElement(search: PMSearchElement): () => void {
    this.desktopToolbarSearchElement = search
    return () => {
      if (this.desktopToolbarSearchElement === search) {
        this.desktopToolbarSearchElement = null
      }
    }
  }

  getDesktopToolbarSearchElement(): PMSearchElement | null {
    return this.desktopToolbarSearchElement
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
    if (!shortcutBlocked && keyboardShortcutsModel.matches('passmanager.createEntry', event)) {
      return 'create-entry'
    }

    if (!shortcutBlocked && keyboardShortcutsModel.matches('passmanager.focusSearch', event)) {
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

    if (
      event.key === 'Enter' &&
      !shortcutBlocked &&
      this.shouldOpenFirstSearchResultFromEvent(event) &&
      this.getFirstSearchResult()
    ) {
      return 'open-first-search-result'
    }

    if (!shortcutBlocked && keyboardShortcutsModel.matches('passmanager.copyPassword', event)) {
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

  getDesktopToolbarContext(): PMDesktopToolbarContext {
    const readOnly = this.isReadOnly()

    const context: PMDesktopToolbarContext = {
      readOnly,
      canCreateGroup: !readOnly,
      canCreateEntry: !readOnly,
      canOpenOtpView: Boolean(getPassmanagerRoot()) && !this.isLoading(),
    }

    this.logger.debug('[PassManager][DesktopToolbar] context', {
      ...describeDesktopToolbarContext(context),
    })

    return context
  }

  getDesktopToolbarSections(): readonly PMDesktopToolbarSection[] {
    const context = this.getDesktopToolbarContext()

    return [
      {
        label: 'Vault',
        actions: [
          {id: 'pm-import', icon: 'cloud-upload', label: i18n('import')},
          {id: 'pm-export', icon: 'cloud-download', label: i18n('export')},
          {
            id: 'pm-otp-view',
            icon: 'shield-check',
            label: i18n('otp:quick_view:title' as never),
            disabled: !context.canOpenOtpView,
          },
          {id: 'pm-clean', icon: 'trash', label: i18n('clean'), danger: true},
        ],
      },
      {
        label: 'Create',
        actions: [
          {
            id: 'pm-create-group',
            icon: 'folder-plus',
            label: i18n('group:create:title'),
            disabled: !context.canCreateGroup,
          },
          {
            id: 'pm-create-entry',
            icon: 'plus-lg',
            label: i18n('enrty:create'),
            disabled: !context.canCreateEntry,
          },
        ],
      },
    ]
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

  isGroupEditActive(): boolean {
    return this.groupActionsModel.isEditMode()
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
    if (this.isListKeyboardRowTarget(target)) {
      return false
    }

    return target instanceof HTMLElement
      ? this.isInputLike(target) || target.matches(INTERACTIVE_TARGET_SELECTOR)
      : false
  }

  private isListKeyboardRowTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false
    }

    const rootNode = target.getRootNode()
    const shadowHost = rootNode instanceof ShadowRoot ? rootNode.host : null

    return (
      target.classList.contains('list-item') ||
      target.classList.contains('group-row') ||
      (target.classList.contains('row') && shadowHost?.tagName.toLowerCase() === 'group-tree-view')
    )
  }

  private shouldOpenFirstSearchResultFromEvent(event: KeyboardEvent): boolean {
    return event.composedPath().some((target) => this.isListKeyboardRowTarget(target))
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

    const root = getPassmanagerRoot()
    if (root) {
      return (root.searched()?.[0] as Group | Entry) ?? undefined
    }

    return undefined
  }

  private setSidebarWidth(width: number): void {
    const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width))
    this.sidebarWidth.set(clampedWidth)
    globalThis.localStorage?.setItem(SIDEBAR_WIDTH_STORAGE_KEY, clampedWidth.toString())
  }

}

export const passwordManagerDesktopLayoutModel = new PasswordManagerLayoutModel()
