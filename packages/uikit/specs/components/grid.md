# cv-grid

Interactive data grid component with keyboard navigation, cell selection, and accessible tabular data display following the WAI-ARIA Grid pattern.

**Headless:** [`createGrid`](../../../headless/specs/components/grid.md)

## Cross-Spec Consistency

This document is the UIKit surface contract for Grid.

- Headless `createGrid` is the source of truth for state, transitions, and invariants.
- UIKit mirrors headless contracts through DOM attributes and events.
- Any intentional divergence between UIKit and headless MUST be documented in both specs.

## Anatomy

```
<cv-grid> (host)
└── <div part="base" role="grid">
    ├── <div role="rowgroup" part="head">
    │   └── <div role="row" part="head-row">
    │       └── <slot name="columns">       ← cv-grid-column elements
    ├── <div role="rowgroup" part="body">
    │   └── <slot name="rows">              ← cv-grid-row elements
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Active cell key in `"rowId::colId"` format. Reflects the currently focused cell. |
| `selection-mode` | String | `"single"` | Selection mode: `"single"` \| `"multiple"` |
| `focus-strategy` | String | `"roving-tabindex"` | Focus management strategy: `"roving-tabindex"` \| `"aria-activedescendant"` |
| `selection-follows-focus` | Boolean | `false` | Auto-select cell on focus move |
| `page-size` | Number | `10` | Rows per page for PageUp/PageDown navigation (minimum 1) |
| `readonly` | Boolean | `false` | Marks all cells as `aria-readonly` |
| `aria-label` | String | `""` | Accessible label for the grid root. Falls back to `"Grid"` when no `aria-labelledby` is set. |
| `aria-labelledby` | String | `""` | `aria-labelledby` reference for the grid root |
| `total-row-count` | Number | `0` | Logical row count for virtualization. When `> 0`, overrides `aria-rowcount`. |
| `total-column-count` | Number | `0` | Logical column count for virtualization. When `> 0`, overrides `aria-colcount`. |

**JS-only property:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `selectedValues` | `string[]` | `[]` | Array of selected cell keys in `"rowId::colId"` format |

## Slots

| Slot | Description |
|------|-------------|
| `columns` | One or more `<cv-grid-column>` elements defining the column headers |
| `rows` | One or more `<cv-grid-row>` elements containing `<cv-grid-cell>` children |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root grid container with `role="grid"`, table layout |
| `head` | `<div>` | Column header row group (`role="rowgroup"`) |
| `head-row` | `<div>` | Row wrapping the column header slots (`role="row"`) |
| `body` | `<div>` | Data row group (`role="rowgroup"`) |

## CSS Custom Properties

The grid component does not expose dedicated `--cv-grid-*` custom properties on the host. Styling is controlled through theme tokens consumed as fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Border color for the grid outline |
| `--cv-color-surface` | `#141923` | Background color of the grid base |
| `--cv-radius-md` | `10px` | Border radius of the grid base |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host` | Block display |
| `:host([selection-mode="multiple"])` | Multiple cell selection enabled; grid root reflects `aria-multiselectable="true"` |
| `:host([focus-strategy="aria-activedescendant"])` | Grid root gets `tabindex="0"` and `aria-activedescendant`; cells all get `tabindex="-1"` |
| `:host([readonly])` | All cells reflect `aria-readonly="true"` |

## ARIA Contract

- Grid root role is `grid`
- Row group elements use `role="rowgroup"`
- Head row uses `role="row"`
- Column headers use `role="columnheader"` (set by UIKit on `cv-grid-column`)
- Data rows use `role="row"` (from headless `getRowProps`)
- Data cells use `role="gridcell"` (from headless `getCellProps`)
- Focus strategies:
  - `roving-tabindex` (default) -- active cell gets `tabindex="0"`, all others `tabindex="-1"`, grid root gets `tabindex="-1"`
  - `aria-activedescendant` -- grid root gets `tabindex="0"` and `aria-activedescendant` pointing to active cell DOM id; all cells get `tabindex="-1"`
- Required attributes on root: `aria-label` or `aria-labelledby`, `aria-multiselectable`, `aria-colcount`, `aria-rowcount`
- Required attributes on rows: `aria-rowindex`
- Required attributes on cells: `aria-colindex`, `aria-selected`, `tabindex`, `data-active`
- Conditional cell attributes: `aria-readonly` (when `readonly`), `aria-disabled` (when cell is disabled)

All ARIA attributes are derived from headless contracts (`getGridProps`, `getRowProps`, `getCellProps`). UIKit does not compute ARIA state independently.

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{value: string \| null, activeCell: GridCellId \| null, selectedValues: string[]}` | Fires when active cell or selection changes due to interaction |
| `cv-change` | `{value: string \| null, activeCell: GridCellId \| null, selectedValues: string[]}` | Fires when active cell or selection changes due to interaction |

