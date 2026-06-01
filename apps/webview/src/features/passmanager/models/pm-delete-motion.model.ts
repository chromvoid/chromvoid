import {atom} from '@reatom/core'

import {Entry, Group} from '@project/passmanager/core'
import type {PMGroupRow} from './pm-root-search-projection'

export type PMDeleteVisibleRow = {
  row: PMGroupRow
  index: number
}

export type PMDeleteMotionRow = PMGroupRow & {
  deleteExiting?: true
}

type ExitingPMRow = {
  row: PMDeleteMotionRow
  index: number
}

const isDeletableRow = (row: PMGroupRow): row is Extract<PMGroupRow, {kind: 'entry' | 'group'}> =>
  row.kind === 'entry' || row.kind === 'group'

export class PMDeleteMotionModel {
  readonly revision = atom(0, 'passmanager.deleteMotion.revision')

  private readonly pending = new Set<string>()
  private readonly exiting = new Map<string, ExitingPMRow>()

  markPending(items: readonly (Entry | Group)[]): void {
    let changed = false
    for (const item of items) {
      if (this.pending.has(item.id) || this.exiting.has(item.id)) continue
      this.pending.add(item.id)
      changed = true
    }
    if (changed) this.bump()
  }

  syncVisibleExits(
    sourceRows: readonly PMGroupRow[],
    previousVisibleRows: readonly PMDeleteVisibleRow[],
    visibleRange: {first: number; last: number} | null,
  ): void {
    const currentIds = new Set(sourceRows.filter(isDeletableRow).map((row) => row.id))
    const previousVisible = new Map<string, PMDeleteVisibleRow>()
    for (const item of previousVisibleRows) {
      if (isDeletableRow(item.row)) {
        previousVisible.set(item.row.id, item)
      }
    }

    let changed = false
    for (const id of [...this.pending]) {
      if (currentIds.has(id)) continue

      const previous = previousVisible.get(id)
      this.pending.delete(id)
      if (previous) {
        this.exiting.set(id, {
          row: {...previous.row, deleteExiting: true},
          index: previous.index,
        })
      }
      changed = true
    }

    if (visibleRange) {
      for (const [id, row] of [...this.exiting]) {
        if (row.index < visibleRange.first || row.index > visibleRange.last + 1) {
          this.exiting.delete(id)
          changed = true
        }
      }
    }

    if (changed) this.bump()
  }

  decorateRows(sourceRows: readonly PMGroupRow[]): PMDeleteMotionRow[] {
    this.revision()
    if (this.exiting.size === 0) return [...sourceRows]

    const rows: PMDeleteMotionRow[] = [...sourceRows]
    const exits = [...this.exiting.values()].sort((left, right) => left.index - right.index)
    for (const exit of exits) {
      if (rows.some((row) => isDeletableRow(row) && row.id === exit.row.id)) continue
      rows.splice(Math.min(exit.index, rows.length), 0, exit.row)
    }
    return rows
  }

  completeExit(id: string): void {
    if (!this.exiting.delete(id)) return
    this.bump()
  }

  clearPending(ids: readonly string[]): void {
    let changed = false
    for (const id of ids) {
      if (this.pending.delete(id)) changed = true
      if (this.exiting.delete(id)) changed = true
    }
    if (changed) this.bump()
  }

  reset(): void {
    if (this.pending.size === 0 && this.exiting.size === 0) return
    this.pending.clear()
    this.exiting.clear()
    this.bump()
  }

  hasExiting(id: string): boolean {
    return this.exiting.has(id)
  }

  private bump(): void {
    this.revision.set(this.revision() + 1)
  }
}

export const pmDeleteMotionModel = new PMDeleteMotionModel()
