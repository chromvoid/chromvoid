import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

export type GridFocusStrategy = 'roving-tabindex' | 'aria-activedescendant'
export type GridSelectionMode = 'single' | 'multiple'

export interface GridRow {
  id: string
  index?: number
  disabled?: boolean
}

export interface GridColumn {
  id: string
  index?: number
  disabled?: boolean
}

export interface GridCellId {
  rowId: string
  colId: string
}

export interface GridKeyboardEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

export interface CreateGridOptions {
  rows: readonly GridRow[]
  columns: readonly GridColumn[]
  disabledCells?: readonly GridCellId[]
  idBase?: string
  ariaLabel?: string
  ariaLabelledBy?: string
  focusStrategy?: GridFocusStrategy
  selectionMode?: GridSelectionMode
  selectionFollowsFocus?: boolean
  totalRowCount?: number
  totalColumnCount?: number
  pageSize?: number
  initialActiveCellId?: GridCellId | null
  initialSelectedCellIds?: readonly GridCellId[]
  isReadOnly?: boolean
}

export interface GridState {
  activeCellId: Atom<GridCellId | null>
  selectedCellIds: Atom<Set<string>>
  rowCount: Computed<number>
  columnCount: Computed<number>
}

export interface GridActions {
  setActiveCell(cell: GridCellId): void
  moveUp(): void
  moveDown(): void
  moveLeft(): void
  moveRight(): void
  moveRowStart(): void
  moveRowEnd(): void
  moveGridStart(): void
  moveGridEnd(): void
  pageUp(): void
  pageDown(): void
  selectCell(cell: GridCellId): void
  toggleCellSelection(cell: GridCellId): void
  selectRow(rowId: string): void
  selectColumn(colId: string): void
  handleKeyDown(event: GridKeyboardEventLike): void
}

export interface GridProps {
  id: string
  role: 'grid'
  tabindex: '0' | '-1'
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-multiselectable': 'true' | 'false'
  'aria-colcount': number
  'aria-rowcount': number
  'aria-activedescendant'?: string
}

export interface GridRowProps {
  id: string
  role: 'row'
  'aria-rowindex': number
}

export interface GridCellProps {
  id: string
  role: 'gridcell'
  tabindex: '0' | '-1'
  'aria-colindex': number
  'aria-selected': 'true' | 'false'
  'aria-readonly'?: 'true'
  'aria-disabled'?: 'true'
  'data-active': 'true' | 'false'
  onFocus: () => void
}

export interface GridContracts {
  getGridProps(): GridProps
  getRowProps(rowId: string): GridRowProps
  getCellProps(rowId: string, colId: string): GridCellProps
}

export interface GridModel {
  readonly state: GridState
  readonly actions: GridActions
  readonly contracts: GridContracts
}

const cellKey = (rowId: string, colId: string) => `${rowId}::${colId}`

