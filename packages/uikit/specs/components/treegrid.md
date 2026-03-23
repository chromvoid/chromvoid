# cv-treegrid

Hierarchical tabular data grid combining multi-column structure with tree expansion/collapse behavior, providing APG-aligned keyboard navigation and row selection.

**Headless:** [`createTreegrid`](../../../headless/specs/components/treegrid.md)

## Anatomy

```
<cv-treegrid> (host)
└── <div part="base" role="treegrid">
    └── <slot>                          ← accepts cv-treegrid-column and cv-treegrid-row children
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Active cell identifier encoded as `"rowId::colId"`; reflects current `activeCellId` from headless state |
| `selected-values` | — | `[]` | Property-only (not an HTML attribute). Array of selected row id strings; reflects `selectedRowIds` from headless state |
| `expanded-values` | — | `[]` | Property-only (not an HTML attribute). Array of expanded row id strings; reflects `expandedRowIds` from headless state |
| `selection-mode` | String | `"single"` | Row selection mode: `single` \| `multiple` |
| `aria-label` | String | `""` | Accessible label applied to the root `[role=treegrid]` element |
| `aria-labelledby` | String | `""` | Id reference applied as `aria-labelledby` on the root `[role=treegrid]` element |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Accepts `cv-treegrid-column` definition elements followed by `cv-treegrid-row` elements; slot changes trigger model rebuild |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root interactive element with `role="treegrid"`; receives all ARIA grid attributes and keyboard event handling |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-treegrid-column-count` | computed | Number of columns; auto-written by `syncElementsFromModel()` onto each row element as an inline style property |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Border color for the base wrapper |
| `--cv-color-surface` | `#141923` | Background color for the base wrapper |
| `--cv-color-primary` | `#65d7ff` | Focus outline color for the base wrapper |
| `--cv-radius-md` | `10px` | Border radius for the base wrapper |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host` | `display: block`; contains scrollable overflow |
| `[part="base"]:focus-visible` | `outline: 2px solid var(--cv-color-primary)` at `outline-offset: 1px` |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{ value: string \| null, activeCell: TreegridCellId \| null, selectedValues: string[], expandedValues: string[] }` | Fires on any user interaction that changes active cell, selection, or expansion state |
| `cv-change` | `{ value: string \| null, activeCell: TreegridCellId \| null, selectedValues: string[], expandedValues: string[] }` | Fires when selection or expansion state commits (subset of `cv-input` cases; active-cell-only changes do not fire `cv-change`) |

`value` in the detail is `null` when no cell is active, otherwise the `"rowId::colId"` string.

`cv-input` and `cv-change` only fire for user-driven interactions (keyboard, pointer). Programmatic changes via `selectedValues`, `expandedValues`, or `value` properties do not re-dispatch these events.

## Reactive State Mapping

`cv-treegrid` is a visual adapter over headless `createTreegrid`.

