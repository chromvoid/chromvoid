# Grid Component Contract

## Purpose

`Grid` provides a headless APG-aligned model for interactive tabular data, enabling users to navigate across rows and columns using directional keys.

## Component Files

- `src/grid/index.ts` - model and public `createGrid` API
- `src/grid/grid.test.ts` - unit behavior tests

## Public API

### `createGrid(options): GridModel`

#### Options (`CreateGridOptions`)

| Option | Type | Default | Description |
|---|---|---|---|
| `rows` | `readonly GridRow[]` | required | Row definitions (`{ id, index?, disabled? }`) |
| `columns` | `readonly GridColumn[]` | required | Column definitions (`{ id, index?, disabled? }`) |
| `disabledCells` | `readonly GridCellId[]` | `[]` | Individually disabled cells |
| `idBase` | `string` | `'grid'` | Prefix for generated DOM ids |
| `ariaLabel` | `string` | — | Static `aria-label` for the grid root |
| `ariaLabelledBy` | `string` | — | `aria-labelledby` reference for the grid root |
| `focusStrategy` | `'roving-tabindex' \| 'aria-activedescendant'` | `'roving-tabindex'` | Focus management strategy |
| `selectionMode` | `'single' \| 'multiple'` | `'single'` | Whether multi-cell selection is allowed |
| `selectionFollowsFocus` | `boolean` | `false` | Auto-select cell on focus move |
| `totalRowCount` | `number` | `rows.length` | Logical row count (for virtualization) |
| `totalColumnCount` | `number` | `columns.length` | Logical column count (for virtualization) |
| `pageSize` | `number` | `10` | Rows per page for PageUp/PageDown (minimum 1) |
| `initialActiveCellId` | `GridCellId \| null` | `null` | Initial active cell (normalized on create) |
| `initialSelectedCellIds` | `readonly GridCellId[]` | `[]` | Initial selected cells (filtered for validity) |
| `isReadOnly` | `boolean` | `false` | Marks all cells as `aria-readonly` |

### State (signal-backed)

- `activeCellId: Atom<GridCellId | null>` - currently focused cell `{ rowId, colId }`, or `null`
- `selectedCellIds: Atom<Set<string>>` - set of selected cell keys (format: `"rowId::colId"`)
- `rowCount: Computed<number>` - `max(totalRowCount, rows.length)`
- `columnCount: Computed<number>` - `max(totalColumnCount, columns.length)`

### Actions

- **focus**: `setActiveCell(cell: GridCellId)` - set active cell (normalizes to nearest valid cell; syncs selection if `selectionFollowsFocus`)
- **navigation**: `moveUp`, `moveDown`, `moveLeft`, `moveRight`, `moveRowStart`, `moveRowEnd`, `moveGridStart`, `moveGridEnd`, `pageUp`, `pageDown`
- **selection**: `selectCell(cell)`, `toggleCellSelection(cell)`, `selectRow(rowId)`, `selectColumn(colId)`
- **keyboard**: `handleKeyDown(event: GridKeyboardEventLike)` - dispatches to navigation/selection actions based on key

### Contracts (ready-to-spread ARIA prop objects)

- `getGridProps(): GridProps`
- `getRowProps(rowId: string): GridRowProps`
- `getCellProps(rowId: string, colId: string): GridCellProps`

#### `GridProps`

| Prop | Type | Notes |
|---|---|---|
| `id` | `string` | `"{idBase}-root"` |
| `role` | `'grid'` | |
| `tabindex` | `'0' \| '-1'` | `'0'` for `aria-activedescendant` strategy, `'-1'` for `roving-tabindex` |
| `aria-label` | `string \| undefined` | From options |
| `aria-labelledby` | `string \| undefined` | From options |
| `aria-multiselectable` | `'true' \| 'false'` | Based on `selectionMode` |
| `aria-colcount` | `number` | From `columnCount` computed |
| `aria-rowcount` | `number` | From `rowCount` computed |
| `aria-activedescendant` | `string \| undefined` | Cell DOM id when using `aria-activedescendant` strategy |

#### `GridRowProps`

| Prop | Type | Notes |
|---|---|---|
| `id` | `string` | `"{idBase}-row-{rowId}"` |
| `role` | `'row'` | |
| `aria-rowindex` | `number` | 1-based; uses `row.index` if provided, else positional index + 1 |

#### `GridCellProps`

| Prop | Type | Notes |
|---|---|---|
| `id` | `string` | `"{idBase}-cell-{rowId}-{colId}"` |
| `role` | `'gridcell'` | |
| `tabindex` | `'0' \| '-1'` | `'0'` only for active cell in `roving-tabindex` mode (and not disabled) |
| `aria-colindex` | `number` | 1-based; uses `column.index` if provided, else positional index + 1 |
| `aria-selected` | `'true' \| 'false'` | Whether cell is in `selectedCellIds` |
| `aria-readonly` | `'true' \| undefined` | Set when `isReadOnly` option is true |
| `aria-disabled` | `'true' \| undefined` | Set when cell is disabled (row disabled, column disabled, or in `disabledCells`) |
| `data-active` | `'true' \| 'false'` | Whether cell is the active cell |
| `onFocus` | `() => void` | Calls `setActiveCell` for this cell |

## APG and A11y Contract

