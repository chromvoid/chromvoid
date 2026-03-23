import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

export type TableSortDirection = 'ascending' | 'descending' | 'none'

export interface TableColumn {
  id: string
  index?: number
}

export interface TableRow {
  id: string
  index?: number
}

export interface TableKeyboardEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

export interface CreateTableOptions {
  columns: readonly TableColumn[]
  rows: readonly TableRow[]
  totalColumnCount?: number
  totalRowCount?: number
  initialSortColumnId?: string | null
  initialSortDirection?: TableSortDirection
  ariaLabel?: string
  ariaLabelledBy?: string
  idBase?: string
  selectable?: 'single' | 'multi' | false
  initialSelectedRowIds?: readonly string[]
  interactive?: boolean
  initialFocusedRowIndex?: number | null
  initialFocusedColumnIndex?: number | null
  pageSize?: number
}

export interface TableState {
  rowCount: Computed<number>
  columnCount: Computed<number>
  sortColumnId: Atom<string | null>
  sortDirection: Atom<TableSortDirection>
  selectedRowIds: Atom<Set<string>>
  focusedRowIndex: Atom<number | null>
  focusedColumnIndex: Atom<number | null>
  selectable: 'single' | 'multi' | false
  interactive: boolean
}

export interface TableActions {
  sortBy(columnId: string, direction: TableSortDirection): void
  clearSort(): void
  selectRow(rowId: string): void
  deselectRow(rowId: string): void
  toggleRowSelection(rowId: string): void
  selectAllRows(): void
  clearSelection(): void
  moveFocus(direction: 'up' | 'down' | 'left' | 'right'): void
  moveFocusToStart(): void
  moveFocusToEnd(): void
  moveFocusToRowStart(): void
  moveFocusToRowEnd(): void
  setFocusedCell(rowIndex: number, columnIndex: number): void
  pageUp(): void
  pageDown(): void
  handleKeyDown(event: TableKeyboardEventLike): void
}

export interface TableProps {
  id: string
  role: 'table' | 'grid'
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-rowcount': number
  'aria-colcount': number
  'aria-multiselectable'?: 'true'
  tabindex?: '0'
}

export interface TableRowProps {
  id: string
  role: 'row'
  'aria-rowindex': number
  'aria-selected'?: 'true' | 'false'
}

export interface TableCellProps {
  id: string
  role: 'cell' | 'gridcell'
  'aria-colindex': number
  'aria-colspan'?: number
  'aria-rowspan'?: number
  tabindex?: '0' | '-1'
  'data-active'?: 'true' | 'false'
}

export interface TableColumnHeaderProps {
  id: string
  role: 'columnheader'
  'aria-colindex': number
  'aria-sort'?: TableSortDirection
  tabindex?: '0' | '-1'
}

export interface TableRowHeaderProps {
  id: string
  role: 'rowheader'
  'aria-rowindex': number
  'aria-colindex': number
}

export interface TableContracts {
  getTableProps(): TableProps
  getRowProps(rowId: string): TableRowProps
  getCellProps(rowId: string, columnId: string, span?: {colspan?: number; rowspan?: number}): TableCellProps
  getColumnHeaderProps(columnId: string): TableColumnHeaderProps
  getRowHeaderProps(rowId: string, columnId: string): TableRowHeaderProps
}

export interface TableModel {
  readonly state: TableState
  readonly actions: TableActions
  readonly contracts: TableContracts
}

const rowIndexById = (rows: readonly TableRow[]) =>
  new Map(rows.map((row, index) => [row.id, row.index ?? index + 1]))

