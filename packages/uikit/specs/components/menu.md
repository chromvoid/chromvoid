# cv-menu

Menu panel that displays a list of actionable items, supporting checkable items (checkbox/radio), submenus, groups, and typeahead navigation.

**Headless:** [`createMenu`](../../../headless/specs/components/menu.md)

## Anatomy

```
<cv-menu> (host)
└── <div part="base" role="menu">
    └── <slot>   ← cv-menu-item / cv-menu-group children
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Last selected item value |
| `open` | Boolean | `false` | Whether the menu panel is visible |
| `close-on-select` | Boolean | `true` | Close the menu after an item is selected (overridden to `false` for checkable items) |
| `aria-label` | String | `""` | Accessible label for the menu |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | `cv-menu-item` and `cv-menu-group` children |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root menu container with `role="menu"` |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-menu-padding` | `var(--cv-space-1, 4px)` | Padding inside the menu |
| `--cv-menu-gap` | `var(--cv-space-1, 4px)` | Gap between menu items |
| `--cv-menu-border-radius` | `var(--cv-radius-md, 10px)` | Border radius of the menu |
| `--cv-menu-background` | `var(--cv-color-surface-elevated, #1d2432)` | Background color of the menu |
| `--cv-menu-border-color` | `var(--cv-color-border, #2a3245)` | Border color of the menu |
| `--cv-menu-shadow` | `var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24))` | Box shadow of the menu |
| `--cv-menu-max-height` | `none` | Maximum height of the menu (scrollable when exceeded) |
| `--cv-menu-min-inline-size` | `180px` | Minimum inline size of the menu |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([open])` | Menu panel is visible |
| `:host(:not([open]))` | Menu panel is hidden |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{value, activeId, open}` | Fires on any state change (selection, active, open) |
| `cv-change` | `{value, activeId, open}` | Fires only when the selected `value` changes |

Event detail type:

```ts
interface CVMenuEventDetail {
  value: string | null
  activeId: string | null
  open: boolean
}
```

## Reactive State Mapping

`cv-menu` is a visual adapter over headless `createMenu`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` | attr -> action | `actions.select(value)` when value changes |
| `open` | attr -> action | `actions.open()` when `true`; `actions.close()` when `false` |
| `close-on-select` | attr -> option | passed as `closeOnSelect` in `createMenu(options)` |
| `aria-label` | attr -> option | passed as `ariaLabel` in `createMenu(options)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.isOpen()` | state -> attr | `[open]` host attribute, menu `[hidden]` |
| `state.activeId()` | state -> DOM | `[data-active]` on item elements, focus management |
| `state.selectedId()` | state -> attr | `[value]` host attribute |
| `state.checkedIds()` | state -> DOM | `[aria-checked]` on checkbox/radio item elements |
| `state.openSubmenuId()` | state -> DOM | submenu container `[hidden]` state |
| `state.submenuActiveId()` | state -> DOM | `[data-active]` on submenu child items |

Contracts applied to DOM elements:

- `contracts.getMenuProps()` -> menu container (`[part="base"]`): provides `id`, `role`, `tabindex`, `aria-label`, `aria-activedescendant`
- `contracts.getItemProps(id)` -> each item element: provides `id`, `role`, `tabindex`, `aria-disabled`, `data-active`, `aria-checked`, `aria-haspopup`, `aria-expanded`
- `contracts.getGroupProps(groupId)` -> group container elements: provides `id`, `role`, `aria-label`
- `contracts.getSubmenuProps(parentItemId)` -> submenu containers: provides `id`, `role`, `tabindex`, `hidden`
- `contracts.getSubmenuItemProps(parentItemId, childId)` -> submenu item elements: provides `id`, `role`, `tabindex`, `aria-disabled`, `data-active`, `aria-checked`

UIKit does not own activation, navigation, check toggle, or submenu logic; headless state is the source of truth.

## Usage

```html
<!-- Basic menu -->
<cv-menu open aria-label="Actions">
  <cv-menu-item value="cut">Cut</cv-menu-item>
  <cv-menu-item value="copy">Copy</cv-menu-item>
  <cv-menu-item value="paste">Paste</cv-menu-item>
