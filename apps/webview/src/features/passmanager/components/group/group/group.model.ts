import {atom, wrap} from '@reatom/core'

import {Entry, Group, type ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {
  createEntryFilterMatcher,
  createGroupFilterMatcher,
  filterValue,
  getEffectiveSelectedCredentialTagFilters,
  quickFilters,
  selectedCredentialTagFilters,
} from '@project/passmanager/select'
import {getAppContext} from 'root/shared/services/app-context'
import type {PMDesktopToolbarActionSpec} from '../../desktop-toolbar'
import {pmActiveRowModel} from '../../../models/pm-active-row.model'
import {
  pmCredentialSecurityAuditModel,
  type PMCredentialAuditStatus,
  type PMCredentialRiskSeverity,
  type PMCredentialGroupRiskSummary,
} from '../../../models/pm-credential-security-audit.model'
import {pmEntryMoveModel, type PMDragPayload} from '../../../models/pm-entry-move-model'
import {
  getPassmanagerRoot,
  getPassmanagerShowElement,
  isPassmanagerReadOnly,
  isPassmanagerReadOnlyOrMissing,
} from '../../../models/pm-root.adapter'
import {
  composePMGroupRows,
  pmRootSearchProjectionModel,
  type PMGroupEntryRow,
  type PMGroupFolderRow,
  type PMGroupRow,
} from '../../../models/pm-root-search-projection'
import {pmDeleteMotionModel} from '../../../models/pm-delete-motion.model'
import {pmModel} from '../../../password-manager.model'
import {openPassmanagerMoveDialog} from '../../../service/passmanager-move-dialog'
import {PMEntryModel} from '../../card/entry/entry.model'
import {groupBy, sortDirection, sortField} from '../../list/sort-controls'

export type PMToolbarAction = 'create-entry' | 'create-group' | 'edit-group' | 'remove-group'
export type PMGroupMetric = {
  id: 'entries' | 'reused_passwords' | 'weak_passwords' | 'two_factor'
  label: string
  value: number | null
  family: 'neutral' | 'risk' | 'attribute'
  severity?: 'warning' | 'critical'
}

export type PMGroupRiskIndicator = {
  severity: 'warning' | 'critical'
  label: string
  count: number
} | null

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

type PMSyncKeyboardResult = {
  restoredIndex: number | null
  activeIndex: number
  contextChanged: boolean
}

const toolbarActions = new Set<PMToolbarAction>([
  'create-entry',
  'create-group',
  'edit-group',
  'remove-group',
])
const groupEditMode = atom(false, 'passmanager.group.isEditMode')
const groupEditedName = atom('', 'passmanager.group.editedName')
const groupEditedDescription = atom('', 'passmanager.group.editedDescription')
const groupEditedIconRef = atom<string | undefined>(undefined, 'passmanager.group.editedIconRef')
const groupEditError = atom<string | null>(null, 'passmanager.group.editError')

export class PMGroupModel {
  readonly isEditMode = groupEditMode
  readonly editedName = groupEditedName
  readonly editedDescription = groupEditedDescription
  readonly editedIconRef = groupEditedIconRef
  readonly editError = groupEditError
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

  syncEditDrafts(group: Group | null = null): Group | null {
    const currentGroup = group ?? this.getCurrentGroup()
    if (!(currentGroup instanceof Group)) {
      this.editedName.set('')
      this.editedDescription.set('')
      this.editedIconRef.set(undefined)
      this.editError.set(null)
      return null
    }

    this.editedName.set(this.getGroupDisplayName(currentGroup))
    this.editedDescription.set(currentGroup.description ?? '')
    this.editedIconRef.set(currentGroup.iconRef)
    this.editError.set(null)
    return currentGroup
  }

  setEditedName(name: string): void {
    this.editedName.set(name)
    this.editError.set(null)
  }

  setEditedDescription(description: string): void {
    this.editedDescription.set(description)
  }

  setEditedIconRef(iconRef: string | undefined): void {
    this.editedIconRef.set(iconRef)
  }

  getGroupRowPresentation(group: Group): PMGroupRowPresentation {
    const summary = pmCredentialSecurityAuditModel.summarizeEntries(group.entries())

    return {
      displayName: this.getGroupDisplayName(group),
      description: group.description ?? '',
      entryCount: group.entries().length,
      riskIndicator: this.getRiskIndicator(summary),
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
    const parentPath = group instanceof Group ? this.getParentPath(group) : null
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
      visibleLabel: `${this.formatCount(folderCount, 'group')} · ${this.formatCount(entryCount, 'entry')}`,
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
      this.isManagerRoot(group) ? group.credentialTags() : [],
    )
    const matchesEntry = createEntryFilterMatcher(filterValue(), quickFilters(), Date.now(), selectedTags)
    return rootEntries.filter((entry) => matchesEntry(entry))
  }

  private getRootEntries(group: Group | ManagerRoot): Entry[] | null {
    if (!this.isManagerRoot(group)) return null

    const allEntries = (group as ManagerRoot & {allEntries?: unknown}).allEntries
    return Array.isArray(allEntries) ? allEntries.filter((item): item is Entry => item instanceof Entry) : null
  }

  getVisibleRows(group: Group | ManagerRoot): PMGroupRow[] {
    const root = getPassmanagerRoot()
    if (!root) return []

    if (this.isManagerRoot(group)) {
      return pmRootSearchProjectionModel.getSnapshot().rows
    }

    const currentGroup = group as Group
    const entries = currentGroup.searched() as Entry[]
    const prefix = currentGroup.name + '/'
    const query = filterValue()
    const filters = quickFilters()
    const selectedTags = getEffectiveSelectedCredentialTagFilters(root.allEntries, root.credentialTags())
    const matchesGroup = createGroupFilterMatcher(query)

    const childGroups = root.entriesList().filter((item): item is Group => {
      if (!(item instanceof Group)) return false
      if (!item.name.startsWith(prefix)) return false

      const restPath = item.name.slice(prefix.length)
      if (restPath.includes('/')) return false
      if (query || filters.length || selectedTags.length) {
        return (
          item.searched().length > 0 ||
          (query.length > 0 &&
            matchesGroup({
              name: this.getGroupDisplayName(item),
              description: item.description,
            }))
        )
      }
      return true
    })

    return composePMGroupRows(childGroups, entries, {
      groupBy: groupBy(),
      sortField: sortField(),
      sortDirection: sortDirection(),
    })
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

  getListContextKey(group: Group | ManagerRoot, itemCount: number): string {
    const groupKey = this.isManagerRoot(group) ? 'root' : group.id
    const query = filterValue()
    const filters = quickFilters().join(',')
    const tagFilters = selectedCredentialTagFilters().join(',')
    return `${groupKey}|${query}|${filters}|${tagFilters}|${sortField()}|${sortDirection()}|${groupBy()}|${itemCount}`
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

  private getParentPath(group: Group): string | null {
    const separator = group.name.lastIndexOf('/')
    if (separator <= 0) return null
    return group.name.slice(0, separator)
  }

  private formatCount(value: number, noun: string): string {
    if (noun === 'entry') {
      return `${value} ${value === 1 ? 'entry' : 'entries'}`
    }

    return `${value} ${noun}${value === 1 ? '' : 's'}`
  }

  private getRiskIndicator(summary: PMCredentialGroupRiskSummary): PMGroupRiskIndicator {
    const weakPasswordCount = summary.weakPasswordCount ?? 0
    if (weakPasswordCount > 0) {
      return {
        severity: 'critical',
        count: weakPasswordCount,
        label: i18n('group:risk:weak_passwords', {count: String(weakPasswordCount)}),
      }
    }

    const reusedPasswordCount = summary.reusedPasswordCount ?? 0
    if (reusedPasswordCount > 0) {
      return {
        severity: 'warning',
        count: reusedPasswordCount,
        label: i18n('group:risk:reused_passwords', {count: String(reusedPasswordCount)}),
      }
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

    this.syncEditDrafts(group)
    this.isEditMode.set(true)
  }

  exitEditMode(): void {
    this.isEditMode.set(false)
    this.editError.set(null)
  }

  async saveEdit(): Promise<boolean> {
    const group = this.getCurrentGroup()
    if (!(group instanceof Group)) {
      return false
    }

    const nextLeafName = this.editedName().trim()
    if (!nextLeafName) {
      this.editError.set(i18n('group:error:name_text'))
      return false
    }

    const parentPath = this.getParentPath(group)
    const nextPath = parentPath ? `${parentPath}/${nextLeafName}` : nextLeafName
    if (nextPath !== group.name && !group.rename(nextPath)) {
      this.editError.set(i18n('group:error:name_text'))
      return false
    }

    group.updateData({
      description: this.editedDescription(),
      iconRef: this.editedIconRef(),
    })
    group.root.updatedTs.set(Date.now())
    await wrap(group.root.save())
    this.exitEditMode()
    return true
  }

  deleteGroup(group: Group): void {
    pmDeleteMotionModel.markPending([group])
    void this.removeGroupWithDeleteMotion(group).catch(() => {})
  }

  deleteEntry(entry: Entry): void {
    if (this.isReadOnly()) return

    this.entryActionsModel.deleteEntryCard(entry)
  }

  private async removeGroupWithDeleteMotion(group: Group): Promise<void> {
    try {
      await wrap(group.remove())
    } finally {
      const root = getPassmanagerRoot()
      if (root?.getCardByID?.(group.id) === group) {
        pmDeleteMotionModel.clearPending([group.id])
      }
    }
  }

  async moveGroup(group: Group): Promise<void> {
    if (isPassmanagerReadOnly()) return

    const firstAllowedTarget = pmEntryMoveModel
      .listTargets()
      .find((target) => pmEntryMoveModel.canDropToTarget(target.id, {domain: 'passmanager', kind: 'group', id: group.id}))

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

  getDesktopToolbarActions(group: Group | ManagerRoot | null = this.getCurrentGroup()) {
    if (!group) return [] as PMDesktopToolbarActionSpec<PMToolbarAction>[]

    const isReadOnly = this.isReadOnly()
    const isRoot = this.isManagerRoot(group)
    const actions: PMDesktopToolbarActionSpec<PMToolbarAction>[] = [
      {
        id: 'create-entry',
        icon: 'plus-lg',
        label: i18n('enrty:create'),
        disabled: isReadOnly,
      },
      {
        id: 'create-group',
        icon: 'plus-lg',
        label: i18n('group:create'),
        disabled: isReadOnly,
      },
    ]

    if (!isRoot) {
      actions.push(
        {
          id: 'edit-group',
          icon: 'pencil-square',
          label: i18n('button:edit'),
          disabled: isReadOnly,
          iconOnly: true,
        },
        {
          id: 'remove-group',
          icon: 'x-lg',
          label: i18n('button:remove'),
          disabled: isReadOnly,
          iconOnly: true,
        },
      )
    }

    return actions
  }

  executeToolbarAction(action: PMToolbarAction): void {
    const passmanager = getPassmanagerRoot()
    if (!passmanager || isPassmanagerReadOnly()) return

    const group = this.getCurrentGroup()
    if (!group) return

    switch (action) {
      case 'create-entry':
        passmanager.setShowElement('createEntry', this.isManagerRoot(group) ? undefined : group)
        return
      case 'create-group':
        pmModel.onCreateGroup()
        return
      case 'edit-group':
        if (this.isManagerRoot(group)) return
        this.enterEditMode()
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
