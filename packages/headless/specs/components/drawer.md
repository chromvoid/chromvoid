# Drawer Component Contract

## Purpose

`Drawer` is a headless contract for slide-out panel dialogs. It wraps `createDialog` internally, delegating all dialog behavior (visibility, focus trapping, scroll locking, dismissal), and adds a `placement` dimension that determines which edge the panel slides from. Supports all dialog features including modal/non-modal modes and `alertdialog` role.

## Component Files

- `src/drawer/index.ts` - model and public `createDrawer` API
- `src/drawer/drawer.test.ts` - unit behavior tests

## Public API

- `createDrawer(options)`
- `state` (signal-backed):
  - `isOpen()` — whether the drawer is currently visible (delegated from dialog)
  - `isModal()` — whether the drawer is in modal mode (delegated from dialog)
  - `type()` — `'dialog' | 'alertdialog'` (delegated from dialog)
  - `restoreTargetId()` — element id to return focus to on close (delegated from dialog)
  - `isFocusTrapped()` — computed: `true` when open AND modal (delegated from dialog)
  - `shouldLockScroll()` — computed: `true` when open AND modal (delegated from dialog)
  - `initialFocusTargetId()` — id of element to focus on open (delegated from dialog)
  - `placement()` — current placement edge: `'start' | 'end' | 'top' | 'bottom'`
- `actions`:
  - `open(source?)`, `close(intent?)`, `toggle(source?)` (delegated from dialog)
  - `setTriggerId(id)` (delegated from dialog)
  - `setPlacement(placement)` — update the placement edge at runtime
  - `handleTriggerClick()` (delegated from dialog)
  - `handleTriggerKeyDown(event)` (delegated from dialog)
  - `handleKeyDown(event)` (delegated from dialog)
  - `handleOutsidePointer()` (delegated from dialog)
  - `handleOutsideFocus()` (delegated from dialog)
- `contracts`:
  - `getTriggerProps()` (delegated from dialog)
  - `getOverlayProps()` (delegated from dialog)
  - `getPanelProps()` — drawer-specific: extends dialog content props with `data-placement`
  - `getTitleProps()` (delegated from dialog)
  - `getDescriptionProps()` (delegated from dialog)
  - `getCloseButtonProps()` (delegated from dialog)
  - `getHeaderCloseButtonProps()` (delegated from dialog)

## CreateDrawerOptions

Extends `CreateDialogOptions` with:

| Option      | Type                                      | Default  | Description                                     |
|-------------|-------------------------------------------|----------|-------------------------------------------------|
| `placement` | `'start' \| 'end' \| 'top' \| 'bottom'` | `'end'`  | Which edge the drawer panel slides from         |

All options from `CreateDialogOptions` are supported and forwarded to the internal dialog:

| Option                  | Type                           | Default       | Description                                            |
|-------------------------|--------------------------------|---------------|--------------------------------------------------------|
| `idBase`                | `string`                       | `'drawer'`    | Base id prefix for all generated ids                   |
| `type`                  | `'dialog' \| 'alertdialog'`   | `'dialog'`    | ARIA role for the content element                      |
| `initialOpen`           | `boolean`                      | `false`       | Whether the drawer starts open                         |
| `isModal`               | `boolean`                      | `true`        | Modal mode enables focus trap and scroll lock          |
| `closeOnEscape`         | `boolean`                      | `true`        | Whether Escape key closes the drawer                   |
| `closeOnOutsidePointer` | `boolean`                      | `true`        | Whether clicking outside closes the drawer             |
| `closeOnOutsideFocus`   | `boolean`                      | `true`        | Whether focusing outside closes the drawer             |
| `initialFocusId`        | `string`                       | ---           | Id of element to receive initial focus on open         |
| `ariaLabelledBy`        | `string`                       | `{idBase}-title` | Custom id for `aria-labelledby`                     |
| `ariaDescribedBy`       | `string`                       | `{idBase}-description` | Custom id for `aria-describedby`             |

## State Signal Surface