### UIKit properties → headless actions

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` (attr) | attr → action | `contracts.getCellProps(rowId, colId).onFocus()` (sets active cell) |
| `selectedValues` (prop) | prop → action | `actions.selectRow(id)` (single mode) or `actions.toggleRowSelection(id)` (multiple mode, diff-applied) |
| `expandedValues` (prop) | prop → action | `actions.expandRow(id)` / `actions.collapseRow(id)` (diff-applied) |
| `selectionMode` (attr) | attr → option | passed as `selectionMode` to `createTreegrid(options)` on model rebuild |
| `aria-label` (attr) | attr → option | passed as `ariaLabel` to `createTreegrid(options)` on model rebuild |
| `aria-labelledby` (attr) | attr → option | passed as `ariaLabelledBy` to `createTreegrid(options)` on model rebuild |

### Headless state → DOM attributes

| Headless Signal | Direction | DOM Reflection |
|-----------------|-----------|----------------|
| `state.activeCellId()` | state → attr | `value` property (`"rowId::colId"` string); `tabindex="0"` and `data-active="true"` on active cell via `getCellProps` |
| `state.selectedRowIds()` | state → attr | `selectedValues` property; `aria-selected="true"` on selected rows and cells via `getRowProps`/`getCellProps`; `[selected]` on row and cell elements |
| `state.expandedRowIds()` | state → attr | `expandedValues` property; `aria-expanded="true/false"` on branch rows via `getRowProps`; child row visibility toggled via `hidden` attribute |
| `state.rowCount()` | state → attr | `aria-rowcount` on `[part="base"]` via `getTreegridProps` |
| `state.columnCount()` | state → attr | `aria-colcount` on `[part="base"]` via `getTreegridProps`; `--cv-treegrid-column-count` inline style on each row |

### Contracts spread onto DOM elements

| Contract | Spread target |
|----------|---------------|
| `contracts.getTreegridProps()` | `[part="base"]` (`role`, `tabindex`, `aria-label`, `aria-labelledby`, `aria-rowcount`, `aria-colcount`, `aria-multiselectable`) |
| `contracts.getRowProps(rowId)` | Each `cv-treegrid-row` element (`id`, `role`, `aria-level`, `aria-posinset`, `aria-setsize`, `aria-rowindex`, `aria-expanded`, `aria-selected`, `aria-disabled`) |
| `contracts.getCellProps(rowId, colId)` | Each `cv-treegrid-cell` element (`id`, `role`, `tabindex`, `aria-colindex`, `aria-selected`, `aria-disabled`, `data-active`); `onFocus` wired to cell `focus` event |

### Pointer and keyboard action triggers

| User Trigger | Action Called |
|--------------|---------------|
| `click` on a cell | Sets active cell via `onFocus()`; then calls `actions.toggleRowSelection(rowId)` in `multiple` mode (plain or `Ctrl/Meta` click both accumulate), or `actions.selectRow(rowId)` (replace) in `single` mode |
| `keydown` `Enter` or `Space` on active cell | `actions.selectRow(activeRowId)` (non-additive) or `actions.toggleRowSelection(activeRowId)` (when `Ctrl/Meta` held in `multiple` mode) |
| `keydown` navigation keys | `actions.handleKeyDown(event)` |
| `focus` on a cell | `contracts.getCellProps(rowId, colId).onFocus()` |
| slot content change | Model rebuilt from DOM (`rebuildModelFromSlot(preserveState: true)`) |
| `selection-mode` / `aria-label` / `aria-labelledby` change | Model rebuilt from DOM (`rebuildModelFromSlot(preserveState: true)`) |

## Keyboard Interaction

Derived from headless `handleKeyDown` contract:

| Key | Behavior |
|-----|----------|
| `ArrowUp` | Move active cell to same column in previous visible enabled row |
| `ArrowDown` | Move active cell to same column in next visible enabled row |
| `ArrowLeft` | If focused row is an expanded branch: collapse it. If focused row has a parent: move to same column in parent row. Otherwise: move to previous enabled cell in current row |
| `ArrowRight` | If focused row is a collapsed branch: expand it (focus stays). If focused row is an expanded branch: move to same column in first child row. Otherwise (leaf): move to next enabled cell in current row |
| `Home` | Move to first enabled cell in current row |
| `End` | Move to last enabled cell in current row |
| `Ctrl+Home` / `Meta+Home` | Move to first enabled cell in first visible enabled row |
| `Ctrl+End` / `Meta+End` | Move to last enabled cell in last visible enabled row |
| `Enter` / `Space` | Select active row (toggles in multiple mode when `Ctrl/Meta` held) |

Keys `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `Enter`, and `Space` are always `preventDefault()`-ed when handled.

## ARIA

| Element | Role | Required Attributes |
|---------|------|---------------------|
| `[part="base"]` | `treegrid` | `aria-label` or `aria-labelledby`, `aria-multiselectable`, `aria-rowcount`, `aria-colcount` |
| `cv-treegrid-row` | `row` | `aria-level`, `aria-posinset`, `aria-setsize`, `aria-rowindex`, `aria-selected`; `aria-expanded` (branch rows only); `aria-disabled` (disabled rows only) |
| `cv-treegrid-cell` | `gridcell` \| `rowheader` \| `columnheader` | `aria-colindex`, `aria-selected`, `tabindex`; `aria-disabled` (disabled cells only) |