**Event detail shape:**

| Field | Type | Description |
|-------|------|-------------|
| `value` | `string \| null` | Active cell key (`"rowId::colId"`) or `null` |
| `activeCell` | `GridCellId \| null` | Active cell object `{rowId, colId}` or `null` |
| `selectedValues` | `string[]` | All selected cell keys in `"rowId::colId"` format |

Both `cv-input` and `cv-change` fire together whenever active cell or selection state changes as a result of keyboard navigation, click interaction, or programmatic `value`/`selectedValues` updates that alter model state.

## Reactive State Mapping

`cv-grid` is a visual adapter over headless `createGrid`.

### Attribute to Headless (UIKit -> Headless)

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` | attr -> action | Parsed to `GridCellId`, calls `actions.setActiveCell(cell)` if valid and different from current |
| `selectedValues` | prop -> action | Parsed to cell ids, calls `actions.selectCell()` (single) or `actions.toggleCellSelection()` (multiple) after clearing |
| `selection-mode` | attr -> option | Passed as `selectionMode` in `createGrid(options)` -- triggers model rebuild |
| `focus-strategy` | attr -> option | Passed as `focusStrategy` in `createGrid(options)` -- triggers model rebuild |
| `selection-follows-focus` | attr -> option | Passed as `selectionFollowsFocus` in `createGrid(options)` -- triggers model rebuild |
| `page-size` | attr -> option | Passed as `pageSize` in `createGrid(options)` -- triggers model rebuild |
| `readonly` | attr -> option | Passed as `isReadOnly` in `createGrid(options)` -- triggers model rebuild |
| `aria-label` | attr -> option | Passed as `ariaLabel` in `createGrid(options)` -- triggers model rebuild |
| `aria-labelledby` | attr -> option | Passed as `ariaLabelledBy` in `createGrid(options)` -- triggers model rebuild |
| `total-row-count` | attr -> option | Passed as `totalRowCount` in `createGrid(options)` -- triggers model rebuild |
| `total-column-count` | attr -> option | Passed as `totalColumnCount` in `createGrid(options)` -- triggers model rebuild |

### Headless to DOM (Headless -> UIKit)

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.activeCellId()` | state -> attr | `[value]` host attribute as `"rowId::colId"` |
| `state.selectedCellIds()` | state -> prop | `selectedValues` JS property as `string[]` |
| `contracts.getGridProps()` | state -> render | Spread onto `[part="base"]`: `role`, `tabindex`, `aria-label`, `aria-labelledby`, `aria-multiselectable`, `aria-colcount`, `aria-rowcount`, `aria-activedescendant` |
| `contracts.getRowProps(rowId)` | state -> render | Spread onto `cv-grid-row` elements: `id`, `role`, `aria-rowindex` |
| `contracts.getCellProps(rowId, colId)` | state -> render | Spread onto `cv-grid-cell` elements: `id`, `role`, `tabindex`, `aria-colindex`, `aria-selected`, `aria-readonly`, `aria-disabled`, `data-active` |

### UIKit-Only Concerns (NOT in headless)

- Column header ARIA attributes (`role="columnheader"`, `aria-colindex`, `aria-disabled`) -- applied by UIKit directly to `cv-grid-column` elements
- Slot-based model rebuilding: UIKit scans `cv-grid-column`, `cv-grid-row`, and `cv-grid-cell` from the light DOM and rebuilds the headless model on slot changes and direct child mutations (via `MutationObserver` on the host `childList`)
- DOM focus management: when `activeCellId` changes in `roving-tabindex` mode, UIKit calls `.focus()` on the corresponding `cv-grid-cell`
- Click handling with modifier keys: Ctrl/Meta+click toggles selection in multiple mode; plain click selects
- `cv-grid-row-slotchange` internal event: `cv-grid-row` dispatches this when its cells change, triggering model rebuild
- Auto-generated fallback values for column (`column-{n}`) and row (`row-{n}`) identifiers when `value` is empty
- Cell validity filtering: cells referencing non-existent columns are hidden
- `preventDefault()` on grid-handled keyboard events (arrows, Home, End, PageUp, PageDown, Enter, Space)

## Behavioral Contract

### Model Rebuild

The headless model is rebuilt when:
- The component connects to the DOM
- Any option attribute changes (`selection-mode`, `focus-strategy`, `selection-follows-focus`, `page-size`, `readonly`, `aria-label`, `aria-labelledby`, `total-row-count`, `total-column-count`)
- Slot content changes (columns added/removed, rows added/removed, cells within rows changed)