</cv-menu>

<!-- With disabled item -->
<cv-menu open aria-label="Edit">
  <cv-menu-item value="undo">Undo</cv-menu-item>
  <cv-menu-item value="redo" disabled>Redo</cv-menu-item>
</cv-menu>

<!-- With checkbox group -->
<cv-menu open aria-label="View options">
  <cv-menu-group type="checkbox" label="Panels">
    <cv-menu-item value="toolbar" checked>Toolbar</cv-menu-item>
    <cv-menu-item value="sidebar">Sidebar</cv-menu-item>
    <cv-menu-item value="statusbar" checked>Status Bar</cv-menu-item>
  </cv-menu-group>
</cv-menu>

<!-- With radio group -->
<cv-menu open aria-label="Sort order">
  <cv-menu-group type="radio" label="Sort by">
    <cv-menu-item value="name" checked>Name</cv-menu-item>
    <cv-menu-item value="date">Date</cv-menu-item>
    <cv-menu-item value="size">Size</cv-menu-item>
  </cv-menu-group>
</cv-menu>

<!-- With submenu -->
<cv-menu open aria-label="File">
  <cv-menu-item value="new">New</cv-menu-item>
  <cv-menu-item value="share">
    Share
    <cv-menu slot="submenu">
      <cv-menu-item value="email">Email</cv-menu-item>
      <cv-menu-item value="link">Copy Link</cv-menu-item>
    </cv-menu>
  </cv-menu-item>
</cv-menu>
```

---

## Child Elements

### cv-menu-item

Actionable item within a menu. Supports standard, checkbox, and radio types, as well as hosting a submenu.

#### Anatomy

```
<cv-menu-item> (host)
└── <div part="base" class="item">
    ├── <span part="checkmark">          ← only for checkbox/radio items
    ├── <span part="prefix">
    │   └── <slot name="prefix">
    ├── <span part="label">
    │   └── <slot>
    ├── <span part="suffix">
    │   └── <slot name="suffix">
    └── <span part="submenu-icon">       ← only when item has submenu
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Identifier for the item (used as selection value and typeahead matching) |
| `disabled` | Boolean | `false` | Prevents selection and skips during navigation |
| `type` | String | `"normal"` | Item type: `normal` \| `checkbox` \| `radio` (inherited from parent `cv-menu-group` when not explicitly set) |
| `checked` | Boolean | `false` | Checked state for checkbox/radio items |
| `active` | Boolean | `false` | Reflects keyboard-active (highlighted) state (managed by parent) |
| `selected` | Boolean | `false` | Reflects whether this item is the last selected value (managed by parent) |
| `label` | String | `""` | Explicit label for typeahead matching (defaults to text content if not set) |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Item label text |
| `prefix` | Icon or element before the label |
| `suffix` | Icon or element after the label (e.g., keyboard shortcut text) |
| `submenu` | Nested `cv-menu` for submenu content |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Item root wrapper |
| `checkmark` | `<span>` | Check indicator for checkbox/radio items (rendered only when `type` is `checkbox` or `radio`) |
| `prefix` | `<span>` | Wrapper around the `prefix` slot |
| `label` | `<span>` | Wrapper around the default slot |
| `suffix` | `<span>` | Wrapper around the `suffix` slot |
| `submenu-icon` | `<span>` | Arrow indicator for items with submenu (rendered only when submenu slot is populated) |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-menu-item-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding of the item |
| `--cv-menu-item-padding-block` | `var(--cv-space-2, 8px)` | Vertical padding of the item |
| `--cv-menu-item-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius of the item |
| `--cv-menu-item-gap` | `var(--cv-space-2, 8px)` | Gap between internal parts (checkmark, prefix, label, suffix, submenu-icon) |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([active])` | Item has keyboard focus (primary tint at 24%) |
| `:host([selected])` | Item is the last selected value (primary tint at 32%) |
| `:host([disabled])` | Item is non-selectable (opacity 0.5) |
| `:host([hidden])` | Item is hidden when menu is closed |
| `:host([checked])` | Checkbox/radio item is checked (checkmark visible) |
| `:host([has-submenu])` | Item hosts a submenu (submenu-icon visible) |

