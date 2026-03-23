# Treegrid Component Contract

## Purpose

`Treegrid` provides a headless APG-aligned model for hierarchical tabular data, combining the multi-column structure of a `Grid` with the expansion/collapse behavior of a `Treeview`.

## Component Files

- `src/treegrid/index.ts` - model and public `createTreegrid` API
- `src/treegrid/treegrid.test.ts` - unit behavior tests

## Exported Types

```ts
type TreegridSelectionMode = 'single' | 'multiple'
type TreegridCellRole = 'gridcell' | 'rowheader' | 'columnheader'

interface TreegridRow {
  id: string
  index?: number
  disabled?: boolean
  children?: readonly TreegridRow[]
}

interface TreegridColumn {
  id: string
  index?: number
  disabled?: boolean
  cellRole?: TreegridCellRole
}

interface TreegridCellId {
  rowId: string
  colId: string
}

interface TreegridKeyboardEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

interface TreegridState {
  activeCellId: Atom<TreegridCellId | null>
  expandedRowIds: Atom<Set<string>>
  selectedRowIds: Atom<Set<string>>
  rowCount: Computed<number>
  columnCount: Computed<number>
}

interface TreegridActions {
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

interface TreegridContracts {
  getTreegridProps(): TreegridProps
  getRowProps(rowId: string): TreegridRowProps
  getCellProps(rowId: string, colId: string): TreegridCellProps
}

interface TreegridModel {
  readonly state: TreegridState
  readonly actions: TreegridActions
  readonly contracts: TreegridContracts
}
```

## Options (`CreateTreegridOptions`)

| Option                  | Type                        | Default        | Description                                                  |
|-------------------------|-----------------------------|----------------|--------------------------------------------------------------|
| `rows`                  | `readonly TreegridRow[]`    | required       | Hierarchical row definitions (children nested recursively)   |
| `columns`               | `readonly TreegridColumn[]` | required       | Column definitions with optional role and disabled state      |
| `disabledCells`         | `readonly TreegridCellId[]` | `[]`           | Individual cells disabled beyond row/column level            |
| `idBase`                | `string`                    | `'treegrid'`   | Prefix for all generated DOM ids and atom names              |
| `ariaLabel`             | `string`                    | `undefined`    | `aria-label` for the root treegrid element                   |
| `ariaLabelledBy`        | `string`                    | `undefined`    | `aria-labelledby` for the root treegrid element              |
| `selectionMode`         | `TreegridSelectionMode`     | `'single'`     | Single or multi-row selection                                |
| `initialExpandedRowIds` | `readonly string[]`         | `[]`           | Row ids that begin expanded; invalid/leaf ids are filtered   |
| `initialActiveCellId`   | `TreegridCellId \| null`    | `null`         | Initially active cell; normalized to first enabled cell      |
| `initialSelectedRowIds` | `readonly string[]`         | `[]`           | Initially selected rows; trimmed to 1 for single mode        |

## Public API

### `createTreegrid(options: CreateTreegridOptions): TreegridModel`

Returns a `TreegridModel` with three namespaces:

### `state` (signal-backed)

| Signal        | Type                      | Description                                         |
|---------------|---------------------------|-----------------------------------------------------|
| `activeCellId`  | `Atom<TreegridCellId \| null>` | Currently focused cell; `null` when grid is empty |
| `expandedRowIds` | `Atom<Set<string>>`      | Set of expanded branch row identifiers              |
| `selectedRowIds` | `Atom<Set<string>>`      | Set of selected row identifiers                     |
| `rowCount`      | `Computed<number>`         | Total number of rows (all, not just visible)        |
| `columnCount`   | `Computed<number>`         | Total number of columns                             |

### `actions`

