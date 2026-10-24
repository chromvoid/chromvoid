import {action, computed, withAsync, wrap} from '@reatom/core'
import {Entry, Group, type ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {
  createEntryFilterMatcher,
  filterValue,
  getEffectiveSelectedCredentialTagFilters,
  quickFilters,
  selectedCredentialTagFilters,
} from '@project/passmanager/select'
import {getAppContext} from 'root/shared/services/app-context'
import {toast} from 'root/shared/services/toast-manager'
import type {PMDesktopToolbarActionSpec} from '../../desktop-toolbar'
import {pmActiveRowModel} from '../../../models/pm-active-row.model'
import {
  pmCredentialSecurityAuditModel,
  type PMCredentialAuditStatus,
  type PMCredentialRiskSeverity,
} from '../../../models/pm-credential-security-audit.model'
import {pmEntryMoveModel, type PMDragPayload} from '../../../models/pm-entry-move-model'
import {
  getPassmanagerRoot,
  getPassmanagerShowElement,
  isPassmanagerReadOnly,
  isPassmanagerReadOnlyOrMissing,
} from '../../../models/pm-root.adapter'
import {
  getPMCredentialSurfaceRows,
  getPMRootCredentialTagsForSearch,
  getPMRootEntriesForSearch,
  type PMGroupEntryRow,
  type PMGroupFolderRow,
  type PMGroupRow,
} from '../../../models/pm-root-search-projection'
import {pmDeleteMotionModel} from '../../../models/pm-delete-motion.model'
import {pmModel} from '../../../password-manager.model'
import {passmanagerNavigationController} from '../../../passmanager-navigation.controller'
import {openPassmanagerMoveDialog} from '../../../service/passmanager-move-dialog'
import {PMEntryModel} from '../../card/entry/entry.model'
import {groupBy, sortDirection, sortField} from '../../list/sort-controls.model'
import {
  formatGroupCount,
  getDeletionNeighbourId,
  getGroupDeletionParent,
  getGroupParentPath,
  getGroupRiskIndicator,
  type PMGroupRiskIndicator,
} from './group-view-helpers'
import {pmGroupEditModel} from './group-edit.model'

export type PMToolbarAction = 'edit-group' | 'move-group' | 'remove-group'
export type PMGroupMetric = {
  id: 'entries' | 'reused_passwords' | 'weak_passwords' | 'two_factor'
  label: string
  value: number | null
  family: 'neutral' | 'risk' | 'attribute'
  severity?: 'warning' | 'critical'
}
type PMGroupEmptyStateKind = 'empty' | 'filtered'
export type {PMGroupRiskIndicator} from './group-view-helpers'
export type PMGroupRowPresentation = {
  displayName: string
  description: string
  entryCount: number
  riskIndicator: PMGroupRiskIndicator
}

export type PMGroupPresentation = {
  scopeLabel: string
  supportText: string
  visibleLabel: string
  folderCount: number
  entryCount: number
  metrics: PMGroupMetric[]
  securityStatus: PMCredentialAuditStatus
  riskSeverity: PMCredentialRiskSeverity
}

type PMGroupActionableRow = PMGroupEntryRow | PMGroupFolderRow
export type {PMGroupEntryRow, PMGroupFolderRow, PMGroupRow} from '../../../models/pm-root-search-projection'
export type PMPointerDropTarget = {id: string; el: HTMLElement}

type PMSyncKeyboardResult = {restoredIndex: number | null; activeIndex: number; contextChanged: boolean}

const toolbarActions = new Set<PMToolbarAction>(['edit-group', 'move-group', 'remove-group'])
const pendingGroupDeleteIds = new Set<string>()
const isActionableRow = (row: PMGroupRow): row is PMGroupActionableRow =>
  row.kind === 'entry' || row.kind === 'group'

export class PMGroupModel {
  readonly isEditMode = pmGroupEditModel.active
  readonly editedName = pmGroupEditModel.name
  readonly editedDescription = pmGroupEditModel.description
  readonly editedIconRef = pmGroupEditModel.iconRef
  readonly editNameError = pmGroupEditModel.nameError
  readonly editDescriptionError = pmGroupEditModel.descriptionError
  readonly editSubmitError = pmGroupEditModel.submitError
  readonly editPending = pmGroupEditModel.submit.pending
  private readonly hasActiveContentFilters = computed(
    () =>
      filterValue().trim().length > 0 ||
      quickFilters().length > 0 ||
      selectedCredentialTagFilters().length > 0,
    'passmanager.group.hasActiveContentFilters',
  )
  private keyboardContextKey = ''
  private keyboardItems: PMGroupRow[] = []
  private currentContainerId: string | null = null
  private readonly entryActionsModel = new PMEntryModel()

  getCurrentGroup(): Group | ManagerRoot | null {
    const element = getPassmanagerShowElement()
    if (!element) return null

    if (element instanceof Group) return element
    if (typeof element === 'object' && element !== null && 'isRoot' in element) {
      return element as ManagerRoot
    }

    return null
  }

  getEmptyStateKind(): PMGroupEmptyStateKind {
    if (!this.hasUnfilteredContent()) return 'empty'
    return this.hasActiveContentFilters() ? 'filtered' : 'empty'
  }

  clearContentFilters(): void {
    filterValue.set('')
    quickFilters.set([])
    selectedCredentialTagFilters.set([])
  }

  private hasUnfilteredContent(): boolean {
    const group = this.getCurrentGroup()
    if (!group) return false

    if (this.isManagerRoot(group)) {
      return group.entriesList().length > 0
    }

    if (group.entriesList().length > 0) return true

    const prefix = `${group.name}/`
    return (
      getPassmanagerRoot()
        ?.entriesList()
        .some(
          (item) =>
            item instanceof Group &&
            item.name.startsWith(prefix) &&
            !item.name.slice(prefix.length).includes('/'),
        ) ?? false
    )
  }

  isManagerRoot(item: unknown): item is ManagerRoot {
    return (
      typeof item === 'object' &&
      item !== null &&
      'isRoot' in item &&
      (item as {isRoot: boolean}).isRoot === true
    )
  }

  isGroup(item: unknown): item is Group {
    return item instanceof Group
  }

  getGroupMetadata(group: Group) {
    const displayName = this.getGroupDisplayName(group)
    const title = displayName || i18n('no_title')
    return {
      title,
      avatar: (title.trim().charAt(0) || '?').toUpperCase(),
    }
  }

  getGroupDisplayName(group: Group): string {
    const name = group.name
    const separator = name.lastIndexOf('/')
    return separator >= 0 ? name.slice(separator + 1) : name
  }

  setEditedName(name: string): void {
    pmGroupEditModel.setName(name)
  }

  setEditedDescription(description: string): void {
    pmGroupEditModel.setDescription(description)
  }

  setEditedIconRef(iconRef: string | undefined): void {
    pmGroupEditModel.setIconRef(iconRef)
  }

  getGroupRowPresentation(group: Group): PMGroupRowPresentation {
    const summary = pmCredentialSecurityAuditModel.summarizeEntries(group.entries())

    return {
      displayName: this.getGroupDisplayName(group),
      description: group.description ?? '',
      entryCount: group.entries().length,
      riskIndicator: getGroupRiskIndicator(summary),
    }
  }

  getGroupPresentation(group: Group | ManagerRoot, rows: PMGroupRow[], isRoot: boolean): PMGroupPresentation {
    let folderCount = 0
    const visibleEntries: Entry[] = []

    for (const row of rows) {
      if (row.kind === 'group') {
        folderCount += 1
        continue
      }

      if (row.kind === 'entry') {
        visibleEntries.push(row.item)
      }
    }

    const metricEntries = this.getMetricEntries(group, rows, isRoot, visibleEntries)
    const entryCount = metricEntries.length
    const securitySummary = pmCredentialSecurityAuditModel.summarizeEntries(metricEntries)
    const parentPath = group instanceof Group ? getGroupParentPath(group) : null
    const scopeLabel = isRoot
      ? i18n('group:scope-root')
      : parentPath
        ? i18n('group:scope-parent', {parent: parentPath})
        : i18n('group:scope-top-level')
    const supportText = isRoot
      ? i18n('group:support-root')
      : parentPath
        ? i18n('group:support-branch')
        : i18n('group:support-group')

    return {
      scopeLabel,
      supportText,
      visibleLabel: `${formatGroupCount(folderCount, 'group')} · ${formatGroupCount(entryCount, 'entry')}`,
      folderCount,
      entryCount,
      metrics: [
        {
          id: 'entries',
          label: i18n('metrics:entries'),
          value: entryCount,
          family: 'neutral',
        },
        {
          id: 'reused_passwords',
          label: i18n('metrics:reused_passwords'),
          value: securitySummary.reusedPasswordCount,
          family: 'risk',
          severity: 'warning',
        },
        {
          id: 'weak_passwords',
          label: i18n('metrics:weak_passwords'),
          value: securitySummary.weakPasswordCount,
          family: 'risk',
          severity: 'critical',
        },
        {
          id: 'two_factor',
          label: i18n('metrics:two_factor'),
          value: securitySummary.twoFactorCount,
          family: 'attribute',
        },
      ],
      securityStatus: securitySummary.status,
      riskSeverity: securitySummary.riskSeverity,
    }
  }

  private getMetricEntries(
    group: Group | ManagerRoot,
    rows: PMGroupRow[],
    isRoot: boolean,
    visibleEntries: Entry[],
  ): Entry[] {
    if (!isRoot) return visibleEntries

    const rootEntries = this.getRootEntries(group)
    if (!rootEntries) {
      return rows.flatMap((row) => (row.kind === 'entry' ? [row.item] : []))
    }

    const selectedTags = getEffectiveSelectedCredentialTagFilters(
      rootEntries,
      this.isManagerRoot(group) ? getPMRootCredentialTagsForSearch(group) : [],
    )
    const matchesEntry = createEntryFilterMatcher(filterValue(), quickFilters(), Date.now(), selectedTags)
    return rootEntries.filter((entry) => matchesEntry(entry))
  }

  private getRootEntries(group: Group | ManagerRoot): Entry[] | null {
    if (!this.isManagerRoot(group)) return null

    return getPMRootEntriesForSearch(group)
  }

  getVisibleRows(group: Group | ManagerRoot): PMGroupRow[] {
    const root = getPassmanagerRoot()
    if (!root) return []
    return getPMCredentialSurfaceRows(root, group)
  }

  getUniqueRows(items: PMGroupRow[]): PMGroupRow[] {
    const seen = new Set<string>()
    const unique: PMGroupRow[] = []

    for (const item of items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      unique.push(item)
    }

    return unique
  }

  getGroupingAnchorEntryId(
    rows: readonly PMGroupRow[],
    visibleRange: {first: number; last: number} | null,
    activeItemId: string | null | undefined,
  ): string | null {
    if (rows.length === 0) return null

    const first = Math.max(0, Math.min(rows.length - 1, visibleRange?.first ?? 0))
    const last = Math.max(first, Math.min(rows.length - 1, visibleRange?.last ?? first))
    if (activeItemId) {
      for (let index = first; index <= last; index += 1) {
        const row = rows[index]
        if (row?.kind === 'entry' && row.id === activeItemId) return row.id
      }
    }

    for (let index = first; index <= last; index += 1) {
      const row = rows[index]
      if (row?.kind === 'entry') return row.id
    }
    for (let index = last + 1; index < rows.length; index += 1) {
      const row = rows[index]
      if (row?.kind === 'entry') return row.id
    }
    for (let index = first - 1; index >= 0; index -= 1) {
      const row = rows[index]
      if (row?.kind === 'entry') return row.id
    }

    return null
  }

  resolveGroupingAnchorIndex(rows: readonly PMGroupRow[], entryId: string | null): number | null {
    if (entryId) {
      const exactIndex = rows.findIndex((row) => row.kind === 'entry' && row.id === entryId)
      if (exactIndex >= 0) return exactIndex
    }

    const fallbackIndex = rows.findIndex((row) => row.kind === 'entry')
    return fallbackIndex >= 0 ? fallbackIndex : null
  }

  getListContextKey(group: Group | ManagerRoot, _itemCount: number): string {
    const groupKey = this.isManagerRoot(group) ? 'root' : group.id
    const query = filterValue()
    const filters = quickFilters().join(',')
    const tagFilters = selectedCredentialTagFilters().join(',')
    return `${groupKey}|${query}|${filters}|${tagFilters}|${sortField()}|${sortDirection()}|${groupBy()}`
  }

  resetKeyboardState(): void {
    this.keyboardItems = []
    this.keyboardContextKey = ''
    this.currentContainerId = null
  }

  syncKeyboardState(
    items: PMGroupRow[],
    contextKey: string,
    group: Group | ManagerRoot,
  ): PMSyncKeyboardResult {
    const containerId = this.getContainerId(group)
    const contextChanged = contextKey !== this.keyboardContextKey
    const activeItemId = pmActiveRowModel.getActive(containerId)
    this.keyboardItems = items
    this.currentContainerId = containerId

    if (!items.some((item) => this.isActionableRow(item))) {
      this.keyboardContextKey = contextKey
      return {restoredIndex: null, activeIndex: -1, contextChanged}
    }

    const activeIndex = activeItemId == null ? -1 : this.findActionableIndexById(items, activeItemId)
    if (activeIndex >= 0 && activeItemId) {
      this.keyboardContextKey = contextKey
      pmActiveRowModel.setActive(containerId, activeItemId)
      return {restoredIndex: contextChanged ? activeIndex : null, activeIndex, contextChanged}
    }

    const firstInteractive = this.findFirstActionableIndex(items)
    if (firstInteractive >= 0) {
      const firstActionableId = this.getActionableIdByIndex(items, firstInteractive)
      if (firstActionableId) {
        pmActiveRowModel.setActive(containerId, firstActionableId)
      }
    }

    this.keyboardContextKey = contextKey
    return {
      restoredIndex: contextChanged && activeItemId != null ? firstInteractive : null,
      activeIndex: firstInteractive,
      contextChanged,
    }
  }

  moveKeyboardFocus(step: number): number | null {
    const items = this.keyboardItems
    if (!items.length || !items.some((item) => this.isActionableRow(item))) return null

    const containerId = this.currentContainerId
    if (!containerId) return null

    const length = items.length
    const current = this.findActionableIndexById(items, pmActiveRowModel.getActive(containerId))
    if (current < 0) {
      const next = step < 0 ? this.findLastActionableIndex(items) : this.findFirstActionableIndex(items)
      const nextId = this.getActionableIdByIndex(items, next)
      if (nextId) {
        pmActiveRowModel.setActive(containerId, nextId)
      }
      return next
    }

    let next = current
    for (let offset = 0; offset < length; offset += 1) {
      next = (next + step + length) % length
      if (this.isActionableRow(items[next])) {
        const nextId = this.getActionableIdByIndex(items, next)
        if (nextId) {
          pmActiveRowModel.setActive(containerId, nextId)
        }
        return next
      }
    }

    const nextId = this.getActionableIdByIndex(items, next)
    if (nextId) {
      pmActiveRowModel.setActive(containerId, nextId)
    }
    return next
  }

  openActiveItem(): boolean {
    const containerId = this.currentContainerId
    if (!containerId) return false

    const activeIndex = this.findActionableIndexById(
      this.keyboardItems,
      pmActiveRowModel.getActive(containerId),
    )
    const item = this.keyboardItems[activeIndex]
    if (!this.isActionableRow(item)) return false

    pmModel.openItem(item.item)
    return true
  }

  setActiveItemById(id: string): number | null {
    const index = this.findActionableIndexById(this.keyboardItems, id)
    if (index >= 0) {
      const containerId = this.currentContainerId ?? this.getCurrentGroup()?.id ?? null
      if (containerId) {
        pmActiveRowModel.setActive(containerId, id)
      }
      return index
    }

    return null
  }

  getActiveItemId(): string | undefined {
    const containerId = this.currentContainerId ?? this.getCurrentGroup()?.id ?? null
    if (!containerId) {
      return undefined
    }

    return pmActiveRowModel.getActive(containerId) ?? undefined
  }

  getKeyboardItemIdByIndex(index: number): string | undefined {
    return this.keyboardItems[index]?.id
  }

  startPointerDrag(itemId: string, kind: 'entry' | 'group'): string {
    if (kind === 'entry') {
      pmEntryMoveModel.startDrag(itemId)
    } else {
      pmEntryMoveModel.startGroupDrag(itemId)
    }

    return this.getPointerDragLabel(itemId, kind)
  }

  findPointerDropTarget(x: number, y: number, payload: PMDragPayload): PMPointerDropTarget | null {
    const hit = pmEntryMoveModel.hitTestDropTarget(x, y)
    if (!hit || !pmEntryMoveModel.canDropToTarget(hit.id, payload)) {
      return null
    }

    return hit
  }

  setPointerDropTarget(targetId: string | null): void {
    pmEntryMoveModel.setDropTarget(targetId)
  }

  dropPointerPayload(targetId: string, payload: PMDragPayload): Promise<boolean> {
    return pmEntryMoveModel.dropToTarget(targetId, payload)
  }

  clearPointerDragState(): void {
    pmEntryMoveModel.clearDragState()
  }

  selectByID(id: string): void {
    const card = getPassmanagerRoot()?.getCardByID(id)
    if (card instanceof Entry || card instanceof Group) {
      pmModel.openItem(card)
    }
  }

  private getPointerDragLabel(itemId: string, kind: 'entry' | 'group'): string {
    const root = getPassmanagerRoot()
    if (!root) return ''

    if (kind === 'group') return root.getGroup(itemId)?.name || '?'
    return root.getEntry(itemId)?.title || i18n('no_title')
  }

  enterEditMode(): void {
    const group = this.getCurrentGroup()
    if (!(group instanceof Group)) return

    pmGroupEditModel.enter(group)
  }

  exitEditMode(): void {
    pmGroupEditModel.discard()
  }

  requestEditClose(): Promise<boolean> {
    return pmGroupEditModel.requestClose()
  }

  saveEdit(): Promise<boolean> {
    return pmGroupEditModel.submit()
  }

  deleteGroup(group: Group): void {
    if (this.isReadOnly()) return

    void this.removeGroupAction(group, false)
  }

  deleteEntry(entry: Entry): void {
    if (this.isReadOnly()) return

    const presentationParent = this.getCurrentGroup()
    this.entryActionsModel.deleteEntryCard(
      entry,
      presentationParent ?? undefined,
      getDeletionNeighbourId(this.keyboardItems.filter(isActionableRow), entry.id),
    )
  }

  private readonly removeGroupAction = action(async (group: Group, skipConfirmation: boolean) => {
    if (pendingGroupDeleteIds.has(group.id)) return false
    pendingGroupDeleteIds.add(group.id)
    let deleteConfirmed = false
    let deletingGroups: Group[] = [group]
    const root = group.root
    const deletionParent = getGroupDeletionParent(group)
    const wasCurrentGroup = root.showElement() === group
    const currentContainer = this.getCurrentGroup()
    const presentationParent = wasCurrentGroup
      ? deletionParent
      : (currentContainer ?? deletionParent)
    const neighbourId = wasCurrentGroup
      ? getDeletionNeighbourId(
          this.getUniqueRows(this.getVisibleRows(deletionParent)).filter(isActionableRow),
          group.id,
        )
      : getDeletionNeighbourId(this.keyboardItems.filter(isActionableRow), group.id)
    try {
      if (!skipConfirmation) {
        const confirmed = await wrap(group.confirmRemoval())
        if (!confirmed) return false
      }

      deleteConfirmed = true
      deletingGroups = root
        .entriesList()
        .filter(
          (item): item is Group =>
            item instanceof Group &&
            (item.name === group.name || item.name.startsWith(`${group.name}/`)),
        )
      pmDeleteMotionModel.markPending(deletingGroups)
      const toastKey = `passmanager.group.delete:${group.id}`
      const deletingToast = toast.loading(
        i18n('notify:remove:group:pending', {name: group.name}),
        undefined,
        {key: toastKey},
      )

      try {
        await wrap(
          group.remove({
            silent: true,
            presentation: wasCurrentGroup ? 'defer' : 'auto',
          }),
        )
        if (
          (wasCurrentGroup && root.showElement() === group) ||
          (!wasCurrentGroup && root.showElement() === presentationParent)
        ) {
          passmanagerNavigationController.presentAfterDelete({
            deletedId: group.id,
            parent: presentationParent,
            neighbourId,
          })
        }
        deletingToast.update({
          key: toastKey,
          message: i18n('notify:remove:group:success', {name: group.name}),
          variant: 'success',
        })
        return true
      } catch {
        deletingToast.update({
          key: toastKey,
          message: i18n('notify:remove:group:error', {name: group.name}),
          variant: 'error',
          persistent: true,
          closable: true,
          actions: [
            {
              label: i18n('button:retry'),
              dismissOnClick: false,
              onClick: () => {
                void this.removeGroupAction(group, true)
              },
            },
          ],
        })
        return false
      }
    } finally {
      pendingGroupDeleteIds.delete(group.id)
      const root = getPassmanagerRoot()
      if (deleteConfirmed && root?.getCardByID?.(group.id) === group) {
        pmDeleteMotionModel.clearPending(deletingGroups.map((item) => item.id))
      }
    }
  }, 'passmanager.group.remove').extend(withAsync())

  async moveGroup(group: Group): Promise<void> {
    if (isPassmanagerReadOnly()) return

    const firstAllowedTarget = pmEntryMoveModel
      .listTargets()
      .find((target) =>
        pmEntryMoveModel.canDropToTarget(target.id, {domain: 'passmanager', kind: 'group', id: group.id}),
      )

    await openPassmanagerMoveDialog({
      onConfirm: (targetId) => pmEntryMoveModel.moveGroupById(group.id, targetId),
      selectedId: firstAllowedTarget?.id ?? '',
      useMobilePicker: this.shouldUseMobileMovePicker(),
    })
  }

  isReadOnly(): boolean {
    return isPassmanagerReadOnlyOrMissing()
  }

  isToolbarAction(value: string | undefined): value is PMToolbarAction {
    if (!value) return false
    return toolbarActions.has(value as PMToolbarAction)
  }

  getDesktopToolbarActions(
    group: Group | ManagerRoot | null = this.getCurrentGroup(),
  ): PMDesktopToolbarActionSpec<PMToolbarAction>[] {
    if (!group) return [] as PMDesktopToolbarActionSpec<PMToolbarAction>[]

    const isReadOnly = this.isReadOnly()
    const isRoot = this.isManagerRoot(group)
    if (isRoot) return [] as PMDesktopToolbarActionSpec<PMToolbarAction>[]

    return [
      {
        id: 'edit-group',
        icon: 'pencil-square',
        label: i18n('button:edit'),
        disabled: isReadOnly,
        iconOnly: true,
        appearance: 'ghost',
      },
      {
        id: 'move-group',
        icon: 'folder-symlink',
        label: i18n('button:move'),
        disabled: isReadOnly,
        iconOnly: true,
      },
      {
        id: 'remove-group',
        icon: 'trash',
        label: i18n('button:remove'),
        disabled: isReadOnly,
        danger: true,
        iconOnly: true,
      },
    ]
  }

  executeToolbarAction(action: PMToolbarAction): void {
    const passmanager = getPassmanagerRoot()
    if (!passmanager || isPassmanagerReadOnly()) return

    const group = this.getCurrentGroup()
    if (!group) return

    switch (action) {
      case 'edit-group':
        if (this.isManagerRoot(group)) return
        this.enterEditMode()
        return
      case 'move-group':
        if (this.isManagerRoot(group)) return
        void this.moveGroup(group)
        return
      case 'remove-group':
        if (this.isManagerRoot(group)) return
        this.deleteGroup(group)
        return
      default:
        return
    }
  }

  private isActionableRow(item: PMGroupRow | undefined): item is PMGroupActionableRow {
    return item?.kind === 'entry' || item?.kind === 'group'
  }

  private findFirstActionableIndex(items: PMGroupRow[]): number {
    return items.findIndex((item) => this.isActionableRow(item))
  }

  private findLastActionableIndex(items: PMGroupRow[]): number {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (this.isActionableRow(items[index])) {
        return index
      }
    }

    return -1
  }

  private findActionableIndexById(items: PMGroupRow[], id: string | null | undefined): number {
    if (!id) {
      return -1
    }

    return items.findIndex((item) => this.isActionableRow(item) && item.id === id)
  }

  private getActionableIdByIndex(items: PMGroupRow[], index: number): string | null {
    const item = items[index]
    return this.isActionableRow(item) ? item.id : null
  }

  private getContainerId(group: Group | ManagerRoot): string {
    return group.id
  }

  private shouldUseMobileMovePicker(): boolean {
    try {
      return getAppContext().store.layoutMode() === 'mobile'
    } catch {
      return window.matchMedia('(max-width: 720px)').matches
    }
  }
}
