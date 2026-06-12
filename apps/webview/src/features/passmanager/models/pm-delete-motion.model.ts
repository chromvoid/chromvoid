import {atom} from '@reatom/core'

import {Entry, Group} from '@project/passmanager/core'
import type {PMGroupRow} from './pm-root-search-projection'

export type PMDeleteVisibleRow = {
  row: PMDeleteMotionRow
  index: number
}

export type PMDeleteMotionRow = PMGroupRow & {
  deleteExiting?: true
}

type ExitingPMRow = {
  row: PMDeleteMotionRow
  index: number
}

const isDeletableRow = (row: PMDeleteMotionRow): row is Extract<PMDeleteMotionRow, {kind: 'entry' | 'group'}> =>
  row.kind === 'entry' || row.kind === 'group'

export class PMDeleteMotionModel {
  readonly revision = atom(0, 'passmanager.deleteMotion.revision')

  private readonly pending = new Set<string>()
  private readonly exiting = new Map<string, ExitingPMRow>()
  private readonly hiddenAfterExit = new Set<string>()

  markPending(items: readonly (Entry | Group)[]): void {
    let changed = false
    for (const item of items) {
      if (this.pending.has(item.id) || this.exiting.has(item.id) || this.hiddenAfterExit.has(item.id)) continue
      this.pending.add(item.id)
      changed = true
    }
    if (changed) this.bump()
  }

  syncVisibleExits(
    sourceRows: readonly PMDeleteMotionRow[],
    previousVisibleRows: readonly PMDeleteVisibleRow[],
    visibleRange: {first: number; last: number} | null,
  ): void {
    const currentRows = new Map<string, PMDeleteVisibleRow>()
    for (let index = 0; index < sourceRows.length; index += 1) {
      const row = sourceRows[index]
      if (row && isDeletableRow(row)) {
        currentRows.set(row.id, {row, index})
      }
    }
    const currentIds = new Set(currentRows.keys())
    const previousVisible = new Map<string, PMDeleteVisibleRow>()
    for (const item of previousVisibleRows) {
      if (isDeletableRow(item.row)) {
        previousVisible.set(item.row.id, item)
      }
    }

    for (const id of [...this.pending]) {
      if (this.hiddenAfterExit.has(id)) {
        if (currentIds.has(id)) continue

        this.pending.delete(id)
        this.hiddenAfterExit.delete(id)
        continue
      }

      const previous = previousVisible.get(id) ?? currentRows.get(id)
      if (currentIds.has(id)) {
        if (!previous || this.exiting.has(id)) continue

        this.exiting.set(id, {
          row: {...previous.row, deleteExiting: true},
          index: previous.index,
        })
        continue
      }

      this.pending.delete(id)
      if (previous && !this.exiting.has(id)) {
        this.exiting.set(id, {
          row: {...previous.row, deleteExiting: true},
          index: previous.index,
        })
      }
    }

    if (visibleRange) {
      for (const [id, row] of [...this.exiting]) {
        if (row.index < visibleRange.first || row.index > visibleRange.last + 1) {
          this.exiting.delete(id)
        }
      }
    }
  }

  decorateRows(sourceRows: readonly PMGroupRow[]): PMDeleteMotionRow[] {
    this.revision()
    if (this.exiting.size === 0 && this.hiddenAfterExit.size === 0) return [...sourceRows]

    const rows: PMDeleteMotionRow[] = []
    for (const row of sourceRows) {
      if (isDeletableRow(row) && this.hiddenAfterExit.has(row.id)) continue
      const exit = isDeletableRow(row) ? this.exiting.get(row.id) : undefined
      rows.push(exit?.row ?? row)
    }

    const exits = [...this.exiting.values()].sort((left, right) => left.index - right.index)
    for (const exit of exits) {
      if (rows.some((row) => isDeletableRow(row) && row.id === exit.row.id)) continue
      rows.splice(Math.min(exit.index, rows.length), 0, exit.row)
    }
    return rows
  }

  completeExit(id: string): void {
    if (!this.exiting.delete(id)) return
    if (this.pending.has(id)) {
      this.hiddenAfterExit.add(id)
    }
    this.bump()
  }

  clearPending(ids: readonly string[]): void {
    let changed = false
    for (const id of ids) {
      if (this.pending.delete(id)) changed = true
      if (this.exiting.delete(id)) changed = true
      if (this.hiddenAfterExit.delete(id)) changed = true
    }
    if (changed) this.bump()
  }

  reset(): void {
    if (this.pending.size === 0 && this.exiting.size === 0 && this.hiddenAfterExit.size === 0) return
    this.pending.clear()
    this.exiting.clear()
    this.hiddenAfterExit.clear()
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
