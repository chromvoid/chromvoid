import {atom} from '@reatom/core'

import type {Entry, Group} from '@project/passmanager/core'
import type {PMGroupRow} from './pm-root-search-projection'

export type PMListMutationPhase = 'add' | 'restore'

export type PMListMutationRow = PMGroupRow & {
  deleteExiting?: true
  entering?: PMListMutationPhase
}

export type PMListMutationVisibleRow = {
  row: PMListMutationRow
  index: number
}

type ExitingPMRow = {
  row: PMListMutationRow
  index: number
}

type EnteringPMRow = {
  row: PMListMutationRow
  index: number
  phase: PMListMutationPhase
  staged: boolean
}

type ProjectionState = {
  initialized: boolean
  hasSeenRows: boolean
  knownSourceIds: Set<string>
  sourceRows: Map<string, {row: PMListMutationRow; index: number}>
  exiting: Map<string, ExitingPMRow>
  hiddenAfterExit: Set<string>
  entering: Map<string, EnteringPMRow>
  processedDeleteIds: Set<string>
}

const isMutableRow = (
  row: PMListMutationRow,
): row is Extract<PMListMutationRow, {kind: 'entry' | 'group'}> =>
  row.kind === 'entry' || row.kind === 'group'

const LEGACY_SCOPE = 'legacy-content'

export class PMListMutationMotionModel {
  readonly revision = atom(0, 'passmanager.listMutationMotion.revision')

  private readonly pendingDeletes = new Set<string>()
  private readonly projections = new Map<string, ProjectionState>()

  markPending(items: readonly (Entry | Group)[]): void {
    let changed = false
    for (const item of items) {
      if (this.pendingDeletes.has(item.id)) continue
      this.pendingDeletes.add(item.id)
      changed = true
    }
    if (changed) this.bump()
  }

  syncProjection(
    scopeId: string,
    sourceRows: readonly PMGroupRow[],
    previousVisibleRows: readonly PMListMutationVisibleRow[],
    visibleRange: {first: number; last: number} | null,
  ): void {
    const state = this.getProjection(scopeId)
    const currentRows = new Map<string, {row: PMListMutationRow; index: number}>()
    for (let index = 0; index < sourceRows.length; index += 1) {
      const row = sourceRows[index]
      if (row && isMutableRow(row)) currentRows.set(row.id, {row, index})
    }
    state.sourceRows = currentRows

    if (!state.initialized || (!state.hasSeenRows && currentRows.size > 0)) {
      state.initialized = true
      state.hasSeenRows = currentRows.size > 0
      state.knownSourceIds = new Set(currentRows.keys())
    } else {
      this.syncEnteringRows(state, currentRows, previousVisibleRows, visibleRange)
    }

    this.syncExitingRows(state, currentRows, previousVisibleRows, visibleRange)
    state.knownSourceIds = new Set(currentRows.keys())
    this.cleanupProcessedDeletes()
  }

  decorateProjection(scopeId: string, sourceRows: readonly PMGroupRow[]): PMListMutationRow[] {
    this.revision()
    const state = this.projections.get(scopeId)
    if (!state) return [...sourceRows]

    const rows: PMListMutationRow[] = []
    for (const sourceRow of sourceRows) {
      if (!isMutableRow(sourceRow)) {
        rows.push(sourceRow)
        continue
      }
      if (state.hiddenAfterExit.has(sourceRow.id)) continue

      const entering = state.entering.get(sourceRow.id)
      if (entering?.staged) continue

      const exit = state.exiting.get(sourceRow.id)
      rows.push(exit?.row ?? (entering ? {...sourceRow, entering: entering.phase} : sourceRow))
    }

    const exits = [...state.exiting.values()].sort((left, right) => left.index - right.index)
    for (const exit of exits) {
      if (rows.some((row) => isMutableRow(row) && row.id === exit.row.id)) continue
      rows.splice(Math.min(exit.index, rows.length), 0, exit.row)
    }
    return rows
  }

  getStagedEnterIds(scopeId: string): string[] {
    const state = this.projections.get(scopeId)
    if (!state) return []
    return [...state.entering]
      .filter(([, entering]) => entering.staged)
      .map(([id]) => id)
  }

  revealEnterBatch(scopeId: string, ids: readonly string[]): void {
    const state = this.projections.get(scopeId)
    if (!state) return
    let changed = false
    for (const id of ids) {
      const entering = state.entering.get(id)
      if (!entering?.staged) continue
      entering.staged = false
      changed = true
    }
    if (changed) this.bump()
  }

  consumeEnter(scopeId: string, id: string): void {
    const state = this.projections.get(scopeId)
    if (!state?.entering.delete(id)) return
    this.bump()
  }

  completeExitBatch(scopeId: string, ids: readonly string[]): void {
    const state = this.projections.get(scopeId)
    if (!state) return
    let changed = false
    for (const id of ids) {
      if (!state.exiting.delete(id)) continue
      if (this.pendingDeletes.has(id)) state.hiddenAfterExit.add(id)
      changed = true
    }
    if (changed) this.bump()
  }

  clearPending(ids: readonly string[]): void {
    let changed = false
    for (const id of ids) {
      if (this.pendingDeletes.delete(id)) changed = true
      for (const state of this.projections.values()) {
        if (state.processedDeleteIds.delete(id)) changed = true
        if (state.exiting.delete(id)) changed = true
        if (state.hiddenAfterExit.delete(id)) changed = true
        const current = state.sourceRows.get(id)
        if (current) {
          state.entering.set(id, {
            ...current,
            row: {...current.row, entering: 'restore'},
            phase: 'restore',
            staged: false,
          })
          changed = true
        }
      }
    }
    if (changed) this.bump()
  }

