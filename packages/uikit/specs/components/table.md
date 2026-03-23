# cv-table

Data table for displaying structured tabular content with optional sorting, row selection, and grid-style keyboard navigation.

**Headless:** [`createTable`](../../../headless/specs/components/table.md)

## Anatomy

```
<cv-table> (host)
└── <div part="base" role="table|grid">
    ├── <div role="rowgroup" part="head">
    │   └── <div role="row" part="head-row">
    │       └── <slot name="columns">       ← accepts <cv-table-column> children
    └── <div role="rowgroup" part="body" @cv-table-row-slotchange>
        └── <slot name="rows">               ← accepts <cv-table-row> children
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `sort-column` | String | `""` | Currently sorted column id (reflected) |
| `sort-direction` | String | `"none"` | Sort direction: `none` \| `ascending` \| `descending` (reflected) |
| `aria-label` | String | `""` | Accessible label for the table root |
| `aria-labelledby` | String | `""` | `aria-labelledby` reference for the table root |
| `total-column-count` | Number | `0` | Logical column count for virtualization (reflected) |
| `total-row-count` | Number | `0` | Logical row count for virtualization (reflected) |
| `selectable` | String | `""` | Row selection mode: `single` \| `multi`. Empty or absent disables selection. |
| `interactive` | Boolean | `false` | Enables grid navigation mode (switches role to `grid`, activates roving tabindex) |
| `sticky-header` | Boolean | `false` | Makes the header row stick to the top when scrolling |
| `striped` | Boolean | `false` | Alternating row background colors |
| `compact` | Boolean | `false` | Reduced cell padding for denser display |
| `bordered` | Boolean | `false` | Visible borders between all cells |
| `page-size` | Number | `10` | Rows per page for PageUp/PageDown in grid navigation mode (minimum 1) |

## Slots

| Slot | Description |
|------|-------------|
| `columns` | `<cv-table-column>` children defining column headers |
| `rows` | `<cv-table-row>` children containing table data rows |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root table/grid element with role and ARIA attributes |
| `head` | `<div>` | Header rowgroup wrapper |
| `head-row` | `<div>` | Header row containing column slots |
| `body` | `<div>` | Body rowgroup wrapper containing row slots |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-table-border-radius` | `var(--cv-radius-md, 10px)` | Border radius of the table container |
| `--cv-table-border-color` | `var(--cv-color-border, #2a3245)` | Border color of the table and cells |
| `--cv-table-background` | `var(--cv-color-surface, #141923)` | Table background color |
| `--cv-table-header-background` | `color-mix(in oklab, var(--cv-color-surface, #141923) 82%, transparent)` | Header row background |
| `--cv-table-stripe-background` | `color-mix(in oklab, var(--cv-color-surface, #141923) 90%, transparent)` | Background for alternating rows when `striped` |
| `--cv-table-row-selected-background` | `color-mix(in oklab, var(--cv-color-primary, #65d7ff) 12%, transparent)` | Background for selected rows |
| `--cv-table-cell-padding-block` | `var(--cv-space-2, 8px)` | Vertical cell padding |
| `--cv-table-cell-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal cell padding |
| `--cv-table-compact-cell-padding-block` | `var(--cv-space-1, 4px)` | Vertical cell padding in compact mode |
| `--cv-table-compact-cell-padding-inline` | `var(--cv-space-2, 8px)` | Horizontal cell padding in compact mode |
| `--cv-table-focus-outline-color` | `var(--cv-color-primary, #65d7ff)` | Focus ring color for grid navigation |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Base border color |
| `--cv-color-surface` | `#141923` | Surface background color |
| `--cv-color-text` | `#e8ecf6` | Default text color |
| `--cv-color-primary` | `#65d7ff` | Primary accent color (focus, selection, active sort) |
| `--cv-radius-md` | `10px` | Border radius fallback |
| `--cv-space-1` | `4px` | Small spacing scale |
| `--cv-space-2` | `8px` | Medium spacing scale |
| `--cv-space-3` | `12px` | Medium-large spacing scale |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([striped])` | Alternating row backgrounds via `--cv-table-stripe-background` |
| `:host([compact])` | Reduced cell padding via compact custom properties |
| `:host([bordered])` | Visible borders between all cells |
| `:host([sticky-header])` | Header row uses `position: sticky; top: 0` |
| `:host([interactive])` | Grid navigation mode active; focus ring on active cell |
| `:host([selectable])` | Row selection enabled; selected rows highlighted |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{sortColumnId: string \| null, sortDirection: TableSortDirection}` | Fires on sort interaction (before commit) |
| `cv-change` | `{sortColumnId: string \| null, sortDirection: TableSortDirection}` | Fires when sort state changes |
| `cv-selection-change` | `{selectedRowIds: string[], selectable: 'single' \| 'multi'}` | Fires when row selection changes via user interaction |
| `cv-focus-change` | `{rowIndex: number \| null, columnIndex: number \| null}` | Fires when focused cell changes in grid navigation mode |

Sort events (`cv-input` / `cv-change`) fire only when sort state changes due to user interaction (column header click or keyboard activation). They share the same detail shape and follow the convention where `cv-input` fires on interaction and `cv-change` fires on committed state change.

`cv-selection-change` fires when selection changes due to user interaction (row click, Space key, Ctrl+A). It does not fire for programmatic attribute changes.

`cv-focus-change` fires when the focused cell changes during grid navigation. It does not fire for programmatic `setFocusedCell` calls.

## Reactive State Mapping

`cv-table` is a visual adapter over headless `createTable`.

### UIKit Property to Headless Binding

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `sort-column` | attr → action | `actions.sortBy(value, direction)` or `actions.clearSort()` when attribute changes |
| `sort-direction` | attr → action | `actions.sortBy(column, value)` or `actions.clearSort()` when attribute changes |
| `aria-label` | attr → option | passed as `ariaLabel` in `createTable(options)` |
| `aria-labelledby` | attr → option | passed as `ariaLabelledBy` in `createTable(options)` |
| `total-column-count` | attr → option | passed as `totalColumnCount` in `createTable(options)` |
| `total-row-count` | attr → option | passed as `totalRowCount` in `createTable(options)` |
| `selectable` | attr → option | passed as `selectable` in `createTable(options)` |
| `interactive` | attr → option | passed as `interactive` in `createTable(options)` |
| `page-size` | attr → option | passed as `pageSize` in `createTable(options)` |

### Headless State to DOM Reflection

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.sortColumnId()` | state → attr | `cv-table[sort-column]` host attribute |
| `state.sortDirection()` | state → attr | `cv-table[sort-direction]` host attribute |
| `state.selectedRowIds()` | state → attr | `cv-table-row[selected]` boolean attribute on each row |
| `state.focusedRowIndex()` | state → DOM | Active cell receives `tabindex="0"` and `.focus()` call |
| `state.focusedColumnIndex()` | state → DOM | Active cell receives `tabindex="0"` and `.focus()` call |

### Headless Actions Called

| Action | UIKit Trigger |
|--------|---------------|
| `actions.sortBy(columnId, direction)` | Column header click or keyboard activation cycles sort direction |
| `actions.clearSort()` | Sort direction cycles back to `none` |
| `actions.selectRow(rowId)` | Row click when `selectable="single"` |
| `actions.toggleRowSelection(rowId)` | Row click when `selectable="multi"`, or Space key in interactive mode |
| `actions.selectAllRows()` | Ctrl/Cmd+A in interactive mode when `selectable="multi"` |
| `actions.clearSelection()` | Programmatic API |
| `actions.deselectRow(rowId)` | Programmatic API |
| `actions.handleKeyDown(event)` | `keydown` event on the grid root when `interactive` is `true` |
| `actions.moveFocus(direction)` | Arrow key navigation (delegated via `handleKeyDown`) |
| `actions.moveFocusToStart()` | Ctrl/Cmd+Home (delegated via `handleKeyDown`) |
| `actions.moveFocusToEnd()` | Ctrl/Cmd+End (delegated via `handleKeyDown`) |
| `actions.moveFocusToRowStart()` | Home key (delegated via `handleKeyDown`) |
| `actions.moveFocusToRowEnd()` | End key (delegated via `handleKeyDown`) |
| `actions.pageUp()` | PageUp key (delegated via `handleKeyDown`) |
| `actions.pageDown()` | PageDown key (delegated via `handleKeyDown`) |
| `actions.setFocusedCell(rowIndex, columnIndex)` | Cell click in interactive mode |

### Headless Contracts Spread

| Contract | UIKit Target |
|----------|--------------|
| `contracts.getTableProps()` | Spread onto `[part="base"]` root element |
| `contracts.getRowProps(rowId)` | Spread onto each `cv-table-row` element |
| `contracts.getCellProps(rowId, colId, span?)` | Spread onto each `cv-table-cell` element |
| `contracts.getColumnHeaderProps(colId)` | Spread onto each `cv-table-column` element |
| `contracts.getRowHeaderProps(rowId, colId)` | Spread onto `cv-table-cell[row-header]` elements |

### UIKit-Only Concerns (Not in Headless)

- **Display variants** (`striped`, `compact`, `bordered`): CSS-only visual modifiers, not part of headless state.
- **Sticky header** (`sticky-header`): CSS `position: sticky` on header, not part of headless state.
- **Visual selection indicators**: Row background highlighting for selected rows.
- **DOM focus management**: Calling `.focus()` on cells when `focusedRowIndex`/`focusedColumnIndex` change in headless state.
- **`preventDefault()`**: Called on keyboard events handled by `handleKeyDown` to prevent scrolling.
- **`cv-input` / `cv-change` / `cv-selection-change` / `cv-focus-change` events**: Custom DOM events dispatched by the UIKit wrapper, not part of the headless model.
- **Auto-generated fallback values**: `value` attributes on columns and rows receive auto-generated fallbacks (`column-N`, `row-N`) when not explicitly set.
- **Slot-based model rebuild**: Model is rebuilt from slotted children on `slotchange` events.

UIKit does not own sort, selection, or navigation logic; headless state is the source of truth.

## Usage

```html
<!-- Basic table -->
<cv-table aria-label="Users">
  <cv-table-column value="name" label="Name" sortable></cv-table-column>
  <cv-table-column value="email" label="Email"></cv-table-column>
  <cv-table-column value="role" label="Role"></cv-table-column>

  <cv-table-row value="user-1">
    <cv-table-cell column="name" row-header>Alice</cv-table-cell>
    <cv-table-cell column="email">alice@example.com</cv-table-cell>
    <cv-table-cell column="role">Admin</cv-table-cell>
  </cv-table-row>
  <cv-table-row value="user-2">
    <cv-table-cell column="name" row-header>Bob</cv-table-cell>
    <cv-table-cell column="email">bob@example.com</cv-table-cell>
    <cv-table-cell column="role">Editor</cv-table-cell>
  </cv-table-row>
</cv-table>

<!-- Striped, compact, bordered with sticky header -->
<cv-table aria-label="Log entries" striped compact bordered sticky-header>
  <cv-table-column value="timestamp" label="Time" sortable></cv-table-column>
  <cv-table-column value="level" label="Level"></cv-table-column>
  <cv-table-column value="message" label="Message"></cv-table-column>

  <cv-table-row value="log-1">
    <cv-table-cell column="timestamp">12:01:33</cv-table-cell>
    <cv-table-cell column="level">INFO</cv-table-cell>
    <cv-table-cell column="message">Server started</cv-table-cell>
  </cv-table-row>
</cv-table>

<!-- Selectable rows (multi) -->
<cv-table aria-label="Files" selectable="multi">
  <cv-table-column value="name" label="Name"></cv-table-column>
  <cv-table-column value="size" label="Size"></cv-table-column>

  <cv-table-row value="file-1">
    <cv-table-cell column="name">readme.md</cv-table-cell>
    <cv-table-cell column="size">4 KB</cv-table-cell>
  </cv-table-row>
  <cv-table-row value="file-2">
    <cv-table-cell column="name">index.ts</cv-table-cell>
    <cv-table-cell column="size">12 KB</cv-table-cell>
  </cv-table-row>
</cv-table>

<!-- Interactive grid with selection -->
<cv-table aria-label="Spreadsheet" interactive selectable="multi" page-size="5">
  <cv-table-column value="a" label="A"></cv-table-column>
  <cv-table-column value="b" label="B"></cv-table-column>
  <cv-table-column value="c" label="C"></cv-table-column>

  <cv-table-row value="row-1">
    <cv-table-cell column="a">1</cv-table-cell>
    <cv-table-cell column="b">2</cv-table-cell>
    <cv-table-cell column="c">3</cv-table-cell>
  </cv-table-row>
  <cv-table-row value="row-2">
    <cv-table-cell column="a">4</cv-table-cell>
    <cv-table-cell column="b">5</cv-table-cell>
    <cv-table-cell column="c">6</cv-table-cell>
  </cv-table-row>
</cv-table>
```

## Child Elements

### cv-table-column

Column header definition within the table header row.

#### Anatomy

```
<cv-table-column> (host)
└── <span part="base">
    ├── <slot>${label}</slot>
    └── sort indicator (▲/▼)     ← only when sort-direction is ascending/descending
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Unique column identifier. Auto-generated as `column-N` if empty. |
| `label` | String | `""` | Column header text (used as default slot fallback) |
| `index` | Number | `0` | 1-based aria-colindex override for virtualized tables |
| `sortable` | Boolean | `false` | Enables sort interaction on this column |
| `sort-direction` | String | `"none"` | Current sort state: `none` \| `ascending` \| `descending` (managed by parent) |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Column header content (falls back to `label` attribute) |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<span>` | Inline-flex wrapper containing label and sort indicator |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([sortable])` | `cursor: pointer` indicating interactive sort |
| `:host([sort-direction="ascending"])` | Primary color text with ascending indicator (▲) |
| `:host([sort-direction="descending"])` | Primary color text with descending indicator (▼) |
| `:host(:focus-visible)` | Focus ring for keyboard activation of sortable columns |

---

### cv-table-row

Data row containing cells within the table body.

#### Anatomy

```
<cv-table-row> (host)
└── <slot>                       ← accepts <cv-table-cell> children
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Unique row identifier. Auto-generated as `row-N` if empty. |
| `index` | Number | `0` | 1-based aria-rowindex override for virtualized tables |
| `selected` | Boolean | `false` | Whether this row is selected (reflected from headless state) |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | host | Row element (uses `display: table-row`) |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-table-row-slotchange` | -- | Fires when slotted cell children change; bubbles to parent for model rebuild |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([selected])` | Selected row background via `--cv-table-row-selected-background` |

---

### cv-table-cell

Individual data cell within a table row.

#### Anatomy

```
<cv-table-cell> (host)
└── <slot>
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `column` | String | `""` | Column id this cell belongs to. Auto-resolved from positional index if empty. |
| `row-header` | Boolean | `false` | Marks this cell as a row header (`role="rowheader"`) |
| `colspan` | Number | `0` | Column span (applied as `aria-colspan` when >= 2) |
| `rowspan` | Number | `0` | Row span (applied as `aria-rowspan` when >= 2) |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Cell content |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | host | Cell element (uses `display: table-cell`) |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([row-header])` | Bold text (`font-weight: 600`) for row header cells |
| `:host([data-active="true"])` | Active cell in grid navigation mode (receives `tabindex="0"` via headless contract) |