#### ARIA Contract

| Item type | `role` | Additional attributes |
|-----------|--------|-----------------------|
| `normal` (default) | `menuitem` | `tabindex="-1"`, `aria-disabled` (when disabled), `data-active` |
| `checkbox` | `menuitemcheckbox` | `tabindex="-1"`, `aria-disabled`, `data-active`, `aria-checked` |
| `radio` | `menuitemradio` | `tabindex="-1"`, `aria-disabled`, `data-active`, `aria-checked` |
| any with submenu | adds to existing role | `aria-haspopup="menu"`, `aria-expanded` |

---

### cv-menu-group

Groups related menu items under a label. Children inherit the `type` attribute for checkbox/radio behavior.

#### Anatomy

```
<cv-menu-group> (host)
├── <div part="label" role="presentation">   ← from label attribute or label slot
└── <div part="base" role="group">
    └── <slot>   ← cv-menu-item children
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | String | `""` | Checkable type propagated to children: `checkbox` \| `radio` |
| `label` | String | `""` | Group accessible name (used as `aria-label` on the group container) |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | `cv-menu-item` children |
| `label` | Custom group heading content (overrides `label` attribute) |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Group container with `role="group"` |
| `label` | `<div>` | Group label text element |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-menu-group-label-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding of the group label |
| `--cv-menu-group-label-font-size` | `0.75em` | Font size of the group label |
| `--cv-menu-group-gap` | `var(--cv-space-1, 4px)` | Gap between items within the group |

#### Visual States

None. The group itself has no interactive visual states.

#### ARIA Contract

| Attribute | Value |
|-----------|-------|
| `role` | `group` (on `[part="base"]`) |
| `aria-label` | group label text |

---

### cv-menu-button

Button that opens a menu popup. Supports standard and split-button patterns.

#### Anatomy

```
<cv-menu-button> (host)
└── <div part="base">
    ├── <button part="trigger">                ← standard mode: single trigger
    │   ├── <span part="prefix">
    │   │   └── <slot name="prefix">
    │   ├── <span part="label">
    │   │   └── <slot>
    │   ├── <span part="suffix">
    │   │   └── <slot name="suffix">
    │   └── <span part="dropdown-icon">
    └── <div part="menu" role="menu">
        └── <slot name="menu">               ← cv-menu-item children
```

Split-button mode (`[split]`):

```
<cv-menu-button split> (host)
└── <div part="base">
    ├── <button part="action">                ← primary action
    │   ├── <span part="prefix">
    │   │   └── <slot name="prefix">
    │   ├── <span part="label">
    │   │   └── <slot>
    │   └── <span part="suffix">
    │       └── <slot name="suffix">
    ├── <button part="dropdown">              ← opens menu
    │   └── <span part="dropdown-icon">
    └── <div part="menu" role="menu">
        └── <slot name="menu">
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Last selected menu item value |
| `open` | Boolean | `false` | Whether the menu popup is visible |
| `disabled` | Boolean | `false` | Prevents all interaction |
| `split` | Boolean | `false` | Enables split-button mode with separate action and dropdown areas |
| `size` | String | `"medium"` | Size: `small` \| `medium` \| `large` |
| `variant` | String | `"default"` | Visual variant: `default` \| `primary` \| `danger` \| `ghost` |
| `close-on-select` | Boolean | `true` | Close the menu after an item is selected |
| `aria-label` | String | `""` | Accessible label for the trigger/dropdown |

