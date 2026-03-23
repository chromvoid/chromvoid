# Menu Component Contract

## Purpose

`Menu` provides a headless model for menu button and menu interactions.

It handles trigger-open-close lifecycle, active-item navigation,
dismiss behavior, deterministic item selection, typeahead character navigation,
checkable items (checkbox and radio), submenu management, and split button
trigger support — all without visual rendering.

## Component Files

- `src/menu/index.ts` - model and public `createMenu` API
- `src/menu/menu.test.ts` - unit behavior tests

## Public API

### `createMenu(options)`

```ts
interface MenuItem {
  id: string
  label?: string
  disabled?: boolean
  type?: 'normal' | 'checkbox' | 'radio'  // NEW — default: 'normal'
  group?: string                           // NEW — radio group name (for type='radio')
  checked?: boolean                        // NEW — initial checked state (for checkbox/radio)
  hasSubmenu?: boolean                     // NEW — whether this item opens a submenu
}

interface MenuGroup {                      // NEW
  id: string
  type: 'checkbox' | 'radio'
  label?: string
}

interface CreateMenuOptions {
  items: readonly MenuItem[]
  idBase?: string
  ariaLabel?: string
  initialOpen?: boolean
  initialActiveId?: string | null
  closeOnSelect?: boolean                  // default: true
  typeahead?: boolean                      // NEW — default: true
  typeaheadTimeout?: number                // NEW — default: 500 (ms)
  groups?: readonly MenuGroup[]            // NEW — group definitions
  splitButton?: boolean                    // NEW — enable split button pattern (default: false)
}
```

### Return: `MenuModel`

```ts
interface MenuModel {
  readonly state: MenuState
  readonly actions: MenuActions
  readonly contracts: MenuContracts
}
```

## State Signal Surface

All state is signal-backed (Reatom atoms). UIKit reads these reactively to drive re-renders.

| Signal | Type | Description | Status |
| --- | --- | --- | --- |
| `isOpen()` | `boolean` | Menu visibility | existing |
| `activeId()` | `string \| null` | Currently highlighted item id | existing |
| `selectedId()` | `string \| null` | Last selected item id | existing |
| `openedBy()` | `MenuOpenSource \| null` | Source that triggered the current open: `'keyboard'`, `'pointer'`, or `'programmatic'`. Resets to `null` on close. | existing |
| `hasSelection` | `Computed<boolean>` | Whether any item has been selected (`selectedId != null`) | existing |
| `checkedIds()` | `ReadonlySet<string>` | Set of currently checked item ids. Initialized from items with `checked: true`. Updated on checkbox toggle and radio group selection. | **NEW** |
| `openSubmenuId()` | `string \| null` | Id of the currently open submenu parent item, or `null` if no submenu is open. Reset to `null` on close. | **NEW** |
| `submenuActiveId()` | `string \| null` | Id of the currently highlighted item within the open submenu, or `null`. Reset to `null` on close or submenu close. | **NEW** |

```ts
type MenuOpenSource = 'keyboard' | 'pointer' | 'programmatic'
```

## Actions

All state transitions go through these actions. UIKit must never mutate state directly.

