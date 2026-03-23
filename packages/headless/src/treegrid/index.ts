import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

export type TreegridSelectionMode = 'single' | 'multiple'
export type TreegridCellRole = 'gridcell' | 'rowheader' | 'columnheader'

export interface TreegridRow {
  id: string
  index?: number
  disabled?: boolean
  children?: readonly TreegridRow[]
}

export interface TreegridColumn {
  id: string
  index?: number
  disabled?: boolean
  cellRole?: TreegridCellRole
}

export interface TreegridCellId {
  rowId: string
  colId: string
}

export interface TreegridKeyboardEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

interface TreegridRowMeta {
  id: string
  parentId: string | null
  childIds: string[]
  level: number
  posInSet: number
  setSize: number
  rowIndex: number
  disabled: boolean
}

export interface CreateTreegridOptions {
  rows: readonly TreegridRow[]
  columns: readonly TreegridColumn[]
  disabledCells?: readonly TreegridCellId[]
  idBase?: string
  ariaLabel?: string
  ariaLabelledBy?: string
  selectionMode?: TreegridSelectionMode
  initialExpandedRowIds?: readonly string[]
  initialActiveCellId?: TreegridCellId | null
  initialSelectedRowIds?: readonly string[]
}

export interface TreegridState {
  activeCellId: Atom<TreegridCellId | null>
  expandedRowIds: Atom<Set<string>>
  selectedRowIds: Atom<Set<string>>
  rowCount: Computed<number>
  columnCount: Computed<number>
}

export interface TreegridActions {
  moveUp(): void
  moveDown(): void
  moveLeft(): void
  moveRight(): void
  moveRowStart(): void
  moveRowEnd(): void
  expandRow(rowId: string): void
  collapseRow(rowId: string): void
  toggleRowExpanded(rowId: string): void
  selectRow(rowId: string): void
  toggleRowSelection(rowId: string): void
  handleKeyDown(event: TreegridKeyboardEventLike): void
}

export interface TreegridProps {
  id: string
  role: 'treegrid'
  tabindex: '-1'
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-multiselectable': 'true' | 'false'
  'aria-rowcount': number
  'aria-colcount': number
}

export interface TreegridRowProps {
  id: string
  role: 'row'
  'aria-level': number
  'aria-posinset': number
  'aria-setsize': number
  'aria-rowindex': number
  'aria-expanded'?: 'true' | 'false'
  'aria-selected': 'true' | 'false'
  'aria-disabled'?: 'true'
}

export interface TreegridCellProps {
  id: string
  role: TreegridCellRole
  tabindex: '0' | '-1'
  'aria-colindex': number
  'aria-selected': 'true' | 'false'
  'aria-disabled'?: 'true'
  'data-active': 'true' | 'false'
  onFocus: () => void
}

export interface TreegridContracts {
  getTreegridProps(): TreegridProps
  getRowProps(rowId: string): TreegridRowProps
  getCellProps(rowId: string, colId: string): TreegridCellProps
}

export interface TreegridModel {
  readonly state: TreegridState
  readonly actions: TreegridActions
  readonly contracts: TreegridContracts
}

const cellKey = (rowId: string, colId: string) => `${rowId}::${colId}`

const collectDescendantIds = (metaById: ReadonlyMap<string, TreegridRowMeta>, rowId: string) => {
  const descendants: string[] = []
  const queue = [...(metaById.get(rowId)?.childIds ?? [])]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    descendants.push(current)
    queue.push(...(metaById.get(current)?.childIds ?? []))
  }

  return descendants
}

