# cv-treeview

Hierarchical tree widget providing APG-aligned keyboard navigation, expansion/collapse, and single- or multiple-select behavior over slotted `cv-treeitem` children.

**Headless:** [`createTreeview`](../../../headless/specs/components/treeview.md)

## Anatomy

```
<cv-treeview> (host)
└── <div part="base" role="tree">
    └── <slot>   ← accepts cv-treeitem children
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Selected item identifier in single-select mode; reflects the first entry of `selectedIds` from headless state; empty string means no selection |
| `values` | — | `[]` | Property-only (not an HTML attribute). Array of selected item id strings in multiple-select mode; reflects `selectedIds` from headless state |
| `expanded-values` | — | `[]` | Property-only (not an HTML attribute). Array of expanded item id strings; reflects `expandedIds` from headless state |
| `selection-mode` | String | `"single"` | Item selection mode: `single` \| `multiple` |
| `aria-label` | String | `""` | Accessible label applied to the root `[role=tree]` element |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Accepts `cv-treeitem` elements as root-level tree nodes; slot changes trigger model rebuild |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root interactive element with `role="tree"`; receives all ARIA tree attributes and keyboard event handling |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-treeview-indent-size` | `1.5rem` | Per-level indentation of child items |
| `--cv-treeview-indent-guide-width` | `0px` | Width of the vertical indent guide line; set to `1px` to show the guide |
| `--cv-treeview-indent-guide-color` | `var(--cv-color-border)` | Color of the vertical indent guide line |
| `--cv-treeview-indent-guide-style` | `solid` | Border style of the indent guide line (`solid`, `dotted`, `dashed`) |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Border color for the base wrapper |
| `--cv-color-surface` | `#141923` | Background color for the base wrapper |
| `--cv-color-primary` | `#65d7ff` | Focus outline color for the base wrapper |
| `--cv-radius-md` | `10px` | Border radius for the base wrapper |
| `--cv-space-1` | `4px` | Gap between tree items and padding within the base wrapper |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host` | `display: block` |
| `[part="base"]:focus-visible` | `outline: 2px solid var(--cv-color-primary)` at `outline-offset: 1px` |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{ value: string \| null, values: string[], activeId: string \| null, expandedValues: string[] }` | Fires on any user interaction that changes active item, selection, or expansion state |
| `cv-change` | `{ value: string \| null, values: string[], activeId: string \| null, expandedValues: string[] }` | Fires when selection or expansion state commits (subset of `cv-input` cases; active-item-only changes do not fire `cv-change`) |

`value` in the detail is `null` when no item is selected, otherwise the id string of the first selected item. `values` contains all selected ids (single-select mode will have at most one entry).

`cv-input` and `cv-change` only fire for user-driven interactions (keyboard, pointer). Programmatic changes via `value`, `values`, or `expandedValues` properties do not re-dispatch these events.

## Reactive State Mapping

`cv-treeview` is a visual adapter over headless `createTreeview`.

