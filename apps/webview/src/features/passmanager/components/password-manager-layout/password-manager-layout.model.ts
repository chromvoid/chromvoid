import {atom, computed} from '@reatom/core'

import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {filterValue, quickFilters} from '@project/passmanager/select'
import {defaultLogger} from 'root/core/logger'
import {runtimeCapabilitiesAtom} from 'root/core/runtime/runtime-capabilities'
import {keyboardShortcutsModel} from 'root/shared/keyboard'
import {pmEntryEditorModel} from '../../models/pm-entry-editor.model'
import {pmComponentLoaderModel, type PMExtendedComponentLayout} from '../../models/pm-component-loader.model'
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
import {groupBy, sortDirection, sortField} from '../list/sort-controls.model'
import {pmSshKeysViewModel} from '../ssh-keys-view/ssh-keys-view.model'

const SIDEBAR_WIDTH_STORAGE_KEY = 'pm-sidebar-width'
export const PM_SIDEBAR_MIN_WIDTH = 232
export const PM_SIDEBAR_MAX_WIDTH = 320
const PM_SIDEBAR_DEFAULT_WIDTH = 256
export const PM_SIDEBAR_WIDTH_STEP = 8
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
  canOpenSshView: boolean
  showEnvRuntimeView: boolean
  canOpenEnvRuntimeView: boolean
}

export type PMDesktopToolbarActionId =
  | 'pm-import'
  | 'pm-export'
  | 'pm-clean'
  | 'pm-ssh-view'
  | 'pm-env-runtime-view'
  | 'pm-create-group'
  | 'pm-create-entry'
  | 'pm-create-ssh-key'

export type PMDesktopToolbarSection = {
  label: string
  state?: 'active' | 'inactive'
  actions: readonly PMDesktopToolbarActionSpec<PMDesktopToolbarActionId>[]
}

function describeDesktopToolbarContext(context: PMDesktopToolbarContext) {
  return {
    readOnly: context.readOnly,
    canCreateGroup: context.canCreateGroup,
    canCreateEntry: context.canCreateEntry,
    canOpenSshView: context.canOpenSshView,
    showEnvRuntimeView: context.showEnvRuntimeView,
    canOpenEnvRuntimeView: context.canOpenEnvRuntimeView,
  }
}

export class PasswordManagerLayoutModel {
  private readonly logger = defaultLogger
  private readonly groupActionsModel = new PMGroupModel()

  readonly sidebarWidth = atom(PM_SIDEBAR_DEFAULT_WIDTH)
  readonly hasActiveFilters = computed(
    () =>
      filterValue().trim().length > 0 ||
      quickFilters().length > 0 ||
      sortField() !== 'name' ||
      sortDirection() !== 'asc' ||
      groupBy() !== 'none',
  )

  private desktopToolbarSearchElement: PMSearchElement | null = null

  isLoading(): boolean {
    return isPassmanagerLoading()
  }

  getSessionStatus() {
    const status = pmModel.sessionStatus()
    const root = getPassmanagerRoot()
    if (
      status === 'inactive' &&
      root &&
      (typeof root.entries !== 'function' || root.entries() !== undefined)
    ) {
      return 'ready'
    }
    return status
  }

