# Context Menu Component Contract

## Purpose

`Context Menu` provides a headless model for pointer and keyboard-invoked contextual menu interactions. It composes the existing `createMenu` primitive for navigation and selection, adding right-click trigger behavior, coordinate-based positioning, keyboard invocation (`Shift+F10`, `ContextMenu` key), checkable items (checkbox/radio), sub-menus, separators, group labels, long-press touch support, and type-ahead character navigation on top.

## Component Files

- `src/context-menu/index.ts` - model and public `createContextMenu` API
- `src/context-menu/context-menu.test.ts` - unit behavior tests

## Public API

### `createContextMenu(options)`

```ts
interface CreateContextMenuOptions {
  items: readonly ContextMenuItem[]
  idBase?: string
  ariaLabel?: string
  closeOnSelect?: boolean           // default: true (via composed menu)
  closeOnOutsidePointer?: boolean   // default: true
  longPressDuration?: number        // default: 500 (ms, for touch devices)
}
```

### `ContextMenuItem`

Context-menu uses its own item type that extends beyond the composed menu's `MenuItem` to support checkable items, separators, group labels, and sub-menus:

```ts
type ContextMenuItemType = 'item' | 'separator' | 'group-label' | 'checkbox' | 'radio' | 'submenu'

interface ContextMenuItem {
  id: string
  label?: string
  disabled?: boolean
  type?: ContextMenuItemType        // default: 'item'
  checked?: boolean                 // initial checked state for checkbox/radio items
  group?: string                    // radio group name for radio items
  children?: readonly ContextMenuItem[]  // children for submenu items
}
```

Item types and their behavior:
- `'item'` (default) — standard actionable menu item
- `'separator'` — visual divider, not actionable, skipped during navigation
- `'group-label'` — label for a group of items, not actionable, skipped during navigation
- `'checkbox'` — toggleable item with `aria-checked` state
- `'radio'` — mutually exclusive item within a `group`, with `aria-checked` state
- `'submenu'` — item that opens a nested sub-menu via `children`

### Return: `ContextMenuModel`

```ts
interface ContextMenuModel {
  readonly state: ContextMenuState
  readonly actions: ContextMenuActions
  readonly contracts: ContextMenuContracts
}
```

## State Signal Surface

All state is signal-backed (Reatom atoms). UIKit reads these reactively to drive re-renders.

| Signal | Type | Description |
| --- | --- | --- |
| `isOpen()` | `boolean` | Menu visibility. Delegated to composed `createMenu`. |
| `activeId()` | `string \| null` | Currently highlighted item id. Delegated to composed `createMenu`. |
| `anchorX()` | `number` | X coordinate of the context menu anchor point (from right-click or imperative call). Initial: `0`. |
| `anchorY()` | `number` | Y coordinate of the context menu anchor point. Initial: `0`. |
| `openedBy()` | `ContextMenuOpenSource \| null` | Source that triggered the current open: `'pointer'`, `'keyboard'`, or `'programmatic'`. Resets to `null` on close. |
| `restoreTargetId()` | `string \| null` | DOM id of the element that should receive focus after menu close. Set to `'{idBase}-target'` on close/select-close. `null` while open. |
| `checkedIds()` | `ReadonlySet<string>` | Set of currently checked item ids. Initialized from items with `checked: true`. Updated on checkbox toggle and radio group selection. |
| `openSubmenuId()` | `string \| null` | Id of the currently open sub-menu parent item, or `null` if no sub-menu is open. Reset to `null` on close. |
| `submenuActiveId()` | `string \| null` | Id of the currently highlighted item within the open sub-menu, or `null`. Reset to `null` on close or sub-menu close. |

```ts
type ContextMenuOpenSource = 'pointer' | 'keyboard' | 'programmatic'
```

### Composed State (from `createMenu`)

The following state is held internally by the composed `createMenu` instance and exposed through the context-menu model's `state`:

- `isOpen` -- re-exported directly from `menu.state.isOpen`
- `activeId` -- re-exported directly from `menu.state.activeId`