| Action | Signature | Description | Status |
| --- | --- | --- | --- |
| `open` | `(source?: MenuOpenSource) => void` | Opens the menu. Sets `openedBy`. If no `activeId` is set, sets it to the first enabled item. Resets submenu state. | existing |
| `close` | `() => void` | Closes the menu. Resets `activeId`, `openedBy`, `openSubmenuId`, `submenuActiveId` to `null`. | existing (updated) |
| `toggle` | `(source?: MenuOpenSource) => void` | Toggles open/close. | existing |
| `setActive` | `(id: string \| null) => void` | Sets the active (highlighted) item. No-op for disabled items. | existing |
| `moveNext` | `() => void` | Moves active to next enabled item (wrapping). | existing |
| `movePrev` | `() => void` | Moves active to previous enabled item (wrapping). | existing |
| `moveFirst` | `() => void` | Moves active to first enabled item. | existing |
| `moveLast` | `() => void` | Moves active to last enabled item. | existing |
| `select` | `(id: string) => void` | Selects an item. For `type='checkbox'`: toggles the item in `checkedIds`. For `type='radio'`: sets item as only checked in its group. For `type='normal'`: sets `selectedId`. If `closeOnSelect` is true, closes the menu. No-op for disabled or unknown items. | existing (updated) |
| `toggleCheck` | `(id: string) => void` | Toggles checked state for a checkbox item. For radio items, sets item as only checked in its group. No-op for normal items, disabled items, or unknown ids. | **NEW** |
| `openSubmenu` | `(id: string) => void` | Opens the submenu for the given parent item id. Sets `openSubmenuId` to `id`. Sets `submenuActiveId` to first enabled child. No-op if item does not have `hasSubmenu: true`. | **NEW** |
| `closeSubmenu` | `() => void` | Closes the currently open submenu. Resets `openSubmenuId` and `submenuActiveId` to `null`. | **NEW** |
| `handleTypeahead` | `(char: string) => void` | Handles a single printable character for typeahead navigation. Advances the character buffer, matches items by label prefix, and moves `activeId` to the matched item. If a submenu is open, searches submenu children instead. No-op if `typeahead` option is `false`. | **NEW** |
| `handleTriggerKeyDown` | `(event: Pick<KeyboardEvent, 'key'>) => void` | Handles keyboard on the trigger element. `ArrowDown` opens and focuses first item. `ArrowUp` opens and focuses last item. `Enter`/`Space` toggles. | existing |
| `handleMenuKeyDown` | `(event: MenuKeyboardEventLike) => void` | Handles keyboard inside the open menu. When a submenu is open, delegates navigation to submenu. `ArrowRight` on a submenu item opens the submenu. `ArrowLeft` closes the submenu. Printable characters trigger typeahead. All other keys handled as before. | existing (updated) |
| `handleItemPointerEnter` | `(id: string) => void` | Handles pointer enter on a menu item. Sets `activeId` immediately. If item has submenu, starts ~200ms hover intent timer. If item does not have submenu, cancels pending timer and closes open submenu. | **NEW** |
| `handleItemPointerLeave` | `(id: string) => void` | Handles pointer leave on a menu item. Cancels pending hover intent timer if it was for this item. | **NEW** |
| `setSubmenuItems` | `(parentId: string, items: readonly MenuItem[]) => void` | Provides submenu child items for a parent item. Must be called before `openSubmenu` for the parent to have navigable children. | **NEW** |

```ts
interface MenuKeyboardEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}
```

## Contracts

Contracts return complete ARIA prop objects ready to spread onto DOM elements.

### `getTriggerProps(): MenuTriggerProps`

```ts
interface MenuTriggerProps {
  id: string                        // '{idBase}-trigger'
  tabindex: '0'
  'aria-haspopup': 'menu'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string           // '{idBase}-menu'
  'aria-label'?: string
}
```

Existing, unchanged.

### `getMenuProps(): MenuProps`

```ts
interface MenuProps {
  id: string                        // '{idBase}-menu'
  role: 'menu'
  tabindex: '-1'
  'aria-label'?: string
  'aria-activedescendant'?: string  // NEW — DOM id of active item when open
}
```

**Updated**: Added `aria-activedescendant` which references the active item's DOM id when the menu is open and an item is active.

### `getItemProps(id: string): MenuItemProps`

```ts
interface MenuItemProps {
  id: string                        // '{idBase}-item-{id}'
  role: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio'  // UPDATED
  tabindex: '-1'
  'aria-disabled'?: 'true'          // present only for disabled items
  'data-active': 'true' | 'false'  // reflects activeId === id
  'aria-checked'?: 'true' | 'false' // NEW — present for checkbox and radio items
  'aria-haspopup'?: 'menu'          // NEW — present for submenu items
  'aria-expanded'?: 'true' | 'false' // NEW — present for submenu items
}
```

