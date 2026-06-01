import {atom, wrap} from '@reatom/core'

import {normalizePath, splitPath} from 'root/core/catalog/local-catalog/path'
import type {ClientCatalogNode} from 'root/core/catalog/local-catalog/client-model'
import type {AppContext} from 'root/shared/services/app-context'
import type {FileItemData} from 'root/shared/contracts/file-manager'
import {
  MobilePointerDndModel,
  type MobilePointerDndAdapter,
  type MobilePointerDndPayload,
} from 'root/shared/services/mobile-pointer-dnd'
import {toast} from 'root/shared/services/toast-manager'
import {i18n} from 'root/i18n'

import {isSystemShardPath} from './file-list.model'

const RECENT_TARGETS_STORAGE_KEY = 'file-manager-move-recent-targets-v1'
const RECENT_TARGETS_LIMIT = 5

export const FILE_NODE_DND_MIME = 'application/x-chromvoid-file-node-id'
export const FILE_SELECTION_DND_MIME = 'application/x-chromvoid-file-selection'

type LoadingSignal = {
  set(value: boolean): void
}

type FileMoveDeps = {
  fileList: {
    getFileItemById(nodeId: number): FileItemData | null
    getSelectedFileItems(): FileItemData[]
  }
  isLoading: LoadingSignal
  ensureVisibleRangeLoaded: () => Promise<void> | void
}

type LastMoveSnapshot = {
  itemId: number
  sourceParentPath: string
  targetPath: string
  originalName: string
}

type ToastVariant = 'info' | 'success' | 'warning' | 'error'

type ToastAction = {
  label: string
  onClick: () => void
}

export type FileMoveTarget = {
  id: string
  path: string
  label: string
  subtitle?: string
  isRoot: boolean
  depth: number
  hasChildren: boolean
}

export type FileSingleDragPayload = MobilePointerDndPayload & {
  domain: 'files'
  kind: 'item'
  id: number
}

export type FileSelectionDragPayload = MobilePointerDndPayload & {
  domain: 'files'
  kind: 'selection'
  anchorId: number
  ids: number[]
}

export type FileDragPayload = FileSingleDragPayload | FileSelectionDragPayload

type MoveValidationResult =
  | {ok: true; targetPath: string}
  | {ok: false; message: string; variant: ToastVariant}

export class FileMoveModel {
  readonly recentTargetPaths = atom<string[]>(
    this.readRecentTargets(),
    'file_manager_move_recent_target_paths',
  )
  readonly draggedItemId = atom<number | null>(null, 'file_manager_move_dragged_item_id')
  readonly dropTargetPath = atom<string | null>(null, 'file_manager_move_drop_target_path')
  readonly lastMove = atom<LastMoveSnapshot | null>(null, 'file_manager_move_last_move')
  readonly mobileDnd = new MobilePointerDndModel<FileDragPayload>(this.createMobileDndAdapter(), {
    namespace: 'files.mobileDnd',
  })

  constructor(
    private readonly ctx: AppContext,
    private readonly deps: FileMoveDeps,
  ) {}

  listTargets(): FileMoveTarget[] {
    const targets: FileMoveTarget[] = [
      {
        id: '/',
        path: '/',
        label: i18n('file-manager:move:root-label'),
        subtitle: i18n('file-manager:move:root-subtitle'),
        isRoot: true,
        depth: 0,
        hasChildren: this.catalogChildren('/').some((node) => node.isDir && !isSystemShardPath(node.path)),
      },
    ]

    const seen = new Set<string>(['/'])
    const appendFolderTargets = (parentPath: string) => {
      for (const node of this.catalogChildren(parentPath)) {
        if (!node.isDir) continue

        const path = normalizePath(node.path)
        if (seen.has(path) || isSystemShardPath(path)) continue

        seen.add(path)
        targets.push({
          id: path,
          path,
          label: node.name,
          subtitle: path,
          isRoot: false,
          depth: splitPath(path).length,
          hasChildren: node.hasChildren,
        })
        appendFolderTargets(path)
      }
    }

    appendFolderTargets('/')
    return targets
  }