| Signal                  | Type                                     | Derived? | Source    | Description                                               |
|-------------------------|------------------------------------------|----------|-----------|-----------------------------------------------------------|
| `isOpen`                | `Atom<boolean>`                          | No       | dialog    | Single source of truth for visibility                     |
| `isModal`               | `Atom<boolean>`                          | No       | dialog    | Whether modal behaviors (focus trap, scroll lock) are on  |
| `type`                  | `Atom<'dialog' \| 'alertdialog'>`        | No       | dialog    | ARIA role type                                            |
| `restoreTargetId`       | `Atom<string \| null>`                   | No       | dialog    | Element id to return focus to after close                 |
| `isFocusTrapped`        | `Computed<boolean>`                      | Yes      | dialog    | `isOpen() && isModal()`                                   |
| `shouldLockScroll`      | `Computed<boolean>`                      | Yes      | dialog    | `isOpen() && isModal()`                                   |
| `initialFocusTargetId`  | `Atom<string \| null>`                   | No       | dialog    | Id of element to receive focus when drawer opens          |
| `placement`             | `Atom<DrawerPlacement>`                  | No       | drawer    | Current placement edge                                    |

### DrawerPlacement type

```ts
type DrawerPlacement = 'start' | 'end' | 'top' | 'bottom'
```

Logical values (`start`/`end`) follow the CSS inline direction, meaning `start` is left in LTR and right in RTL. Physical values (`top`/`bottom`) are always relative to the viewport block axis.

## APG and A11y Contract

Inherits all dialog APG requirements:

- content role: `dialog` (default) or `alertdialog` (when `type: 'alertdialog'`)
- required attributes:
  - panel (content): `aria-modal`, `aria-labelledby`
  - panel (content): `aria-describedby` (required when `type: 'alertdialog'`, recommended for `dialog`)
  - trigger: `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`
- focus management:
  - **modal**: focus trap within the drawer; Tab/Shift+Tab cycle through focusable elements
  - **non-modal**: no focus trap; focus can move freely to/from the drawer
  - initial focus on a specific target (via `initialFocusId`) or the first focusable element
  - return focus to the trigger upon closing (both modal and non-modal)
- alertdialog specifics:
  - role `alertdialog` signals that the drawer contains an alert message requiring user response
  - `aria-describedby` is required (per W3C APG) to point to the alert message content

Drawer additions:

- `data-placement` attribute on the panel element reflecting the current placement value
- No additional ARIA roles or attributes are required for placement; it is a visual/layout concern

## Behavior Contract

All dialog behaviors are inherited. See Dialog spec for full details.

### Modal (`isModal: true`, default)
- `Escape` key closes the drawer (configurable via `closeOnEscape`)
- Outside pointer click closes the drawer (configurable via `closeOnOutsidePointer`)
- Outside focus closes the drawer (configurable via `closeOnOutsideFocus`)
- Scroll lock on the body while the drawer is open
- Focus trap: `Tab` and `Shift+Tab` cycle through focusable elements inside the drawer
- Initial focus: defaults to the first focusable element, can be overridden via `initialFocusId`

### Non-modal (`isModal: false`)
- `Escape` key closes the drawer (configurable via `closeOnEscape`)
- Outside pointer click closes the drawer (configurable via `closeOnOutsidePointer`)
- Outside focus closes the drawer (configurable via `closeOnOutsideFocus`)
- No scroll lock
- No focus trap
- `aria-modal` is `'false'`
- Initial focus: same as modal (configurable via `initialFocusId`)

### Placement
- `placement` determines the edge from which the drawer visually appears
- Changing placement at runtime (via `setPlacement`) updates the `data-placement` attribute
- Placement has no effect on ARIA attributes or focus behavior; it is purely a layout/animation hint

## Contract Prop Shapes

### `getTriggerProps()`
Delegated from dialog. Same shape as `DialogTriggerProps`.
```ts
{
  id: string
  role: 'button'
  tabindex: '0'
  'aria-haspopup': 'dialog'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  onClick: () => void
  onKeyDown: (event) => void
}
```