During rebuild with `preserveState=true`, the current active cell and selected cells are restored if they remain valid in the new model.

### Click Interaction

- Plain click on a cell: sets active cell and selects it
- Ctrl/Meta+click on a cell (multiple mode): sets active cell and toggles selection for that cell
- Disabled cells ignore click interaction
- After click, DOM focus moves to the active cell (roving-tabindex mode)

### Keyboard Navigation

All keyboard interaction is delegated to headless `actions.handleKeyDown(event)`. UIKit calls `preventDefault()` on handled keys and manages DOM focus after state changes.

| Key | Modifier | Action |
|-----|----------|--------|
| `ArrowUp` | -- | Move active cell up |
| `ArrowDown` | -- | Move active cell down |
| `ArrowLeft` | -- | Move active cell left |
| `ArrowRight` | -- | Move active cell right |
| `Home` | -- | Move to first cell in current row |
| `End` | -- | Move to last cell in current row |
| `Home` | Ctrl / Meta | Move to first cell in grid |
| `End` | Ctrl / Meta | Move to last cell in grid |
| `PageUp` | -- | Move up by `page-size` rows |
| `PageDown` | -- | Move down by `page-size` rows |
| `Enter` | -- | Move active cell down |
| `Space` | -- | Select active cell (single mode) or toggle selection (multiple mode) |

## Out of Scope

The following features are explicitly out of scope for the current implementation:

- **Cell editing** -- inline input mode for cell content
- **Column reordering** -- drag-and-drop or programmatic column order changes
- **Column resizing** -- adjustable column widths via drag handles
- **Context menus** -- right-click or long-press context menu integration

## Usage

```html
<!-- Basic grid -->
<cv-grid aria-label="Users">
  <cv-grid-column value="name" label="Name">Name</cv-grid-column>
  <cv-grid-column value="status" label="Status">Status</cv-grid-column>
  <cv-grid-column value="role" label="Role">Role</cv-grid-column>

  <cv-grid-row value="r1">
    <cv-grid-cell column="name">Alice</cv-grid-cell>
    <cv-grid-cell column="status">Active</cv-grid-cell>
    <cv-grid-cell column="role">Admin</cv-grid-cell>
  </cv-grid-row>
  <cv-grid-row value="r2">
    <cv-grid-cell column="name">Bob</cv-grid-cell>
    <cv-grid-cell column="status">Inactive</cv-grid-cell>
    <cv-grid-cell column="role">Editor</cv-grid-cell>
  </cv-grid-row>
</cv-grid>

<!-- Multiple selection -->
<cv-grid aria-label="Tasks" selection-mode="multiple">
  <cv-grid-column value="task">Task</cv-grid-column>
  <cv-grid-column value="priority">Priority</cv-grid-column>

  <cv-grid-row value="t1">
    <cv-grid-cell column="task">Review PR</cv-grid-cell>
    <cv-grid-cell column="priority">High</cv-grid-cell>
  </cv-grid-row>
  <cv-grid-row value="t2">
    <cv-grid-cell column="task">Write docs</cv-grid-cell>
    <cv-grid-cell column="priority">Low</cv-grid-cell>
  </cv-grid-row>
</cv-grid>

<!-- With disabled cells and rows -->
<cv-grid aria-label="Inventory" readonly>
  <cv-grid-column value="item">Item</cv-grid-column>
  <cv-grid-column value="qty">Quantity</cv-grid-column>

  <cv-grid-row value="r1">
    <cv-grid-cell column="item">Widget A</cv-grid-cell>
    <cv-grid-cell column="qty">42</cv-grid-cell>
  </cv-grid-row>
  <cv-grid-row value="r2" disabled>
    <cv-grid-cell column="item">Widget B</cv-grid-cell>
    <cv-grid-cell column="qty">0</cv-grid-cell>
  </cv-grid-row>
</cv-grid>

<!-- aria-activedescendant focus strategy -->
<cv-grid aria-label="Data" focus-strategy="aria-activedescendant">
  <cv-grid-column value="col1">Column 1</cv-grid-column>
  <cv-grid-column value="col2">Column 2</cv-grid-column>

  <cv-grid-row value="r1">
    <cv-grid-cell column="col1">A1</cv-grid-cell>
    <cv-grid-cell column="col2">A2</cv-grid-cell>
  </cv-grid-row>
</cv-grid>

<!-- Selection follows focus -->
<cv-grid aria-label="Files" selection-follows-focus>
  <cv-grid-column value="name">Name</cv-grid-column>
  <cv-grid-column value="size">Size</cv-grid-column>

  <cv-grid-row value="f1">
    <cv-grid-cell column="name">readme.md</cv-grid-cell>
    <cv-grid-cell column="size">2KB</cv-grid-cell>
  </cv-grid-row>
  <cv-grid-row value="f2">
    <cv-grid-cell column="name">index.ts</cv-grid-cell>
    <cv-grid-cell column="size">4KB</cv-grid-cell>
  </cv-grid-row>
</cv-grid>

<!-- Virtualized grid with total counts -->
<cv-grid aria-label="Log" total-row-count="10000" total-column-count="5" page-size="50">
  <cv-grid-column value="ts">Timestamp</cv-grid-column>
  <cv-grid-column value="msg">Message</cv-grid-column>

  <cv-grid-row value="r1">
    <cv-grid-cell column="ts">12:00:01</cv-grid-cell>
    <cv-grid-cell column="msg">Server started</cv-grid-cell>
  </cv-grid-row>
</cv-grid>
```

