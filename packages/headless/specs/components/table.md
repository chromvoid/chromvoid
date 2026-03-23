# Table Component Contract

## Purpose

`Table` provides a headless APG-aligned model for tabular data. In its default (non-interactive) mode it is a structural container navigated by screen reader reading commands. When `interactive` mode is enabled, the root role switches to `grid` and full APG keyboard cell navigation is activated. Optional row selection support (single or multi) is available in both modes.

## Component Files

- `src/table/index.ts` - model and public `createTable` API
- `src/table/table.test.ts` - unit behavior tests

## Public API

### `createTable(options: CreateTableOptions): TableModel`

### CreateTableOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `columns` | `readonly TableColumn[]` | required | Column definitions (`{ id, index? }`) |
| `rows` | `readonly TableRow[]` | required | Row definitions (`{ id, index? }`) |
| `totalColumnCount` | `number` | `columns.length` | Logical column count (for virtualization) |
| `totalRowCount` | `number` | `rows.length` | Logical row count (for virtualization) |
| `initialSortColumnId` | `string \| null` | `null` | Initial sort column |
| `initialSortDirection` | `TableSortDirection` | `'none'` | Initial sort direction |
| `ariaLabel` | `string` | -- | Static `aria-label` for the table root |
| `ariaLabelledBy` | `string` | -- | `aria-labelledby` reference for the table root |
| `idBase` | `string` | `'table'` | Prefix for generated DOM ids |
| `selectable` | `'single' \| 'multi' \| false` | `false` | Row selection mode |
| `initialSelectedRowIds` | `readonly string[]` | `[]` | Initial selected row ids (filtered for validity on create) |
| `interactive` | `boolean` | `false` | Enable grid navigation mode |
| `initialFocusedRowIndex` | `number \| null` | `null` | Initial focused row index (interactive mode only) |
| `initialFocusedColumnIndex` | `number \| null` | `null` | Initial focused column index (interactive mode only) |
| `pageSize` | `number` | `10` | Rows per page for PageUp/PageDown (interactive mode only, minimum 1) |

### State (signal-backed)

| Signal | Type | Description |
|---|---|---|
| `rowCount` | `Computed<number>` | `max(totalRowCount, rows.length)` |
| `columnCount` | `Computed<number>` | `max(totalColumnCount, columns.length)` |
| `sortColumnId` | `Atom<string \| null>` | Currently sorted column id |
| `sortDirection` | `Atom<TableSortDirection>` | `'ascending' \| 'descending' \| 'none'` |
| `selectedRowIds` | `Atom<Set<string>>` | Set of selected row ids (empty when `selectable` is `false`) |
| `focusedRowIndex` | `Atom<number \| null>` | Currently focused row index (null when `interactive` is `false` or no focus) |
| `focusedColumnIndex` | `Atom<number \| null>` | Currently focused column index (null when `interactive` is `false` or no focus) |

Static config values exposed on state for adapter convenience:

| Property | Type | Description |
|---|---|---|
| `selectable` | `'single' \| 'multi' \| false` | Current selection mode (from config) |
| `interactive` | `boolean` | Whether grid navigation is active (from config) |

### Actions

#### Sorting

| Action | Signature | Description |
|---|---|---|
| `sortBy` | `(columnId: string, direction: TableSortDirection) => void` | Set sort column and direction |
| `clearSort` | `() => void` | Reset sort to `none` |

#### Selection

| Action | Signature | Description |
|---|---|---|
| `selectRow` | `(rowId: string) => void` | Select a row. In single mode, clears other selections first. No-op when `selectable` is `false` or `rowId` is unknown. |
| `deselectRow` | `(rowId: string) => void` | Deselect a row. No-op when `selectable` is `false` or `rowId` is not selected. |
| `toggleRowSelection` | `(rowId: string) => void` | Toggle selection state for a row. In single mode, toggling on clears other selections. No-op when `selectable` is `false`. |
| `selectAllRows` | `() => void` | Select all rows. Only works in `multi` mode. No-op when `selectable` is not `multi`. |
| `clearSelection` | `() => void` | Clear all row selections. No-op when `selectable` is `false`. |

#### Grid Navigation (interactive mode only)

All navigation actions are no-ops when `interactive` is `false`.