const cellKeyFrom = (cell: GridCellId) => cellKey(cell.rowId, cell.colId)

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function createGrid(options: CreateGridOptions): GridModel {
  const idBase = options.idBase ?? 'grid'
  const focusStrategy = options.focusStrategy ?? 'roving-tabindex'
  const selectionMode = options.selectionMode ?? 'single'
  const selectionFollowsFocus = options.selectionFollowsFocus ?? false
  const pageSize = Math.max(options.pageSize ?? 10, 1)

  const rows = [...options.rows]
  const columns = [...options.columns]

  const rowById = new Map(rows.map((row, index) => [row.id, {row, index}]))
  const columnById = new Map(columns.map((column, index) => [column.id, {column, index}]))
  const disabledCellSet = new Set((options.disabledCells ?? []).map((cell) => cellKeyFrom(cell)))

  const rowCountAtom = computed(
    () => Math.max(options.totalRowCount ?? rows.length, rows.length),
    `${idBase}.rowCount`,
  )
  const columnCountAtom = computed(
    () => Math.max(options.totalColumnCount ?? columns.length, columns.length),
    `${idBase}.columnCount`,
  )

  const getRowIndex = (rowId: string) => rowById.get(rowId)?.index ?? -1
  const getColumnIndex = (colId: string) => columnById.get(colId)?.index ?? -1

  const rowAriaIndex = (rowId: string) => {
    const info = rowById.get(rowId)
    if (!info) return 1
    return info.row.index ?? info.index + 1
  }

  const colAriaIndex = (colId: string) => {
    const info = columnById.get(colId)
    if (!info) return 1
    return info.column.index ?? info.index + 1
  }

  const isCellDisabled = (rowId: string, colId: string) => {
    const rowInfo = rowById.get(rowId)
    const columnInfo = columnById.get(colId)
    if (!rowInfo || !columnInfo) return true

    if (rowInfo.row.disabled) return true
    if (columnInfo.column.disabled) return true
    if (disabledCellSet.has(cellKey(rowId, colId))) return true
    return false
  }

  const hasCell = (rowId: string, colId: string) => rowById.has(rowId) && columnById.has(colId)

  const firstEnabledCellInRow = (rowIndex: number): GridCellId | null => {
    const rowId = rows[rowIndex]?.id
    if (!rowId) return null

    for (const column of columns) {
      if (!isCellDisabled(rowId, column.id)) {
        return {rowId, colId: column.id}
      }
    }

    return null
  }

  const lastEnabledCellInRow = (rowIndex: number): GridCellId | null => {
    const rowId = rows[rowIndex]?.id
    if (!rowId) return null

    for (let index = columns.length - 1; index >= 0; index -= 1) {
      const columnId = columns[index]?.id
      if (columnId != null && !isCellDisabled(rowId, columnId)) {
        return {rowId, colId: columnId}
      }
    }

    return null
  }

  const firstEnabledCellInGrid = (): GridCellId | null => {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const cell = firstEnabledCellInRow(rowIndex)
      if (cell) return cell
    }

    return null
  }

  const lastEnabledCellInGrid = (): GridCellId | null => {
    for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
      const cell = lastEnabledCellInRow(rowIndex)
      if (cell) return cell
    }

    return null
  }

  const normalizeCell = (cell: GridCellId | null): GridCellId | null => {
    if (cell == null) return firstEnabledCellInGrid()
    if (!hasCell(cell.rowId, cell.colId)) return firstEnabledCellInGrid()
    if (isCellDisabled(cell.rowId, cell.colId)) return firstEnabledCellInGrid()
    return cell
  }

  const activeCellIdAtom = atom<GridCellId | null>(
    normalizeCell(options.initialActiveCellId ?? null),
    `${idBase}.activeCellId`,
  )

  const selectedCellIdsAtom = atom<Set<string>>(
    new Set(
      (options.initialSelectedCellIds ?? [])
        .filter((cell) => hasCell(cell.rowId, cell.colId) && !isCellDisabled(cell.rowId, cell.colId))
        .map((cell) => cellKeyFrom(cell)),
    ),
    `${idBase}.selectedCellIds`,
  )

  const setSelection = (keys: Iterable<string>) => {
    selectedCellIdsAtom.set(new Set(keys))
  }

  const setActiveCell = action((cell: GridCellId) => {
    const normalized = normalizeCell(cell)
    if (!normalized) {
      activeCellIdAtom.set(null)
      return
    }

    activeCellIdAtom.set(normalized)

    if (selectionFollowsFocus) {
      setSelection([cellKeyFrom(normalized)])
    }
  }, `${idBase}.setActiveCell`)

  const tryMoveHorizontal = (direction: 1 | -1) => {
    const current = normalizeCell(activeCellIdAtom())
    if (!current) return

    const rowIndex = getRowIndex(current.rowId)
    const colIndex = getColumnIndex(current.colId)
    if (rowIndex < 0 || colIndex < 0) return

    for (let nextCol = colIndex + direction; nextCol >= 0 && nextCol < columns.length; nextCol += direction) {
      const colId = columns[nextCol]?.id
      if (colId != null && !isCellDisabled(current.rowId, colId)) {
        setActiveCell({rowId: current.rowId, colId})
        return
      }
    }
  }

  const tryMoveVertical = (direction: 1 | -1) => {
    const current = normalizeCell(activeCellIdAtom())
    if (!current) return

    const rowIndex = getRowIndex(current.rowId)
    if (rowIndex < 0) return

    for (let nextRow = rowIndex + direction; nextRow >= 0 && nextRow < rows.length; nextRow += direction) {
      const rowId = rows[nextRow]?.id
      if (rowId != null && !isCellDisabled(rowId, current.colId)) {
        setActiveCell({rowId, colId: current.colId})
        return
      }
    }
  }

  const moveUp = action(() => {
    tryMoveVertical(-1)
  }, `${idBase}.moveUp`)

  const moveDown = action(() => {
    tryMoveVertical(1)
  }, `${idBase}.moveDown`)

  const moveLeft = action(() => {
    tryMoveHorizontal(-1)
  }, `${idBase}.moveLeft`)

  const moveRight = action(() => {
    tryMoveHorizontal(1)
  }, `${idBase}.moveRight`)

  const moveRowStart = action(() => {
    const current = normalizeCell(activeCellIdAtom())
    if (!current) return

    const rowIndex = getRowIndex(current.rowId)
    if (rowIndex < 0) return

    const cell = firstEnabledCellInRow(rowIndex)
    if (cell) {
      setActiveCell(cell)
    }
  }, `${idBase}.moveRowStart`)

  const moveRowEnd = action(() => {
    const current = normalizeCell(activeCellIdAtom())
    if (!current) return

    const rowIndex = getRowIndex(current.rowId)
    if (rowIndex < 0) return

    const cell = lastEnabledCellInRow(rowIndex)
    if (cell) {
      setActiveCell(cell)
    }
  }, `${idBase}.moveRowEnd`)

  const moveGridStart = action(() => {
    const cell = firstEnabledCellInGrid()
    if (cell) {
      setActiveCell(cell)
    }
  }, `${idBase}.moveGridStart`)

  const moveGridEnd = action(() => {
    const cell = lastEnabledCellInGrid()
    if (cell) {
      setActiveCell(cell)
    }
  }, `${idBase}.moveGridEnd`)

  const moveByPage = (direction: 1 | -1) => {
    const current = normalizeCell(activeCellIdAtom())
    if (!current) return

    const rowIndex = getRowIndex(current.rowId)
    if (rowIndex < 0) return

    const targetRowIndex = clamp(rowIndex + direction * pageSize, 0, rows.length - 1)
    for (let nextRow = targetRowIndex; nextRow >= 0 && nextRow < rows.length; nextRow += direction) {
      const rowId = rows[nextRow]?.id
      if (rowId != null && !isCellDisabled(rowId, current.colId)) {
        setActiveCell({rowId, colId: current.colId})
        return
      }
    }
  }

  const pageUp = action(() => {
    moveByPage(-1)
  }, `${idBase}.pageUp`)

  const pageDown = action(() => {
    moveByPage(1)
  }, `${idBase}.pageDown`)

  const selectCell = action((cell: GridCellId) => {
    if (!hasCell(cell.rowId, cell.colId) || isCellDisabled(cell.rowId, cell.colId)) {
      return
    }

    const key = cellKeyFrom(cell)
    if (selectionMode === 'multiple') {
      setSelection([key])
      return
    }

    setSelection([key])
  }, `${idBase}.selectCell`)

  const toggleCellSelection = action((cell: GridCellId) => {
    if (!hasCell(cell.rowId, cell.colId) || isCellDisabled(cell.rowId, cell.colId)) {
      return
    }

    if (selectionMode !== 'multiple') {
      selectCell(cell)
      return
    }

    const key = cellKeyFrom(cell)
    const next = new Set(selectedCellIdsAtom())
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }

    selectedCellIdsAtom.set(next)
  }, `${idBase}.toggleCellSelection`)

  const selectRow = action((rowId: string) => {
    const rowIndex = getRowIndex(rowId)
    if (rowIndex < 0) return

    const keys = columns
      .map((column) => ({rowId, colId: column.id}))
      .filter((cell) => !isCellDisabled(cell.rowId, cell.colId))
      .map((cell) => cellKeyFrom(cell))

    if (keys.length === 0) return

    if (selectionMode === 'multiple') {
      setSelection(keys)
      return
    }

    const firstKey = keys[0]
    if (firstKey != null) {
      setSelection([firstKey])
    }
  }, `${idBase}.selectRow`)

  const selectColumn = action((colId: string) => {
    const colIndex = getColumnIndex(colId)
    if (colIndex < 0) return

    const keys = rows
      .map((row) => ({rowId: row.id, colId}))
      .filter((cell) => !isCellDisabled(cell.rowId, cell.colId))
      .map((cell) => cellKeyFrom(cell))

    if (keys.length === 0) return

    if (selectionMode === 'multiple') {
      setSelection(keys)
      return
    }

    const firstKey = keys[0]
    if (firstKey != null) {
      setSelection([firstKey])
    }
  }, `${idBase}.selectColumn`)

  const handleKeyDown = action((event: GridKeyboardEventLike) => {
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
      case 'PageUp':
        pageUp()
        return
      case 'PageDown':
        pageDown()
        return
      case 'Enter':
        moveDown()
        return
      case ' ':
        {
          const current = activeCellIdAtom()
          if (current) {
            if (selectionMode === 'multiple') {
              toggleCellSelection(current)
            } else {
              selectCell(current)
            }
          }
        }
        return
      default:
        return
    }
  }, `${idBase}.handleKeyDown`)

  const actions: GridActions = {
    setActiveCell,
    moveUp,
    moveDown,
    moveLeft,
    moveRight,
    moveRowStart,
    moveRowEnd,
    moveGridStart,
    moveGridEnd,
    pageUp,
    pageDown,
    selectCell,
    toggleCellSelection,
    selectRow,
    selectColumn,
    handleKeyDown,
  }

  const cellDomId = (rowId: string, colId: string) => `${idBase}-cell-${rowId}-${colId}`

  const contracts: GridContracts = {
    getGridProps() {
      const activeCell = activeCellIdAtom()

      return {
        id: `${idBase}-root`,
        role: 'grid',
        tabindex: focusStrategy === 'aria-activedescendant' ? '0' : '-1',
        'aria-label': options.ariaLabel,
        'aria-labelledby': options.ariaLabelledBy,
        'aria-multiselectable': selectionMode === 'multiple' ? 'true' : 'false',
        'aria-colcount': columnCountAtom(),
        'aria-rowcount': rowCountAtom(),
        'aria-activedescendant':
          focusStrategy === 'aria-activedescendant' && activeCell != null
            ? cellDomId(activeCell.rowId, activeCell.colId)
            : undefined,
      }
    },
    getRowProps(rowId: string) {
      if (!rowById.has(rowId)) {
        throw new Error(`Unknown grid row id: ${rowId}`)
      }

      return {
        id: `${idBase}-row-${rowId}`,
        role: 'row',
        'aria-rowindex': rowAriaIndex(rowId),
      }
    },
    getCellProps(rowId: string, colId: string) {
      if (!hasCell(rowId, colId)) {
        throw new Error(`Unknown grid cell id: ${rowId}:${colId}`)
      }

      const key = cellKey(rowId, colId)
      const activeCell = activeCellIdAtom()
      const isActive = activeCell?.rowId === rowId && activeCell?.colId === colId
      const isDisabled = isCellDisabled(rowId, colId)

      return {
        id: cellDomId(rowId, colId),
        role: 'gridcell',
        tabindex: focusStrategy === 'roving-tabindex' && isActive && !isDisabled ? '0' : '-1',
        'aria-colindex': colAriaIndex(colId),
        'aria-selected': selectedCellIdsAtom().has(key) ? 'true' : 'false',
        'aria-readonly': options.isReadOnly ? 'true' : undefined,
        'aria-disabled': isDisabled ? 'true' : undefined,
        'data-active': isActive ? 'true' : 'false',
        onFocus: () => setActiveCell({rowId, colId}),
      }
    },
  }

  const state: GridState = {
    activeCellId: activeCellIdAtom,
    selectedCellIds: selectedCellIdsAtom,
    rowCount: rowCountAtom,
    columnCount: columnCountAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