  listRecentTargets(): FileMoveTarget[] {
    const byPath = new Map(this.listTargets().map((target) => [target.path, target]))
    return this.recentTargetPaths()
      .map((path) => byPath.get(normalizePath(path)))
      .filter((target): target is FileMoveTarget => Boolean(target))
  }

  getTargetLabel(path: string): string {
    const targetPath = normalizePath(path || '/')
    const target = this.listTargets().find((item) => item.path === targetPath)
    return target?.label ?? targetPath
  }

  getItemParentPath(item: Pick<FileItemData, 'path' | 'isDir'>): string {
    const path = normalizePath(item.path || '/')
    const parts = splitPath(path)
    if (parts.length <= 1) return '/'
    return normalizePath('/' + parts.slice(0, -1).join('/'))
  }

  getDisabledTargetPaths(items: FileItemData[]): string[] {
    return this.listTargets()
      .filter((target) => !this.canMoveItemsToTarget(items, target.path))
      .map((target) => target.path)
  }

  canMoveItemsToTarget(items: FileItemData[], targetPath: string): boolean {
    return this.validateMove(items, targetPath).ok
  }

  canOpenMoveDialogForItems(items: FileItemData[]): boolean {
    if (items.length === 0) return false
    return items.every((item) => !isSystemShardPath(item.path))
  }

  async moveItemById(itemId: number, targetPath: string): Promise<boolean> {
    const item = this.resolveItem(itemId)
    if (!item) {
      this.showToast(i18n('file-manager:move:source-missing'), 'error')
      return false
    }

    return this.moveItems([item], targetPath)
  }

  async moveItemsByIds(itemIds: number[], targetPath: string): Promise<boolean> {
    const items = itemIds
      .map((id) => this.resolveItem(id))
      .filter((item): item is FileItemData => Boolean(item))

    if (items.length !== itemIds.length) {
      this.showToast(i18n('file-manager:move:source-missing'), 'error')
      return false
    }

    return this.moveItems(items, targetPath)
  }

  async moveItems(items: FileItemData[], targetPath: string): Promise<boolean> {
    const validation = this.validateMove(items, targetPath)
    if (!validation.ok) {
      this.showToast(validation.message, validation.variant)
      return false
    }

    this.deps.isLoading.set(true)
    try {
      for (const item of items) {
        await wrap(this.ctx.catalog.api.move(item.id, validation.targetPath))
      }

      await wrap(this.ctx.catalog.refresh()).catch(() => {})
      this.clearSelection()
      this.rememberRecentTarget(validation.targetPath)

      if (items.length === 1) {
        const item = items[0]!
        this.lastMove.set({
          itemId: item.id,
          sourceParentPath: this.getItemParentPath(item),
          targetPath: validation.targetPath,
          originalName: item.name,
        })
        this.showMoveSuccessToast(item, validation.targetPath)
      } else {
        this.lastMove.set(null)
        this.showMoveManySuccessToast(items.length, validation.targetPath)
      }

      return true
    } catch (error) {
      this.showToast(
        i18n('file-manager:move-failed', {message: this.getMoveErrorMessage(error)}),
        'error',
      )
      return false
    } finally {
      this.deps.isLoading.set(false)
    }
  }

  async undoLastMove(): Promise<boolean> {
    const snapshot = this.lastMove()
    if (!snapshot) return false

    const item = this.resolveItem(snapshot.itemId)
    if (!item) {
      this.lastMove.set(null)
      this.showToast(i18n('file-manager:move:source-missing'), 'error')
      return false
    }

    this.deps.isLoading.set(true)
    try {
      await wrap(this.ctx.catalog.api.move(snapshot.itemId, snapshot.sourceParentPath))
      await wrap(this.ctx.catalog.refresh()).catch(() => {})
      this.lastMove.set(null)
      this.showToast(i18n('file-manager:move:undo-success'), 'info')
      return true
    } catch (error) {
      this.showToast(
        i18n('file-manager:move-failed', {message: this.getMoveErrorMessage(error)}),
        'error',
      )
      return false
    } finally {
      this.deps.isLoading.set(false)
    }
  }