**Updated**: Role assignment per item type:
- `type='normal'` (default) — `role: 'menuitem'`
- `type='checkbox'` — `role: 'menuitemcheckbox'`
- `type='radio'` — `role: 'menuitemradio'`

For items with `hasSubmenu: true`, `aria-haspopup` is set to `'menu'` and `aria-expanded` reflects whether the submenu is currently open (`openSubmenuId === id`).

For checkbox and radio items, `aria-checked` reflects whether the item id is present in `checkedIds`.

### `getSubmenuProps(parentItemId: string): MenuSubmenuProps` — NEW

```ts
interface MenuSubmenuProps {
  id: string                        // '{idBase}-submenu-{parentItemId}'
  role: 'menu'
  tabindex: '-1'
  hidden: boolean                   // openSubmenuId !== parentItemId
  'aria-label'?: string             // from parent item label
}
```

Returns props for the submenu container associated with a parent item. `hidden` reflects whether the submenu is currently open.

### `getSubmenuItemProps(parentItemId: string, childId: string): MenuItemProps` — NEW

```ts
// Returns MenuItemProps (same interface as getItemProps)
```

Returns props for an item within a submenu. `data-active` reflects `submenuActiveId === childId` instead of `activeId`. Role, `aria-checked`, `aria-disabled` follow the same rules as `getItemProps`.

### `getSplitTriggerProps(): MenuSplitTriggerProps` — NEW

```ts
interface MenuSplitTriggerProps {
  id: string                        // '{idBase}-split-action'
  tabindex: '0'
  role: 'button'
}
```

Returns props for the action portion of a split button. This is the primary action area that does NOT open the menu. Only returned when `splitButton: true`. Throws if `splitButton` is not enabled.

### `getSplitDropdownProps(): MenuSplitDropdownProps` — NEW

```ts
interface MenuSplitDropdownProps {
  id: string                        // '{idBase}-split-dropdown'
  tabindex: '0'
  role: 'button'
  'aria-haspopup': 'menu'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string           // '{idBase}-menu'
  'aria-label': string              // 'More options' or from ariaLabel
}
```

Returns props for the dropdown arrow portion of a split button. This is the trigger that opens the menu. Only returned when `splitButton: true`. Throws if `splitButton` is not enabled.

When `splitButton: true`, `getTriggerProps()` is still available and returns the same props as `getSplitDropdownProps()` (they are equivalent). This ensures backward compatibility for adapters that use `getTriggerProps()`.

### `getGroupProps(groupId: string): MenuGroupProps` — NEW

```ts
interface MenuGroupProps {
  id: string                        // '{idBase}-group-{groupId}'
  role: 'group'
  'aria-label'?: string             // from group.label
}
```

Returns props for a group container element. Groups provide semantic grouping for related checkbox or radio items.

## APG and A11y Contract

- trigger exposes `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`
- popup role: `menu`
- item role: `menuitem` (default), `menuitemcheckbox` (for `type='checkbox'`), or `menuitemradio` (for `type='radio'`) — **UPDATED**
- disabled items expose `aria-disabled="true"`
- checkable items expose `aria-checked="true"` or `aria-checked="false"` — **NEW**
- submenu items expose `aria-haspopup="menu"` and `aria-expanded` — **NEW**
- submenu container role: `menu` with `tabindex="-1"` and `hidden` — **NEW**
- group container role: `group` with optional `aria-label` — **NEW**
- split button: action area has `role="button"`, dropdown area has `role="button"` with `aria-haspopup="menu"` — **NEW**

## Keyboard Contract

### Trigger Element

