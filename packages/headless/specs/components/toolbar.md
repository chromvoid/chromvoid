# Toolbar Component Contract

## Purpose

`Toolbar` is a headless contract for a container of interactive elements (buttons, checkboxes, etc.) that provides a single tab stop and arrow-key navigation between items. It supports separator items (non-focusable dividers skipped by navigation) and focus memory (restoring focus to the last-active item when the toolbar is re-entered via Tab).

## Component Files

- `src/toolbar/index.ts` - model and public `createToolbar` API
- `src/toolbar/toolbar.test.ts` - unit behavior tests

## Public API

- `createToolbar(options): ToolbarModel`
- `state` (signal-backed):
  - `activeId()` - current roving-focus item id
  - `lastActiveId()` - last item that held focus before blur (for focus memory)
- `actions`:
  - `setActive`, `moveNext`, `movePrev`, `moveFirst`, `moveLast`
  - `handleKeyDown`
  - `handleToolbarFocus` - restores focus to `lastActiveId` on toolbar re-entry
  - `handleToolbarBlur` - snapshots `activeId` into `lastActiveId`
- `contracts`:
  - `getRootProps()`
  - `getItemProps(id)`
  - `getSeparatorProps(id)`

## Options (`CreateToolbarOptions`)

| Option | Type | Default | Description |
|---|---|---|---|
| `items` | `readonly ToolbarItem[]` | required | Item definitions. Each has `id: string`, optional `disabled?: boolean`, optional `separator?: boolean`. |
| `idBase` | `string` | `'toolbar'` | Prefix for generated DOM ids (`{idBase}-root`, `{idBase}.nav-item-{id}`). |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Determines keyboard navigation axis and `aria-orientation` value. |
| `wrap` | `boolean` | `true` | Whether arrow navigation wraps from last to first and vice versa. `false` clamps at boundaries. |
| `ariaLabel` | `string \| undefined` | `undefined` | Optional `aria-label` for the toolbar root element. |
| `initialActiveId` | `string \| null` | first enabled non-separator item | Initial roving-focus item. Normalized to first navigable item if invalid, disabled, or a separator. |

### `ToolbarItem`

```ts
interface ToolbarItem {
  id: string
  disabled?: boolean
  separator?: boolean  // non-focusable, non-interactive divider
}
```

Items with `separator: true` are excluded from the navigable set regardless of their `disabled` flag. They are purely visual dividers.

### Initial State Resolution

1. If `initialActiveId` is provided and refers to a valid enabled non-separator item, use it.
2. Otherwise, fall back to the first enabled non-separator item.
3. If no navigable items exist, `activeId` is `null`.

## Reactive State Contract

Headless Toolbar exposes state as reactive signal-backed getters.

### State Surface

- `state.activeId(): string | null`
  - Current roving-focus item id.
  - Only navigable items (enabled, non-separator) can be active.
  - Changes on directional navigation, `setActive`, and `handleToolbarFocus`.
- `state.lastActiveId(): string | null`
  - Snapshot of the most recent `activeId` before the toolbar lost focus.
  - Updated by `handleToolbarBlur`.
  - Read by `handleToolbarFocus` to restore focus position on re-entry.
- `state.orientation: 'horizontal' | 'vertical'`
  - Static value from options. Determines arrow key mapping.

### Derived Values

The following are computed by the underlying composite-navigation layer and available through contracts, not as separate signals:

- Whether an item is active (`data-active` in `getItemProps`)
- Roving tabindex value per item (`tabindex` in `getItemProps`)
- Enabled item list (used internally for navigation; separators excluded)

### Reactivity Guarantees

- `state` values are read via getter calls (`Atom<string | null>`) and are suitable as reactive dependencies in adapters.
- Any state change MUST be observable synchronously by adapters after action execution.
- Adapters MUST treat `state` as source of truth; DOM flags are derived outputs.

## Actions

### `setActive(id: string)`

- If `id` is a valid enabled non-separator item, sets `activeId` to `id`.
- If `id` is disabled, a separator, or unknown, no state change.

### `moveNext()` / `movePrev()`

- Moves `activeId` to the next/previous navigable item (enabled, non-separator), wrapping or clamping based on `wrap` option.
- Separators and disabled items are skipped.
- If no navigable items exist, sets `activeId` to `null`.
- If `activeId` is currently `null` or invalid, resets to the first/last navigable item.

