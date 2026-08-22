import {atom} from '@reatom/core'

import type {PMListMutationRow} from './pm-list-mutation-motion.model'

export type PMMobileListRange = {first: number; last: number}
export type PMMobileListScrollAlignment = 'nearest' | 'center'

export type PMMobileListWindowRow = {
  row: PMListMutationRow
  index: number
}

export type PMMobileListWindow = {
  rows: PMMobileListWindowRow[]
  renderedRange: PMMobileListRange | null
  visibleRange: PMMobileListRange | null
  totalBlockSize: number
  offsetBlock: number
}

const MIN_OVERSCAN_ROWS = 6
const MIN_BLOCK_SIZE = 1
const RANGE_EDGE_EPSILON = 0.001

// Mobile credential rows have stable product-owned geometry: actionable rows are
// 60px surfaces inside 2px block padding, while grouped headers are 42px tall.
const ROW_BLOCK_SIZES: Record<PMListMutationRow['kind'], number> = {
  entry: 64,
  group: 64,
  header: 42,
}

const normalizeBlockSize = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0

export class PMMobileListWindowModel {
  readonly scrollTop = atom(0, 'passmanager.mobileListWindow.scrollTop')
  readonly viewportBlockSize = atom(0, 'passmanager.mobileListWindow.viewportBlockSize')

  setViewportBlockSize(value: number): void {
    const next = normalizeBlockSize(value)
    if (this.viewportBlockSize() !== next) this.viewportBlockSize.set(next)
  }

  syncScrollTop(rows: readonly PMListMutationRow[], value: number, force = false): boolean {
    const offsets = this.buildOffsets(rows)
    const next = this.clampScrollTopFromOffsets(offsets, value)
    if (!force && rows.length > 0) {
      const nextFirst = this.getVisibleRangeFromOffsets(offsets, next).first
      const currentFirst = this.getVisibleRangeFromOffsets(offsets, this.scrollTop()).first
      if (nextFirst === currentFirst) return false
    }
    if (this.scrollTop() === next) return false

    this.scrollTop.set(next)
    return true
  }

  getWindow(rows: readonly PMListMutationRow[]): PMMobileListWindow {
    if (rows.length === 0) {
      return {
        rows: [],
        renderedRange: null,
        visibleRange: null,
        totalBlockSize: 0,
        offsetBlock: 0,
      }
    }

    const offsets = this.buildOffsets(rows)
    const visibleRange = this.getVisibleRangeFromOffsets(offsets, this.scrollTop())
    const visibleRowCount = visibleRange.last - visibleRange.first + 1
    const overscanRows = Math.max(MIN_OVERSCAN_ROWS, visibleRowCount)
    const renderedRange = {
      first: Math.max(0, visibleRange.first - overscanRows),
      last: Math.min(rows.length - 1, visibleRange.last + overscanRows),
    }

    return {
      rows: rows
        .slice(renderedRange.first, renderedRange.last + 1)
        .map((row, offset) => ({row, index: renderedRange.first + offset})),
      renderedRange,
      visibleRange,
      totalBlockSize: offsets.at(-1) ?? 0,
      offsetBlock: offsets[renderedRange.first] ?? 0,
    }
  }

  getScrollTopForIndex(
    rows: readonly PMListMutationRow[],
    index: number,
    alignment: PMMobileListScrollAlignment,
    currentScrollTop: number,
  ): number {
    if (rows.length === 0) return 0

    const safeIndex = Math.max(0, Math.min(rows.length - 1, Math.floor(index)))
    const offsets = this.buildOffsets(rows)
    const rowTop = offsets[safeIndex] ?? 0
    const rowBottom = offsets[safeIndex + 1] ?? rowTop
    const viewportBlockSize = Math.max(MIN_BLOCK_SIZE, this.viewportBlockSize())
    let target = currentScrollTop

    if (alignment === 'center') {
      target = rowTop - (viewportBlockSize - (rowBottom - rowTop)) / 2
    } else if (rowTop < currentScrollTop) {
      target = rowTop
    } else if (rowBottom > currentScrollTop + viewportBlockSize) {
      target = rowBottom - viewportBlockSize
    }

    return this.clampScrollTopFromOffsets(offsets, target)
  }

  private getVisibleRangeFromOffsets(offsets: readonly number[], scrollTop: number): PMMobileListRange {
    const safeScrollTop = this.clampScrollTopFromOffsets(offsets, scrollTop)
    const viewportBlockSize = Math.max(MIN_BLOCK_SIZE, this.viewportBlockSize())
    const first = this.findIndexAtOffset(offsets, safeScrollTop) ?? 0
    const last =
      this.findIndexAtOffset(offsets, Math.max(safeScrollTop, safeScrollTop + viewportBlockSize - RANGE_EDGE_EPSILON)) ??
      first
    return {first, last}
  }

  private clampScrollTopFromOffsets(offsets: readonly number[], value: number): number {
    const totalBlockSize = offsets.at(-1) ?? 0
    const maxScrollTop = Math.max(0, totalBlockSize - this.viewportBlockSize())
    const normalized = Number.isFinite(value) ? Math.max(0, value) : 0
    return Math.min(maxScrollTop, normalized)
  }

  private buildOffsets(rows: readonly PMListMutationRow[]): number[] {
    const offsets = new Array<number>(rows.length + 1)
    offsets[0] = 0
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      offsets[index + 1] =
        (offsets[index] ?? 0) + (row ? ROW_BLOCK_SIZES[row.kind] : MIN_BLOCK_SIZE)
    }
    return offsets
  }

  private findIndexAtOffset(offsets: readonly number[], value: number): number | null {
    const rowCount = offsets.length - 1
    if (rowCount <= 0) return null

    const totalBlockSize = offsets[rowCount] ?? 0
    const target = Math.max(0, Math.min(Math.max(0, totalBlockSize - RANGE_EDGE_EPSILON), value))
    let low = 0
    let high = rowCount
    while (low < high) {
      const middle = Math.floor((low + high + 1) / 2)
      if ((offsets[middle] ?? 0) <= target) low = middle
      else high = middle - 1
    }
    return Math.min(rowCount - 1, low)
  }
}
