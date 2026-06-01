import {atom, wrap} from '@reatom/core'

import {Entry, Group, type ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {
  MobilePointerDndModel,
  type MobilePointerDndAdapter,
  type MobilePointerDndPayload,
} from 'root/shared/services/mobile-pointer-dnd'
import {toast} from 'root/shared/services/toast-manager'
import {pmMobileSelectionModel} from './pm-mobile-selection.model'
import {getPassmanagerRoot} from './pm-root.adapter'

const RECENT_TARGETS_STORAGE_KEY = 'pm-entry-move-recent-targets-v1'
const RECENT_TARGETS_LIMIT = 5
const DND_ENTRY_MIME = 'application/x-chromvoid-entry-id'
const DND_GROUP_MIME = 'application/x-chromvoid-group-id'
type MoveTargetEntity = Group | ManagerRoot

type LastMoveSnapshot = {
  entryId: string
  sourceTargetId: string
  targetId: string
}

type GroupMovePlan = {
  sourcePath: string
  targetPath: string | null
  targetLabel: string
  movedLabel: string
  movedGroupIds: Set<string>
  nextPathByGroupId: Map<string, string>
}

type BulkMovePlan = {
  targetLabel: string
  movedGroupIds: Set<string>
  nextPathByGroupId: Map<string, string>
}

type ToastVariant = 'info' | 'success' | 'warning' | 'error'

type ToastAction = {
  label: string
  onClick: () => void | Promise<void>
}

export type MoveTarget = {
  id: string
  path: string
  label: string
  isRoot: boolean
}

export type PMSingleDragPayload = MobilePointerDndPayload & {
  domain: 'passmanager'
  kind: 'entry' | 'group'
  id: string
}

export type PMSelectionDragPayload = MobilePointerDndPayload & {
  domain: 'passmanager'
  kind: 'selection'
  anchorKind: 'entry' | 'group'
  anchorId: string
  entryIds: string[]
  groupIds: string[]
}

export type PMDragPayload = PMSingleDragPayload | PMSelectionDragPayload

class PMEntryMoveModel {
  readonly recentTargetIds = atom<string[]>(this.readRecentTargets(), 'pm_entry_move_recent_targets')
  readonly draggedEntryId = atom<string | null>(null, 'pm_entry_move_dragged_entry_id')
  readonly draggedGroupId = atom<string | null>(null, 'pm_entry_move_dragged_group_id')
  readonly dropTargetId = atom<string | null>(null, 'pm_entry_move_drop_target_id')
  readonly lastMove = atom<LastMoveSnapshot | null>(null, 'pm_entry_move_last_move')
  readonly mobileDnd = new MobilePointerDndModel<PMDragPayload>(this.createMobileDndAdapter(), {
    namespace: 'passmanager.mobileDnd',
  })

  isDesktopDragEnabled(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true
    }
    return window.matchMedia('(pointer:fine)').matches
  }

  listTargets(): MoveTarget[] {
    const root = this.root()
    if (!root) return []

    const targets: MoveTarget[] = [{id: root.id, path: '/', label: '/', isRoot: true}]
    for (const item of root.entriesList()) {
      if (!(item instanceof Group)) continue
      targets.push({id: item.id, path: item.name, label: item.name, isRoot: false})
    }
    return targets
  }

  listRecentTargets(): MoveTarget[] {
    const byId = new Map(this.listTargets().map((target) => [target.id, target]))
    return this.recentTargetIds()
      .map((id) => byId.get(id))
      .filter((target): target is MoveTarget => Boolean(target))
  }

  getTargetLabelById(targetId: string): string {
    const target = this.listTargets().find((item) => item.id === targetId)
    return target?.label ?? '/'
  }

  getEntryParentTargetId(entry: Entry): string {
    const root = this.root()
    if (!root) return ''
    return entry.parent instanceof Group ? entry.parent.id : root.id
  }

  startDrag(entryId: string): void {
    this.draggedGroupId.set(null)
    this.draggedEntryId.set(entryId)
  }

  startGroupDrag(groupId: string): void {
    this.draggedEntryId.set(null)
    this.draggedGroupId.set(groupId)
  }

  setDropTarget(targetId: string | null): void {
    this.dropTargetId.set(targetId)
  }

  clearDragState(): void {
    this.draggedEntryId.set(null)
    this.draggedGroupId.set(null)
    this.dropTargetId.set(null)
  }

  canStartMobileDrag(kind: 'entry' | 'group', id: string): boolean {
    const root = this.root()
    if (!root || root.isReadOnly() || !id) return false

    if (pmMobileSelectionModel.active()) {
      const selected =
        kind === 'entry'
          ? pmMobileSelectionModel.isEntrySelected(id)
          : pmMobileSelectionModel.isGroupSelected(id)
      return selected && pmMobileSelectionModel.selectedCount() > 0
    }

    return kind === 'entry' ? Boolean(root.getEntry(id)) : Boolean(root.getGroup(id))
  }

  createMobileDragPayload(kind: 'entry' | 'group', id: string): PMDragPayload | null {
    if (!this.canStartMobileDrag(kind, id)) return null

    if (!pmMobileSelectionModel.active()) {
      return {domain: 'passmanager', kind, id}
    }

    const selected =
      kind === 'entry'
        ? pmMobileSelectionModel.isEntrySelected(id)
        : pmMobileSelectionModel.isGroupSelected(id)
    if (!selected) return null

    return {
      domain: 'passmanager',
      kind: 'selection',
      anchorKind: kind,
      anchorId: id,
      entryIds: pmMobileSelectionModel.selectedEntryIds(),
      groupIds: pmMobileSelectionModel.selectedGroupIds(),
    }
  }

  beginMobileDrag(kind: 'entry' | 'group', id: string, point: {x: number; y: number}): boolean {
    const payload = this.createMobileDragPayload(kind, id)
    if (!payload) return false
    this.mobileDnd.begin(payload, point)
    return true
  }

  moveMobileDrag(point: {x: number; y: number}): boolean {
    return this.mobileDnd.move(point)
  }

  commitMobileDrag(point: {x: number; y: number}): Promise<boolean> {
    return this.mobileDnd.commit(point)
  }

  cancelMobileDrag(): void {
    this.mobileDnd.cancel()
  }

  registerMobileDropZone(root: Document | ShadowRoot): void {
    this.mobileDnd.registerDropZoneRoot(root)
  }

  unregisterMobileDropZone(root: Document | ShadowRoot): void {
    this.mobileDnd.unregisterDropZoneRoot(root)
  }

  readEntryIdFromDataTransfer(dataTransfer: DataTransfer | null): string | null {
    const payload = this.readDragPayload(dataTransfer)
    return payload?.kind === 'entry' ? payload.id : null
  }

  readGroupIdFromDataTransfer(dataTransfer: DataTransfer | null): string | null {
    const payload = this.readDragPayload(dataTransfer)
    return payload?.kind === 'group' ? payload.id : null
  }

  readDragPayload(dataTransfer: DataTransfer | null): PMDragPayload | null {
    if (!dataTransfer) return null

    const groupId = String(dataTransfer.getData(DND_GROUP_MIME) || '').trim()
    if (groupId.length > 0) {
      return {domain: 'passmanager', kind: 'group', id: groupId}
    }

    const entryId = String(dataTransfer.getData(DND_ENTRY_MIME) || '').trim()
    if (entryId.length > 0) {
      return {domain: 'passmanager', kind: 'entry', id: entryId}
    }

    const textValue = String(dataTransfer.getData('text/plain') || '').trim()
    if (!textValue) return null

    if (this.draggedGroupId() === textValue) {
      return {domain: 'passmanager', kind: 'group', id: textValue}
    }

    return {domain: 'passmanager', kind: 'entry', id: textValue}
  }

  canDropToTarget(targetId: string, payload?: PMDragPayload | null): boolean {
    const activePayload = payload || this.getDraggedPayload()
    if (!activePayload) return false

    if (activePayload.kind === 'selection') {
      const {entries, groups} = this.resolveSelectionPayloadItems(activePayload)
      return this.canMoveSelectionToTarget(entries, groups, targetId)
    }

    if (activePayload.kind === 'entry') {
      const root = this.root()
      if (!root || root.isReadOnly()) return false

      const entry = root.getEntry(activePayload.id)
      if (!entry) return false

      const sourceTargetId = this.getEntryParentTargetId(entry)
      return Boolean(sourceTargetId) && sourceTargetId !== targetId
    }

    return this.canMoveGroupToTarget(activePayload.id, targetId)
  }

  setDragData(event: DragEvent, entryId: string): void {
    this.setEntryDragData(event, entryId)
  }

  setEntryDragData(event: DragEvent, entryId: string): void {
    const dataTransfer = event.dataTransfer
    if (!dataTransfer) return
    dataTransfer.effectAllowed = 'move'
    dataTransfer.setData(DND_ENTRY_MIME, entryId)
    dataTransfer.setData('text/plain', entryId)
  }

  setGroupDragData(event: DragEvent, groupId: string): void {
    const dataTransfer = event.dataTransfer
    if (!dataTransfer) return
    dataTransfer.effectAllowed = 'move'
    dataTransfer.setData(DND_GROUP_MIME, groupId)
    dataTransfer.setData('text/plain', groupId)
  }

  async dropToTarget(targetId: string, fallbackPayload?: PMDragPayload | string | null): Promise<boolean> {
    const payload =
      typeof fallbackPayload === 'string'
        ? ({domain: 'passmanager', kind: 'entry', id: fallbackPayload} as PMDragPayload)
        : (fallbackPayload ?? this.getDraggedPayload())

    this.clearDragState()
    if (!payload) return false

    if (payload.kind === 'selection') {
      const {entries, groups} = this.resolveSelectionPayloadItems(payload)
      return this.moveSelection(entries, groups, targetId)
    }

    if (payload.kind === 'group') {
      return this.moveGroupById(payload.id, targetId)
    }

    return this.moveEntryById(payload.id, targetId)
  }

  moveGroupById(groupId: string, targetId: string): boolean {
    const root = this.root()
    if (!root || root.isReadOnly()) return false

    const sourceGroup = root.getGroup(groupId)
    if (!sourceGroup) return false

    const plan = this.buildGroupMovePlan(sourceGroup, targetId)
    if (!plan) {
      this.showToast(i18n('notify:move:already_in_group'), 'info')
      return false
    }

    let changed = false
    for (const item of root.entriesList()) {
      if (!(item instanceof Group)) continue
      if (!plan.movedGroupIds.has(item.id)) continue

      const nextPath = plan.nextPathByGroupId.get(item.id)
      if (!nextPath || nextPath === item.name) continue

      item.updateData({name: nextPath})
      changed = true
    }

    if (!changed) {
      this.showToast(i18n('notify:move:already_in_group'), 'info')
      return false
    }

    root.updatedTs.set(Date.now())
    void root.save()

    const message = `${i18n('notify:move:moved_prefix')} "${plan.movedLabel}" ${i18n('notify:move:moved_to')} "${plan.targetLabel}"`
    const actions: ToastAction[] = [
      {
        label: i18n('button:open_group'),
        onClick: () => {
          this.openTarget(targetId)
        },
      },
    ]

    this.showToast(message, 'success', actions)
    this.exitMobileSelectionIfMoved([], [groupId])
    return true
  }

  async moveEntryById(entryId: string, targetId: string): Promise<boolean> {
    const root = this.root()
    if (!root) return false
    const entry = root.getEntry(entryId)
    if (!entry) return false
    return this.moveEntry(entry, targetId)
  }

  async moveEntry(entry: Entry, targetId: string): Promise<boolean> {
    const root = this.root()
    if (!root) return false
    if (root.isReadOnly()) return false

    const target = this.resolveTargetEntity(targetId)
    if (!target) return false

    const sourceTargetId = this.getEntryParentTargetId(entry)
    if (!sourceTargetId || sourceTargetId === targetId) {
      this.showToast(i18n('notify:move:already_in_group'), 'info')
      return false
    }

    const entryTitle = this.getEntryDisplayTitle(entry)
    try {
      const moved = await wrap(entry.move(target, {silent: true}))
      if (!moved) {
        this.showToast(i18n('error:save'), 'error')
        return false
      }
    } catch (error) {
      this.showToast(this.getMoveErrorMessage(error), 'error')
      return false
    }

    this.lastMove.set({
      entryId: entry.id,
      sourceTargetId,
      targetId,
    })
    this.rememberRecentTarget(targetId)

    const targetLabel = this.getTargetLabelById(targetId)
    const message = `${i18n('notify:move:moved_prefix')} "${entryTitle}" ${i18n('notify:move:moved_to')} "${targetLabel}"`
    const actions: ToastAction[] = [{label: i18n('button:undo'), onClick: () => void this.undoLastMove()}]

    if (!this.isCurrentTargetVisible(targetId)) {
      actions.push({
        label: i18n('button:open_group'),
        onClick: () => {
          this.openTarget(targetId)
        },
      })
    }

    this.showToast(message, 'success', actions)
    this.exitMobileSelectionIfMoved([entry.id], [])
    return true
  }

  getDisabledSelectionTargetIds(entries: Entry[], groups: Group[]): string[] {
    return this.listTargets()
      .filter((target) => !this.canMoveSelectionToTarget(entries, groups, target.id))
      .map((target) => target.id)
  }

  canMoveSelectionToTarget(entries: Entry[], groups: Group[], targetId: string): boolean {
    if (entries.length === 0 && groups.length === 0) {
      return false
    }

    const root = this.root()
    if (!root || root.isReadOnly()) {
      return false
    }

    if (!this.resolveTargetEntity(targetId)) {
      return false
    }

    for (const entry of entries) {
      const sourceTargetId = this.getEntryParentTargetId(entry)
      if (!sourceTargetId || sourceTargetId === targetId) {
        return false
      }
    }

    return this.buildBulkGroupMovePlan(groups, targetId) !== null
  }

  async moveSelection(entries: Entry[], groups: Group[], targetId: string): Promise<boolean> {
    const root = this.root()
    if (!root || root.isReadOnly()) return false

    if (entries.length === 0 && groups.length === 0) return false

    for (const entry of entries) {
      const sourceTargetId = this.getEntryParentTargetId(entry)
      if (!sourceTargetId || sourceTargetId === targetId) {
        this.showToast(i18n('notify:move:already_in_group'), 'info')
        return false
      }
    }

    const groupPlan = this.buildBulkGroupMovePlan(groups, targetId)
    if (!groupPlan) {
      this.showToast(i18n('notify:move:already_in_group'), 'info')
      return false
    }

    const target = this.resolveTargetEntity(targetId)
    if (!target) {
      return false
    }

    let changed = false

    for (const item of root.entriesList()) {
      if (!(item instanceof Group)) continue
      if (!groupPlan.movedGroupIds.has(item.id)) continue

      const nextPath = groupPlan.nextPathByGroupId.get(item.id)
      if (!nextPath || nextPath === item.name) continue

      item.updateData({name: nextPath})
      changed = true
    }

    for (const entry of entries) {
      const moved = await wrap(entry.move(target, {silent: true})).catch((error) => {
        this.showToast(this.getMoveErrorMessage(error), 'error')
        return false
      })
      if (!moved) {
        return false
      }
      changed = true
    }

    if (!changed) {
      this.showToast(i18n('notify:move:already_in_group'), 'info')
      return false
    }

    root.updatedTs.set(Date.now())
    void root.save()
    this.rememberRecentTarget(targetId)

    const total = groups.length + entries.length
    const message = `Moved ${total} item${total === 1 ? '' : 's'} ${i18n('notify:move:moved_to')} "${groupPlan.targetLabel}"`
    const actions: ToastAction[] = [
      {
        label: i18n('button:open_group'),
        onClick: () => {
          this.openTarget(targetId)
        },
      },
    ]

    this.showToast(message, 'success', actions)
    this.exitMobileSelectionIfMoved(
      entries.map((entry) => entry.id),
      groups.map((group) => group.id),
    )
    return true
  }

  async undoLastMove(): Promise<boolean> {
    const snapshot = this.lastMove()
    if (!snapshot) return false

    const root = this.root()
    if (!root) return false

    const entry = root.getEntry(snapshot.entryId)
    const sourceTarget = this.resolveTargetEntity(snapshot.sourceTargetId)

    if (!entry || !sourceTarget) {
      this.lastMove.set(null)
      return false
    }

    const moved = await wrap(entry.move(sourceTarget, {silent: true})).catch((error) => {
      this.showToast(this.getMoveErrorMessage(error), 'error')
      return false
    })
    if (!moved) {
      return false
    }

    this.lastMove.set(null)
    this.showToast(i18n('notify:move:undo_success'), 'info')
    return true
  }

  openTarget(targetId: string): boolean {
    const root = this.root()
    if (!root) return false

    if (targetId === root.id) {
      root.showElement.set(root)
      return true
    }

    const group = root.getGroup(targetId)
    if (!group) return false
    root.showElement.set(group)
    return true
  }

  private getDraggedPayload(): PMDragPayload | null {
    const groupId = this.draggedGroupId()
    if (groupId) {
      return {domain: 'passmanager', kind: 'group', id: groupId}
    }

    const entryId = this.draggedEntryId()
    if (entryId) {
      return {domain: 'passmanager', kind: 'entry', id: entryId}
    }

    return null
  }

  private createMobileDndAdapter(): MobilePointerDndAdapter<PMDragPayload> {
    return {
      canDrop: (targetId, payload) => this.canDropToTarget(targetId, payload),
      drop: (targetId, payload) => this.dropToTarget(targetId, payload),
      getGhostLabel: (payload) => this.getDragPayloadLabel(payload),
      onCancel: () => {
        this.clearDragState()
      },
    }
  }

  private exitMobileSelectionIfMoved(entryIds: readonly string[], groupIds: readonly string[]): void {
    if (!pmMobileSelectionModel.active()) return

    const selectedEntryIds = pmMobileSelectionModel.selectedEntryIds()
    const selectedGroupIds = pmMobileSelectionModel.selectedGroupIds()
    const movedSelectedEntry = entryIds.some((entryId) => selectedEntryIds.includes(entryId))
    const movedSelectedGroup = groupIds.some((groupId) => selectedGroupIds.includes(groupId))

    if (movedSelectedEntry || movedSelectedGroup) {
      pmMobileSelectionModel.exit()
    }
  }

  private resolveSelectionPayloadItems(payload: PMSelectionDragPayload): {entries: Entry[]; groups: Group[]} {
    const root = this.root()
    if (!root) return {entries: [], groups: []}

    const entries = payload.entryIds
      .map((entryId) => root.getEntry(entryId))
      .filter((entry): entry is Entry => entry instanceof Entry)
    const groups = payload.groupIds
      .map((groupId) => root.getGroup(groupId))
      .filter((group): group is Group => group instanceof Group)

    return {entries, groups}
  }

  private getDragPayloadLabel(payload: PMDragPayload): string {
    const root = this.root()
    if (!root) return ''

    if (payload.kind === 'selection') {
      const total = payload.entryIds.length + payload.groupIds.length
      return `${total} selected`
    }

    if (payload.kind === 'group') {
      const groupName = root.getGroup(payload.id)?.name ?? ''
      return this.getPathBaseName(groupName) || '?'
    }

    return root.getEntry(payload.id)?.title || i18n('no_title')
  }

  private canMoveGroupToTarget(groupId: string, targetId: string): boolean {
    const root = this.root()
    if (!root || root.isReadOnly()) return false

    const sourceGroup = root.getGroup(groupId)
    if (!sourceGroup) return false

    return this.buildGroupMovePlan(sourceGroup, targetId) !== null
  }

  private buildBulkGroupMovePlan(groups: Group[], targetId: string): BulkMovePlan | null {
    const root = this.root()
    if (!root) return null

    const targetEntity = this.resolveTargetEntity(targetId)
    if (!targetEntity) return null

    const targetLabel = targetEntity instanceof Group ? targetEntity.name : '/'
    const movedGroupIds = new Set<string>()
    const nextPathByGroupId = new Map<string, string>()
    const takenNextPaths = new Set<string>()

    for (const group of groups) {
      const plan = this.buildGroupMovePlan(group, targetId)
      if (!plan) {
        return null
      }

      for (const movedGroupId of plan.movedGroupIds) {
        movedGroupIds.add(movedGroupId)
      }

      for (const [groupId, nextPath] of plan.nextPathByGroupId) {
        if (takenNextPaths.has(nextPath)) {
          return null
        }
        takenNextPaths.add(nextPath)
        nextPathByGroupId.set(groupId, nextPath)
      }
    }

    return {
      targetLabel,
      movedGroupIds,
      nextPathByGroupId,
    }
  }

  private buildGroupMovePlan(sourceGroup: Group, targetId: string): GroupMovePlan | null {
    const root = this.root()
    if (!root) return null

    const targetEntity = this.resolveTargetEntity(targetId)
    if (!targetEntity) return null

    if (targetEntity instanceof Group && targetEntity.id === sourceGroup.id) {
      return null
    }

    const sourcePath = sourceGroup.name
    const targetPath = targetEntity instanceof Group ? targetEntity.name : null

    if (targetPath && targetPath.startsWith(`${sourcePath}/`)) {
      return null
    }

    const movedLabel = this.getPathBaseName(sourcePath)
    const nextRootPath = targetPath ? `${targetPath}/${movedLabel}` : movedLabel
    if (!nextRootPath || nextRootPath === sourcePath) {
      return null
    }

    const movedGroups = root
      .entriesList()
      .filter((item): item is Group => item instanceof Group)
      .filter((group) => group.name === sourcePath || group.name.startsWith(`${sourcePath}/`))

    if (movedGroups.length === 0) {
      return null
    }

    const movedGroupIds = new Set(movedGroups.map((group) => group.id))
    const nextPathByGroupId = new Map<string, string>()

    for (const group of movedGroups) {
      const suffix = group.name.slice(sourcePath.length)
      nextPathByGroupId.set(group.id, `${nextRootPath}${suffix}`)
    }

    const takenPaths = new Set<string>()
    for (const item of root.entriesList()) {
      if (!(item instanceof Group)) continue
      if (movedGroupIds.has(item.id)) continue
      takenPaths.add(item.name)
    }

    for (const nextPath of nextPathByGroupId.values()) {
      if (takenPaths.has(nextPath)) {
        return null
      }
    }

    return {
      sourcePath,
      targetPath,
      targetLabel: targetPath ?? '/',
      movedLabel,
      movedGroupIds,
      nextPathByGroupId,
    }
  }

  private getPathBaseName(path: string): string {
    const normalized = String(path ?? '').trim()
    if (!normalized) return ''
    const parts = normalized.split('/').filter(Boolean)
    return parts.length > 0 ? parts[parts.length - 1]! : normalized
  }

  private root(): ManagerRoot | undefined {
    return getPassmanagerRoot()
  }

  private resolveTargetEntity(targetId: string): MoveTargetEntity | null {
    const root = this.root()
    if (!root) return null
    if (targetId === root.id) return root

    const group = root.getGroup(targetId)
    return group ?? null
  }

  private isCurrentTargetVisible(targetId: string): boolean {
    const root = this.root()
    if (!root) return true

    const current = root.showElement()
    if (targetId === root.id) return current === root
    return current instanceof Group && current.id === targetId
  }

  private getEntryDisplayTitle(entry: Entry): string {
    const title = String(entry.title ?? '').trim()
    if (title.length > 0) return title
    return i18n('no_title')
  }

  private rememberRecentTarget(targetId: string): void {
    const current = this.recentTargetIds()
    const next = [targetId, ...current.filter((id) => id !== targetId)].slice(0, RECENT_TARGETS_LIMIT)
    this.recentTargetIds.set(next)
    this.saveRecentTargets(next)
  }

  private readRecentTargets(): string[] {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem(RECENT_TARGETS_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .map((value) => String(value ?? '').trim())
        .filter((value) => value.length > 0)
        .slice(0, RECENT_TARGETS_LIMIT)
    } catch {
      return []
    }
  }

  private saveRecentTargets(targetIds: string[]): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(RECENT_TARGETS_STORAGE_KEY, JSON.stringify(targetIds))
    } catch {}
  }

  private showToast(message: string, variant: ToastVariant, actions: ToastAction[] = []): void {
    toast.show({
      message,
      variant,
      duration: 8000,
      persistent: false,
      closable: true,
      actions,
    })
  }

  private getMoveErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message.trim()
      if (message.length > 0) {
        return message
      }
    }

    return i18n('error:save')
  }

  // --- Drop zone registry for cross-component pointer D&D ---

  private dropZoneRoots = new Set<Document | ShadowRoot>()

  registerDropZone(root: Document | ShadowRoot): void {
    this.dropZoneRoots.add(root)
  }

  unregisterDropZone(root: Document | ShadowRoot): void {
    this.dropZoneRoots.delete(root)
  }

  hitTestDropTarget(x: number, y: number): {id: string; el: HTMLElement} | null {
    let best: {id: string; el: HTMLElement; area: number} | null = null

    for (const root of this.dropZoneRoots) {
      const els = root.querySelectorAll<HTMLElement>('[data-drop-target-id]')
      for (const el of els) {
        const rect = el.getBoundingClientRect()
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          const id = el.getAttribute('data-drop-target-id')
          if (!id) continue
          const area = rect.width * rect.height
          if (!best || area < best.area) {
            best = {id, el, area}
          }
        }
      }
    }

    return best ? {id: best.id, el: best.el} : null
  }

}

export const pmEntryMoveModel = new PMEntryMoveModel()