#### Sizes

| Size | `--cv-menu-button-min-height` | `--cv-menu-button-padding-inline` | `--cv-menu-button-padding-block` |
|------|-------------------------------|-----------------------------------|----------------------------------|
| `small` | `30px` | `var(--cv-space-2, 8px)` | `var(--cv-space-1, 4px)` |
| `medium` | `36px` | `var(--cv-space-3, 12px)` | `var(--cv-space-2, 8px)` |
| `large` | `42px` | `var(--cv-space-4, 16px)` | `var(--cv-space-2, 8px)` |

#### Variants

| Variant | Description |
|---------|-------------|
| `default` | Default surface background with border |
| `primary` | Primary-tinted background and border |
| `danger` | Danger-tinted background and border |
| `ghost` | Transparent background and border |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Button label text |
| `prefix` | Icon or element before the label |
| `suffix` | Icon or element after the label |
| `menu` | `cv-menu-item` children for the dropdown menu |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root layout wrapper |
| `trigger` | `<button>` | Full trigger button (standard mode only) |
| `action` | `<button>` | Primary action button (split mode only) |
| `dropdown` | `<button>` | Dropdown arrow button (split mode only) |
| `label` | `<span>` | Wrapper around the default slot |
| `prefix` | `<span>` | Wrapper around the `prefix` slot |
| `suffix` | `<span>` | Wrapper around the `suffix` slot |
| `dropdown-icon` | `<span>` | Dropdown arrow indicator |
| `menu` | `<div>` | Menu popup container |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-menu-button-min-height` | `36px` | Minimum block size of the trigger |
| `--cv-menu-button-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding of the trigger |
| `--cv-menu-button-padding-block` | `var(--cv-space-2, 8px)` | Vertical padding of the trigger |
| `--cv-menu-button-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius of the trigger |
| `--cv-menu-button-gap` | `var(--cv-space-2, 8px)` | Gap between trigger content parts |
| `--cv-menu-button-font-size` | `inherit` | Font size of button content |
| `--cv-menu-button-menu-offset` | `var(--cv-space-1, 4px)` | Gap between trigger and menu popup |
| `--cv-menu-button-menu-min-inline-size` | `max(180px, 100%)` | Minimum inline size of the menu popup |
| `--cv-menu-button-menu-z-index` | `20` | Z-index of the menu popup |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{value, activeId, open}` | Fires on any state change (selection, active, open) forwarded from menu |
| `cv-change` | `{value, activeId, open}` | Fires only when the selected `value` changes |
| `cv-action` | `{}` | Fires when the action button is clicked in split-button mode |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([open])` | Menu popup is visible |
| `:host([disabled])` | Reduced opacity, `cursor: not-allowed`, all interaction blocked |
| `:host([split])` | Split-button mode with separate action and dropdown areas |
| `:host([size="small"])` | Small size overrides |
| `:host([size="large"])` | Large size overrides |
| `:host([variant="default"])` | Default surface background with border |
| `:host([variant="primary"])` | Primary-tinted background and border |
| `:host([variant="danger"])` | Danger-tinted background and border |
| `:host([variant="ghost"])` | Transparent background and border |

#### Reactive State Mapping

`cv-menu-button` is a visual adapter over headless `createMenu`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` | attr -> action | `actions.select(value)` when value changes |
| `open` | attr -> action | `actions.open()` when `true`; `actions.close()` when `false` |
| `disabled` | attr -> DOM | disables trigger and blocks all interaction |
| `split` | attr -> option | passed as `splitButton` in `createMenu(options)` |
| `close-on-select` | attr -> option | passed as `closeOnSelect` in `createMenu(options)` |
| `aria-label` | attr -> option | passed as `ariaLabel` in `createMenu(options)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.isOpen()` | state -> attr | `[open]` host attribute, menu `[hidden]` |
| `state.activeId()` | state -> DOM | `[data-active]` on item elements, focus management |
| `state.selectedId()` | state -> attr | `[value]` host attribute |
| `state.openedBy()` | state -> DOM | focus management strategy (keyboard vs pointer) |
| `state.restoreTargetId()` | state -> DOM | focus restored to trigger on close |
| `state.checkedIds()` | state -> DOM | `[aria-checked]` on checkbox/radio item elements |
| `state.openSubmenuId()` | state -> DOM | submenu container `[hidden]` state |
| `state.submenuActiveId()` | state -> DOM | `[data-active]` on submenu child items |