### UIKit properties → headless actions

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` (attr) | attr → action | `actions.select(value)` in single-select mode; `actions.clearSelected()` when empty |
| `values` (prop) | prop → action | `actions.clearSelected()` then `actions.toggleSelected(id)` per id (multiple mode; diff-applied) |
| `expandedValues` (prop) | prop → action | `actions.expand(id)` / `actions.collapse(id)` (diff-applied) |
| `selection-mode` (attr) | attr → option | passed as `selectionMode` to `createTreeview(options)` on model rebuild |
| `aria-label` (attr) | attr → option | passed as `ariaLabel` to `createTreeview(options)` on model rebuild |

### Headless state → DOM attributes

| Headless Signal | Direction | DOM Reflection |
|-----------------|-----------|----------------|
| `state.selectedIds()` | state → prop/attr | `values` property; `value` attribute (first selected id or `""`); `[selected]` on matching `cv-treeitem` elements; `aria-selected="true"` on selected items via `getItemProps` |
| `state.activeId()` | state → prop | `[active]` on matching `cv-treeitem` element; `tabindex="0"` on active item via `getItemProps`; focus moved to active element |
| `state.expandedIds()` | state → prop | `expandedValues` property; `[expanded]` on matching `cv-treeitem` elements; child visibility toggled via `[hidden]` attribute on non-expanded branch children |

### Contracts spread onto DOM elements

| Contract | Spread target |
|----------|---------------|
| `contracts.getTreeProps()` | `[part="base"]` — applies `role`, `tabindex`, `aria-label`, `aria-multiselectable` |
| `contracts.getItemProps(id)` | Each `cv-treeitem` element — applies `id`, `role`, `tabindex`, `aria-level`, `aria-posinset`, `aria-setsize`, `aria-selected`, `aria-expanded` (branch only), `aria-disabled` (disabled only), `data-active`, `data-expanded`; UIKit also writes `active`, `selected`, `expanded`, `branch`, `level`, `disabled`, and `hidden` as element properties |

### Pointer and keyboard action triggers

| User Trigger | Action Called |
|--------------|---------------|
| `click` on a `cv-treeitem` | `actions.setActive(id)`; then `actions.toggleSelected(id)` (multiple mode) or `actions.select(id)` (single mode) |
| `cv-treeitem-toggle` event from a `cv-treeitem` | `actions.toggleExpanded(id)` |
| `focus` on a `cv-treeitem` | `actions.setActive(id)` |
| `keydown` on `[part="base"]` | `actions.handleKeyDown(event)` |
| slot content change | Model rebuilt from DOM (`rebuildModelFromSlot(preserveState: true)`) |
| `selection-mode` / `aria-label` change | Model rebuilt from DOM (`rebuildModelFromSlot(preserveState: true)`) |

## Keyboard Interaction

Derived from headless `handleKeyDown` contract:

| Key | Behavior |
|-----|----------|
| `ArrowUp` | Move focus to previous visible enabled item; in single-select mode also moves selection to that item (selection-follows-focus) |
| `ArrowDown` | Move focus to next visible enabled item; in single-select mode also moves selection to that item (selection-follows-focus) |
| `ArrowRight` | If focused item is a collapsed branch: expand it (focus stays). If focused item is an expanded branch: move focus to first child item |
| `ArrowLeft` | If focused item is an expanded branch: collapse it (focus stays). If focused item is collapsed or a leaf: move focus to parent item |
| `Home` | Move focus to first visible enabled item; in single-select mode also moves selection to that item (selection-follows-focus) |
| `End` | Move focus to last visible enabled item; in single-select mode also moves selection to that item (selection-follows-focus) |
| `Enter` | Select the currently focused item (both modes; replaces selection) |
| `Space` | Toggle selection on the currently focused item (both modes; in multiple mode, focus and selection are independent) |
| `Ctrl+A` / `Meta+A` | Select all enabled items (multiple mode only) |

**Selection-follows-focus** applies in single-select mode only. When `ArrowUp`, `ArrowDown`, `Home`, or `End` moves focus to a new enabled visible node, `selectedIds` is simultaneously updated to contain only that node's id. In multiple-select mode, focus and selection remain independent.

Keys `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `Enter`, and `Space` are always `preventDefault()`-ed when handled.

## ARIA

| Element | Role | Required Attributes |
|---------|------|---------------------|
| `[part="base"]` | `tree` | `aria-label` (recommended); `aria-multiselectable="true"` when `selection-mode="multiple"` |
| `cv-treeitem` | `treeitem` | `aria-level`, `aria-posinset`, `aria-setsize`, `aria-selected`; `aria-expanded` (branch items only); `aria-disabled` (disabled items only) |

`aria-level` starts at `1` for root items. `aria-multiselectable` is `"true"` when `selection-mode="multiple"`, omitted otherwise.

## Usage

```html
<!-- Single-select tree -->
<cv-treeview aria-label="File tree" selection-mode="single">
  <cv-treeitem value="src" label="src/">
    <cv-treeitem value="index" label="index.ts" slot="children"></cv-treeitem>
    <cv-treeitem value="app" label="app.ts" slot="children"></cv-treeitem>
  </cv-treeitem>
  <cv-treeitem value="readme" label="README.md"></cv-treeitem>
</cv-treeview>

<!-- Multiple-select tree with pre-expanded branch -->
<cv-treeview aria-label="Settings" selection-mode="multiple">
  <cv-treeitem value="general" label="General">
    <cv-treeitem value="theme" label="Theme" slot="children"></cv-treeitem>
    <cv-treeitem value="language" label="Language" slot="children"></cv-treeitem>
  </cv-treeitem>
  <cv-treeitem value="advanced" label="Advanced" disabled></cv-treeitem>
</cv-treeview>
```

## Child Elements

### cv-treeitem

Represents a single tree node. Slotted directly into `cv-treeview` (root items) or into `slot="children"` of a parent `cv-treeitem` (child items). State attributes (`active`, `selected`, `expanded`, `branch`, `level`, `hidden`) are managed by the parent `cv-treeview`; authors should not set them manually.

#### Anatomy