  openTarget(targetPath: string): boolean {
    const normalizedTargetPath = normalizePath(targetPath || '/')
    if (!this.resolveTarget(normalizedTargetPath)) return false

    this.ctx.store.setCurrentPath(normalizedTargetPath)
    void Promise.resolve(this.deps.ensureVisibleRangeLoaded()).catch(() => {})
    return true
  }

  setDragData(event: DragEvent, itemId: number): void {
    const dataTransfer = event.dataTransfer
    if (!dataTransfer) return

    this.startDrag(itemId)
    const payload = this.createDesktopDragPayload(itemId)
    if (!payload) return

    dataTransfer.effectAllowed = 'move'
    if (payload.kind === 'selection') {
      dataTransfer.setData(FILE_SELECTION_DND_MIME, JSON.stringify(payload))
    } else {
      dataTransfer.setData(FILE_NODE_DND_MIME, String(payload.id))
    }
    dataTransfer.setData('application/json', JSON.stringify(payload))
    dataTransfer.setData('text/plain', String(itemId))
  }

  readDragPayload(dataTransfer: DataTransfer | null): FileDragPayload | null {
    if (!dataTransfer) return null

    const selectionRaw = String(dataTransfer.getData(FILE_SELECTION_DND_MIME) || '').trim()
    if (selectionRaw) {
      const payload = this.parseSelectionPayload(selectionRaw)
      if (payload) return payload
    }

    const itemIdRaw = String(dataTransfer.getData(FILE_NODE_DND_MIME) || '').trim()
    if (itemIdRaw) {
      const id = Number(itemIdRaw)
      if (Number.isFinite(id)) return {domain: 'files', kind: 'item', id}
    }

    const jsonRaw = String(dataTransfer.getData('application/json') || '').trim()
    if (jsonRaw) {
      const payload = this.parseJsonDragPayload(jsonRaw)
      if (payload) return payload
    }

    const textRaw = String(dataTransfer.getData('text/plain') || '').trim()
    const textId = Number(textRaw)
    if (Number.isFinite(textId)) return {domain: 'files', kind: 'item', id: textId}

    return null
  }

  startDrag(itemId: number): void {
    this.draggedItemId.set(itemId)
  }

  setDropTarget(targetPath: string | null): void {
    this.dropTargetPath.set(targetPath ? normalizePath(targetPath) : null)
  }

  async dropToTarget(
    targetPath: string,
    fallbackPayload?: FileDragPayload | number | null,
  ): Promise<boolean> {
    const payload =
      typeof fallbackPayload === 'number'
        ? ({domain: 'files', kind: 'item', id: fallbackPayload} satisfies FileSingleDragPayload)
        : (fallbackPayload ?? this.getDraggedPayload())

    this.clearDragState()
    if (!payload) return false

    const items = this.resolvePayloadItems(payload)
    return this.moveItems(items, targetPath)
  }

  clearDragState(): void {
    this.draggedItemId.set(null)
    this.dropTargetPath.set(null)
  }

  canDropToTarget(targetPath: string, payload?: FileDragPayload | null): boolean {
    const activePayload = payload ?? this.getDraggedPayload()
    if (!activePayload) return false
    return this.canMoveItemsToTarget(this.resolvePayloadItems(activePayload), targetPath)
  }

  createMobileDragPayload(itemId: number): FileDragPayload | null {
    const item = this.resolveItem(itemId)
    if (!item) return null

    const selectedItems = this.deps.fileList.getSelectedFileItems()
    const selectedIds = selectedItems.map((selected) => selected.id)
    if (selectedIds.includes(itemId) && selectedIds.length > 0) {
      return {
        domain: 'files',
        kind: 'selection',
        anchorId: itemId,
        ids: selectedIds,
      }
    }

    return {domain: 'files', kind: 'item', id: itemId}
  }