### `getOverlayProps()`
Delegated from dialog. Same shape as `DialogOverlayProps`.
```ts
{
  id: string
  hidden: boolean
  'data-open': 'true' | 'false'
  onPointerDownOutside: () => void
  onFocusOutside: () => void
}
```

### `getPanelProps()`
Extends dialog content props with `data-placement`.
```ts
{
  id: string
  role: 'dialog' | 'alertdialog'
  tabindex: '-1'
  'aria-modal': 'true' | 'false'
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'data-initial-focus'?: string
  'data-placement': DrawerPlacement
  onKeyDown: (event) => void
}
```

### `getTitleProps()`
Delegated from dialog. Same shape as `DialogTitleProps`.
```ts
{
  id: string
}
```

### `getDescriptionProps()`
Delegated from dialog. Same shape as `DialogDescriptionProps`.
```ts
{
  id: string
}
```

### `getCloseButtonProps()` (footer/generic close)
Delegated from dialog. Same shape as `DialogCloseButtonProps`.
```ts
{
  id: string
  role: 'button'
  tabindex: '0'
  onClick: () => void
}
```

### `getHeaderCloseButtonProps()` (header close icon)
Delegated from dialog. Same shape as `DialogHeaderCloseButtonProps`.
```ts
{
  id: string
  role: 'button'
  tabindex: '0'
  'aria-label': 'Close'
  onClick: () => void
}
```

## Transitions Table

All dialog transitions apply. See Dialog spec for the full table.

Drawer-specific additions:

| Event / Action                      | Current State     | Next State / Effect                                          |
|-------------------------------------|-------------------|--------------------------------------------------------------|
| `setPlacement(placement)`           | any               | `placement` atom updated to new value                        |

### Inherited transitions (from dialog)

| Event / Action                      | Current State     | Next State / Effect                                          |
|-------------------------------------|-------------------|--------------------------------------------------------------|
| `open(source)`                      | `isOpen = false`  | `isOpen = true`; restore target cleared; focus management begins |
| `close(intent)`                     | `isOpen = true`   | `isOpen = false`; `restoreTargetId` set to trigger id        |
| `toggle(source)`                    | `isOpen = false`  | calls `open(source)`                                         |
| `toggle(source)`                    | `isOpen = true`   | calls `close('programmatic')`                                |
| `handleTriggerClick()`              | any               | calls `toggle('pointer')`                                    |
| `handleTriggerKeyDown(Enter/Space)` | any               | calls `toggle('keyboard')`                                   |
| `handleKeyDown(Escape)`             | `isOpen = true`, `closeOnEscape = true` | calls `close('escape')`                     |
| `handleKeyDown(Escape)`             | `closeOnEscape = false` | no-op                                                  |
| `handleOutsidePointer()`            | `isOpen = true`, `closeOnOutsidePointer = true` | calls `close('outside-pointer')` |
| `handleOutsidePointer()`            | `closeOnOutsidePointer = false` | no-op                                           |
| `handleOutsideFocus()`              | `isOpen = true`, `closeOnOutsideFocus = true` | calls `close('outside-focus')`    |
| `handleOutsideFocus()`              | `closeOnOutsideFocus = false` | no-op                                             |
| `setTriggerId(id)`                  | any               | trigger id updated; affects future `restoreTargetId`         |

### Derived state reactions

| State Change      | `isFocusTrapped`            | `shouldLockScroll`          |
|-------------------|-----------------------------|-----------------------------|
| open + modal      | `true`                      | `true`                      |
| open + non-modal  | `false`                     | `false`                     |
| closed (any)      | `false`                     | `false`                     |

## Invariants