## Child Elements

### cv-grid-column

Column header definition. The parent `cv-grid` assigns `role="columnheader"`, `aria-colindex`, and `aria-disabled` attributes.

#### Anatomy

```
<cv-grid-column> (host)
└── <slot>{label fallback}</slot>
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Unique column identifier. Auto-generated as `column-{n}` if empty. |
| `label` | String | `""` | Fallback label text rendered when no slotted content is provided |
| `index` | Number | `0` | Explicit 1-based `aria-colindex`. When `< 1`, positional index is used. |
| `disabled` | Boolean | `false` | Whether the column is disabled (all cells in this column become disabled) |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Column header content. Falls back to `label` attribute text. |

#### CSS Custom Properties (inherited from theme)

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-space-2` | `8px` | Vertical padding |
| `--cv-space-3` | `12px` | Horizontal padding |
| `--cv-color-border` | `#2a3245` | Bottom border color |
| `--cv-color-text` | `#e8ecf6` | Text color |
| `--cv-color-surface` | `#141923` | Background color (mixed at 82% opacity) |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host` | Table-cell display, `font-weight: 600`, tinted surface background |
| `:host([disabled])` | Reduced opacity (`0.55`) |

### cv-grid-row

Data row container. The parent `cv-grid` assigns `id`, `role="row"`, and `aria-rowindex` from headless `getRowProps`.

#### Anatomy

```
<cv-grid-row> (host)
└── <slot>       ← accepts cv-grid-cell children
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Unique row identifier. Auto-generated as `row-{n}` if empty. |
| `index` | Number | `0` | Explicit 1-based `aria-rowindex`. When `< 1`, positional index is used. |
| `disabled` | Boolean | `false` | Whether the row is disabled (all cells in this row become disabled) |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | One or more `<cv-grid-cell>` children |

#### Internal Events

| Event | Bubbles | Description |
|-------|---------|-------------|
| `cv-grid-row-slotchange` | Yes (composed) | Dispatched when slotted cell children change. The parent `cv-grid` listens for this to trigger model rebuild. |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host` | Table-row display |
| `:host([disabled])` | Reduced opacity (`0.55`) |

### cv-grid-cell

Individual data cell within a grid row. The parent `cv-grid` manages all ARIA attributes on this element via headless contracts and direct event wiring.

#### Anatomy

```
<cv-grid-cell> (host)
└── <slot>
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `column` | String | `""` | Column identifier this cell belongs to. Auto-assigned from positional column if empty. |
| `disabled` | Boolean | `false` | Whether the cell is individually disabled |
| `active` | Boolean | `false` | Whether the cell is the active (focused) cell. Managed by parent. |
| `selected` | Boolean | `false` | Whether the cell is selected. Managed by parent. |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Cell content |

#### CSS Custom Properties (inherited from theme)

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-space-2` | `8px` | Vertical padding |
| `--cv-space-3` | `12px` | Horizontal padding |
| `--cv-color-border` | `#2a3245` | Bottom border color (at 70% mix) |
| `--cv-color-text` | `#e8ecf6` | Text color |
| `--cv-color-primary` | `#65d7ff` | Active/selected background tint and focus outline color |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host` | Table-cell display, padding, bottom border, no outline |
| `:host([active])` | Primary-tinted background at 14% opacity |
| `:host([selected])` | Primary-tinted background at 24% opacity |
| `:host([disabled])` | Reduced opacity (`0.55`) |
| `:host(:focus-visible)` | 2px solid primary outline with -2px offset |
| `:host([hidden])` | Hidden (cell references non-existent column) |
