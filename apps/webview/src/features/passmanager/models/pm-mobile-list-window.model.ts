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

type PMMobileListRowKind = PMListMutationRow['kind']
type PMMobileListRowBlockSizes = Record<PMMobileListRowKind, number>

const OVERSCAN_ROWS = 2
const MIN_BLOCK_SIZE = 1
const RANGE_EDGE_EPSILON = 0.001
const MEASUREMENT_EPSILON = 0.5

const FALLBACK_ROW_BLOCK_SIZES: PMMobileListRowBlockSizes = {
  entry: 64,
  group: 64,
  header: 42,
}

const normalizeBlockSize = (value: number, fallback = 0): number =>
  Number.isFinite(value) && value > 0 ? value : fallback

export class PMMobileListWindowModel {
  readonly scrollTop = atom(0, 'passmanager.mobileListWindow.scrollTop')
  readonly viewportBlockSize = atom(0, 'passmanager.mobileListWindow.viewportBlockSize')
  readonly rowBlockSizes = atom<PMMobileListRowBlockSizes>(
    {...FALLBACK_ROW_BLOCK_SIZES},
    'passmanager.mobileListWindow.rowBlockSizes',
  )

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

  syncMeasuredRowBlockSize(
    kind: PMMobileListRowKind,
    value: number,
    rows: readonly PMListMutationRow[],
    currentScrollTop: number,
  ): number | null {
    const nextBlockSize = normalizeBlockSize(value)
    const currentBlockSize = this.rowBlockSizes()[kind]
    if (nextBlockSize === 0 || Math.abs(nextBlockSize - currentBlockSize) < MEASUREMENT_EPSILON) return null

    const currentOffsets = this.buildOffsets(rows)
    const anchorIndex = this.findIndexAtOffset(currentOffsets, currentScrollTop)
    const anchorOffset =
      anchorIndex === null ? 0 : Math.max(0, currentScrollTop - (currentOffsets[anchorIndex] ?? 0))

    this.rowBlockSizes.set({...this.rowBlockSizes(), [kind]: nextBlockSize})

    const nextOffsets = this.buildOffsets(rows)
    const correctedScrollTop =
      anchorIndex === null
        ? 0
        : this.clampScrollTop(
            rows,
            (nextOffsets[anchorIndex] ?? 0) + Math.min(anchorOffset, nextBlockSize - RANGE_EDGE_EPSILON),
          )
    this.scrollTop.set(correctedScrollTop)

    return Math.abs(correctedScrollTop - currentScrollTop) >= MEASUREMENT_EPSILON
      ? correctedScrollTop
      : null
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
    const renderedRange = {
      first: Math.max(0, visibleRange.first - OVERSCAN_ROWS),
      last: Math.min(rows.length - 1, visibleRange.last + OVERSCAN_ROWS),
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

  private clampScrollTop(rows: readonly PMListMutationRow[], value: number): number {
    return this.clampScrollTopFromOffsets(this.buildOffsets(rows), value)
  }

  private clampScrollTopFromOffsets(offsets: readonly number[], value: number): number {
    const totalBlockSize = offsets.at(-1) ?? 0
    const maxScrollTop = Math.max(0, totalBlockSize - this.viewportBlockSize())
    const normalized = Number.isFinite(value) ? Math.max(0, value) : 0
    return Math.min(maxScrollTop, normalized)
  }

  private buildOffsets(rows: readonly PMListMutationRow[]): number[] {
    const sizes = this.rowBlockSizes()
    const offsets = new Array<number>(rows.length + 1)
    offsets[0] = 0
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      offsets[index + 1] = (offsets[index] ?? 0) + (row ? sizes[row.kind] : MIN_BLOCK_SIZE)
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