const columnIndexById = (columns: readonly TableColumn[]) =>
  new Map(columns.map((column, index) => [column.id, column.index ?? index + 1]))

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function createTable(options: CreateTableOptions): TableModel {
  if (!options.ariaLabel && !options.ariaLabelledBy) {
    throw new Error('Table requires either ariaLabel or ariaLabelledBy for accessibility')
  }

  const idBase = options.idBase ?? 'table'
  const selectable = options.selectable ?? false
  const interactive = options.interactive ?? false
  const pageSize = Math.max(options.pageSize ?? 10, 1)

  const columnIds = new Set(options.columns.map((column) => column.id))
  const rowIds = new Set(options.rows.map((row) => row.id))
  const rowIdsList = options.rows.map((row) => row.id)
  const rowIndexMap = rowIndexById(options.rows)
  const columnIndexMap = columnIndexById(options.columns)

  // --- Sorting ---

  const sortColumnIdAtom = atom<string | null>(options.initialSortColumnId ?? null, `${idBase}.sortColumnId`)
  const sortDirectionAtom = atom<TableSortDirection>(
    options.initialSortDirection ?? 'none',
    `${idBase}.sortDirection`,
  )
  const rowCountAtom = computed(
    () => Math.max(options.totalRowCount ?? options.rows.length, options.rows.length),
    `${idBase}.rowCount`,
  )
  const columnCountAtom = computed(
    () => Math.max(options.totalColumnCount ?? options.columns.length, options.columns.length),
    `${idBase}.columnCount`,
  )

  const sortBy = action((columnId: string, direction: TableSortDirection) => {
    if (direction === 'none') {
      sortColumnIdAtom.set(null)
      sortDirectionAtom.set('none')
      return
    }
    if (!columnIds.has(columnId)) return
    sortColumnIdAtom.set(columnId)
    sortDirectionAtom.set(direction)
  }, `${idBase}.sortBy`)

  const clearSort = action(() => {
    sortColumnIdAtom.set(null)
    sortDirectionAtom.set('none')
  }, `${idBase}.clearSort`)

  // --- Selection ---

  const resolveInitialSelectedRowIds = (): Set<string> => {
    if (selectable === false) return new Set()
    const initial = (options.initialSelectedRowIds ?? []).filter((id) => rowIds.has(id))
    if (selectable === 'single') {
      return initial.length > 0 ? new Set([initial[0]!]) : new Set()
    }
    return new Set(initial)
  }

  const selectedRowIdsAtom = atom<Set<string>>(resolveInitialSelectedRowIds(), `${idBase}.selectedRowIds`)

  const selectRow = action((rowId: string) => {
    if (selectable === false) return
    if (!rowIds.has(rowId)) return
    if (selectable === 'single') {
      selectedRowIdsAtom.set(new Set([rowId]))
    } else {
      const next = new Set(selectedRowIdsAtom())
      next.add(rowId)
      selectedRowIdsAtom.set(next)
    }
  }, `${idBase}.selectRow`)

  const deselectRow = action((rowId: string) => {
    if (selectable === false) return
    const current = selectedRowIdsAtom()
    if (!current.has(rowId)) return
    const next = new Set(current)
    next.delete(rowId)
    selectedRowIdsAtom.set(next)
  }, `${idBase}.deselectRow`)

  const toggleRowSelection = action((rowId: string) => {
    if (selectable === false) return
    if (!rowIds.has(rowId)) return
    const current = selectedRowIdsAtom()
    if (current.has(rowId)) {
      const next = new Set(current)
      next.delete(rowId)
      selectedRowIdsAtom.set(next)
    } else {
      if (selectable === 'single') {
        selectedRowIdsAtom.set(new Set([rowId]))
      } else {
        const next = new Set(current)
        next.add(rowId)
        selectedRowIdsAtom.set(next)
      }
    }
  }, `${idBase}.toggleRowSelection`)

  const selectAllRows = action(() => {
    if (selectable !== 'multi') return
    selectedRowIdsAtom.set(new Set(rowIdsList))
  }, `${idBase}.selectAllRows`)

  const clearSelection = action(() => {
    if (selectable === false) return
    selectedRowIdsAtom.set(new Set<string>())
  }, `${idBase}.clearSelection`)

  // --- Grid Navigation ---

  const resolveInitialFocus = (index: number | null | undefined, max: number): number | null => {
    if (!interactive) return null
    if (index != null) return clamp(index, 0, max)
    return 0
  }

  const focusedRowIndexAtom = atom<number | null>(
    resolveInitialFocus(options.initialFocusedRowIndex, options.rows.length - 1),
    `${idBase}.focusedRowIndex`,
  )
  const focusedColumnIndexAtom = atom<number | null>(
    resolveInitialFocus(options.initialFocusedColumnIndex, options.columns.length - 1),
    `${idBase}.focusedColumnIndex`,
  )

  const moveFocus = action((direction: 'up' | 'down' | 'left' | 'right') => {
    if (!interactive) return
    const row = focusedRowIndexAtom()
    const col = focusedColumnIndexAtom()
    if (row == null || col == null) return

    const maxRow = options.rows.length - 1
    const maxCol = options.columns.length - 1

    switch (direction) {
      case 'up':
        focusedRowIndexAtom.set(Math.max(0, row - 1))
        break
      case 'down':
        focusedRowIndexAtom.set(Math.min(maxRow, row + 1))
        break
      case 'left':
        focusedColumnIndexAtom.set(Math.max(0, col - 1))
        break
      case 'right':
        focusedColumnIndexAtom.set(Math.min(maxCol, col + 1))
        break
    }
  }, `${idBase}.moveFocus`)

  const moveFocusToStart = action(() => {
    if (!interactive) return
    focusedRowIndexAtom.set(0)
    focusedColumnIndexAtom.set(0)
  }, `${idBase}.moveFocusToStart`)

  const moveFocusToEnd = action(() => {
    if (!interactive) return
    focusedRowIndexAtom.set(options.rows.length - 1)
    focusedColumnIndexAtom.set(options.columns.length - 1)
  }, `${idBase}.moveFocusToEnd`)

  const moveFocusToRowStart = action(() => {
    if (!interactive) return
    focusedColumnIndexAtom.set(0)
  }, `${idBase}.moveFocusToRowStart`)

  const moveFocusToRowEnd = action(() => {
    if (!interactive) return
    focusedColumnIndexAtom.set(options.columns.length - 1)
  }, `${idBase}.moveFocusToRowEnd`)

  const setFocusedCell = action((rowIndex: number, columnIndex: number) => {
    if (!interactive) return
    focusedRowIndexAtom.set(clamp(rowIndex, 0, options.rows.length - 1))
    focusedColumnIndexAtom.set(clamp(columnIndex, 0, options.columns.length - 1))
  }, `${idBase}.setFocusedCell`)

  const pageUpAction = action(() => {
    if (!interactive) return
    const row = focusedRowIndexAtom()
    if (row == null) return
    focusedRowIndexAtom.set(Math.max(0, row - pageSize))
  }, `${idBase}.pageUp`)

  const pageDownAction = action(() => {
    if (!interactive) return
    const row = focusedRowIndexAtom()
    if (row == null) return
    focusedRowIndexAtom.set(Math.min(options.rows.length - 1, row + pageSize))
  }, `${idBase}.pageDown`)

  const handleKeyDown = action((event: TableKeyboardEventLike) => {
    if (!interactive) return

    const ctrlOrMeta = event.ctrlKey === true || event.metaKey === true

    switch (event.key) {
      case 'ArrowUp':
        moveFocus('up')
        return
      case 'ArrowDown':
        moveFocus('down')
        return
      case 'ArrowLeft':
        moveFocus('left')
        return
      case 'ArrowRight':
        moveFocus('right')
        return
      case 'Home':
        if (ctrlOrMeta) {
          moveFocusToStart()
        } else {
          moveFocusToRowStart()
        }
        return
      case 'End':
        if (ctrlOrMeta) {
          moveFocusToEnd()
        } else {
          moveFocusToRowEnd()
        }
        return
      case 'PageUp':
        pageUpAction()
        return
      case 'PageDown':
        pageDownAction()
        return
      case ' ': {
        if (selectable === false) return
        const focusedRow = focusedRowIndexAtom()
        if (focusedRow == null) return
        const rowId = rowIdsList[focusedRow]
        if (rowId != null) {
          toggleRowSelection(rowId)
        }
        return
      }
      case 'a': {
        if (ctrlOrMeta && selectable === 'multi') {
          selectAllRows()
        }
        return
      }
      default:
        return
    }
  }, `${idBase}.handleKeyDown`)

  // --- Actions ---

  const actions: TableActions = {
    sortBy,
    clearSort,
    selectRow,
    deselectRow,
    toggleRowSelection,
    selectAllRows,
    clearSelection,
    moveFocus,
    moveFocusToStart,
    moveFocusToEnd,
    moveFocusToRowStart,
    moveFocusToRowEnd,
    setFocusedCell,
    pageUp: pageUpAction,
    pageDown: pageDownAction,
    handleKeyDown,
  }

  // --- Contracts ---

  const getRowPositionalIndex = (rowId: string): number => {
    const idx = rowIdsList.indexOf(rowId)
    return idx >= 0 ? idx : -1
  }

  const getColumnPositionalIndex = (columnId: string): number => {
    for (let i = 0; i < options.columns.length; i++) {
      if (options.columns[i]!.id === columnId) return i
    }
    return -1
  }

  const contracts: TableContracts = {
    getTableProps() {
      const props: TableProps = {
        id: `${idBase}-root`,
        role: interactive ? 'grid' : 'table',
        'aria-label': options.ariaLabel,
        'aria-labelledby': options.ariaLabelledBy,
        'aria-rowcount': rowCountAtom(),
        'aria-colcount': columnCountAtom(),
      }

      if (selectable === 'multi') {
        props['aria-multiselectable'] = 'true'
      }

      if (interactive) {
        props.tabindex = '0'
      }

      return props
    },
    getRowProps(rowId: string) {
      if (!rowIds.has(rowId)) {
        throw new Error(`Unknown table row id: ${rowId}`)
      }

      const props: TableRowProps = {
        id: `${idBase}-row-${rowId}`,
        role: 'row',
        'aria-rowindex': rowIndexMap.get(rowId) ?? 1,
      }

      if (selectable !== false) {
        props['aria-selected'] = selectedRowIdsAtom().has(rowId) ? 'true' : 'false'
      }

      return props
    },
    getCellProps(rowId: string, columnId: string, span?: {colspan?: number; rowspan?: number}) {
      if (!rowIds.has(rowId)) {
        throw new Error(`Unknown table row id for cell: ${rowId}`)
      }
      if (!columnIds.has(columnId)) {
        throw new Error(`Unknown table column id for cell: ${columnId}`)
      }

      const props: TableCellProps = {
        id: `${idBase}-cell-${rowId}-${columnId}`,
        role: interactive ? 'gridcell' : 'cell',
        'aria-colindex': columnIndexMap.get(columnId) ?? 1,
        'aria-colspan': span?.colspan,
        'aria-rowspan': span?.rowspan,
      }

      if (interactive) {
        const rowPos = getRowPositionalIndex(rowId)
        const colPos = getColumnPositionalIndex(columnId)
        const focusedRow = focusedRowIndexAtom()
        const focusedCol = focusedColumnIndexAtom()
        const isFocused = rowPos === focusedRow && colPos === focusedCol

        props.tabindex = isFocused ? '0' : '-1'
        props['data-active'] = isFocused ? 'true' : 'false'
      }

      return props
    },
    getColumnHeaderProps(columnId: string) {
      if (!columnIds.has(columnId)) {
        throw new Error(`Unknown table column id for header: ${columnId}`)
      }

      const isSorted = sortColumnIdAtom() === columnId
      const sortDirection = sortDirectionAtom()

      const props: TableColumnHeaderProps = {
        id: `${idBase}-column-header-${columnId}`,
        role: 'columnheader',
        'aria-colindex': columnIndexMap.get(columnId) ?? 1,
        'aria-sort': isSorted ? sortDirection : 'none',
      }

      if (interactive) {
        const colPos = getColumnPositionalIndex(columnId)
        const focusedCol = focusedColumnIndexAtom()
        // Column headers are at conceptual row -1 (above data rows);
        // they get tabindex=-1 unless no data cell is focused and we are on this header.
        // For simplicity, headers always get tabindex in interactive mode.
        props.tabindex = focusedCol === colPos && focusedRowIndexAtom() === null ? '0' : '-1'
      }

      return props
    },
    getRowHeaderProps(rowId: string, columnId: string) {
      if (!rowIds.has(rowId)) {
        throw new Error(`Unknown table row id for row header: ${rowId}`)
      }
      if (!columnIds.has(columnId)) {
        throw new Error(`Unknown table column id for row header: ${columnId}`)
      }

      return {
        id: `${idBase}-row-header-${rowId}-${columnId}`,
        role: 'rowheader',
        'aria-rowindex': rowIndexMap.get(rowId) ?? 1,
        'aria-colindex': columnIndexMap.get(columnId) ?? 1,
      }
    },
  }

  // --- State ---

  const state: TableState = {
    rowCount: rowCountAtom,
    columnCount: columnCountAtom,
    sortColumnId: sortColumnIdAtom,
    sortDirection: sortDirectionAtom,
    selectedRowIds: selectedRowIdsAtom,
    focusedRowIndex: focusedRowIndexAtom,
    focusedColumnIndex: focusedColumnIndexAtom,
    selectable,
    interactive,
  }

  return {
    state,
    actions,
    contracts,
  }
}