| Key | Action | Status |
| --- | --- | --- |
| `ArrowDown` | Open menu, focus first enabled item | existing |
| `ArrowUp` | Open menu, focus last enabled item | existing |
| `Enter` | Toggle open state | existing |
| `Space` | Toggle open state | existing |

### Menu Element (when open, no submenu)

| Key | Action | Status |
| --- | --- | --- |
| `ArrowDown` | Move active to next enabled item (wrapping) | existing |
| `ArrowUp` | Move active to previous enabled item (wrapping) | existing |
| `Home` | Move active to first enabled item | existing |
| `End` | Move active to last enabled item | existing |
| `Enter` | Select active item | existing |
| `Space` | Select active item (for checkable items: toggle check state) | existing (updated) |
| `Escape` | Close menu | existing |
| `ArrowRight` | If active item has submenu: open submenu, focus first child | **NEW** |
| `ArrowLeft` | No-op (at top-level menu) | **NEW** |
| Printable character | Typeahead: advance query, move active to matching item by label prefix | **NEW** |

### Submenu (when open) — NEW

| Key | Action |
| --- | --- |
| `Escape` | Close submenu, return focus to parent menu item |
| `ArrowLeft` | Close submenu, return focus to parent menu item |
| `ArrowDown` | Move `submenuActiveId` to next enabled submenu item (wrapping) |
| `ArrowUp` | Move `submenuActiveId` to previous enabled submenu item (wrapping) |
| `Home` | Move `submenuActiveId` to first enabled submenu item |
| `End` | Move `submenuActiveId` to last enabled submenu item |
| `Enter` | Select active submenu item |
| `Space` | Select active submenu item |
| `ArrowRight` | If active submenu item has nested submenu: open it (future — currently one level only) |
| Printable character | Typeahead within submenu items |

## Behavior Contract

- trigger keyboard support:
  - `ArrowDown` opens and focuses first enabled item
  - `ArrowUp` opens and focuses last enabled item
  - `Enter` and `Space` toggle open state
- menu keyboard support:
  - `ArrowUp/ArrowDown` navigation (with disabled-item skip)
  - `Home/End` first/last navigation
  - `Enter` activates selected item
  - `Escape` closes menu
  - `ArrowRight` opens submenu on submenu items — **NEW**
  - `ArrowLeft` closes submenu — **NEW**
  - Printable characters trigger typeahead navigation — **NEW**
- selection closes menu by default (`closeOnSelect: true`)
- pointer path is tracked via `openedBy: 'pointer'`
- **NEW**: For checkbox items, `select()` toggles checked state in `checkedIds` without closing the menu (unless `closeOnSelect` is explicitly true)
- **NEW**: For radio items, `select()` sets the item as checked and unchecks all other items in the same group
- **NEW**: Submenu open uses hover intent with ~200ms delay timer when triggered by pointer
- **NEW**: Submenu items that have children receive `aria-haspopup="menu"` and `aria-expanded`
- **NEW**: Split button mode provides separate action and dropdown trigger areas

### Typeahead Behavior — NEW

- Enabled by default (`typeahead: true`)
- Uses `interactions/typeahead` utility for character buffering
- Buffer timeout: configurable via `typeaheadTimeout` (default 500ms)
- On each printable character key:
  1. Advance the typeahead buffer
  2. Build a query from the buffer (handles repeated character sequences)
  3. Search items by normalized label prefix, starting from the item after `activeId`
  4. If a match is found, set `activeId` to the matching item
  5. If no match, do not change `activeId`
- When a submenu is open, typeahead searches submenu children instead
- Space is excluded from typeahead (used for selection)
- Modifier keys (Ctrl, Meta, Alt) exclude the key from typeahead

### Checkable Item Behavior — NEW

- Items with `type='checkbox'`:
  - Toggle their presence in `checkedIds` when selected
  - `aria-checked` reflects their state
  - Default: do NOT close menu on selection (override `closeOnSelect` for checkable items)