```
<cv-treeitem> (host)
├── <div part="row">
│   ├── <button part="toggle" aria-hidden?=${!branch} hidden?=${!branch}>
│   │   └── ▸ or ▾ (expand/collapse icon)
│   └── <span part="label">
│       └── <slot name="label">   ← falls back to [label] attribute text
└── <div part="children" role="group" hidden?=${!expanded}>
    └── <slot name="children">    ← accepts nested cv-treeitem children
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Item identifier. Auto-assigned as `"item-N"` by parent if empty |
| `label` | String | `""` | Fallback text displayed in the `label` slot when no slotted content is provided |
| `disabled` | Boolean | `false` | Marks item as disabled; excluded from navigation and selection |
| `active` | Boolean | `false` | Set by parent `cv-treeview` when this item is the currently focused item; drives row-level active highlight |
| `selected` | Boolean | `false` | Set by parent `cv-treeview` when this item is selected; drives row-level selection highlight |
| `expanded` | Boolean | `false` | Set by parent `cv-treeview`; controls visibility of `[part="children"]` and reflects `aria-expanded` |
| `branch` | Boolean | `false` | Set by parent `cv-treeview` when this item has child items; shows the toggle button |
| `level` | Number | `1` | Nesting depth written by parent `cv-treeview` from `getItemProps()['aria-level']`; drives indentation via `--cv-tree-level` inline property; root items get `1`, child items get `2`, grandchild items get `3`, etc. |
| `hidden` | Boolean | `false` | Set by parent `cv-treeview` when item is not visible due to an ancestor being collapsed; maps to `display: none` |

#### Slots

| Slot | Description |
|------|-------------|
| `label` | Item label content; falls back to the `label` attribute value |
| `children` | Accepts nested `cv-treeitem` elements; rendered inside `[part="children"]`, hidden when `[expanded]` is absent |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `row` | `<div>` | Row layout element; uses CSS grid with toggle button and label; left-padding computed from `--cv-treeview-indent-size` and `--cv-tree-level` (inline custom property set by parent `cv-treeview`) |
| `toggle` | `<button>` | Expand/collapse trigger button; hidden (visibility-hidden) when `[branch]` is absent |
| `label` | `<span>` | Wrapper around the `label` slot |
| `children` | `<div>` | Container for nested child items; `display: none` when `[expanded]` is absent |

#### CSS Custom Properties

`cv-treeitem` defines the following custom properties with defaults on `:host`, which can be overridden by the parent `cv-treeview` or any ancestor:

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-treeview-indent-size` | `1.5rem` | Per-level indentation; used directly in `[part="row"]` padding calculation via `--cv-tree-level` inline property |
| `--cv-treeview-indent-guide-width` | `0px` | Width of the vertical indent guide line on `[part="children"]`; set to `1px` to show the guide |
| `--cv-treeview-indent-guide-color` | `var(--cv-color-border)` | Color of the vertical indent guide line |
| `--cv-treeview-indent-guide-style` | `solid` | Border style of the vertical indent guide line |

Additionally, component styles depend on theme tokens:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-primary` | `#65d7ff` | Active/selected row background tint and focus outline color |
| `--cv-color-border` | `#2a3245` | Toggle button border color |
| `--cv-color-surface` | `#141923` | Toggle button background color |
| `--cv-color-text` | `#e8ecf6` | Toggle button icon color |
| `--cv-radius-sm` | `6px` | Border radius of `[part="row"]` and `[part="toggle"]` |
| `--cv-radius-xs` | `4px` | Border radius of `[part="toggle"]` |
| `--cv-space-1` | `4px` | Gap between toggle button and label in `[part="row"]` |
| `--cv-space-2` | `8px` | Inline-end padding of `[part="row"]` |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host` | `display: block`, `outline: none` |
| `:host([hidden])` | `display: none` |
| `:host([active]) [part="row"]` | `background: color-mix(in oklab, var(--cv-color-primary) 22%, transparent)` |
| `:host([selected]) [part="row"]` | `background: color-mix(in oklab, var(--cv-color-primary) 30%, transparent)` |
| `:host([disabled]) [part="row"]` | `opacity: 0.55` |
| `:host([expanded]) [part="children"]` | Visible (default); children hidden only when `[expanded]` is absent |
| `:host([branch]) [part="toggle"]` | Toggle button rendered and visible |
| `:host(:focus-visible) [part="row"]` | `outline: 2px solid var(--cv-color-primary)` at `outline-offset: 1px` |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-treeitem-toggle` | `{ id: string }` | Fired (bubbling, composed) when the user clicks the `[part="toggle"]` button; intercepted by the parent `cv-treeview` to call `actions.toggleExpanded(id)`; `stopPropagation()` is called by the parent so the event does not escape the tree |

## Out of Scope

- Async/lazy loading of child nodes (pagination or lazy fetch)
- Drag-and-drop node reordering
- Checkbox or radio variant tree items
- Typeahead (jump to node by typed character)
- Leaf-only selection mode (preventing branch-node selection)