  beginMobileDrag(itemId: number, point: {x: number; y: number}): boolean {
    const payload = this.createMobileDragPayload(itemId)
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

  private createDesktopDragPayload(itemId: number): FileDragPayload | null {
    const selectedItems = this.deps.fileList.getSelectedFileItems()
    const selectedIds = selectedItems.map((item) => item.id)
    if (selectedIds.includes(itemId) && selectedIds.length > 1) {
      return {
        domain: 'files',
        kind: 'selection',
        anchorId: itemId,
        ids: selectedIds,
      }
    }

    return {domain: 'files', kind: 'item', id: itemId}
  }

  private getDraggedPayload(): FileDragPayload | null {
    const itemId = this.draggedItemId()
    if (itemId === null) return null
    return {domain: 'files', kind: 'item', id: itemId}
  }

  private resolvePayloadItems(payload: FileDragPayload): FileItemData[] {
    if (payload.kind === 'selection') {
      return payload.ids
        .map((id) => this.resolveItem(id))
        .filter((item): item is FileItemData => Boolean(item))
    }

    const item = this.resolveItem(payload.id)
    return item ? [item] : []
  }

  private validateMove(items: FileItemData[], targetPath: string): MoveValidationResult {
    const normalizedTargetPath = normalizePath(targetPath || '/')

    if (items.length === 0) {
      return {ok: false, message: i18n('file-manager:move:source-missing'), variant: 'error'}
    }

    const target = this.resolveTarget(normalizedTargetPath)
    if (!target) {
      return {ok: false, message: i18n('file-manager:move:target-missing'), variant: 'error'}
    }

    if (isSystemShardPath(normalizedTargetPath)) {
      return {ok: false, message: i18n('file-manager:move:system-target'), variant: 'warning'}
    }

    for (const item of items) {
      const resolved = this.resolveItem(item.id)
      if (!resolved) {
        return {ok: false, message: i18n('file-manager:move:source-missing'), variant: 'error'}
      }

      const sourcePath = normalizePath(item.path || resolved.path || '/')
      if (isSystemShardPath(sourcePath)) {
        return {ok: false, message: i18n('file-manager:move:system-source'), variant: 'warning'}
      }

      if (this.getItemParentPath(item) === normalizedTargetPath) {
        return {ok: false, message: i18n('file-manager:move:already-in-folder'), variant: 'info'}
      }

      if (item.isDir && (sourcePath === normalizedTargetPath || normalizedTargetPath.startsWith(`${sourcePath}/`))) {
        return {ok: false, message: i18n('file-manager:move-folder-self-error'), variant: 'warning'}
      }
    }

    return {ok: true, targetPath: normalizedTargetPath}
  }

  private resolveTarget(targetPath: string): FileMoveTarget | null {
    const normalizedTargetPath = normalizePath(targetPath || '/')
    if (normalizedTargetPath === '/') {
      return this.listTargets()[0] ?? null
    }

    const node = this.ctx.catalog.catalog.findByPath(normalizedTargetPath)
    if (!node || !node.isDir || isSystemShardPath(node.path)) return null

    return {
      id: normalizedTargetPath,
      path: normalizedTargetPath,
      label: node.name,
      subtitle: normalizedTargetPath,
      isRoot: false,
      depth: splitPath(normalizedTargetPath).length,
      hasChildren: node.hasChildren,
    }
  }

  private resolveItem(itemId: number): FileItemData | null {
    const visibleItem = this.deps.fileList.getFileItemById(itemId)
    if (visibleItem) return visibleItem

    const node = this.ctx.catalog.catalog.getNode(itemId)
    if (!node) return null

    return this.toFileItemData(node)
  }

  private toFileItemData(node: ClientCatalogNode): FileItemData {
    return {
      id: node.nodeId,
      path: node.path,
      name: node.name,
      isDir: node.isDir,
      size: node.size,
      lastModified: node.modtime,
      sourceRevision: node.sourceRevision,
      mediaInspectedRevision: node.mediaInspectedRevision,
      mimeType: node.mimeType,
      mediaInfo: node.mediaInfo,
    }
  }

  private catalogChildren(path: string): ClientCatalogNode[] {
    try {
      return this.ctx.catalog.catalog.getChildren(normalizePath(path))
    } catch {
      return []
    }
  }

  private createMobileDndAdapter(): MobilePointerDndAdapter<FileDragPayload> {
    return {
      canDrop: (targetPath, payload) => this.canDropToTarget(targetPath, payload),
      drop: (targetPath, payload) => this.dropToTarget(targetPath, payload),
      getGhostLabel: (payload) => this.getDragPayloadLabel(payload),
      onAfterDrop: (_targetPath, payload, dropped) => {
        if (dropped && payload.kind === 'selection') {
          this.clearSelection()
        }
      },
      onCancel: () => {
        this.clearDragState()
      },
    }
  }

  private getDragPayloadLabel(payload: FileDragPayload): string {
    if (payload.kind === 'selection') {
      return i18n('file-manager:move:selected-count', {count: String(payload.ids.length)})
    }

    return this.resolveItem(payload.id)?.name ?? ''
  }

  private parseSelectionPayload(raw: string): FileSelectionDragPayload | null {
    try {
      const parsed = JSON.parse(raw) as Partial<FileSelectionDragPayload>
      if (parsed.domain !== 'files' || parsed.kind !== 'selection') return null
      const anchorId = Number(parsed.anchorId)
      const ids = Array.isArray(parsed.ids)
        ? parsed.ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : []
      if (!Number.isFinite(anchorId) || ids.length === 0) return null
      return {domain: 'files', kind: 'selection', anchorId, ids}
    } catch {
      return null
    }
  }

  private parseJsonDragPayload(raw: string): FileDragPayload | null {
    try {
      const parsed = JSON.parse(raw) as Partial<FileDragPayload & FileItemData>

      if (parsed.domain === 'files' && parsed.kind === 'selection') {
        return this.parseSelectionPayload(raw)
      }

      if (parsed.domain === 'files' && parsed.kind === 'item') {
        const id = Number(parsed.id)
        return Number.isFinite(id) ? {domain: 'files', kind: 'item', id} : null
      }

      const legacyId = Number(parsed.id)
      if (Number.isFinite(legacyId)) {
        return {domain: 'files', kind: 'item', id: legacyId}
      }
    } catch {
      return null
    }

    return null
  }

  private clearSelection(): void {
    this.ctx.store.setSelectedItems([])
    this.ctx.store.setSelectionMode(false)
  }

  private showMoveSuccessToast(item: FileItemData, targetPath: string): void {
    const targetLabel = this.getTargetLabel(targetPath)
    const actions: ToastAction[] = [
      {
        label: i18n('file-manager:move:undo'),
        onClick: () => {
          void this.undoLastMove()
        },
      },
    ]

    if (!this.isCurrentTargetVisible(targetPath)) {
      actions.push({
        label: i18n('file-manager:move:open-folder'),
        onClick: () => {
          this.openTarget(targetPath)
        },
      })
    }

    this.showToast(
      i18n('file-manager:move:moved', {source: item.name, target: targetLabel}),
      'success',
      actions,
    )
  }

  private showMoveManySuccessToast(count: number, targetPath: string): void {
    const targetLabel = this.getTargetLabel(targetPath)
    this.showToast(
      i18n('file-manager:move:moved-many', {count: String(count), target: targetLabel}),
      'success',
      [
        {
          label: i18n('file-manager:move:open-folder'),
          onClick: () => {
            this.openTarget(targetPath)
          },
        },
      ],
    )
  }

  private isCurrentTargetVisible(targetPath: string): boolean {
    return normalizePath(this.ctx.store.currentPath()) === normalizePath(targetPath || '/')
  }

  private rememberRecentTarget(targetPath: string): void {
    const normalizedTargetPath = normalizePath(targetPath || '/')
    const current = this.recentTargetPaths()
    const next = [normalizedTargetPath, ...current.filter((path) => normalizePath(path) !== normalizedTargetPath)].slice(
      0,
      RECENT_TARGETS_LIMIT,
    )
    this.recentTargetPaths.set(next)
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
        .map((value) => normalizePath(String(value ?? '') || '/'))
        .filter((path) => path.length > 0)
        .slice(0, RECENT_TARGETS_LIMIT)
    } catch {
      return []
    }
  }

  private saveRecentTargets(targetPaths: string[]): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(RECENT_TARGETS_STORAGE_KEY, JSON.stringify(targetPaths))
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
      if (message.length > 0) return message
    }

    return String(error || i18n('file-manager:move:generic-error'))
  }
}
