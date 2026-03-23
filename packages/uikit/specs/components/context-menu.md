# cv-context-menu

Contextual menu triggered by right-click, long-press on touch, or keyboard invocation, supporting action items, checkable items (checkbox/radio), sub-menus, separators, and group labels.

**Headless:** [`createContextMenu`](../../../headless/specs/components/context-menu.md)

## Anatomy

```
<cv-context-menu> (host)
├── <div part="target" tabindex="0">
│   └── <slot name="target">
└── <div part="menu" role="menu" tabindex="-1">
    └── <slot>   ← cv-context-menu-item / cv-context-menu-separator / cv-context-menu-group children
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Last selected item value |
| `open` | Boolean | `false` | Whether the menu is currently visible |
| `anchor-x` | Number | `0` | X coordinate of the menu anchor point |
| `anchor-y` | Number | `0` | Y coordinate of the menu anchor point |
| `aria-label` | String | `""` | Accessible label for the menu |
| `close-on-select` | Boolean | `true` | Close the menu after an item is selected |
| `close-on-outside-pointer` | Boolean | `true` | Close the menu on pointer interaction outside |

## Slots

| Slot | Description |
|------|-------------|
| `target` | Content that acts as the right-click/long-press target zone |
| `(default)` | `cv-context-menu-item`, `cv-context-menu-separator`, and `cv-context-menu-group` children |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `target` | `<div>` | Wrapper for the trigger/target zone |
| `menu` | `<div>` | Menu popup container positioned at anchor coordinates |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-context-menu-x` | `0px` | Inline-start position of the menu popup (set programmatically from `anchor-x`) |
| `--cv-context-menu-y` | `0px` | Block-start position of the menu popup (set programmatically from `anchor-y`) |
| `--cv-context-menu-min-inline-size` | `180px` | Minimum inline size of the menu popup |
| `--cv-context-menu-padding` | `var(--cv-space-1, 4px)` | Padding inside the menu popup |
| `--cv-context-menu-gap` | `var(--cv-space-1, 4px)` | Gap between menu items |
| `--cv-context-menu-border-radius` | `var(--cv-radius-md, 10px)` | Border radius of the menu popup |
| `--cv-context-menu-z-index` | `80` | Z-index of the menu popup |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([open])` | Menu popup is visible |
| `:host(:not([open]))` | Menu popup is hidden |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{value, activeId, open, anchorX, anchorY, openedBy}` | Fires on any state change (selection, active, open, anchor) |
| `cv-change` | `{value, activeId, open, anchorX, anchorY, openedBy}` | Fires only when the selected `value` changes |

Event detail type:

```ts
interface CVContextMenuEventDetail {
  value: string | null
  activeId: string | null
  open: boolean
  anchorX: number
  anchorY: number
  openedBy: string | null  // 'pointer' | 'keyboard' | 'programmatic' | null
}
```

## Imperative API

| Method | Signature | Description |
|--------|-----------|-------------|
| `openAt` | `(x: number, y: number) => void` | Opens the menu at the given coordinates |
| `cv-close` | `() => void` | Closes the menu |

## Keyboard Interaction

### Target element

| Key | Action |
|-----|--------|
| `ContextMenu` | Open menu at current anchor coordinates |
| `Shift+F10` | Open menu at current anchor coordinates |

### Menu (when open, no sub-menu)

| Key | Action |
|-----|--------|
| `Escape` | Close menu, restore focus to target |
| `Tab` | Close menu, restore focus to target |
| `ArrowDown` | Move active to next enabled item (wrapping) |
| `ArrowUp` | Move active to previous enabled item (wrapping) |
| `ArrowRight` | If active item has a sub-menu: open it, focus first child |
| `Home` | Move active to first enabled item |
| `End` | Move active to last enabled item |
| `Enter` / `Space` | Select active item |
| Printable character | Type-ahead: move active to matching item by label prefix |

### Sub-menu (when open)

| Key | Action |
|-----|--------|
| `Escape` | Close sub-menu, return to parent menu |
| `ArrowLeft` | Close sub-menu, return to parent menu |
| `ArrowDown` | Move to next enabled sub-menu item (wrapping) |
| `ArrowUp` | Move to previous enabled sub-menu item (wrapping) |
| `Home` | Move to first enabled sub-menu item |
| `End` | Move to last enabled sub-menu item |
| `Enter` / `Space` | Select active sub-menu item |

## Touch Interaction

Long-press on the target zone opens the menu at the touch coordinates after the long-press threshold (default 500ms). Touch move or touch end before the threshold cancels the long-press.