The composed menu also holds `selectedId`, `openedBy`, and `hasSelection`, but these are internal to the menu and not re-exported on the context-menu surface.

## Actions

All state transitions go through these actions. UIKit must never mutate state directly.

| Action | Signature | Description |
| --- | --- | --- |
| `openAt` | `(x: number, y: number, source?: ContextMenuOpenSource) => void` | Opens the menu at coordinates `(x, y)`. Sets `anchorX`, `anchorY`, `openedBy`. Default `source` is `'programmatic'`. Clears `restoreTargetId`. Resets `openSubmenuId` and `submenuActiveId` to `null`. Delegates open to composed menu. |
| `close` | `() => void` | Closes the menu. Resets `activeId` to `null`. Sets `openedBy` to `null`. Sets `restoreTargetId` to `'{idBase}-target'`. Resets `openSubmenuId` and `submenuActiveId` to `null`. |
| `select` | `(id: string) => void` | Selects an item. For checkbox items, toggles the item's presence in `checkedIds`. For radio items, sets the item as the only checked item in its group. For submenu children, closes the entire menu if `closeOnSelect` is true. For regular items, delegates to composed menu's `select`. Skips separators and group-labels. No-op for disabled or unknown items. If menu closes as a result (when `closeOnSelect` is true), resets `openedBy` to `null`, sets `restoreTargetId`, and resets sub-menu state. |
| `handleTargetKeyDown` | `(event: ContextMenuKeyboardEventLike) => void` | Handles keyboard on the target element. Opens the menu on `ContextMenu` key or `Shift+F10`. Uses `'keyboard'` as open source. Coordinates stay at their current values (last known position). |
| `handleKeyDown` | `(event: ContextMenuKeyboardEventLike) => void` | Handles keyboard inside the open menu. When a sub-menu is open, delegates to sub-menu keyboard handler first (Escape/ArrowLeft close sub-menu, ArrowDown/ArrowUp/Home/End navigate sub-menu items, Enter/Space select sub-menu item). `Escape` and `Tab` close the menu. `ArrowRight` on a submenu item opens the sub-menu. Printable characters trigger type-ahead navigation. All other keys are delegated to the composed menu's `handleMenuKeyDown` (arrow navigation, Home/End, Enter/Space activation). No-op when menu is closed. |
| `handleOutsidePointer` | `() => void` | Closes the menu on outside pointer interaction. No-op when `closeOnOutsidePointer` is `false` or menu is already closed. |
| `handleTouchStart` | `(point: {clientX: number; clientY: number}) => void` | Starts a long-press timer. After `longPressDuration` ms, opens the menu at the touch coordinates with source `'pointer'`. |
| `handleTouchMove` | `() => void` | Cancels the long-press timer (touch moved, not a long-press). |
| `handleTouchEnd` | `() => void` | Cancels the long-press timer (touch ended before threshold). |

```ts
interface ContextMenuKeyboardEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}
```

## Contracts

Contracts return complete ARIA prop objects ready to spread onto DOM elements.

### `getTargetProps(): ContextMenuTargetProps`

```ts
interface ContextMenuTargetProps {
  id: string                        // '{idBase}-target'
  onContextMenu: (event: {
    clientX: number
    clientY: number
    preventDefault?: () => void
  }) => void
  onKeyDown: (event: ContextMenuKeyboardEventLike) => void
}
```

The `onContextMenu` handler:
1. Calls `event.preventDefault()` if available (suppresses native browser context menu)
2. Opens the menu at `(event.clientX, event.clientY)` with source `'pointer'`

The `onKeyDown` handler delegates to `handleTargetKeyDown`.

### `getMenuProps(): ContextMenuProps`

```ts
interface ContextMenuProps {
  id: string                        // '{idBase}-menu' (from composed menu)
  role: 'menu'
  tabindex: '-1'
  hidden: boolean                   // !isOpen
  'aria-label'?: string             // from options.ariaLabel
  'data-anchor-x': string           // String(anchorX)
  'data-anchor-y': string           // String(anchorY)
  onKeyDown: (event: ContextMenuKeyboardEventLike) => void
}
```