### `moveFirst()` / `moveLast()`

- Sets `activeId` to the first/last navigable item (enabled, non-separator), or `null` if none exist.

### `handleKeyDown(event: Pick<KeyboardEvent, 'key'>)`

- Maps keys based on orientation:
  - Horizontal: `ArrowRight` -> `moveNext()`, `ArrowLeft` -> `movePrev()`
  - Vertical: `ArrowDown` -> `moveNext()`, `ArrowUp` -> `movePrev()`
- `Home` -> `moveFirst()`, `End` -> `moveLast()` (both orientations)
- Unrecognized keys produce no state change.

### `handleToolbarFocus()`

- Called when the toolbar or any of its items receives focus after the toolbar was not focused.
- If `lastActiveId` is non-null and still refers to a navigable item, sets `activeId` to `lastActiveId` (focus memory).
- If `lastActiveId` is `null` or stale (item no longer navigable), falls back to the current `activeId` (no change).

### `handleToolbarBlur()`

- Called when focus leaves the toolbar entirely.
- Snapshots the current `activeId` into `lastActiveId`.

## Transitions Table

| Event / Action | `activeId` | `lastActiveId` |
|---|---|---|
| `setActive(id)` where id is navigable | set to `id` | unchanged |
| `setActive(id)` where id is disabled/separator/unknown | unchanged | unchanged |
| `moveNext()` / `movePrev()` | next/prev navigable (wrap or clamp) | unchanged |
| `moveFirst()` / `moveLast()` | first/last navigable | unchanged |
| `handleKeyDown` (orientation-matched arrow) | delegates to `moveNext`/`movePrev` | unchanged |
| `handleKeyDown` (Home/End) | delegates to `moveFirst`/`moveLast` | unchanged |
| `handleKeyDown` (unrecognized key) | unchanged | unchanged |
| `handleToolbarBlur()` | unchanged | set to current `activeId` |
| `handleToolbarFocus()` with valid `lastActiveId` | set to `lastActiveId` | unchanged |
| `handleToolbarFocus()` with null/stale `lastActiveId` | unchanged | unchanged |

## Contracts

Contracts return ready-to-spread ARIA attribute maps.

### `getRootProps(): ToolbarRootProps`

```ts
interface ToolbarRootProps {
  id: string                              // '{idBase}-root'
  role: 'toolbar'
  'aria-orientation': 'horizontal' | 'vertical'
  'aria-label'?: string                   // from options.ariaLabel
}
```

### `getItemProps(id: string): ToolbarItemProps`

Returns props for a navigable (non-separator) item. Throws `Error` if `id` is unknown.

```ts
interface ToolbarItemProps {
  id: string                              // '{idBase}.nav-item-{id}'
  tabindex: '0' | '-1'                   // '0' if active, '-1' otherwise
  'aria-disabled'?: 'true'               // present only when item is disabled
  'data-active': 'true' | 'false'        // matches activeId
  onFocus: () => void                    // calls setActive(id)
}
```

### `getSeparatorProps(id: string): ToolbarSeparatorProps`

Returns props for a separator item. Throws `Error` if `id` is unknown or not a separator.

```ts
interface ToolbarSeparatorProps {
  id: string                              // '{idBase}-separator-{id}'
  role: 'separator'
  'aria-orientation': 'vertical' | 'horizontal'  // perpendicular to toolbar orientation
}
```

The separator's `aria-orientation` is perpendicular to the toolbar's orientation: a horizontal toolbar gets vertical separators and vice versa.

## APG and A11y Contract

- toolbar role: `toolbar`
- separator role: `separator` (with perpendicular `aria-orientation`)
- focus management:
  - `roving-tabindex` (only one navigable item has `tabindex="0"` at a time)
  - separators are never focusable and have no `tabindex`
- keyboard behavior:
  - `ArrowRight` / `ArrowDown` moves focus to the next navigable item (orientation-dependent)
  - `ArrowLeft` / `ArrowUp` moves focus to the previous navigable item (orientation-dependent)
  - `Home` moves focus to the first navigable item
  - `End` moves focus to the last navigable item
  - Separators and disabled items are skipped