## ARIA Contract

| Element | Attribute | Value |
|---------|-----------|-------|
| menu | `role` | `menu` |
| menu | `tabindex` | `-1` |
| menu | `aria-label` | optional label text |
| menu | `hidden` | reflects `!open` |
| menu | `data-anchor-x` | string of `anchorX` |
| menu | `data-anchor-y` | string of `anchorY` |
| target | `id` | `{idBase}-target` |

## Reactive State Mapping

`cv-context-menu` is a visual adapter over headless `createContextMenu`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` | attr -> action | `actions.select(value)` when value changes |
| `open` | attr -> action | `actions.openAt(anchorX, anchorY)` when `true`; `actions.close()` when `false` |
| `anchor-x` / `anchor-y` | attr -> action | passed to `actions.openAt(x, y)` |
| `aria-label` | attr -> option | passed as `ariaLabel` in `createContextMenu(options)` |
| `close-on-select` | attr -> option | passed as `closeOnSelect` in `createContextMenu(options)` |
| `close-on-outside-pointer` | attr -> option | passed as `closeOnOutsidePointer` in `createContextMenu(options)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.isOpen()` | state -> attr | `[open]` host attribute, menu `[hidden]` |
| `state.activeId()` | state -> DOM | `[data-active]` on item elements, focus management |
| `state.anchorX()` / `state.anchorY()` | state -> attr | `[anchor-x]` / `[anchor-y]` host attributes, `--cv-context-menu-x` / `--cv-context-menu-y` CSS custom properties |
| `state.openedBy()` | state -> event | included in `cv-input`/`cv-change` event detail |
| `state.restoreTargetId()` | state -> DOM | focus restored to target element on close |
| `state.checkedIds()` | state -> DOM | `[aria-checked]` on checkbox/radio item elements |
| `state.openSubmenuId()` | state -> DOM | sub-menu container `[hidden]` state |
| `state.submenuActiveId()` | state -> DOM | `[data-active]` on sub-menu child items |

Contracts applied to DOM elements:

- `contracts.getTargetProps()` -> target wrapper (`[part="target"]`): provides `id`, `onContextMenu`, `onKeyDown`
- `contracts.getMenuProps()` -> menu container (`[part="menu"]`): provides `id`, `role`, `tabindex`, `hidden`, `aria-label`, `data-anchor-x`, `data-anchor-y`, `onKeyDown`
- `contracts.getItemProps(id)` -> each item element: provides `id`, `role`, `tabindex`, `aria-disabled`, `data-active`, `aria-checked`, `aria-haspopup`, `aria-expanded`, `onClick`
- `contracts.getSeparatorProps(id)` -> separator elements: provides `id`, `role`
- `contracts.getGroupLabelProps(id)` -> group label elements: provides `id`, `role`, `aria-label`
- `contracts.getSubmenuProps(id)` -> sub-menu containers: provides `id`, `role`, `tabindex`, `hidden`

UIKit does not own activation, navigation, or toggle logic; headless state is the source of truth.

## Usage

```html
<!-- Basic context menu -->
<cv-context-menu aria-label="File actions">
  <div slot="target">Right-click here</div>
  <cv-context-menu-item value="copy">Copy</cv-context-menu-item>
  <cv-context-menu-item value="paste">Paste</cv-context-menu-item>
  <cv-context-menu-item value="delete" disabled>Delete</cv-context-menu-item>
</cv-context-menu>

<!-- With separators and groups -->
<cv-context-menu aria-label="Edit actions">
  <div slot="target">Right-click here</div>
  <cv-context-menu-item value="cut">Cut</cv-context-menu-item>
  <cv-context-menu-item value="copy">Copy</cv-context-menu-item>
  <cv-context-menu-item value="paste">Paste</cv-context-menu-item>
  <cv-context-menu-separator></cv-context-menu-separator>
  <cv-context-menu-item value="select-all">Select All</cv-context-menu-item>
</cv-context-menu>

<!-- With checkbox items -->
<cv-context-menu aria-label="View options">
  <div slot="target">Right-click here</div>
  <cv-context-menu-item value="toolbar" type="checkbox" checked>Toolbar</cv-context-menu-item>
  <cv-context-menu-item value="sidebar" type="checkbox">Sidebar</cv-context-menu-item>
  <cv-context-menu-item value="statusbar" type="checkbox" checked>Status Bar</cv-context-menu-item>
</cv-context-menu>