Contracts applied to DOM elements:

- `contracts.getTriggerProps()` -> trigger button (`[part="trigger"]`): provides `id`, `tabindex`, `aria-haspopup`, `aria-expanded`, `aria-controls`, `aria-label`
- `contracts.getMenuProps()` -> menu container (`[part="menu"]`): provides `id`, `role`, `tabindex`, `aria-label`, `aria-activedescendant`
- `contracts.getItemProps(id)` -> each item element: provides `id`, `role`, `tabindex`, `aria-disabled`, `data-active`, `aria-checked`, `aria-haspopup`, `aria-expanded`
- `contracts.getSplitTriggerProps()` -> action button (`[part="action"]`): provides `id`, `tabindex`, `role` (only when `split` is `true`)
- `contracts.getSplitDropdownProps()` -> dropdown button (`[part="dropdown"]`): provides `id`, `tabindex`, `role`, `aria-haspopup`, `aria-expanded`, `aria-controls`, `aria-label` (only when `split` is `true`)

UIKit does not own activation, navigation, toggle, or dismiss logic; headless state is the source of truth.

#### ARIA Contract

| Element | Attribute | Value |
|---------|-----------|-------|
| trigger (standard) | `aria-haspopup` | `menu` |
| trigger (standard) | `aria-expanded` | `true` / `false` |
| trigger (standard) | `aria-controls` | menu element id |
| action (split) | `role` | `button` |
| dropdown (split) | `aria-haspopup` | `menu` |
| dropdown (split) | `aria-expanded` | `true` / `false` |
| dropdown (split) | `aria-controls` | menu element id |
| dropdown (split) | `aria-label` | `"More options"` or from `aria-label` attribute |
| menu | `role` | `menu` |
| menu | `tabindex` | `-1` |
| menu | `aria-activedescendant` | id of active item (when open) |

#### Usage

```html
<!-- Basic menu button -->
<cv-menu-button>
  Actions
  <cv-menu-item slot="menu" value="cut">Cut</cv-menu-item>
  <cv-menu-item slot="menu" value="copy">Copy</cv-menu-item>
  <cv-menu-item slot="menu" value="paste">Paste</cv-menu-item>
</cv-menu-button>

<!-- With icon prefix -->
<cv-menu-button variant="primary">
  <icon-plus slot="prefix"></icon-plus>
  Create
  <cv-menu-item slot="menu" value="file">New File</cv-menu-item>
  <cv-menu-item slot="menu" value="folder">New Folder</cv-menu-item>
</cv-menu-button>

<!-- Small size -->
<cv-menu-button size="small">
  Options
  <cv-menu-item slot="menu" value="a">Option A</cv-menu-item>
  <cv-menu-item slot="menu" value="b">Option B</cv-menu-item>
</cv-menu-button>

<!-- Split button -->
<cv-menu-button split variant="primary">
  Save
  <cv-menu-item slot="menu" value="save-as">Save As...</cv-menu-item>
  <cv-menu-item slot="menu" value="save-copy">Save Copy</cv-menu-item>
  <cv-menu-item slot="menu" value="export">Export</cv-menu-item>
</cv-menu-button>

<!-- Disabled -->
<cv-menu-button disabled>
  Disabled
  <cv-menu-item slot="menu" value="a">Option A</cv-menu-item>
</cv-menu-button>
```