1. All dialog invariants apply (see Dialog spec invariants 1-10).
2. `placement` must always be one of `'start' | 'end' | 'top' | 'bottom'`.
3. `placement` defaults to `'end'` when not specified.
4. `getPanelProps()` must always include `data-placement` reflecting the current `placement` value.
5. `getPanelProps()` must include all attributes from dialog's `getContentProps()` (role, aria-modal, aria-labelledby, etc.).
6. The drawer must not duplicate any dialog logic; all dialog behavior is delegated to the internal `createDialog` instance.
7. Changing `placement` must not affect open/close state, focus behavior, or ARIA attributes.

## Adapter Expectations

UIKit adapters MUST bind to the headless model as follows:

**Signals read (reactive, drive re-renders):**
- `state.isOpen()` — whether the drawer is visible
- `state.isModal()` — whether modal behaviors are active
- `state.type()` — dialog type for role assignment
- `state.isFocusTrapped()` — whether focus trap should be active
- `state.shouldLockScroll()` — whether body scroll lock should be active
- `state.restoreTargetId()` — element id to focus after close
- `state.initialFocusTargetId()` — element id to focus on open
- `state.placement()` — current placement edge for layout/animation

**Actions called (event handlers, never mutate state directly):**
- `actions.open(source?)` / `actions.close(intent?)` — programmatic open/close
- `actions.toggle(source?)` — toggle open state
- `actions.setTriggerId(id)` — set custom trigger element id
- `actions.setPlacement(placement)` — update placement edge at runtime
- `actions.handleTriggerClick()` — on trigger click
- `actions.handleTriggerKeyDown(event)` — on trigger keydown
- `actions.handleKeyDown(event)` — on panel keydown (Escape handling)
- `actions.handleOutsidePointer()` — on pointer outside the drawer
- `actions.handleOutsideFocus()` — on focus outside the drawer

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getTriggerProps()` — spread onto the trigger button element
- `contracts.getOverlayProps()` — spread onto the overlay/backdrop element
- `contracts.getPanelProps()` — spread onto the drawer panel element (includes all dialog content attrs plus `data-placement`)
- `contracts.getTitleProps()` — spread onto the drawer title element
- `contracts.getDescriptionProps()` — spread onto the drawer description element
- `contracts.getCloseButtonProps()` — spread onto a footer/generic close button
- `contracts.getHeaderCloseButtonProps()` — spread onto a header close icon button (includes `aria-label: 'Close'`)

**UIKit-only concerns (NOT in headless):**
- Lifecycle events (`cv-open`, `cv-close`, `cv-after-open`, `cv-after-close`)
- CSS transitions and slide animations (direction determined by `data-placement`)
- Backdrop rendering and styling
- Scroll lock implementation (headless provides the signal, UIKit applies the side effect)
- Focus trap implementation (headless provides the signal, UIKit manages DOM focus)
- Contained mode (deferred to v2)

## Minimum Test Matrix

- All dialog tests apply (open/close, Escape, outside pointer, outside focus, focus trap, scroll lock, return focus, initial focus, ARIA linkage, alertdialog, close buttons, trigger handlers, overlay state)
- Default placement is `'end'`
- `getPanelProps()` returns `data-placement` matching current placement
- `setPlacement()` updates placement and `getPanelProps()` reflects the change
- All four placement values (`start`, `end`, `top`, `bottom`) are accepted
- Placement change does not affect `isOpen` state
- Placement change does not affect ARIA attributes (role, aria-modal, aria-labelledby, aria-describedby)
- `getPanelProps()` includes all dialog content attributes (role, tabindex, aria-modal, etc.)
- Custom `idBase` propagates through to all generated ids (uses `'drawer'` as default, not `'dialog'`)

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no `@statx/*` in headless core.
- **Layering**: `core -> interactions -> a11y-contracts -> adapters`; adapters remain thin mappings.
- **Independence**: No imports from `@project/*`, `apps/*`, or other out-of-package modules.
- **Composition**: `createDrawer` wraps `createDialog`; no duplication of dialog internals.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- Contained mode (drawer within a parent container instead of viewport) - deferred to v2
- Swipe-to-dismiss gesture handling
- Nested/stacked drawers management
- Complex animations/transitions (CSS/JS animations are UIKit concerns)