<!-- With radio items -->
<cv-context-menu aria-label="Sort order">
  <div slot="target">Right-click here</div>
  <cv-context-menu-item value="name" type="radio" group="sort" checked>By Name</cv-context-menu-item>
  <cv-context-menu-item value="date" type="radio" group="sort">By Date</cv-context-menu-item>
  <cv-context-menu-item value="size" type="radio" group="sort">By Size</cv-context-menu-item>
</cv-context-menu>

<!-- With sub-menu -->
<cv-context-menu aria-label="Actions">
  <div slot="target">Right-click here</div>
  <cv-context-menu-item value="open">Open</cv-context-menu-item>
  <cv-context-menu-item value="share" type="submenu">
    Share
    <cv-context-menu-item slot="submenu" value="email">Email</cv-context-menu-item>
    <cv-context-menu-item slot="submenu" value="link">Copy Link</cv-context-menu-item>
  </cv-context-menu-item>
</cv-context-menu>

<!-- Imperative positioning -->
<cv-context-menu id="my-menu" aria-label="Custom menu">
  <div slot="target">Content area</div>
  <cv-context-menu-item value="action1">Action 1</cv-context-menu-item>
</cv-context-menu>
<script>
  document.getElementById('my-menu').openAt(200, 150)
</script>
```

## Child Elements

### cv-context-menu-item

Actionable item within a context menu. Supports standard, checkbox, radio, and submenu types.

#### Anatomy

```
<cv-context-menu-item> (host)
└── <div part="base" class="item">
    └── <slot>
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Identifier for the item (used as selection value) |
| `disabled` | Boolean | `false` | Prevents selection and skips during navigation |
| `active` | Boolean | `false` | Reflects keyboard-active (highlighted) state (managed by parent) |
| `selected` | Boolean | `false` | Reflects whether this item is the last selected value (managed by parent) |
| `type` | String | `"item"` | Item type: `item` \| `checkbox` \| `radio` \| `submenu` |
| `checked` | Boolean | `false` | Initial checked state for checkbox/radio items |
| `group` | String | `""` | Radio group name for radio items |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Item label text |
| `submenu` | Nested `cv-context-menu-item` children (only for `type="submenu"`) |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Item root wrapper |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-context-menu-item-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding of the item |
| `--cv-context-menu-item-padding-block` | `var(--cv-space-2, 8px)` | Vertical padding of the item |
| `--cv-context-menu-item-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius of the item |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([active])` | Item has keyboard focus (primary tint at 24%) |
| `:host([selected])` | Item is the last selected value (primary tint at 32%) |
| `:host([disabled])` | Item is non-selectable (opacity 0.5) |
| `:host([hidden])` | Item is hidden when menu is closed |
| `:host([type="checkbox"][aria-checked="true"])` | Checkbox item is checked |
| `:host([type="radio"][aria-checked="true"])` | Radio item is checked |

#### ARIA Contract

| Item type | `role` | Additional attributes |
|-----------|--------|-----------------------|
| `item` (default) | `menuitem` | `tabindex="-1"`, `aria-disabled` (when disabled), `data-active` |
| `checkbox` | `menuitemcheckbox` | `tabindex="-1"`, `aria-disabled`, `data-active`, `aria-checked` |
| `radio` | `menuitemradio` | `tabindex="-1"`, `aria-disabled`, `data-active`, `aria-checked` |
| `submenu` | `menuitem` | `tabindex="-1"`, `aria-disabled`, `data-active`, `aria-haspopup="menu"`, `aria-expanded` |

---

### cv-context-menu-separator

Visual divider between groups of menu items. Not actionable, skipped during keyboard navigation.

#### Anatomy

```
<cv-context-menu-separator> (host)
└── <div part="base" role="separator">
```

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Separator line element |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-context-menu-separator-color` | `var(--cv-color-border, #2a3245)` | Color of the separator line |

#### ARIA Contract

| Attribute | Value |
|-----------|-------|
| `role` | `separator` |

---

### cv-context-menu-group

Labels a group of related menu items. Not actionable, skipped during keyboard navigation.

#### Anatomy

```
<cv-context-menu-group> (host)
├── <div part="label" role="presentation" aria-label="...">
└── <slot>   ← cv-context-menu-item children
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `label` | String | `""` | Group label text (set as `aria-label` on the label element) |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | `cv-context-menu-item` children in this group |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `label` | `<div>` | Group label text element |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-context-menu-group-label-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding of the group label |
| `--cv-context-menu-group-label-font-size` | `0.75em` | Font size of the group label |

#### ARIA Contract

| Attribute | Value |
|-----------|-------|
| `role` | `presentation` |
| `aria-label` | group label text |