  retrySessionLoad(): void {
    void pmModel.retrySessionLoad()
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

  requiresExtendedComponents(layout: PMExtendedComponentLayout): boolean {
    const showElement = this.getCurrentShowElement()
    return !pmComponentLoaderModel.isReadyFor(showElement, layout)
  }

  getExtendedComponentsLoadError(): string | null {
    return pmComponentLoaderModel.extendedLoadError()
  }

  requestExtendedComponents(layout: PMExtendedComponentLayout): void {
    const showElement = this.getCurrentShowElement()
    void pmComponentLoaderModel.requestExtendedComponents(showElement, layout)
  }

  retryExtendedComponents(layout: PMExtendedComponentLayout): void {
    const showElement = this.getCurrentShowElement()
    void pmComponentLoaderModel.retryExtendedComponents(showElement, layout)
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

  createTopLevelGroup(): void {
    pmModel.onCreateTopLevelGroup()
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

  openSshView(): void {
    pmModel.openSshView()
  }

  openEnvRuntimeView(): void {
    if (!this.getDesktopToolbarContext().canOpenEnvRuntimeView) return
    pmModel.openEnvRuntimeView()
  }

  createSshKey(): void {
    if (this.getCurrentShowElement() !== 'sshView' || this.isReadOnly()) return
    pmSshKeysViewModel.openCreate()
  }

  isDesktopToolbarAction(value: string | undefined): value is PMDesktopToolbarActionId {
    return (
      value === 'pm-import' ||
      value === 'pm-export' ||
      value === 'pm-clean' ||
      value === 'pm-ssh-view' ||
      value === 'pm-env-runtime-view' ||
      value === 'pm-create-group' ||
      value === 'pm-create-entry' ||
      value === 'pm-create-ssh-key'
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
      case 'pm-ssh-view':
        this.openSshView()
        return
      case 'pm-env-runtime-view':
        this.openEnvRuntimeView()
        return
      case 'pm-create-group':
        this.createGroup()
        return
      case 'pm-create-entry':
        this.createEntry()
        return
      case 'pm-create-ssh-key':
        this.createSshKey()
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
    const parsedWidth = savedWidth === null ? PM_SIDEBAR_DEFAULT_WIDTH : Number.parseFloat(savedWidth)
    const normalizedWidth = this.normalizeSidebarWidth(
      Number.isFinite(parsedWidth) ? parsedWidth : PM_SIDEBAR_DEFAULT_WIDTH,
    )

    this.sidebarWidth.set(normalizedWidth)
    if (savedWidth !== null && savedWidth !== String(normalizedWidth)) {
      globalThis.localStorage?.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(normalizedWidth))
    }
  }

  previewSidebarWidth(width: number): void {
    this.sidebarWidth.set(this.normalizeSidebarWidth(width))
  }

  commitSidebarWidth(width: number): void {
    const normalizedWidth = this.normalizeSidebarWidth(width)
    this.sidebarWidth.set(normalizedWidth)
    globalThis.localStorage?.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(normalizedWidth))
  }

  getDesktopToolbarContext(): PMDesktopToolbarContext {
    const readOnly = this.isReadOnly()
    const capabilities = runtimeCapabilitiesAtom()
    const showEnvRuntimeView = capabilities.desktop && !capabilities.mobile

    const context: PMDesktopToolbarContext = {
      readOnly,
      canCreateGroup: this.canCreateGroup(),
      canCreateEntry: !readOnly,
      canOpenSshView: Boolean(getPassmanagerRoot()) && !this.isLoading(),
      showEnvRuntimeView,
      canOpenEnvRuntimeView: showEnvRuntimeView && Boolean(getPassmanagerRoot()) && !this.isLoading(),
    }

    this.logger.debug('[PassManager][DesktopToolbar] context', {
      ...describeDesktopToolbarContext(context),
    })

    return context
  }

  canCreateGroup(): boolean {
    return !this.isReadOnly()
  }

  getDesktopToolbarSections(): readonly PMDesktopToolbarSection[] {
    const context = this.getDesktopToolbarContext()

    return [
      {
        label: 'Vault',
        actions: [
          {id: 'pm-import', icon: 'cloud-upload', label: i18n('import')},
          {id: 'pm-export', icon: 'cloud-download', label: i18n('export')},
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
            label: i18n('button:create_entry'),
            disabled: !context.canCreateEntry,
          },
          ...(this.getCurrentShowElement() === 'sshView'
            ? [
                {
                  id: 'pm-create-ssh-key' as const,
                  icon: 'key',
                  label: i18n('ssh:add'),
                  disabled: context.readOnly,
                },
              ]
            : []),
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

  private normalizeSidebarWidth(width: number): number {
    return Math.round(Math.max(PM_SIDEBAR_MIN_WIDTH, Math.min(PM_SIDEBAR_MAX_WIDTH, width)))
  }
}

export const passwordManagerDesktopLayoutModel = new PasswordManagerLayoutModel()