Spreads the composed menu's `getMenuProps()` result and augments it with:
- `hidden` reflecting open state
- `data-anchor-x` / `data-anchor-y` reflecting anchor coordinates as string data attributes
- `onKeyDown` delegating to `handleKeyDown`

### `getItemProps(id: string): ContextMenuItemProps`

```ts
interface ContextMenuItemProps {
  id: string                        // '{idBase}-item-{id}' (from composed menu or manual)
  role: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio'
  tabindex: '-1'
  'aria-disabled'?: 'true'          // present only for disabled items
  'data-active': 'true' | 'false'  // reflects activeId === id (or submenuActiveId for sub-menu children)
  'aria-checked'?: 'true' | 'false' // present for checkbox and radio items, reflects checkedIds
  'aria-haspopup'?: 'menu'          // present for submenu items
  'aria-expanded'?: 'true' | 'false' // present for submenu items, reflects openSubmenuId
  onClick: () => void               // calls select(id)
}
```

Role assignment per item type:
- `'item'` (default) and `'submenu'` — `role: 'menuitem'`
- `'checkbox'` — `role: 'menuitemcheckbox'`
- `'radio'` — `role: 'menuitemradio'`

For submenu items, `aria-haspopup` is set to `'menu'` and `aria-expanded` reflects whether the sub-menu is currently open.

For sub-menu child items (not in the top-level actionable items list), props are built manually with `data-active` reflecting `submenuActiveId`.

### `getSeparatorProps(id: string): ContextMenuSeparatorProps`

```ts
interface ContextMenuSeparatorProps {
  id: string                        // '{idBase}-separator-{id}'
  role: 'separator'
}
```

### `getGroupLabelProps(id: string): ContextMenuGroupLabelProps`

```ts
interface ContextMenuGroupLabelProps {
  id: string                        // '{idBase}-group-{id}'
  role: 'presentation'
  'aria-label'?: string             // from item.label
}
```

### `getSubmenuProps(id: string): ContextMenuSubmenuProps`

```ts
interface ContextMenuSubmenuProps {
  id: string                        // '{idBase}-submenu-{id}'
  role: 'menu'
  tabindex: '-1'
  hidden: boolean                   // openSubmenuId !== id
}
```

## Transition Model

### Core Transitions