| Action                          | Description                                                              |
|---------------------------------|--------------------------------------------------------------------------|
| `moveUp()`                      | Move active cell to the same column in the previous visible enabled row  |
| `moveDown()`                    | Move active cell to the same column in the next visible enabled row      |
| `moveLeft()`                    | APG ArrowLeft behavior (see Keyboard Contract)                           |
| `moveRight()`                   | APG ArrowRight behavior (see Keyboard Contract)                          |
| `moveRowStart()`                | Move active cell to the first enabled cell in the current row            |
| `moveRowEnd()`                  | Move active cell to the last enabled cell in the current row             |
| `expandRow(rowId: string)`      | Expand a branch row; no-op on leaf rows or already-expanded rows         |
| `collapseRow(rowId: string)`    | Collapse a branch row; migrates focus if active cell is a descendant     |
| `toggleRowExpanded(rowId: string)` | Toggle expanded state of a branch row                               |
| `selectRow(rowId: string)`      | Replace selection with the given row (single and multiple modes)         |
| `toggleRowSelection(rowId: string)` | In multiple mode: add/remove from selection; in single mode: set   |
| `handleKeyDown(event: TreegridKeyboardEventLike)` | Dispatch keyboard events to the appropriate action       |

Note: `moveGridStart` (Ctrl+Home) and `moveGridEnd` (Ctrl+End) are internal actions invoked via `handleKeyDown` and are not exposed on the `actions` interface.

### `contracts`

| Contract                                    | Description                                              |
|---------------------------------------------|----------------------------------------------------------|
| `getTreegridProps(): TreegridProps`         | Props to spread on the root `[role=treegrid]` element    |
| `getRowProps(rowId: string): TreegridRowProps` | Props to spread on each `[role=row]` element          |
| `getCellProps(rowId: string, colId: string): TreegridCellProps` | Props to spread on each cell element |

## Contract Prop Shapes

### `TreegridProps` (root element)

```ts
interface TreegridProps {
  id: string                         // `${idBase}-root`
  role: 'treegrid'
  tabindex: '-1'
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-multiselectable': 'true' | 'false'
  'aria-rowcount': number            // total row count (all rows, not just visible)
  'aria-colcount': number            // total column count
}
```

### `TreegridRowProps` (row element)

```ts
interface TreegridRowProps {
  id: string                         // `${idBase}-row-${rowId}`
  role: 'row'
  'aria-level': number               // starts at 1 for root rows
  'aria-posinset': number            // 1-based position within sibling set
  'aria-setsize': number             // total siblings count
  'aria-rowindex': number            // row.index if provided, else 1-based declaration order
  'aria-expanded'?: 'true' | 'false' // only present on branch rows
  'aria-selected': 'true' | 'false'
  'aria-disabled'?: 'true'           // only present when row is disabled
}
```

### `TreegridCellProps` (cell element)

```ts
interface TreegridCellProps {
  id: string                         // `${idBase}-cell-${rowId}-${colId}`
  role: TreegridCellRole             // from column.cellRole, defaults to 'gridcell'
  tabindex: '0' | '-1'              // '0' only for the active non-disabled cell
  'aria-colindex': number            // column.index if provided, else 1-based declaration order
  'aria-selected': 'true' | 'false'
  'aria-disabled'?: 'true'          // only present when cell is disabled
  'data-active': 'true' | 'false'
  onFocus: () => void               // calls setActiveCell to sync focus with state
}
```

## APG and A11y Contract

- root role: `treegrid`
- row role: `row`
- cell role: `gridcell`, `rowheader`, or `columnheader` (per column definition)
- required attributes:
  - root: `aria-label` or `aria-labelledby`, `aria-multiselectable`, `aria-rowcount`, `aria-colcount`
  - row: `aria-level`, `aria-posinset`, `aria-setsize`, `aria-rowindex`, `aria-expanded` (for branch rows), `aria-selected`
  - cell: `aria-selected`, `aria-colindex`, `tabindex`, `data-active`

## Keyboard Contract

- `ArrowUp` / `ArrowDown`: move focus to the cell in the previous/next visible enabled row (same column)
- `ArrowLeft`:
  - if the focused row is a branch row and is expanded: collapse it
  - if the focused row has a parent: move focus to the same column of the parent row (fallback to first enabled cell in parent if that column is disabled)
  - otherwise (root leaf row): move focus to the previous enabled cell in the same row