| Action | Signature | Description |
|---|---|---|
| `moveFocus` | `(direction: 'up' \| 'down' \| 'left' \| 'right') => void` | Move focused cell one step in the given direction. No change at boundary. |
| `moveFocusToStart` | `() => void` | Move focus to first cell (row 0, column 0). Equivalent to Ctrl+Home. |
| `moveFocusToEnd` | `() => void` | Move focus to last cell (last row, last column). Equivalent to Ctrl+End. |
| `moveFocusToRowStart` | `() => void` | Move focus to first cell in the current row. Equivalent to Home. |
| `moveFocusToRowEnd` | `() => void` | Move focus to last cell in the current row. Equivalent to End. |
| `setFocusedCell` | `(rowIndex: number, columnIndex: number) => void` | Programmatically set the focused cell. Clamped to valid bounds. |
| `pageUp` | `() => void` | Move focus up by `pageSize` rows (clamped). |
| `pageDown` | `() => void` | Move focus down by `pageSize` rows (clamped). |
| `handleKeyDown` | `(event: TableKeyboardEventLike) => void` | Delegates keyboard events to navigation/selection actions. Only active in interactive mode. |

### Contracts (ready-to-spread ARIA prop objects)

| Contract | Return Type | Description |
|---|---|---|
| `getTableProps()` | `TableProps` | ARIA attributes for the table/grid root element |
| `getRowProps(rowId)` | `TableRowProps` | ARIA attributes for a row element |
| `getCellProps(rowId, colId, span?)` | `TableCellProps` | ARIA attributes for a data cell |
| `getColumnHeaderProps(colId)` | `TableColumnHeaderProps` | ARIA attributes for a column header |
| `getRowHeaderProps(rowId, colId)` | `TableRowHeaderProps` | ARIA attributes for a row header cell |

#### `TableProps`

| Prop | Type | Notes |
|---|---|---|
| `id` | `string` | `"{idBase}-root"` |
| `role` | `'table' \| 'grid'` | `'table'` when `interactive` is false, `'grid'` when true |
| `aria-label` | `string \| undefined` | From options |
| `aria-labelledby` | `string \| undefined` | From options |
| `aria-rowcount` | `number` | From `rowCount` computed |
| `aria-colcount` | `number` | From `columnCount` computed |
| `aria-multiselectable` | `'true' \| undefined` | Present only when `selectable` is `'multi'` |
| `tabindex` | `'0' \| undefined` | `'0'` when `interactive` is true (grid root receives focus), undefined when false |

#### `TableRowProps`

| Prop | Type | Notes |
|---|---|---|
| `id` | `string` | `"{idBase}-row-{rowId}"` |
| `role` | `'row'` | Always `'row'` regardless of mode |
| `aria-rowindex` | `number` | 1-based; uses `row.index` if provided, else positional index + 1 |
| `aria-selected` | `'true' \| 'false' \| undefined` | Present only when `selectable` is not `false`. Reflects selection state. |

#### `TableCellProps`

| Prop | Type | Notes |
|---|---|---|
| `id` | `string` | `"{idBase}-cell-{rowId}-{colId}"` |
| `role` | `'cell' \| 'gridcell'` | `'cell'` when `interactive` is false, `'gridcell'` when true |
| `aria-colindex` | `number` | 1-based column index |
| `aria-colspan` | `number \| undefined` | From span parameter |
| `aria-rowspan` | `number \| undefined` | From span parameter |
| `tabindex` | `'0' \| '-1' \| undefined` | Present only in interactive mode. `'0'` for the focused cell, `'-1'` for all others (roving tabindex). |
| `data-active` | `'true' \| 'false' \| undefined` | Present only in interactive mode. Indicates currently focused cell. |

#### `TableColumnHeaderProps`

| Prop | Type | Notes |
|---|---|---|
| `id` | `string` | `"{idBase}-column-header-{colId}"` |
| `role` | `'columnheader'` | Always `'columnheader'` |
| `aria-colindex` | `number` | 1-based column index |
| `aria-sort` | `TableSortDirection` | Sort state for this column |
| `tabindex` | `'0' \| '-1' \| undefined` | Present only in interactive mode. Roving tabindex (headers participate in grid navigation). |

#### `TableRowHeaderProps`

| Prop | Type | Notes |
|---|---|---|
| `id` | `string` | `"{idBase}-row-header-{rowId}-{colId}"` |
| `role` | `'rowheader'` | Always `'rowheader'` |
| `aria-rowindex` | `number` | 1-based row index |
| `aria-colindex` | `number` | 1-based column index |

## APG and A11y Contract