| Event / Action | Preconditions | Next State |
| --- | --- | --- |
| `openAt(x, y, source)` | none | `isOpen=true`; `anchorX=x`; `anchorY=y`; `openedBy=source`; `restoreTargetId=null`; `openSubmenuId=null`; `submenuActiveId=null`; `activeId` set to first enabled item (via composed menu) |
| `close()` | none | `isOpen=false`; `activeId=null`; `openedBy=null`; `restoreTargetId='{idBase}-target'`; `openSubmenuId=null`; `submenuActiveId=null` |
| `select(id)` (checkbox) | item exists, not disabled, type=checkbox | toggles `id` in `checkedIds`; delegates to composed menu `select` |
| `select(id)` (radio) | item exists, not disabled, type=radio, has group | unchecks all items in same group in `checkedIds`, adds `id`; delegates to composed menu `select` |
| `select(id)` (submenu child) | item exists, not disabled | handles checkable state if applicable; if `closeOnSelect=true`: closes entire menu |
| `select(id)` (regular) | item exists, not disabled | delegates to composed menu's `select`; if `closeOnSelect=true`: `isOpen=false`, `activeId=null`, `openedBy=null`, `restoreTargetId='{idBase}-target'`, sub-menu state reset |
| `select(id)` | item disabled, unknown, separator, or group-label | no-op |
| `handleTargetKeyDown(ContextMenu)` | none | same as `openAt(currentAnchorX, currentAnchorY, 'keyboard')` |
| `handleTargetKeyDown(Shift+F10)` | none | same as `openAt(currentAnchorX, currentAnchorY, 'keyboard')` |
| `handleTargetKeyDown(other key)` | none | no-op |
| `handleKeyDown(Escape)` | `isOpen=true`, sub-menu open | closes sub-menu only (`openSubmenuId=null`, `submenuActiveId=null`) |
| `handleKeyDown(Escape)` | `isOpen=true`, no sub-menu open | `close()` |
| `handleKeyDown(Tab)` | `isOpen=true` | `close()` |
| `handleKeyDown(ArrowDown)` | `isOpen=true`, sub-menu open | `submenuActiveId` moves to next enabled sub-menu item (wrapping) |
| `handleKeyDown(ArrowDown)` | `isOpen=true`, no sub-menu | `activeId` moves to next enabled item (wrapping) |
| `handleKeyDown(ArrowUp)` | `isOpen=true`, sub-menu open | `submenuActiveId` moves to previous enabled sub-menu item (wrapping) |
| `handleKeyDown(ArrowUp)` | `isOpen=true`, no sub-menu | `activeId` moves to previous enabled item (wrapping) |
| `handleKeyDown(ArrowRight)` | `isOpen=true`, `activeId` is a submenu item | opens sub-menu: `openSubmenuId=activeId`, `submenuActiveId=first enabled child` |
| `handleKeyDown(ArrowLeft)` | `isOpen=true`, sub-menu open | closes sub-menu (`openSubmenuId=null`, `submenuActiveId=null`) |
| `handleKeyDown(Home)` | `isOpen=true`, sub-menu open | `submenuActiveId` moves to first enabled sub-menu item |
| `handleKeyDown(Home)` | `isOpen=true`, no sub-menu | `activeId` moves to first enabled item |
| `handleKeyDown(End)` | `isOpen=true`, sub-menu open | `submenuActiveId` moves to last enabled sub-menu item |
| `handleKeyDown(End)` | `isOpen=true`, no sub-menu | `activeId` moves to last enabled item |
| `handleKeyDown(Enter/Space)` | `isOpen=true`, sub-menu open, `submenuActiveId!=null` | `select(submenuActiveId)` |
| `handleKeyDown(Enter)` | `isOpen=true`, `activeId!=null` | `select(activeId)` via composed menu |
| `handleKeyDown(Space)` | `isOpen=true`, `activeId!=null` | `select(activeId)` via composed menu |
| `handleKeyDown(printable char)` | `isOpen=true` | type-ahead: advances query, moves `activeId` to matching item by label prefix |
| `handleKeyDown(*)` | `isOpen=false` | no-op |
| `handleOutsidePointer()` | `isOpen=true`, `closeOnOutsidePointer!=false` | `close()` |
| `handleOutsidePointer()` | `isOpen=false` or `closeOnOutsidePointer=false` | no-op |
| `handleTouchStart(point)` | none | starts long-press timer; after `longPressDuration` ms: `openAt(clientX, clientY, 'pointer')` |
| `handleTouchMove()` | timer running | cancels long-press timer |
| `handleTouchEnd()` | timer running | cancels long-press timer |

### Pointer Open Flow

```
contextmenu event on target
  -> preventDefault()
  -> openAt(clientX, clientY, 'pointer')
  -> anchorX=clientX, anchorY=clientY
  -> openedBy='pointer'
  -> menu opens, activeId set to first enabled item
```

### Long-Press Open Flow

```
touchstart on target
  -> start timer(longPressDuration)
  -> if no touchmove/touchend before threshold:
    -> openAt(clientX, clientY, 'pointer')
    -> anchorX=clientX, anchorY=clientY
    -> openedBy='pointer'
    -> menu opens, activeId set to first enabled item
  -> if touchmove or touchend: cancel timer
```

### Keyboard Open Flow

```
ContextMenu or Shift+F10 on target
  -> openAt(currentAnchorX, currentAnchorY, 'keyboard')
  -> openedBy='keyboard'
  -> menu opens, activeId set to first enabled item
```

### Close Flows

```
Escape/Tab in menu  OR  outside pointer click  OR  close()
  -> isOpen=false
  -> activeId=null
  -> openedBy=null
  -> restoreTargetId='{idBase}-target'
  -> openSubmenuId=null
  -> submenuActiveId=null
```

