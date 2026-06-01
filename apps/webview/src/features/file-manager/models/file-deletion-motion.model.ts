import {atom} from '@reatom/core'

import {
  isFileListPlaceholderItem,
  isRealFileListItem,
  type FileListItem,
  type FileListRenderItem,
  type FileListVisibleItem,
} from 'root/shared/contracts/file-manager'

export type FileDeletionDecoratedRows = {
  items: FileListVisibleItem[]
  totalItemsCount: number
}

type ExitingFileRow = {
  item: FileListItem & {deleteExiting: true; virtualIndex?: number}
  virtualIndex: number
}

const toExitingRow = (item: FileListItem & {virtualIndex?: number}): ExitingFileRow => ({
  item: {
    ...item,
    deleteExiting: true,
  },
  virtualIndex: item.virtualIndex ?? 0,
})

export class FileDeletionMotionModel {
  readonly revision = atom(0, 'file.deletionMotion.revision')

  private readonly pending = new Set<number>()
  private readonly exiting = new Map<number, ExitingFileRow>()

  markPending(items: readonly FileListItem[]): void {
    let changed = false
    for (const item of items) {
      if (this.pending.has(item.id) || this.exiting.has(item.id)) continue
      this.pending.add(item.id)
      changed = true
    }
    if (changed) this.bump()
  }

  syncVisibleExits(
    currentRows: readonly FileListVisibleItem[],
    previousRows: readonly FileListVisibleItem[],
    sourceRows: readonly FileListRenderItem[],
  ): void {
    const currentIds = new Set(sourceRows.filter(isRealFileListItem).map((item) => item.id))
    const previousVisible = new Map<number, FileListItem & {virtualIndex?: number}>()
    for (const row of previousRows) {
      if (isFileListPlaceholderItem(row)) continue
      previousVisible.set(row.id, row)
    }

    let changed = false
    for (const id of [...this.pending]) {
      if (currentIds.has(id)) continue

      const previous = previousVisible.get(id)
      this.pending.delete(id)
      if (previous) {
        this.exiting.set(id, toExitingRow(previous))
      }
      changed = true
    }

    const visibleStart = this.getVisibleStart(currentRows)
    const visibleEnd = this.getVisibleEnd(currentRows)
    for (const [id, row] of [...this.exiting]) {
      if (visibleStart === null || row.virtualIndex < visibleStart || row.virtualIndex > visibleEnd + 1) {
        this.exiting.delete(id)
        changed = true
      }
    }

    if (changed) this.bump()
  }

  decorateVisibleRows(
    currentRows: readonly FileListVisibleItem[],
    sourceRows: readonly FileListRenderItem[],
  ): FileDeletionDecoratedRows {
    this.revision()

    if (this.exiting.size === 0) {
      return {
        items: [...currentRows],
        totalItemsCount: sourceRows.length,
      }
    }

    const exitingRows = [...this.exiting.values()].sort((left, right) => left.virtualIndex - right.virtualIndex)
    const rows = [...currentRows]
    for (const row of exitingRows) {
      if (rows.some((item) => !isFileListPlaceholderItem(item) && item.id === row.item.id)) continue

      const insertAt = rows.findIndex((item) => (item.virtualIndex ?? 0) >= row.virtualIndex)
      if (insertAt === -1) {
        rows.push(row.item)
      } else {
        rows.splice(insertAt, 0, row.item)
      }
    }

    return {
      items: rows,
      totalItemsCount: sourceRows.length + this.exiting.size,
    }
  }

  completeExit(id: number): void {
    if (!this.exiting.delete(id)) return
    this.bump()
  }

  clearPending(ids: readonly number[]): void {
    let changed = false
    for (const id of ids) {
      if (this.pending.delete(id)) changed = true
      if (this.exiting.delete(id)) changed = true
    }
    if (changed) this.bump()
  }

  resetForPath(_path: string): void {
    if (this.pending.size === 0 && this.exiting.size === 0) return
    this.pending.clear()
    this.exiting.clear()
    this.bump()
  }

  hasExiting(id: number): boolean {
    return this.exiting.has(id)
  }

  getTotalItemsCount(sourceCount: number): number {
    this.revision()
    return sourceCount + this.exiting.size
  }

  private getVisibleStart(rows: readonly FileListVisibleItem[]): number | null {
    if (rows.length === 0) return null
    return Math.min(...rows.map((item) => item.virtualIndex ?? 0))
  }

  private getVisibleEnd(rows: readonly FileListVisibleItem[]): number {
    if (rows.length === 0) return 0
    return Math.max(...rows.map((item) => item.virtualIndex ?? 0))
  }

  private bump(): void {
    this.revision.set(this.revision() + 1)
  }
}