`aria-level` starts at `1` for root rows. `aria-multiselectable` is `"true"` when `selection-mode="multiple"`, `"false"` otherwise.

## Usage

```html
<cv-treegrid aria-label="File tree" selection-mode="single">
  <cv-treegrid-column value="name" cell-role="rowheader">Name</cv-treegrid-column>
  <cv-treegrid-column value="size">Size</cv-treegrid-column>

  <cv-treegrid-row value="src">
    <cv-treegrid-cell column="name">src/</cv-treegrid-cell>
    <cv-treegrid-cell column="size">—</cv-treegrid-cell>
    <cv-treegrid-row value="index" slot="children">
      <cv-treegrid-cell column="name">index.ts</cv-treegrid-cell>
      <cv-treegrid-cell column="size">2 KB</cv-treegrid-cell>
    </cv-treegrid-row>
  </cv-treegrid-row>

  <cv-treegrid-row value="readme">
    <cv-treegrid-cell column="name">README.md</cv-treegrid-cell>
    <cv-treegrid-cell column="size">4 KB</cv-treegrid-cell>
  </cv-treegrid-row>
</cv-treegrid>
```

## Child Elements

### cv-treegrid-row

Represents a single data row. Slotted directly into `cv-treegrid` (root rows) or into `slot="children"` of a parent `cv-treegrid-row` (child rows).

#### Anatomy