```
Item selected (closeOnSelect=true)
  -> select(id) -> composed menu closes
  -> openedBy=null
  -> restoreTargetId='{idBase}-target'
  -> openSubmenuId=null
  -> submenuActiveId=null
```

### Sub-menu Open/Close Flow

```
ArrowRight on submenu item
  -> openSubmenuId=activeId
  -> submenuActiveId=first enabled child

Escape or ArrowLeft while sub-menu is open
  -> openSubmenuId=null
  -> submenuActiveId=null
  -> focus returns to parent menu item
```

### Checkbox Toggle Flow

```
select(id) where item.type='checkbox'
  -> toggle id in checkedIds
  -> delegates to composed menu select (may close if closeOnSelect)
```

### Radio Selection Flow

```
select(id) where item.type='radio', item.group='groupName'
  -> remove all items with group='groupName' from checkedIds
  -> add id to checkedIds
  -> delegates to composed menu select (may close if closeOnSelect)
```

## Invariants

1. `isOpen` is the single source of truth for menu visibility, delegated to composed `createMenu`.
2. `openedBy` must be `null` whenever `isOpen` is `false`.
3. `restoreTargetId` must be `null` while the menu is open (cleared on `openAt`).
4. `restoreTargetId` must be set to `'{idBase}-target'` on every close path (explicit close, Escape, Tab, select-close, outside pointer).
5. `data-anchor-x` and `data-anchor-y` in menu props always reflect the current `anchorX` and `anchorY` atom values as strings.
6. `activeId` is always `null` or an enabled item id (enforced by composed menu).
7. Disabled items cannot become active or selected.
8. `getTargetProps().onContextMenu` must call `preventDefault()` when available.
9. `handleKeyDown` is a complete no-op when the menu is closed.
10. Menu and item contracts remain structurally compatible with the underlying `createMenu` contracts.
11. `openSubmenuId` and `submenuActiveId` must be `null` whenever `isOpen` is `false`.
12. Only one sub-menu can be open at a time.
13. `checkedIds` is only modified through `select()` on checkbox or radio items; never modified externally.
14. In a radio group, exactly one item (the most recently selected) is checked at a time.
15. Separators and group-labels are never included in keyboard navigation or selection.

## Composition Detail

`createContextMenu` internally creates a `createMenu` instance and delegates to it:

| Context-menu concern | Delegated to composed `createMenu` |
| --- | --- |
| `state.isOpen` | `menu.state.isOpen` (re-exported) |
| `state.activeId` | `menu.state.activeId` (re-exported) |
| `openAt` open logic | `menu.actions.open(source)` |
| `close` close logic | `menu.actions.close()` + `menu.actions.setActive(null)` |
| `select` (regular items) | `menu.actions.select(id)` |
| Arrow/Home/End navigation | `menu.actions.handleMenuKeyDown(event)` |
| `getMenuProps` base | `menu.contracts.getMenuProps()` |
| `getItemProps` base (for top-level actionable items) | `menu.contracts.getItemProps(id)` |

Only actionable items (`item`, `checkbox`, `radio`, `submenu`) are passed to the composed `createMenu`; separators and group-labels are filtered out.

Context-menu adds its own layers:
- Anchor coordinate atoms (`anchorX`, `anchorY`)
- Open source tracking (`openedBy`)
- Focus restoration (`restoreTargetId`)
- Checkable item state (`checkedIds`) with checkbox toggle and radio group management
- Sub-menu state (`openSubmenuId`, `submenuActiveId`) with ArrowRight/ArrowLeft/Escape navigation
- Type-ahead character navigation via `interactions/typeahead`
- Long-press touch support (`handleTouchStart`, `handleTouchMove`, `handleTouchEnd`)
- Separator and group-label contracts (`getSeparatorProps`, `getGroupLabelProps`)
- Sub-menu container contract (`getSubmenuProps`)
- Target contract with `onContextMenu` and `onKeyDown`
- Escape/Tab interception before delegation to menu

## Adapter Expectations

UIKit adapter (`cv-context-menu`) will:

**Signals read (reactive, drive re-renders):**
- `state.isOpen()` -- menu visibility, controls `hidden` attribute and outside-pointer listener registration
- `state.activeId()` -- highlighted item id, used to sync `data-active` and focus on item elements
- `state.anchorX()` / `state.anchorY()` -- positioning coordinates, applied as CSS custom properties for fixed positioning
- `state.openedBy()` -- open source, included in event detail
- `state.restoreTargetId()` -- focus restoration target id, used to return focus to target element on close
- `state.checkedIds()` -- set of checked item ids, used to sync `aria-checked` on checkbox/radio items
- `state.openSubmenuId()` -- id of open sub-menu parent, used to show/hide sub-menu containers
- `state.submenuActiveId()` -- active item within open sub-menu, used to sync `data-active` and focus

**Actions called (event handlers, never mutate state directly):**
- `actions.openAt(x, y, source)` -- on `contextmenu` event (via target contract), or imperative `openAt()` method on element
- `actions.close()` -- imperative `close()` method on element, or driven by property sync
- `actions.select(id)` -- on item click (via item contract `onClick`), or on Enter/Space in menu (via `handleKeyDown`)
- `actions.handleTargetKeyDown(event)` -- on keydown in target area (ContextMenu key, Shift+F10)
- `actions.handleKeyDown(event)` -- on keydown inside menu (Escape, Tab, arrows, Home, End, Enter, Space, printable chars for typeahead)
- `actions.handleOutsidePointer()` -- on document `pointerdown` outside component bounds
- `actions.handleTouchStart(point)` -- on `touchstart` event on the target element
- `actions.handleTouchMove()` -- on `touchmove` event on the target element
- `actions.handleTouchEnd()` -- on `touchend` event on the target element

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getTargetProps()` -- applied to the target wrapper element (provides `id`, `onContextMenu`, `onKeyDown`)
- `contracts.getMenuProps()` -- applied to the menu container element (provides `id`, `role`, `tabindex`, `hidden`, `aria-label`, `data-anchor-x`, `data-anchor-y`, `onKeyDown`)
- `contracts.getItemProps(id)` -- applied to each menu item element (provides `id`, `role`, `tabindex`, `aria-disabled`, `data-active`, `aria-checked`, `aria-haspopup`, `aria-expanded`, `onClick`)
- `contracts.getSeparatorProps(id)` -- applied to separator elements (provides `id`, `role`)
- `contracts.getGroupLabelProps(id)` -- applied to group label elements (provides `id`, `role`, `aria-label`)
- `contracts.getSubmenuProps(id)` -- applied to sub-menu container elements (provides `id`, `role`, `tabindex`, `hidden`)

**UIKit-only concerns (NOT in headless):**
- Fixed positioning via CSS custom properties (`--cv-context-menu-x`, `--cv-context-menu-y`)
- Document-level `pointerdown` listener registration/cleanup for outside-click detection
- Slotted item element discovery and `slotchange` observation
- Item element attribute synchronization (imperative DOM updates)
- Focus management (focusing active item, restoring focus to target)
- `input` and `change` custom event dispatch
- `value` / `open` / `anchorX` / `anchorY` property reflection and attribute sync
- `preventDefault()` on keyboard events that should not propagate
- Model rebuild on slot content changes or config property changes

## APG and A11y Contract

- menu role: `menu`
- item roles: `menuitem`, `menuitemcheckbox`, `menuitemradio`
- separator role: `separator`
- group label role: `presentation` with `aria-label`
- sub-menu role: `menu` with `tabindex="-1"` and `hidden`
- menu attributes:
  - `aria-label` (optional, from config)
  - `hidden` (reflects `!isOpen`)
  - `tabindex="-1"` (focus programmatically managed)
- item attributes:
  - `aria-disabled="true"` (present only when item is disabled)
  - `data-active="true"|"false"` (reflects `activeId === id` or `submenuActiveId === id`)
  - `tabindex="-1"` (all items)
  - `aria-checked="true"|"false"` (present on checkbox and radio items)
  - `aria-haspopup="menu"` (present on submenu items)
  - `aria-expanded="true"|"false"` (present on submenu items)
- target attributes:
  - `id="{idBase}-target"` (used as focus restore target)

## Keyboard Contract

### Target Element

| Key | Action |
| --- | --- |
| `ContextMenu` | Open menu at current anchor coordinates with `source='keyboard'` |
| `Shift+F10` | Open menu at current anchor coordinates with `source='keyboard'` |

### Menu Element (when open, no sub-menu)

| Key | Action |
| --- | --- |
| `Escape` | Close menu, restore focus to target |
| `Tab` | Close menu, restore focus to target |
| `ArrowDown` | Move active to next enabled item (wrapping) |
| `ArrowUp` | Move active to previous enabled item (wrapping) |
| `ArrowRight` | If active item is a submenu: open sub-menu, focus first child |
| `Home` | Move active to first enabled item |
| `End` | Move active to last enabled item |
| `Enter` | Select active item |
| `Space` | Select active item |
| Printable character | Type-ahead: advance query, move active to matching item by label prefix |

### Sub-menu (when open)

| Key | Action |
| --- | --- |
| `Escape` | Close sub-menu, return to parent menu |
| `ArrowLeft` | Close sub-menu, return to parent menu |
| `ArrowDown` | Move submenuActiveId to next enabled sub-menu item (wrapping) |
| `ArrowUp` | Move submenuActiveId to previous enabled sub-menu item (wrapping) |
| `Home` | Move submenuActiveId to first enabled sub-menu item |
| `End` | Move submenuActiveId to last enabled sub-menu item |
| `Enter` | Select active sub-menu item |
| `Space` | Select active sub-menu item |

All menu keyboard handling is no-op when the menu is closed.

## Minimum Test Matrix

- pointer context menu open with coordinate capture
- pointer context menu calls `preventDefault` when available
- pointer context menu works without `preventDefault` (graceful handling)
- keyboard invocation via `Shift+F10`
- keyboard invocation via `ContextMenu` key
- `openedBy` set to `'pointer'` on context menu event
- `openedBy` set to `'keyboard'` on keyboard invocation
- `openedBy` defaults to `'programmatic'` when source not specified
- `openedBy` resets to `null` on close
- `openedBy` resets to `null` on select-close
- menu role contract (role=`menu`, tabindex=`-1`)
- Escape closes menu
- Tab closes menu
- `restoreTargetId` set to target id on close
- `restoreTargetId` set to target id on select-close
- `restoreTargetId` null while menu is open
- outside pointer closes menu by default
- outside pointer does not close when `closeOnOutsidePointer` is false
- `data-anchor-x` / `data-anchor-y` reflect coordinates
- `hidden` attribute reflects open state
- item role contract (role=`menuitem`, tabindex=`-1`)
- item `aria-disabled` present for disabled items, absent for enabled
- item `data-active` reflects active state
- item `onClick` triggers select
- target contract includes id and event handlers
- arrow key navigation delegates to composed menu
- `handleKeyDown` is no-op when menu is closed
- `aria-label` forwarded to menu props
- checkbox item has `role=menuitemcheckbox` and `aria-checked`
- checkbox toggle updates `checkedIds`
- radio item has `role=menuitemradio` and `aria-checked`
- radio selection updates `checkedIds` (only one in group)
- separator has `role=separator` via `getSeparatorProps`
- group label has `role=presentation` and `aria-label` via `getGroupLabelProps`
- submenu item has `aria-haspopup=menu` and `aria-expanded`
- ArrowRight opens sub-menu on submenu item
- ArrowLeft/Escape closes sub-menu
- sub-menu navigation (ArrowDown/ArrowUp/Home/End)
- sub-menu item selection (Enter/Space)
- `getSubmenuProps` returns correct hidden state
- long-press touch opens menu after `longPressDuration`
- touch move cancels long-press
- touch end cancels long-press
- type-ahead navigates to matching item by label prefix

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- Viewport collision/placement logic (UIKit concern)
- Adapter rendering/layering strategies
- Animation and transition effects