### Non-interactive mode (default)

- root role: `table`
- row role: `row`
- cell role: `cell`
- header roles: `columnheader`, `rowheader`
- required attributes:
  - root: `aria-label` or `aria-labelledby`, `aria-colcount`, `aria-rowcount`
  - row: `aria-rowindex`, `aria-selected` (when selectable)
  - cell: `aria-colindex`, `aria-colspan`, `aria-rowspan`
  - header: `aria-sort` (if applicable)
- `Table` is a static structure; users navigate it using screen reader reading commands.
- If a cell contains interactive elements, those elements are part of the page's tab sequence.

### Interactive mode (`interactive: true`)

- root role: `grid`
- row role: `row`
- cell role: `gridcell`
- header roles: `columnheader`, `rowheader`
- focus management: roving tabindex on cells
- required attributes:
  - root: `aria-label` or `aria-labelledby`, `aria-colcount`, `aria-rowcount`, `tabindex="0"`, `aria-multiselectable` (if multi-select)
  - row: `aria-rowindex`, `aria-selected` (when selectable)
  - cell: `aria-colindex`, `tabindex`, `data-active`

### Selection attributes (both modes)

- When `selectable` is not `false`:
  - `aria-selected` is present on every `row` element (`'true'` or `'false'`)
  - `aria-multiselectable="true"` is on root when `selectable` is `'multi'`

## Keyboard Contract (interactive mode only)

| Key | Modifier | Action |
|---|---|---|
| `ArrowUp` | -- | `moveFocus('up')` |
| `ArrowDown` | -- | `moveFocus('down')` |
| `ArrowLeft` | -- | `moveFocus('left')` |
| `ArrowRight` | -- | `moveFocus('right')` |
| `Home` | -- | `moveFocusToRowStart()` |
| `End` | -- | `moveFocusToRowEnd()` |
| `Home` | Ctrl / Meta | `moveFocusToStart()` |
| `End` | Ctrl / Meta | `moveFocusToEnd()` |
| `PageUp` | -- | `pageUp()` |
| `PageDown` | -- | `pageDown()` |
| `Space` | -- | `toggleRowSelection(focusedRowId)` (when selectable) |
| `Ctrl/Cmd + A` | -- | `selectAllRows()` (when selectable is multi) |

## Transitions Table

### Sorting Transitions

| Trigger | Preconditions | Next State |
|---|---|---|
| `sortBy(columnId, dir)` | `columnId` exists, `dir` is not `'none'` | `sortColumnId=columnId`, `sortDirection=dir` |
| `sortBy(columnId, 'none')` | any | `sortColumnId=null`, `sortDirection='none'` |
| `clearSort()` | any | `sortColumnId=null`, `sortDirection='none'` |

### Selection Transitions

| Trigger | Preconditions | Next State |
|---|---|---|
| `selectRow(rowId)` | `selectable='single'`, `rowId` is known | `selectedRowIds={rowId}` (clears previous) |
| `selectRow(rowId)` | `selectable='multi'`, `rowId` is known | `selectedRowIds` adds `rowId` |
| `deselectRow(rowId)` | `selectable` is not `false`, `rowId` in set | `selectedRowIds` removes `rowId` |
| `toggleRowSelection(rowId)` | `selectable='single'`, `rowId` not selected | `selectedRowIds={rowId}` |
| `toggleRowSelection(rowId)` | `selectable='single'`, `rowId` selected | `selectedRowIds={}` |
| `toggleRowSelection(rowId)` | `selectable='multi'`, `rowId` not selected | `selectedRowIds` adds `rowId` |
| `toggleRowSelection(rowId)` | `selectable='multi'`, `rowId` selected | `selectedRowIds` removes `rowId` |
| `selectAllRows()` | `selectable='multi'` | `selectedRowIds` = all known row ids |
| `selectAllRows()` | `selectable` is not `'multi'` | no-op |
| `clearSelection()` | `selectable` is not `false` | `selectedRowIds={}` |
| `clearSelection()` | `selectable=false` | no-op |

### Grid Navigation Transitions (interactive mode only)