const buildRowsMeta = (rows: readonly TreegridRow[]) => {
  const rowById = new Map<string, TreegridRow>()
  const metaById = new Map<string, TreegridRowMeta>()
  const rootIds: string[] = []
  const orderedIds: string[] = []

  const visit = (siblings: readonly TreegridRow[], parentId: string | null, level: number) => {
    const setSize = siblings.length

    siblings.forEach((row, index) => {
      const childIds = (row.children ?? []).map((child) => child.id)
      const rowIndex = orderedIds.length + 1

      orderedIds.push(row.id)
      rowById.set(row.id, row)
      metaById.set(row.id, {
        id: row.id,
        parentId,
        childIds,
        level,
        posInSet: index + 1,
        setSize,
        rowIndex,
        disabled: row.disabled === true,
      })

      if (parentId == null) {
        rootIds.push(row.id)
      }

      if (childIds.length > 0) {
        visit(row.children ?? [], row.id, level + 1)
      }
    })
  }

  visit(rows, null, 1)
  return {rowById, metaById, rootIds}
}

export function createTreegrid(options: CreateTreegridOptions): TreegridModel {
  const idBase = options.idBase ?? 'treegrid'
  const selectionMode = options.selectionMode ?? 'single'

  const columns = [...options.columns]
  const {rowById, metaById, rootIds} = buildRowsMeta(options.rows)

  const allRowIds = [...metaById.keys()]
  const allRowIdSet = new Set(allRowIds)
  const enabledRowIdSet = new Set(allRowIds.filter((rowId) => metaById.get(rowId)?.disabled !== true))

  const columnById = new Map(columns.map((column, index) => [column.id, {column, index}]))
  const disabledCellSet = new Set(
    (options.disabledCells ?? []).map((cell) => cellKey(cell.rowId, cell.colId)),
  )

  const isBranchRow = (rowId: string) => (metaById.get(rowId)?.childIds.length ?? 0) > 0
  const isRowExpanded = (rowId: string) => expandedRowIdsAtom().has(rowId)
  const hasCell = (rowId: string, colId: string) => rowById.has(rowId) && columnById.has(colId)
  const getColumnIndex = (colId: string) => columnById.get(colId)?.index ?? -1
  const colAriaIndex = (colId: string) => {
    const info = columnById.get(colId)
    if (!info) return 1
    return info.column.index ?? info.index + 1
  }

  const isCellDisabled = (rowId: string, colId: string) => {
    const rowMeta = metaById.get(rowId)
    const columnInfo = columnById.get(colId)
    if (!rowMeta || !columnInfo) return true
    if (rowMeta.disabled) return true
    if (columnInfo.column.disabled) return true
    if (disabledCellSet.has(cellKey(rowId, colId))) return true
    return false
  }

  const expandedRowIdsAtom = atom<Set<string>>(
    new Set(
      (options.initialExpandedRowIds ?? []).filter((rowId) => allRowIdSet.has(rowId) && isBranchRow(rowId)),
    ),
    `${idBase}.expandedRowIds`,
  )

  const selectedRowIdsAtom = atom<Set<string>>(
    new Set(
      (options.initialSelectedRowIds ?? [])
        .filter((rowId) => enabledRowIdSet.has(rowId))
        .slice(0, selectionMode === 'single' ? 1 : undefined),
    ),
    `${idBase}.selectedRowIds`,
  )

  const getVisibleRowIds = () => {
    const expanded = expandedRowIdsAtom()
    const visible: string[] = []

    const visit = (rowId: string) => {
      if (!metaById.has(rowId)) return
      visible.push(rowId)
      if (!expanded.has(rowId)) return

      const childIds = metaById.get(rowId)?.childIds ?? []
      for (const childId of childIds) {
        visit(childId)
      }
    }

    for (const rootId of rootIds) {
      visit(rootId)
    }

    return visible
  }

  const getVisibleEnabledRowIds = () => getVisibleRowIds().filter((rowId) => enabledRowIdSet.has(rowId))

  const firstEnabledCellInRow = (rowId: string): TreegridCellId | null => {
    for (const column of columns) {
      if (!isCellDisabled(rowId, column.id)) {
        return {rowId, colId: column.id}
      }
    }
    return null
  }

  const lastEnabledCellInRow = (rowId: string): TreegridCellId | null => {
    for (let index = columns.length - 1; index >= 0; index -= 1) {
      const colId = columns[index]?.id
      if (colId != null && !isCellDisabled(rowId, colId)) {
        return {rowId, colId}
      }
    }
    return null
  }

  const firstEnabledCellInVisibleRows = (): TreegridCellId | null => {
    for (const rowId of getVisibleEnabledRowIds()) {
      const cell = firstEnabledCellInRow(rowId)
      if (cell) return cell
    }
    return null
  }

  const lastEnabledCellInVisibleRows = (): TreegridCellId | null => {
    const visible = getVisibleEnabledRowIds()
    for (let index = visible.length - 1; index >= 0; index -= 1) {
      const rowId = visible[index]
      if (!rowId) continue
      const cell = lastEnabledCellInRow(rowId)
      if (cell) return cell
    }
    return null
  }

  const normalizeCell = (cell: TreegridCellId | null): TreegridCellId | null => {
    if (cell == null) return firstEnabledCellInVisibleRows()
    if (!hasCell(cell.rowId, cell.colId)) return firstEnabledCellInVisibleRows()
    if (!getVisibleRowIds().includes(cell.rowId)) return firstEnabledCellInVisibleRows()
    if (isCellDisabled(cell.rowId, cell.colId)) return firstEnabledCellInVisibleRows()
    return cell
  }

  const activeCellIdAtom = atom<TreegridCellId | null>(
    normalizeCell(options.initialActiveCellId ?? null),
    `${idBase}.activeCellId`,
  )

  const setActiveCell = action((cell: TreegridCellId) => {
    const normalized = normalizeCell(cell)
    if (!normalized) {
      activeCellIdAtom.set(null)
      return
    }

    activeCellIdAtom.set(normalized)
  }, `${idBase}.setActiveCell`)

  const moveToAdjacentRow = (direction: 1 | -1) => {
    const current = normalizeCell(activeCellIdAtom())
    if (!current) return

    const visibleRows = getVisibleEnabledRowIds()
    const currentRowIndex = visibleRows.indexOf(current.rowId)
    if (currentRowIndex < 0) return

    for (
      let nextIndex = currentRowIndex + direction;
      nextIndex >= 0 && nextIndex < visibleRows.length;
      nextIndex += direction
    ) {
      const rowId = visibleRows[nextIndex]
      if (!rowId) continue
      if (!isCellDisabled(rowId, current.colId)) {
        setActiveCell({rowId, colId: current.colId})
        return
      }
    }
  }

  const moveWithinRow = (direction: 1 | -1) => {
    const current = normalizeCell(activeCellIdAtom())
    if (!current) return

    const currentColIndex = getColumnIndex(current.colId)
    if (currentColIndex < 0) return

    for (
      let nextCol = currentColIndex + direction;
      nextCol >= 0 && nextCol < columns.length;
      nextCol += direction
    ) {
      const colId = columns[nextCol]?.id
      if (colId != null && !isCellDisabled(current.rowId, colId)) {
        setActiveCell({rowId: current.rowId, colId})
        return
      }
    }
  }

  const moveUp = action(() => {
    moveToAdjacentRow(-1)
  }, `${idBase}.moveUp`)

  const moveDown = action(() => {
    moveToAdjacentRow(1)
  }, `${idBase}.moveDown`)

  const moveRowStart = action(() => {
    const current = normalizeCell(activeCellIdAtom())
    if (!current) return

    const first = firstEnabledCellInRow(current.rowId)
    if (first) {
      setActiveCell(first)
    }
  }, `${idBase}.moveRowStart`)

  const moveRowEnd = action(() => {
    const current = normalizeCell(activeCellIdAtom())
    if (!current) return

    const last = lastEnabledCellInRow(current.rowId)
    if (last) {
      setActiveCell(last)
    }
  }, `${idBase}.moveRowEnd`)

  const moveGridStart = action(() => {
    const first = firstEnabledCellInVisibleRows()
    if (first) {
      setActiveCell(first)
    }
  }, `${idBase}.moveGridStart`)

  const moveGridEnd = action(() => {
    const last = lastEnabledCellInVisibleRows()
    if (last) {
      setActiveCell(last)
    }
  }, `${idBase}.moveGridEnd`)

  const expandRow = action((rowId: string) => {
    if (!isBranchRow(rowId)) return
    if (expandedRowIdsAtom().has(rowId)) return

    const next = new Set(expandedRowIdsAtom())
    next.add(rowId)
    expandedRowIdsAtom.set(next)
  }, `${idBase}.expandRow`)

  const collapseRow = action((rowId: string) => {
    if (!isBranchRow(rowId)) return
    if (!expandedRowIdsAtom().has(rowId)) return

    const next = new Set(expandedRowIdsAtom())
    next.delete(rowId)
    expandedRowIdsAtom.set(next)

    const active = activeCellIdAtom()
    if (!active || active.rowId === rowId) return

    const descendants = collectDescendantIds(metaById, rowId)
    if (descendants.includes(active.rowId)) {
      if (!isCellDisabled(rowId, active.colId)) {
        setActiveCell({rowId, colId: active.colId})
      } else {
        const fallback = firstEnabledCellInRow(rowId)
        if (fallback) {
          setActiveCell(fallback)
        }
      }
    }
  }, `${idBase}.collapseRow`)

  const toggleRowExpanded = action((rowId: string) => {
    if (expandedRowIdsAtom().has(rowId)) {
      collapseRow(rowId)
    } else {
      expandRow(rowId)
    }
  }, `${idBase}.toggleRowExpanded`)

  const selectRow = action((rowId: string) => {
    if (!enabledRowIdSet.has(rowId)) return

    if (selectionMode === 'single') {
      selectedRowIdsAtom.set(new Set([rowId]))
      return
    }

    selectedRowIdsAtom.set(new Set([rowId]))
  }, `${idBase}.selectRow`)

  const toggleRowSelection = action((rowId: string) => {
    if (!enabledRowIdSet.has(rowId)) return

    if (selectionMode === 'single') {
      selectedRowIdsAtom.set(new Set([rowId]))
      return
    }

    const next = new Set(selectedRowIdsAtom())
    if (next.has(rowId)) {
      next.delete(rowId)
    } else {
      next.add(rowId)
    }

    selectedRowIdsAtom.set(next)
  }, `${idBase}.toggleRowSelection`)

  const moveLeft = action(() => {
    const current = normalizeCell(activeCellIdAtom())
    if (!current) return

    const rowMeta = metaById.get(current.rowId)
    if (!rowMeta) return

    if (isBranchRow(current.rowId) && isRowExpanded(current.rowId)) {
      collapseRow(current.rowId)
      return
    }

    if (rowMeta.parentId != null) {
      const parentId = rowMeta.parentId
      if (!isCellDisabled(parentId, current.colId)) {
        setActiveCell({rowId: parentId, colId: current.colId})
      } else {
        const fallback = firstEnabledCellInRow(parentId)
        if (fallback) {
          setActiveCell(fallback)
        }
      }
      return
    }

    moveWithinRow(-1)
  }, `${idBase}.moveLeft`)

  const moveRight = action(() => {
    const current = normalizeCell(activeCellIdAtom())
    if (!current) return

    if (isBranchRow(current.rowId) && !isRowExpanded(current.rowId)) {
      expandRow(current.rowId)
      return
    }

    if (isBranchRow(current.rowId) && isRowExpanded(current.rowId)) {
      const firstChildId = metaById.get(current.rowId)?.childIds[0]
      if (firstChildId != null && !isCellDisabled(firstChildId, current.colId)) {
        setActiveCell({rowId: firstChildId, colId: current.colId})
        return
      }

      if (firstChildId != null) {
        const fallback = firstEnabledCellInRow(firstChildId)
        if (fallback) {
          setActiveCell(fallback)
          return
        }
      }
    }

    moveWithinRow(1)
  }, `${idBase}.moveRight`)

  const handleKeyDown = action((event: TreegridKeyboardEventLike) => {
    const ctrlOrMeta = event.ctrlKey === true || event.metaKey === true

    switch (event.key) {
      case 'ArrowUp':
        moveUp()
        return
      case 'ArrowDown':
        moveDown()
        return
      case 'ArrowLeft':
        moveLeft()
        return
      case 'ArrowRight':
        moveRight()
        return
      case 'Home':
        if (ctrlOrMeta) {
          moveGridStart()
        } else {
          moveRowStart()
        }
        return
      case 'End':
        if (ctrlOrMeta) {
          moveGridEnd()
        } else {
          moveRowEnd()
        }
        return
      default:
        return
    }
  }, `${idBase}.handleKeyDown`)

  const rowCountAtom = computed(() => allRowIds.length, `${idBase}.rowCount`)
  const columnCountAtom = computed(() => columns.length, `${idBase}.columnCount`)

  const actions: TreegridActions = {
    moveUp,
    moveDown,
    moveLeft,
    moveRight,
    moveRowStart,
    moveRowEnd,
    expandRow,
    collapseRow,
    toggleRowExpanded,
    selectRow,
    toggleRowSelection,
    handleKeyDown,
  }

  const cellDomId = (rowId: string, colId: string) => `${idBase}-cell-${rowId}-${colId}`

  const contracts: TreegridContracts = {
    getTreegridProps() {
      return {
        id: `${idBase}-root`,
        role: 'treegrid',
        tabindex: '-1',
        'aria-label': options.ariaLabel,
        'aria-labelledby': options.ariaLabelledBy,
        'aria-multiselectable': selectionMode === 'multiple' ? 'true' : 'false',
        'aria-rowcount': rowCountAtom(),
        'aria-colcount': columnCountAtom(),
      }
    },
    getRowProps(rowId: string) {
      const rowMeta = metaById.get(rowId)
      if (!rowMeta) {
        throw new Error(`Unknown treegrid row id: ${rowId}`)
      }

      const isBranch = rowMeta.childIds.length > 0
      const expanded = isBranch ? expandedRowIdsAtom().has(rowId) : undefined

      return {
        id: `${idBase}-row-${rowId}`,
        role: 'row',
        'aria-level': rowMeta.level,
        'aria-posinset': rowMeta.posInSet,
        'aria-setsize': rowMeta.setSize,
        'aria-rowindex': rowById.get(rowId)?.index ?? rowMeta.rowIndex,
        'aria-expanded': expanded == null ? undefined : expanded ? 'true' : 'false',
        'aria-selected': selectedRowIdsAtom().has(rowId) ? 'true' : 'false',
        'aria-disabled': rowMeta.disabled ? 'true' : undefined,
      }
    },
    getCellProps(rowId: string, colId: string) {
      if (!hasCell(rowId, colId)) {
        throw new Error(`Unknown treegrid cell id: ${rowId}:${colId}`)
      }

      const activeCell = activeCellIdAtom()
      const isActive = activeCell?.rowId === rowId && activeCell.colId === colId
      const isDisabled = isCellDisabled(rowId, colId)
      const role = columnById.get(colId)?.column.cellRole ?? 'gridcell'

      return {
        id: cellDomId(rowId, colId),
        role,
        tabindex: isActive && !isDisabled ? '0' : '-1',
        'aria-colindex': colAriaIndex(colId),
        'aria-selected': selectedRowIdsAtom().has(rowId) ? 'true' : 'false',
        'aria-disabled': isDisabled ? 'true' : undefined,
        'data-active': isActive ? 'true' : 'false',
        onFocus: () => setActiveCell({rowId, colId}),
      }
    },
  }

  const state: TreegridState = {
    activeCellId: activeCellIdAtom,
    expandedRowIds: expandedRowIdsAtom,
    selectedRowIds: selectedRowIdsAtom,
    rowCount: rowCountAtom,
    columnCount: columnCountAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