- orientation: `horizontal` (default) or `vertical`
- focus memory: re-entering the toolbar via Tab restores focus to the last-active item

## Invariants

1. `activeId` is always `null` or the id of a navigable (enabled, non-separator) item.
2. Only the active item has `tabindex="0"`, all other navigable items have `tabindex="-1"`.
3. Separator items never receive `tabindex`, are never active, and are never reached by keyboard navigation.
4. Disabled items are skipped during navigation and cannot become active.
5. `lastActiveId` is always `null` or the id of an item that was navigable at the time of blur.
6. On toolbar re-entry via `handleToolbarFocus`, if `lastActiveId` still refers to a navigable item, `activeId` is restored to it.
7. The toolbar root element itself is not focusable; only navigable items are.
8. `getItemProps` throws for unknown item ids. `getSeparatorProps` throws for unknown ids or non-separator ids.

## Adapter Expectations

This section lists exactly what the UIKit adapter layer binds to.

### Signals Read

| Signal | UIKit Usage |
|---|---|
| `state.activeId()` | Determines roving tabindex; drives `data-active` attribute on item elements; used for programmatic focus management (calling `.focus()` on the active DOM element). |
| `state.lastActiveId()` | Not directly read by UIKit for rendering; consumed internally by `handleToolbarFocus`. UIKit only needs to call the action. |

### Actions Called

| Action | UIKit Trigger |
|---|---|
| `setActive(id)` | An item receives focus via pointer click or programmatic focus. Also called internally by `getItemProps(id).onFocus`. |
| `handleKeyDown(event)` | `keydown` event on a toolbar item or the toolbar root. |
| `handleToolbarFocus()` | `focusin` event on the toolbar root when toolbar was not previously focused (re-entry detection). UIKit must track whether toolbar already has focus to avoid calling on internal focus moves. |
| `handleToolbarBlur()` | `focusout` event on the toolbar root when `relatedTarget` is outside the toolbar (full blur detection). |
| `moveNext()` / `movePrev()` | Not called directly by UIKit; delegated through `handleKeyDown`. |
| `moveFirst()` / `moveLast()` | Not called directly by UIKit; delegated through `handleKeyDown`. |

### Contracts Spread

| Contract | UIKit Target |
|---|---|
| `getRootProps()` | Spread onto the toolbar root container element. |
| `getItemProps(id)` | Spread onto each navigable (non-separator) item element. The `onFocus` callback is bound to the element's `focus` event. |
| `getSeparatorProps(id)` | Spread onto each separator element. |

### UIKit-Only Concerns (Not in Headless)

- **Focus management DOM calls**: Calling `.focus()` on the DOM element matching `activeId` after `handleToolbarFocus` restores `activeId`. Headless sets state; UIKit moves DOM focus.
- **Focus-in/focus-out tracking**: UIKit must detect toolbar entry vs. internal focus moves (e.g., using a `hasFocus` flag updated on `focusin`/`focusout` with `relatedTarget` checks).
- **Separator rendering**: The visual appearance of separators (line, gap, etc.) is a UIKit concern. Headless only provides the ARIA props.
- **Custom DOM events**: Any `input`/`change` events are UIKit concerns, not part of the headless model.

## Minimum Test Matrix

- arrow navigation (next/prev) in horizontal orientation
- arrow navigation (next/prev) in vertical orientation
- Home/End navigation
- disabled item skip behavior
- separator item skip behavior (arrows, Home/End)
- separator items cannot become active via `setActive`
- orientation-aware key mapping (ArrowRight ignored in vertical, ArrowDown ignored in horizontal)
- roving tabindex contract verification (active item `tabindex="0"`, others `"-1"`)
- separator props contract (role, aria-orientation perpendicular)
- wrapping behavior (`wrap: true`)
- clamping behavior (`wrap: false`)
- focus memory: blur then re-focus restores `activeId` to `lastActiveId`
- focus memory: `lastActiveId` becomes stale (item disabled/removed) - falls back gracefully
- initial state resolution with separators present
- mixed items: navigable, disabled, and separator in various orders

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- nested toolbars
- complex grouping within toolbar
- automatic overflow management
- rich content within toolbar items
- dynamic item insertion/removal orchestration (adapter rebuilds model with updated items)