| Trigger | Preconditions | Next State |
|---|---|---|
| `moveFocus('up')` | `focusedRowIndex > 0` | `focusedRowIndex -= 1` |
| `moveFocus('up')` | `focusedRowIndex = 0` | no change |
| `moveFocus('down')` | `focusedRowIndex < rowCount - 1` | `focusedRowIndex += 1` |
| `moveFocus('down')` | `focusedRowIndex = rowCount - 1` | no change |
| `moveFocus('left')` | `focusedColumnIndex > 0` | `focusedColumnIndex -= 1` |
| `moveFocus('left')` | `focusedColumnIndex = 0` | no change |
| `moveFocus('right')` | `focusedColumnIndex < columnCount - 1` | `focusedColumnIndex += 1` |
| `moveFocus('right')` | `focusedColumnIndex = columnCount - 1` | no change |
| `moveFocusToStart()` | any | `focusedRowIndex=0`, `focusedColumnIndex=0` |
| `moveFocusToEnd()` | any | `focusedRowIndex=rowCount-1`, `focusedColumnIndex=columnCount-1` |
| `moveFocusToRowStart()` | any | `focusedColumnIndex=0` |
| `moveFocusToRowEnd()` | any | `focusedColumnIndex=columnCount-1` |
| `setFocusedCell(r, c)` | any | `focusedRowIndex=clamp(r, 0, rowCount-1)`, `focusedColumnIndex=clamp(c, 0, columnCount-1)` |
| `pageUp()` | any | `focusedRowIndex=max(0, focusedRowIndex - pageSize)` |
| `pageDown()` | any | `focusedRowIndex=min(rowCount-1, focusedRowIndex + pageSize)` |

### Keyboard to Action Mapping (interactive mode)

| Key Event | Mapped Action |
|---|---|
| `ArrowUp` | `moveFocus('up')` |
| `ArrowDown` | `moveFocus('down')` |
| `ArrowLeft` | `moveFocus('left')` |
| `ArrowRight` | `moveFocus('right')` |
| `Home` | `moveFocusToRowStart()` |
| `End` | `moveFocusToRowEnd()` |
| `Ctrl+Home` / `Meta+Home` | `moveFocusToStart()` |
| `Ctrl+End` / `Meta+End` | `moveFocusToEnd()` |
| `PageUp` | `pageUp()` |
| `PageDown` | `pageDown()` |
| `Space` (when selectable) | `toggleRowSelection(rows[focusedRowIndex].id)` |
| `Ctrl+A` / `Meta+A` (when selectable=multi) | `selectAllRows()` |

## Invariants

### General
- `aria-rowcount` and `aria-colcount` must reflect the total number of rows and columns in the data set, even if only a subset is rendered.
- `aria-rowindex` and `aria-colindex` must be 1-based and reflect the position in the total data set.
- `getRowProps`, `getCellProps`, `getColumnHeaderProps`, `getRowHeaderProps` throw `Error` for unknown row/column ids.

### Selection
- When `selectable` is `false`, `selectedRowIds` is always empty and selection actions are no-ops.
- In `single` mode, `selectedRowIds` contains at most one id.
- `selectRow` in `single` mode clears all other selections before adding the new one.
- `selectAllRows` only has effect in `multi` mode.
- `aria-selected` is present on rows only when `selectable` is not `false`.
- `aria-multiselectable` is present on root only when `selectable` is `'multi'`.
- `initialSelectedRowIds` are filtered on create: unknown row ids are excluded. In single mode, only the first valid id is kept.

### Grid Navigation
- When `interactive` is `false`, `focusedRowIndex` and `focusedColumnIndex` are always `null` and navigation actions are no-ops.
- When `interactive` is `true`, exactly one cell has `tabindex="0"` (roving tabindex); all other cells have `tabindex="-1"`.
- `focusedRowIndex` and `focusedColumnIndex` stay within grid bounds: `[0, rowCount-1]` and `[0, columnCount-1]` respectively.
- When `interactive` is `true` and initial focus indices are not provided, focus defaults to `(0, 0)`.
- Role switches: root is `'grid'` (not `'table'`), data cells are `'gridcell'` (not `'cell'`).
- `handleKeyDown` is a no-op when `interactive` is `false`.

## Adapter Expectations

UIKit adapter will:

**Signals read (reactive, drive re-renders):**
- `state.rowCount()` -- total row count
- `state.columnCount()` -- total column count
- `state.sortColumnId()` -- currently sorted column id
- `state.sortDirection()` -- sort direction
- `state.selectedRowIds()` -- set of selected row ids
- `state.focusedRowIndex()` -- focused row index (interactive mode)
- `state.focusedColumnIndex()` -- focused column index (interactive mode)
- `state.selectable` -- selection mode (static, for conditional rendering)
- `state.interactive` -- interactive mode flag (static, for conditional rendering)