- root role: `grid`
- row role: `row`
- cell role: `gridcell`
- focus strategies:
  - `roving-tabindex` (default) - active cell gets `tabindex="0"`, all others `tabindex="-1"`
  - `aria-activedescendant` - grid root gets `tabindex="0"` and `aria-activedescendant` pointing to active cell DOM id
- required attributes:
  - root: `aria-label` or `aria-labelledby`, `aria-multiselectable`, `aria-colcount`, `aria-rowcount`
  - row: `aria-rowindex`
  - cell: `aria-colindex`, `aria-selected`, `aria-readonly`, `tabindex`

## Keyboard Contract

| Key | Modifier | Action |
|---|---|---|
| `ArrowUp` | — | `moveUp()` |
| `ArrowDown` | — | `moveDown()` |
| `ArrowLeft` | — | `moveLeft()` |
| `ArrowRight` | — | `moveRight()` |
| `Home` | — | `moveRowStart()` |
| `End` | — | `moveRowEnd()` |
| `Home` | Ctrl / Meta | `moveGridStart()` |
| `End` | Ctrl / Meta | `moveGridEnd()` |
| `PageUp` | — | `pageUp()` |
| `PageDown` | — | `pageDown()` |
| `Enter` | — | `moveDown()` |
| `Space` | — | `toggleCellSelection(activeCell)` (multiple mode) or `selectCell(activeCell)` (single mode) |

## Transitions Table

| Trigger | Current State | Action | Next State |
|---|---|---|---|
| Arrow key | any active cell | `moveUp/Down/Left/Right` | Active cell moves to nearest non-disabled cell in direction; no change at boundary |
| Home | active cell | `moveRowStart` | Active cell moves to first enabled cell in current row |
| End | active cell | `moveRowEnd` | Active cell moves to last enabled cell in current row |
| Ctrl+Home | active cell | `moveGridStart` | Active cell moves to first enabled cell in entire grid |
| Ctrl+End | active cell | `moveGridEnd` | Active cell moves to last enabled cell in entire grid |
| PageUp | active cell | `pageUp` | Active cell moves up by `pageSize` rows (clamped), skipping disabled |
| PageDown | active cell | `pageDown` | Active cell moves down by `pageSize` rows (clamped), skipping disabled |
| Enter | active cell | `moveDown` | Active cell moves to next row (same column) |
| Space | active cell, single mode | `selectCell(activeCell)` | `selectedCellIds` set to `{activeCell}` |
| Space | active cell, multiple mode | `toggleCellSelection(activeCell)` | `selectedCellIds` toggled for active cell |
| `setActiveCell(cell)` | any | normalize + set | Active cell set to normalized cell; if `selectionFollowsFocus`, selection synced |
| `selectRow(rowId)` | any | select all enabled cells in row | `selectedCellIds` set to enabled cells in row (single mode: first only) |
| `selectColumn(colId)` | any | select all enabled cells in column | `selectedCellIds` set to enabled cells in column (single mode: first only) |

## Invariants

- `activeCellId` must always point to a valid, non-disabled cell if the grid has any enabled cells; `null` only when no enabled cells exist
- `activeCellId` is normalized on creation: invalid or disabled initial values fall back to the first enabled cell
- `aria-rowcount` and `aria-colcount` must match the logical dimensions, even if only a subset is rendered (virtualization)
- Selection state is independent of focus unless `selectionFollowsFocus` is enabled
- Disabled cells (via row `disabled`, column `disabled`, or `disabledCells`) are always skipped during keyboard navigation
- `initialSelectedCellIds` are filtered on creation: disabled or non-existent cells are excluded
- `getRowProps` and `getCellProps` throw `Error` for unknown row/cell ids

## Adapter Expectations

UIKit (or any rendering adapter) must:

1. **Render structure**: create elements for grid root, rows, and cells; spread the prop objects from `getGridProps()`, `getRowProps()`, `getCellProps()` onto the respective elements
2. **Wire keyboard**: attach a `keydown` listener on the grid root that calls `actions.handleKeyDown(event)` and calls `event.preventDefault()` for handled keys
3. **Manage DOM focus**: when `activeCellId` changes, call `.focus()` on the corresponding cell element (for `roving-tabindex` strategy) — the headless model sets `tabindex` but does not perform DOM focus
4. **Subscribe to state**: re-render when `state.activeCellId` or `state.selectedCellIds` change, so that contract prop objects reflect the latest values
5. **Forward `onFocus`**: the `onFocus` handler in `getCellProps` must be connected to the cell element's `focus` event so that clicking or tabbing into a cell updates the model
6. **Prevent default**: adapter should `preventDefault()` on keyboard events that the grid handles, to avoid page scroll on arrow/space keys

## Minimum Test Matrix

- 2D navigation (arrows) across rows and columns
- boundary handling (Home, End, Ctrl+Home, Ctrl+End)
- skipping disabled cells during navigation
- multi-selection behavior (if enabled)
- correct ARIA attribute mapping for virtualized grids
- focus strategy parity (`roving-tabindex` vs `aria-activedescendant`)
- Space key selection (single and multiple mode)
- Enter key navigation
- `selectionFollowsFocus` behavior
- initial state normalization (invalid `initialActiveCellId`, disabled cells in `initialSelectedCellIds`)

## ADR-001 Compliance

- **Runtime Policy**: Reatom only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- cell editing mode (inline inputs)
- column/row reordering (drag and drop)
- column resizing
- context menu integration