  resetScope(scopeId: string): void {
    if (!this.projections.delete(scopeId)) return
    this.bump()
  }

  reset(): void {
    if (this.pendingDeletes.size === 0 && this.projections.size === 0) return
    this.pendingDeletes.clear()
    this.projections.clear()
    this.bump()
  }

  hasExiting(id: string, scopeId?: string): boolean {
    if (scopeId) return this.projections.get(scopeId)?.exiting.has(id) ?? false
    for (const state of this.projections.values()) {
      if (state.exiting.has(id)) return true
    }
    return false
  }

  // Compatibility surface for focused tests and call sites while the generalized model settles.
  syncVisibleExits(
    sourceRows: readonly PMListMutationRow[],
    previousVisibleRows: readonly PMListMutationVisibleRow[],
    visibleRange: {first: number; last: number} | null,
  ): void {
    this.syncProjection(LEGACY_SCOPE, sourceRows, previousVisibleRows, visibleRange)
  }

  decorateRows(sourceRows: readonly PMGroupRow[]): PMListMutationRow[] {
    return this.decorateProjection(LEGACY_SCOPE, sourceRows)
  }

  completeExit(id: string): void {
    const scopeIds = [...this.projections.keys()]
    if (scopeIds.length === 0) {
      this.completeExitBatch(LEGACY_SCOPE, [id])
      return
    }

    for (const scopeId of scopeIds) {
      this.completeExitBatch(scopeId, [id])
    }
  }

  private syncEnteringRows(
    state: ProjectionState,
    currentRows: Map<string, {row: PMListMutationRow; index: number}>,
    previousVisibleRows: readonly PMListMutationVisibleRow[],
    visibleRange: {first: number; last: number} | null,
  ): void {
    const previousVisibleIds = new Set(previousVisibleRows.map(({row}) => row.id))
    for (const [id, current] of currentRows) {
      if (state.knownSourceIds.has(id) || state.entering.has(id) || this.pendingDeletes.has(id)) continue
      if (!this.isVisibleIndex(current.index, visibleRange, previousVisibleIds.size)) continue

      state.entering.set(id, {
        ...current,
        row: {...current.row, entering: 'add'},
        phase: 'add',
        staged: true,
      })
    }

    for (const id of [...state.entering.keys()]) {
      if (!currentRows.has(id)) state.entering.delete(id)
    }
  }

  private syncExitingRows(
    state: ProjectionState,
    currentRows: Map<string, {row: PMListMutationRow; index: number}>,
    previousVisibleRows: readonly PMListMutationVisibleRow[],
    visibleRange: {first: number; last: number} | null,
  ): void {
    const previousVisible = new Map<string, PMListMutationVisibleRow>()
    for (const item of previousVisibleRows) {
      if (isMutableRow(item.row)) previousVisible.set(item.row.id, item)
    }

    for (const id of [...this.pendingDeletes]) {
      if (
        state.knownSourceIds.has(id) ||
        currentRows.has(id) ||
        previousVisible.has(id) ||
        state.exiting.has(id) ||
        state.hiddenAfterExit.has(id)
      ) {
        state.processedDeleteIds.add(id)
      }

      if (state.hiddenAfterExit.has(id)) {
        if (currentRows.has(id)) continue
        state.hiddenAfterExit.delete(id)
        continue
      }

      const previous = previousVisible.get(id) ?? currentRows.get(id)
      if (!previous) {
        continue
      }
      if (!state.exiting.has(id)) {
        state.entering.delete(id)
        state.exiting.set(id, {
          row: {...previous.row, deleteExiting: true, entering: undefined},
          index: previous.index,
        })
      }
    }

    if (!visibleRange) return
    for (const [id, row] of [...state.exiting]) {
      if (row.index < visibleRange.first || row.index > visibleRange.last + 1) {
        state.exiting.delete(id)
      }
    }
  }

  private isVisibleIndex(
    index: number,
    visibleRange: {first: number; last: number} | null,
    previousVisibleCount: number,
  ): boolean {
    if (visibleRange) return index >= visibleRange.first && index <= visibleRange.last + 1
    return index <= Math.max(previousVisibleCount, 39)
  }

  private getProjection(scopeId: string): ProjectionState {
    const existing = this.projections.get(scopeId)
    if (existing) return existing

    const created: ProjectionState = {
      initialized: false,
      hasSeenRows: false,
      knownSourceIds: new Set(),
      sourceRows: new Map(),
      exiting: new Map(),
      hiddenAfterExit: new Set(),
      entering: new Map(),
      processedDeleteIds: new Set(),
    }
    this.projections.set(scopeId, created)
    return created
  }

  private cleanupProcessedDeletes(): void {
    for (const id of [...this.pendingDeletes]) {
      const relevantStates = [...this.projections.values()].filter(
        (state) =>
          state.processedDeleteIds.has(id) ||
          state.knownSourceIds.has(id) ||
          state.sourceRows.has(id) ||
          state.exiting.has(id) ||
          state.hiddenAfterExit.has(id),
      )
      if (relevantStates.length === 0) continue
      if (
        relevantStates.every(
          (state) => state.processedDeleteIds.has(id) && !state.sourceRows.has(id),
        )
      ) {
        this.pendingDeletes.delete(id)
        for (const state of relevantStates) state.processedDeleteIds.delete(id)
      }
    }
  }

  private bump(): void {
    this.revision.set(this.revision() + 1)
  }
}

export const pmListMutationMotionModel = new PMListMutationMotionModel()