**Actions called (event handlers, never mutate state directly):**
- `actions.sortBy(columnId, direction)` -- column header click
- `actions.clearSort()` -- reset sort
- `actions.selectRow(rowId)` -- row click (single select)
- `actions.deselectRow(rowId)` -- row deselect
- `actions.toggleRowSelection(rowId)` -- row click (toggle)
- `actions.selectAllRows()` -- select-all checkbox/shortcut
- `actions.clearSelection()` -- clear all selections
- `actions.moveFocus(direction)` -- arrow key navigation (interactive)
- `actions.moveFocusToStart()` / `actions.moveFocusToEnd()` -- Ctrl+Home/End (interactive)
- `actions.moveFocusToRowStart()` / `actions.moveFocusToRowEnd()` -- Home/End (interactive)
- `actions.setFocusedCell(rowIndex, columnIndex)` -- programmatic focus / cell click (interactive)
- `actions.pageUp()` / `actions.pageDown()` -- PageUp/PageDown (interactive)
- `actions.handleKeyDown(event)` -- keyboard delegation (interactive)

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getTableProps()` -- spread onto table/grid root element
- `contracts.getRowProps(rowId)` -- spread onto each row element
- `contracts.getCellProps(rowId, colId, span?)` -- spread onto each data cell
- `contracts.getColumnHeaderProps(colId)` -- spread onto each column header
- `contracts.getRowHeaderProps(rowId, colId)` -- spread onto row header cells

**UIKit-only concerns (NOT in headless):**
- Display variants (striped, compact, bordered) -- CSS-only
- Sticky header positioning -- CSS-only
- Visual selection indicators (checkbox column, row highlighting)
- DOM focus management (calling `.focus()` on cells when `focusedRowIndex`/`focusedColumnIndex` change)
- `preventDefault()` on keyboard events handled by `handleKeyDown`

## Minimum Test Matrix

### Structural (existing)
- correct structural ARIA roles (`table`, `row`, `cell`)
- 1-based index mapping for `aria-rowindex` and `aria-colindex`
- `aria-sort` state transitions when `sortBy` is called
- support for `colspan` and `rowspan` metadata in `getCellProps`
- virtualization support (correct total counts vs rendered counts)

### Selection
- `selectable=false`: no `aria-selected` on rows, selection actions are no-ops
- `selectable='single'`: `selectRow` replaces current selection
- `selectable='single'`: `selectedRowIds` contains at most one id
- `selectable='single'`: `toggleRowSelection` toggles single row on/off
- `selectable='single'`: `selectAllRows` is a no-op
- `selectable='multi'`: `selectRow` adds to selection
- `selectable='multi'`: `toggleRowSelection` adds/removes individual row
- `selectable='multi'`: `selectAllRows` selects all known rows
- `selectable='multi'`: `clearSelection` empties selection set
- `aria-multiselectable="true"` present only when `selectable='multi'`
- `aria-selected` present on every row when `selectable` is not `false`
- `initialSelectedRowIds` filtered for validity and mode constraints

### Grid Navigation (interactive mode)
- `interactive=false`: roles are `table`/`cell`, no `tabindex` on cells, navigation actions are no-ops
- `interactive=true`: root role is `grid`, cell role is `gridcell`
- `interactive=true`: exactly one cell has `tabindex="0"` (roving tabindex)
- arrow key navigation moves focus within bounds
- boundary clamping (no wrap, no change at edges)
- Home/End navigate to row start/end
- Ctrl+Home/End navigate to grid start/end
- PageUp/PageDown move by `pageSize` rows (clamped)
- `setFocusedCell` clamps to valid bounds
- `handleKeyDown` delegates to correct navigation actions
- Space key triggers `toggleRowSelection` when selectable
- Ctrl+A triggers `selectAllRows` when selectable is multi
- default focus is `(0, 0)` when interactive and no initial focus provided

### Combined Modes
- interactive + selectable: Space key selects focused row
- interactive + selectable='multi': Ctrl+A selects all rows
- non-interactive + selectable: selection works without grid navigation

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- cell-level selection (only row selection is supported; use `Grid` for cell selection)
- cell editing mode (inline inputs)
- column/row reordering (drag and drop)
- column resizing
- complex filtering logic (should be handled in the model/service layer)
- `aria-activedescendant` focus strategy (only roving tabindex is supported in interactive mode)
