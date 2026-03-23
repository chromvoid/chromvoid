import {state} from '@statx/core'

import {Entry, Group, i18n} from '@project/passmanager'
import type {ManagerRoot} from '@project/passmanager'
import {toast} from 'root/shared/services/toast-manager'

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

type ToastVariant = 'info' | 'success' | 'warning' | 'error'

type ToastAction = {
  label: string
  onClick: () => void
}

export type MoveTarget = {
  id: string
  path: string
  label: string
  isRoot: boolean
}

export type PMDragPayload = {
  kind: 'entry' | 'group'
  id: string
}

class PMEntryMoveModel {
  readonly recentTargetIds = state<string[]>(this.readRecentTargets(), {name: 'pm_entry_move_recent_targets'})
  readonly draggedEntryId = state<string | null>(null, {name: 'pm_entry_move_dragged_entry_id'})
  readonly draggedGroupId = state<string | null>(null, {name: 'pm_entry_move_dragged_group_id'})
  readonly dropTargetId = state<string | null>(null, {name: 'pm_entry_move_drop_target_id'})
  readonly lastMove = state<LastMoveSnapshot | null>(null, {name: 'pm_entry_move_last_move'})

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
      return {kind: 'group', id: groupId}
    }

    const entryId = String(dataTransfer.getData(DND_ENTRY_MIME) || '').trim()
    if (entryId.length > 0) {
      return {kind: 'entry', id: entryId}
    }

    const textValue = String(dataTransfer.getData('text/plain') || '').trim()
    if (!textValue) return null

    if (this.draggedGroupId() === textValue) {
      return {kind: 'group', id: textValue}
    }

    return {kind: 'entry', id: textValue}
  }

  canDropToTarget(targetId: string, payload?: PMDragPayload | null): boolean {
    const activePayload = payload || this.getDraggedPayload()
    if (!activePayload) return false

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

  dropToTarget(targetId: string, fallbackPayload?: PMDragPayload | string | null): boolean {
    const payload =
      typeof fallbackPayload === 'string'
        ? ({kind: 'entry', id: fallbackPayload} as PMDragPayload)
        : (fallbackPayload ?? this.getDraggedPayload())

    this.clearDragState()
    if (!payload) return false

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
    return true
  }

  moveEntryById(entryId: string, targetId: string): boolean {
    const root = this.root()
    if (!root) return false
    const entry = root.getEntry(entryId)
    if (!entry) return false
    return this.moveEntry(entry, targetId)
  }

  moveEntry(entry: Entry, targetId: string): boolean {
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
    entry.move(target, {silent: true})

    this.lastMove.set({
      entryId: entry.id,
      sourceTargetId,
      targetId,
    })
    this.rememberRecentTarget(targetId)

    const targetLabel = this.getTargetLabelById(targetId)
    const message = `${i18n('notify:move:moved_prefix')} "${entryTitle}" ${i18n('notify:move:moved_to')} "${targetLabel}"`
    const actions: ToastAction[] = [{label: i18n('button:undo'), onClick: () => this.undoLastMove()}]

    if (!this.isCurrentTargetVisible(targetId)) {
      actions.push({
        label: i18n('button:open_group'),
        onClick: () => {
          this.openTarget(targetId)
        },
      })
    }

    this.showToast(message, 'success', actions)
    return true
  }

  undoLastMove(): boolean {
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

    entry.move(sourceTarget, {silent: true})
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
      return {kind: 'group', id: groupId}
    }

    const entryId = this.draggedEntryId()
    if (entryId) {
      return {kind: 'entry', id: entryId}
    }

    return null
  }

  private canMoveGroupToTarget(groupId: string, targetId: string): boolean {
    const root = this.root()
    if (!root || root.isReadOnly()) return false

    const sourceGroup = root.getGroup(groupId)
    if (!sourceGroup) return false

    return this.buildGroupMovePlan(sourceGroup, targetId) !== null
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
    return window.passmanager
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