- Items with `type='radio'`:
  - Must have a `group` property
  - On selection: uncheck all other items in the same `group`, check the selected item
  - `aria-checked` reflects their state
  - Default: do NOT close menu on selection (override `closeOnSelect` for checkable items)
- `checkedIds` is initialized from items that have `checked: true`
- Radio group invariant: at most one item per group is checked at any time

### Submenu Behavior — NEW

- Items with `hasSubmenu: true` can have an associated submenu
- Submenu items are not provided as children in the `items` array; instead, the submenu is a separate menu model or the adapter provides children via `getSubmenuProps()`
- The headless model manages submenu open/close state and focus transitions
- **Opening**: `ArrowRight` on a submenu item, or hover intent (~200ms delay)
- **Closing**: `ArrowLeft` or `Escape` while submenu is open
- Only one submenu can be open at a time
- When a submenu opens, `submenuActiveId` is set to the first enabled child
- When a submenu closes, focus returns to the parent item (`activeId` is unchanged)
- Submenu items for navigation must be provided via `setSubmenuItems(parentId, items)` action or as part of the initial configuration

#### Hover Intent

- When the pointer enters a submenu item, start a ~200ms delay timer
- If the pointer leaves the item before the timer fires, cancel the timer
- If the timer fires, open the submenu
- If the pointer enters a different submenu item, close the current submenu and start a new timer
- Actions for hover:
  - `handleItemPointerEnter(id: string)` — start hover intent timer if item has submenu; immediately set `activeId`
  - `handleItemPointerLeave(id: string)` — cancel hover intent timer

### Split Button Behavior — NEW

- When `splitButton: true`, the trigger is conceptually split into two areas:
  1. **Action area** (`getSplitTriggerProps()`): performs the primary action (e.g., "Save")
  2. **Dropdown area** (`getSplitDropdownProps()`): opens the menu with alternative actions