```
<cv-treegrid-row> (host)
├── <div part="row">
│   └── <slot>                   ← accepts cv-treegrid-cell children
└── <div part="children" hidden?=${!expanded}>
    └── <slot name="children">   ← accepts nested cv-treegrid-row children
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Row identifier. Auto-assigned as `"row-N"` if empty |
| `index` | Number | `0` | Explicit `aria-rowindex` override; values `< 1` or non-finite are ignored (headless assigns positional index) |
| `disabled` | Boolean | `false` | Marks row as disabled; excluded from navigation and selection |
| `active` | Boolean | `false` | Set by parent when a cell in this row is the active cell; drives row-level highlight |
| `selected` | Boolean | `false` | Set by parent when this row is selected; drives row-level selection styling |
| `expanded` | Boolean | `false` | Set by parent; controls visibility of `[part="children"]` and reflects `aria-expanded` |
| `branch` | Boolean | `false` | Set by parent when this row has child rows; used for styling expand/collapse affordance |
| `level` | Number | `1` | Nesting depth; used to compute `--cv-treegrid-level` for indent. Auto-written by parent `cv-treegrid.syncElementsFromModel()` from `getRowProps()['aria-level']`; root rows get `1`, child rows get `2`, grandchild rows get `3`, etc. |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Accepts `cv-treegrid-cell` elements for the row's columns |
| `children` | Accepts nested `cv-treegrid-row` elements; shown only when `[expanded]` is set |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `row` | `<div>` | Grid row layout element; uses CSS grid with `--cv-treegrid-column-count` columns and left-padding derived from `--cv-treegrid-level` |
| `children` | `<div>` | Container for nested child rows; `hidden` when `[expanded]` is absent |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-treegrid-child-indent` | `14px` | Horizontal indent per nesting level; applied as `padding-inline-start: calc(--cv-treegrid-child-indent * max(--cv-treegrid-level - 1, 0))` |
| `--cv-treegrid-level` | `1` | Current nesting depth (written by the row's own render from `this.level`); consumed by `[part="row"]` indent calculation |
| `--cv-treegrid-column-count` | `1` | Number of columns; written by parent `cv-treegrid` as an inline style on each row; drives the `grid-template-columns` |

Additionally, component styles depend on theme tokens:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-primary` | `#65d7ff` | Active/selected row background tint and focus outline color |
| `--cv-space-2` | `8px` | Inline padding for `[part="row"]` |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([hidden])` | `display: none` |
| `:host(:focus-visible) [part="row"]` | `outline: 2px solid var(--cv-color-primary)` at `outline-offset: -2px` |
| `:host([active]) [part="row"]` | Primary-tinted background (`color-mix(in oklab, primary 18%, transparent)`) |
| `:host([selected]) [part="row"]` | Same primary-tinted background as `[active]` |
| `:host([disabled]) [part="row"]` | `opacity: 0.55` |
| `:host([disabled]) [part="children"]` | `opacity: 0.55` |

---

### cv-treegrid-column

Declares a column definition. Rendered as a visual column header inside `cv-treegrid`. Not part of the row grid; used by the parent to build the headless column model.

#### Anatomy

```
<cv-treegrid-column> (host)
└── <span>
    └── <slot>   ← falls back to [label] attribute text
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Column identifier used to match `cv-treegrid-cell[column]`. Auto-assigned as `"column-N"` if empty |
| `label` | String | `""` | Fallback text displayed in the default slot when no slot content is provided |
| `index` | Number | `0` | Explicit `aria-colindex` override; values `< 1` or non-finite are ignored |
| `disabled` | Boolean | `false` | Disables all cells in this column from navigation |
| `cell-role` | String | `"gridcell"` | ARIA role for all cells in this column: `gridcell` \| `rowheader` \| `columnheader` |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Column header label; falls back to the `label` attribute value |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| _(none)_ | — | The column renders an inner `<span>` but exposes no named parts |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| _(none)_ | — | No component-scoped custom properties; layout controlled by host styles |

Additionally, component styles depend on theme tokens:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Bottom border color |
| `--cv-color-text` | `#e8ecf6` | Label text color |
| `--cv-color-surface` | `#141923` | Column header background base |
| `--cv-color-primary` | `#65d7ff` | Focus outline color |
| `--cv-space-2` | `8px` | Inline padding |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host` | `display: flex`, `min-block-size: 36px`, `font-weight: 600`; bottom border separating header from rows |
| `:host([disabled])` | `opacity: 0.55` |
| `:host(:focus-visible)` | `outline: 2px solid var(--cv-color-primary)` at `outline-offset: -2px` |

---

### cv-treegrid-cell

Represents a single cell within a `cv-treegrid-row`. The `column` attribute links it to a `cv-treegrid-column` by value.

#### Anatomy

```
<cv-treegrid-cell> (host)
└── <slot>   ← cell content
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `column` | String | `""` | Id of the `cv-treegrid-column` this cell belongs to; positional fallback used when value is empty or unrecognized |
| `disabled` | Boolean | `false` | Marks this specific cell as disabled; excluded from navigation |
| `active` | Boolean | `false` | Set by parent when this cell is the active cell; drives cell-level highlight |
| `selected` | Boolean | `false` | Set by parent when the row containing this cell is selected; drives `font-weight: 600` |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Cell content |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| _(none)_ | — | Cell renders a single `<slot>` with no named parts |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| _(none)_ | — | No component-scoped custom properties |

Additionally, component styles depend on theme tokens:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-text` | `#e8ecf6` | Cell text color |
| `--cv-color-primary` | `#65d7ff` | Active cell background tint and focus outline color |
| `--cv-space-2` | `8px` | Inline padding |
| `--cv-space-1` | `4px` | Block padding |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host` | `display: block` |
| `:host([active])` | `background: color-mix(in oklab, var(--cv-color-primary) 16%, transparent)` |
| `:host([selected])` | `font-weight: 600` |
| `:host([disabled])` | `opacity: 0.55` |
| `:host(:focus-visible)` | `outline: 2px solid var(--cv-color-primary)` at `outline-offset: -2px` |

## Out of Scope

- Async loading of child rows (pagination or lazy fetch)
- Column sorting or column header click behavior
- Drag and drop row reordering
- Multiple cell selection (only row-level selection is supported)
- Virtual / windowed rendering of large datasets
- Column resizing or column visibility toggling
- Row grouping beyond the existing tree hierarchy
- Inline cell editing