- `ArrowRight`:
  - if the focused row is a branch row and is collapsed: expand it (focus stays)
  - if the focused row is a branch row and is expanded: move focus to the same column of the first child row (fallback to first enabled cell in child)
  - otherwise (leaf row or no children): move focus to the next enabled cell in the same row
- `Home`: move focus to the first enabled cell in the current row
- `End`: move focus to the last enabled cell in the current row
- `Ctrl+Home` / `Meta+Home`: move focus to the first enabled cell in the first visible enabled row
- `Ctrl+End` / `Meta+End`: move focus to the last enabled cell in the last visible enabled row

## Invariants

- `activeCellId` must always point to a visible, enabled cell (not inside a collapsed branch, not disabled)
- collapsing a branch row that contains the `activeCellId` (or any descendant) migrates focus to the collapsed row (same column if not disabled, else first enabled cell in that row)
- `aria-level` starts at 1 for root rows
- `initialSelectedRowIds` is clamped to the first entry in `single` mode
- `expandRow` and `collapseRow` are no-ops on leaf rows
- disabled rows are excluded from all navigation traversal and from selection

## Minimum Test Matrix

- 2D navigation across hierarchical rows (`ArrowUp`, `ArrowDown`)
- `ArrowRight` expand then move to first child in same column
- `ArrowLeft` parent transition and collapse behavior
- focus migration when a parent row is collapsed while a descendant is active
- structural ARIA metadata (`aria-level`, `aria-posinset`, `aria-setsize`, `aria-rowindex`, `aria-expanded`, `aria-rowcount`, `aria-colcount`) correctness
- skipping disabled rows and disabled cells during navigation
- `Home` / `End` within row; `Ctrl+Home` / `Ctrl+End` across grid

## Adapter Expectations

UIKit bindings (e.g., `cv-treegrid` web component) MUST interact with the headless model as follows:

### Signals UIKit reads

| Signal                              | When to read                                               |
|-------------------------------------|------------------------------------------------------------|
| `state.activeCellId()`              | To derive which cell has `tabindex="0"` and `data-active="true"` (already embedded in `getCellProps`) |
| `state.expandedRowIds()`            | To compute which child rows are visible / to drive `aria-expanded` (already embedded in `getRowProps`) |
| `state.selectedRowIds()`            | To drive selection styling beyond ARIA (already embedded in `getRowProps` / `getCellProps`) |
| `state.rowCount()`                  | If UIKit renders a virtual list and needs the total count  |
| `state.columnCount()`               | If UIKit renders a virtual list and needs the total count  |

### Actions UIKit calls

| Action                                   | Trigger                                                      |
|------------------------------------------|--------------------------------------------------------------|
| `actions.handleKeyDown(event)`           | `keydown` event on any focusable cell or the root element    |
| `actions.toggleRowExpanded(rowId)`       | Click on expand/collapse toggle affordance                   |
| `actions.toggleRowSelection(rowId)`      | Pointer click on a row (accumulate for multi-select)         |
| `actions.selectRow(rowId)`               | Programmatic selection replacement (replaces current set)    |
| `actions.expandRow(rowId)`               | Programmatic expand                                          |
| `actions.collapseRow(rowId)`             | Programmatic collapse                                        |

### Contracts UIKit spreads

| Contract                                    | Spread target                     |
|---------------------------------------------|-----------------------------------|
| `contracts.getTreegridProps()`              | Root `<div role="treegrid">` or `<table>` wrapper |
| `contracts.getRowProps(rowId)`              | Each `<tr role="row">` or `<div role="row">` |
| `contracts.getCellProps(rowId, colId)`      | Each `<td role="gridcell/rowheader">` or `<div role="gridcell">` |

Note: `getCellProps` includes an `onFocus` handler that must be wired to the cell's `focus` event so that mouse-driven focus is reflected back into headless state.

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- async loading of child rows
- column-specific sorting
- drag and drop reordering
- multiple cell selection (only row selection is prioritized)
- level-sync from parent `cv-treegrid` (UIKit concern, not headless)
- multi-select click accumulation vs programmatic replace distinction (UIKit concern; headless exposes both `toggleRowSelection` and `selectRow`)