- The dropdown area behaves identically to a regular menu trigger
- The action area does NOT interact with the menu model (it is the adapter's responsibility to wire the action)
- `getTriggerProps()` returns the same result as `getSplitDropdownProps()` in split button mode for backward compatibility

## Transition Model

### Core Transitions

| Event / Action | Preconditions | Next State | Status |
| --- | --- | --- | --- |
| `open(source)` | none | `isOpen=true`; `openedBy=source`; `activeId=first enabled item`; `openSubmenuId=null`; `submenuActiveId=null` | existing (updated) |
| `close()` | none | `isOpen=false`; `activeId=null`; `openedBy=null`; `openSubmenuId=null`; `submenuActiveId=null` | existing (updated) |
| `toggle(source)` | `isOpen=false` | same as `open(source)` | existing |
| `toggle(source)` | `isOpen=true` | same as `close()` | existing |
| `select(id)` (normal) | item exists, not disabled | `selectedId=id`; `activeId=id`; if `closeOnSelect`: close | existing |
| `select(id)` (checkbox) | item exists, not disabled, type=checkbox | toggles `id` in `checkedIds`; does NOT close menu by default | **NEW** |
| `select(id)` (radio) | item exists, not disabled, type=radio, has group | unchecks all items in same group, adds `id` to `checkedIds`; does NOT close menu by default | **NEW** |
| `select(id)` | item disabled or unknown | no-op | existing |
| `toggleCheck(id)` (checkbox) | item exists, type=checkbox | toggles `id` in `checkedIds` | **NEW** |
| `toggleCheck(id)` (radio) | item exists, type=radio, has group | unchecks all in group, adds `id` | **NEW** |
| `toggleCheck(id)` | item is normal, disabled, or unknown | no-op | **NEW** |
| `openSubmenu(id)` | item has `hasSubmenu: true` | `openSubmenuId=id`; `submenuActiveId=first enabled child` | **NEW** |
| `openSubmenu(id)` | item does not have submenu | no-op | **NEW** |
| `closeSubmenu()` | `openSubmenuId != null` | `openSubmenuId=null`; `submenuActiveId=null` | **NEW** |
| `closeSubmenu()` | `openSubmenuId == null` | no-op | **NEW** |
| `handleTypeahead(char)` | `isOpen=true`, `typeahead=true` | buffer advanced; `activeId` or `submenuActiveId` moves to match | **NEW** |
| `handleTypeahead(char)` | `isOpen=false` or `typeahead=false` | no-op | **NEW** |
| `handleMenuKeyDown(ArrowRight)` | `isOpen=true`, `activeId` has submenu | `openSubmenu(activeId)` | **NEW** |
| `handleMenuKeyDown(ArrowLeft)` | `isOpen=true`, submenu open | `closeSubmenu()` | **NEW** |
| `handleMenuKeyDown(printable)` | `isOpen=true`, `typeahead=true` | `handleTypeahead(key)` | **NEW** |
| `handleMenuKeyDown(ArrowDown)` | submenu open | `submenuActiveId` moves to next enabled child (wrapping) | **NEW** |
| `handleMenuKeyDown(ArrowUp)` | submenu open | `submenuActiveId` moves to previous enabled child (wrapping) | **NEW** |
| `handleMenuKeyDown(Home)` | submenu open | `submenuActiveId` moves to first enabled child | **NEW** |
| `handleMenuKeyDown(End)` | submenu open | `submenuActiveId` moves to last enabled child | **NEW** |
| `handleMenuKeyDown(Enter/Space)` | submenu open, `submenuActiveId!=null` | `select(submenuActiveId)` | **NEW** |
| `handleMenuKeyDown(Escape)` | submenu open | `closeSubmenu()` | **NEW** |
| `handleMenuKeyDown(Escape)` | no submenu open | `close()` | existing |
| `handleMenuKeyDown(ArrowDown)` | no submenu | `activeId` moves to next enabled item (wrapping) | existing |
| `handleMenuKeyDown(ArrowUp)` | no submenu | `activeId` moves to previous enabled item (wrapping) | existing |
| `handleMenuKeyDown(Home)` | no submenu | `activeId` moves to first enabled item | existing |
| `handleMenuKeyDown(End)` | no submenu | `activeId` moves to last enabled item | existing |
| `handleMenuKeyDown(Enter)` | no submenu, `activeId!=null` | `select(activeId)` | existing |
| `handleMenuKeyDown(Space)` | no submenu, `activeId!=null` | `select(activeId)` | existing |
| `handleMenuKeyDown(*)` | `isOpen=false` | no-op | existing |
| `handleItemPointerEnter(id)` | item has submenu | start ~200ms hover timer; on fire: `openSubmenu(id)`. Set `activeId=id`. | **NEW** |
| `handleItemPointerEnter(id)` | item does not have submenu | cancel any pending hover timer; close open submenu; set `activeId=id`. | **NEW** |
| `handleItemPointerLeave(id)` | timer pending for `id` | cancel timer | **NEW** |
| `handleTriggerKeyDown(ArrowDown)` | none | `open('keyboard')`; `activeId=first enabled item` | existing |
| `handleTriggerKeyDown(ArrowUp)` | none | `open('keyboard')`; `activeId=last enabled item` | existing |
| `handleTriggerKeyDown(Enter/Space)` | none | `toggle('keyboard')` | existing |

### Submenu Open/Close Flow — NEW

```
ArrowRight on submenu item
  -> openSubmenuId=activeId
  -> submenuActiveId=first enabled child

Escape or ArrowLeft while submenu is open
  -> openSubmenuId=null
  -> submenuActiveId=null
  -> focus returns to parent menu item

Hover enter on submenu item
  -> start 200ms timer
  -> on timer fire: openSubmenuId=id, submenuActiveId=first enabled child

Hover enter on non-submenu item
  -> cancel pending timer
  -> close open submenu
```

### Checkbox Toggle Flow — NEW

```
select(id) where item.type='checkbox'
  -> toggle id in checkedIds
  -> do NOT close menu (checkable items override closeOnSelect)
```

### Radio Selection Flow — NEW

```
select(id) where item.type='radio', item.group='groupName'
  -> remove all items with group='groupName' from checkedIds
  -> add id to checkedIds
  -> do NOT close menu (checkable items override closeOnSelect)
```

### Typeahead Flow — NEW

```
printable character key in open menu (typeahead=true)
  -> advance typeahead buffer
  -> build query (handle repeated chars)
  -> search items by label prefix from activeId+1 (wrap around)
  -> if match: set activeId to matched item
  -> if no match: no change
  -> if submenu open: search submenu children, set submenuActiveId
```

## Invariants

1. `activeId` is always `null` or an enabled item id (existing)
2. Disabled items cannot become selected (existing)
3. Close action always resets `openedBy` to `null` (existing)
4. **NEW**: `checkedIds` is only modified through `select()` or `toggleCheck()` on checkbox or radio items; never externally
5. **NEW**: In a radio group, at most one item is checked at a time. Selecting a radio item unchecks all others in the same group.
6. **NEW**: `openSubmenuId` and `submenuActiveId` must be `null` whenever `isOpen` is `false`
7. **NEW**: Only one submenu can be open at a time
8. **NEW**: `submenuActiveId` must be `null` whenever `openSubmenuId` is `null`
9. **NEW**: `getItemProps` role must match item type: `menuitem` for normal, `menuitemcheckbox` for checkbox, `menuitemradio` for radio
10. **NEW**: `aria-checked` is only present on checkbox and radio items
11. **NEW**: `aria-haspopup` and `aria-expanded` are only present on items with `hasSubmenu: true`
12. **NEW**: Split button contracts (`getSplitTriggerProps`, `getSplitDropdownProps`) throw if `splitButton` option is not `true`
13. **NEW**: Typeahead buffer resets after `typeaheadTimeout` ms of inactivity

## Adapter Expectations — NEW

UIKit adapter (`cv-menu`) will:

**Signals read (reactive, drive re-renders):**
- `state.isOpen()` — menu visibility, controls `hidden` attribute and positioning
- `state.activeId()` — highlighted item id, used to sync `data-active` and visual focus
- `state.selectedId()` — last selected item id, included in event detail
- `state.openedBy()` — open source, may affect focus management strategy
- `state.hasSelection()` — whether any item has been selected
- `state.checkedIds()` — set of checked item ids, used to sync `aria-checked` on checkbox/radio items
- `state.openSubmenuId()` — id of open submenu parent, used to show/hide submenu containers
- `state.submenuActiveId()` — active item within open submenu, used to sync `data-active` and focus

**Actions called (event handlers, never mutate state directly):**
- `actions.open(source)` — on trigger click or programmatic open
- `actions.close()` — on dismiss or programmatic close
- `actions.toggle(source)` — on trigger click
- `actions.select(id)` — on item click or Enter/Space
- `actions.toggleCheck(id)` — explicit check toggle (alternative to select for checkable items)
- `actions.openSubmenu(id)` — on ArrowRight or hover intent
- `actions.closeSubmenu()` — on ArrowLeft or Escape in submenu
- `actions.handleTypeahead(char)` — on printable character keypress in open menu
- `actions.handleTriggerKeyDown(event)` — on keydown in trigger
- `actions.handleMenuKeyDown(event)` — on keydown inside menu
- `actions.handleItemPointerEnter(id)` — on pointerenter on menu item (for submenu hover intent)
- `actions.handleItemPointerLeave(id)` — on pointerleave on menu item (cancel hover intent)
- `actions.setActive(id)` — on pointer hover over item (non-submenu active tracking)
- `actions.moveNext()` / `actions.movePrev()` / `actions.moveFirst()` / `actions.moveLast()` — programmatic navigation

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getTriggerProps()` — applied to trigger element (or split dropdown in split-button mode)
- `contracts.getMenuProps()` — applied to menu container element
- `contracts.getItemProps(id)` — applied to each menu item element
- `contracts.getSubmenuProps(parentItemId)` — applied to submenu container elements
- `contracts.getSubmenuItemProps(parentItemId, childId)` — applied to submenu item elements
- `contracts.getSplitTriggerProps()` — applied to split button action area (only when `splitButton: true`)
- `contracts.getSplitDropdownProps()` — applied to split button dropdown area (only when `splitButton: true`)
- `contracts.getGroupProps(groupId)` — applied to group container elements

**UIKit-only concerns (NOT in headless):**
- Popup positioning and viewport collision detection
- Slotted item element discovery and `slotchange` observation
- Item element attribute synchronization (imperative DOM updates)
- Focus management (focusing active item, restoring focus to trigger on close)
- `input` and `change` custom event dispatch for checkable items
- `value` / `open` property reflection and attribute sync
- `preventDefault()` on keyboard events that should not propagate
- Submenu positioning relative to parent item
- Hover intent pointer tracking within menu regions
- Model rebuild on slot content changes or config property changes

## Minimum Test Matrix

**Existing tests:**
- keyboard and pointer open paths
- trigger toggle behavior
- navigation and disabled skip behavior
- Enter activation behavior
- Escape dismissal behavior
- roles/aria props contract checks

**New tests — Typeahead:**
- printable character moves active to matching item by label prefix
- typeahead buffer accumulates characters within timeout
- typeahead buffer resets after timeout
- typeahead wraps around to beginning of list
- repeated same character cycles through matching items
- space is not treated as typeahead character
- modifier keys exclude character from typeahead
- typeahead disabled when `typeahead: false`
- typeahead within open submenu searches submenu children

**New tests — Checkable items:**
- checkbox item has `role=menuitemcheckbox` and `aria-checked`
- checkbox toggle updates `checkedIds`
- checkbox select does not close menu by default
- radio item has `role=menuitemradio` and `aria-checked`
- radio selection updates `checkedIds` (only one in group)
- radio select does not close menu by default
- initial `checked: true` items appear in `checkedIds`
- `toggleCheck` toggles checkbox item
- `toggleCheck` on radio sets only that item in group
- `toggleCheck` is no-op for normal items
- disabled checkable items cannot be toggled

**New tests — Submenu:**
- submenu item has `aria-haspopup=menu` and `aria-expanded`
- ArrowRight opens submenu on submenu item
- ArrowRight is no-op on non-submenu item
- ArrowLeft closes submenu
- Escape closes submenu (not entire menu)
- submenu navigation (ArrowDown/ArrowUp/Home/End on `submenuActiveId`)
- submenu item selection (Enter/Space)
- `getSubmenuProps` returns correct `hidden` state
- `getSubmenuItemProps` returns correct `data-active` based on `submenuActiveId`
- only one submenu open at a time
- opening another submenu closes the current one
- closing menu resets submenu state
- hover intent opens submenu after ~200ms delay
- hover leave cancels pending submenu open
- hover on non-submenu item closes open submenu

**New tests — Split button:**
- `getSplitTriggerProps` returns action button props
- `getSplitDropdownProps` returns dropdown trigger props with `aria-haspopup`
- split contracts throw when `splitButton` is not enabled
- `getTriggerProps` in split mode returns same as `getSplitDropdownProps`
- dropdown area opens/closes menu normally

**New tests — Group props:**
- `getGroupProps` returns `role=group` with optional `aria-label`

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- Nested submenus beyond one level (future extension)
- Async item loading and virtualization
- Viewport collision/placement logic (UIKit concern)
- Animation and transition effects
- Context menu behavior (handled by `createContextMenu` which composes `createMenu`)
