# Dialog Component Contract

## Purpose

`Dialog` is a headless APG-aligned contract for modal and non-modal dialogs. It manages visibility, focus trapping (modal only), scroll locking (modal only), and dismissal behavior. Supports both `dialog` and `alertdialog` ARIA roles.

## Component Files

- `src/dialog/index.ts` - model and public `createDialog` API
- `src/dialog/dialog.test.ts` - unit behavior tests

## Public API

- `createDialog(options)`
- `state` (signal-backed):
  - `isOpen()` — whether the dialog is currently visible
  - `isModal()` — whether the dialog is in modal mode
  - `type()` — `'dialog' | 'alertdialog'`
  - `restoreTargetId()` — element id to return focus to on close
  - `isFocusTrapped()` — computed: `true` when open AND modal
  - `shouldLockScroll()` — computed: `true` when open AND modal
  - `initialFocusTargetId()` — id of element to focus on open (or `null`)
- `actions`:
  - `open(source?)`, `close(intent?)`, `toggle(source?)`
  - `setTriggerId(id)`
  - `handleTriggerClick()`
  - `handleTriggerKeyDown(event)`
  - `handleKeyDown(event)`
  - `handleOutsidePointer()`
  - `handleOutsideFocus()`
- `contracts`:
  - `getTriggerProps()`
  - `getOverlayProps()`
  - `getContentProps()`
  - `getTitleProps()`
  - `getDescriptionProps()`
  - `getCloseButtonProps()` — footer/generic close button
  - `getHeaderCloseButtonProps()` — header close icon button

## CreateDialogOptions

| Option                  | Type                           | Default       | Description                                            |
|-------------------------|--------------------------------|---------------|--------------------------------------------------------|
| `idBase`                | `string`                       | `'dialog'`    | Base id prefix for all generated ids                   |
| `type`                  | `'dialog' \| 'alertdialog'`   | `'dialog'`    | ARIA role for the content element                      |
| `initialOpen`           | `boolean`                      | `false`       | Whether the dialog starts open                         |
| `isModal`               | `boolean`                      | `true`        | Modal mode enables focus trap and scroll lock          |
| `closeOnEscape`         | `boolean`                      | `true`        | Whether Escape key closes the dialog                   |
| `closeOnOutsidePointer` | `boolean`                      | `true`        | Whether clicking outside closes the dialog             |
| `closeOnOutsideFocus`   | `boolean`                      | `true`        | Whether focusing outside closes the dialog             |
| `initialFocusId`        | `string`                       | —             | Id of element to receive initial focus on open         |
| `ariaLabelledBy`        | `string`                       | `{idBase}-title` | Custom id for `aria-labelledby`                     |
| `ariaDescribedBy`       | `string`                       | `{idBase}-description` | Custom id for `aria-describedby`             |

## State Signal Surface

| Signal                  | Type                  | Derived? | Description                                               |
|-------------------------|-----------------------|----------|-----------------------------------------------------------|
| `isOpen`                | `Atom<boolean>`       | No       | Single source of truth for visibility                     |
| `isModal`               | `Atom<boolean>`       | No       | Whether modal behaviors (focus trap, scroll lock) are on  |
| `type`                  | `Atom<'dialog' \| 'alertdialog'>` | No | ARIA role type                                     |
| `restoreTargetId`       | `Atom<string \| null>`| No       | Element id to return focus to after close                 |
| `isFocusTrapped`        | `Computed<boolean>`   | Yes      | `isOpen() && isModal()`                                   |
| `shouldLockScroll`      | `Computed<boolean>`   | Yes      | `isOpen() && isModal()`                                   |
| `initialFocusTargetId`  | `Atom<string \| null>`| No       | Id of element to receive focus when dialog opens          |

## APG and A11y Contract

- content role: `dialog` (default) or `alertdialog` (when `type: 'alertdialog'`)
- required attributes:
  - content: `aria-modal`, `aria-labelledby`
  - content: `aria-describedby` (required when `type: 'alertdialog'`, recommended for `dialog`)
  - trigger: `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`
- focus management:
  - **modal**: focus trap within the dialog; Tab/Shift+Tab cycle through focusable elements
  - **non-modal**: no focus trap; focus can move freely to/from the dialog
  - initial focus on a specific target (via `initialFocusId`) or the first focusable element
  - return focus to the trigger upon closing (both modal and non-modal)
- alertdialog specifics:
  - role `alertdialog` signals that the dialog contains an alert message requiring user response
  - `aria-describedby` is required (per W3C APG) to point to the alert message content

## Behavior Contract

### Modal (`isModal: true`, default)
- `Escape` key closes the dialog (configurable via `closeOnEscape`)
- Outside pointer click closes the dialog (configurable via `closeOnOutsidePointer`)
- Outside focus closes the dialog (configurable via `closeOnOutsideFocus`)
- Scroll lock on the body while the dialog is open
- Focus trap: `Tab` and `Shift+Tab` cycle through focusable elements inside the dialog
- Initial focus: defaults to the first focusable element, can be overridden via `initialFocusId`

### Non-modal (`isModal: false`)
- `Escape` key closes the dialog (configurable via `closeOnEscape`)
- Outside pointer click closes the dialog (configurable via `closeOnOutsidePointer`)
- Outside focus closes the dialog (configurable via `closeOnOutsideFocus`)
- No scroll lock — page remains scrollable
- No focus trap — user can Tab out of the dialog freely
- `aria-modal` is `'false'`
- Initial focus: same as modal (configurable via `initialFocusId`)

## Contract Prop Shapes

### `getTriggerProps()`
```ts
{
  id: string                          // trigger element id
  role: 'button'
  tabindex: '0'
  'aria-haspopup': 'dialog'
  'aria-expanded': 'true' | 'false'   // reflects isOpen
  'aria-controls': string             // points to content id
  onClick: () => void
  onKeyDown: (event) => void
}
```

### `getOverlayProps()`
```ts
{
  id: string                          // overlay element id
  hidden: boolean                     // !isOpen
  'data-open': 'true' | 'false'      // reflects isOpen
  onPointerDownOutside: () => void
  onFocusOutside: () => void
}
```

### `getContentProps()`
```ts
{
  id: string                          // content element id
  role: 'dialog' | 'alertdialog'     // based on type option
  tabindex: '-1'
  'aria-modal': 'true' | 'false'     // reflects isModal
  'aria-labelledby': string           // points to title id
  'aria-describedby'?: string         // points to description id (required for alertdialog)
  'data-initial-focus'?: string       // initialFocusId if provided
  onKeyDown: (event) => void
}
```

### `getTitleProps()`
```ts
{
  id: string                          // title element id
}
```

### `getDescriptionProps()`
```ts
{
  id: string                          // description element id
}
```

### `getCloseButtonProps()` (footer/generic close)
```ts
{
  id: string                          // '{idBase}-close'
  role: 'button'
  tabindex: '0'
  onClick: () => void                 // calls close('programmatic')
}
```

### `getHeaderCloseButtonProps()` (header close icon)
```ts
{
  id: string                          // '{idBase}-header-close'
  role: 'button'
  tabindex: '0'
  'aria-label': 'Close'
  onClick: () => void                 // calls close('programmatic')
}
```

## Transitions Table

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

1. Modal dialogs must trap focus and prevent interaction with the rest of the page.
2. Non-modal dialogs must NOT trap focus and must NOT lock scroll.
3. `isOpen` state is the single source of truth for visibility.
4. Closing the dialog must set `restoreTargetId` to the trigger element id for focus restoration.
5. `isFocusTrapped` === `isOpen && isModal` — always derived, never set directly.
6. `shouldLockScroll` === `isOpen && isModal` — always derived, never set directly.
7. When `type` is `'alertdialog'`, the content role must be `'alertdialog'` (not `'dialog'`).
8. `aria-describedby` is always included for `alertdialog` (W3C APG requirement).
9. Both `getCloseButtonProps()` and `getHeaderCloseButtonProps()` must call the same `close('programmatic')` action.
10. `getHeaderCloseButtonProps()` must include `aria-label: 'Close'` for icon-only buttons.

## Adapter Expectations

UIKit adapters MUST bind to the headless model as follows:

**Signals read (reactive, drive re-renders):**
- `state.isOpen()` — whether the dialog is visible
- `state.isModal()` — whether modal behaviors are active
- `state.type()` — dialog type for role assignment
- `state.isFocusTrapped()` — whether focus trap should be active
- `state.shouldLockScroll()` — whether body scroll lock should be active
- `state.restoreTargetId()` — element id to focus after close
- `state.initialFocusTargetId()` — element id to focus on open

**Actions called (event handlers, never mutate state directly):**
- `actions.open(source?)` / `actions.close(intent?)` — programmatic open/close
- `actions.toggle(source?)` — toggle open state
- `actions.setTriggerId(id)` — set custom trigger element id
- `actions.handleTriggerClick()` — on trigger click
- `actions.handleTriggerKeyDown(event)` — on trigger keydown
- `actions.handleKeyDown(event)` — on content keydown (Escape handling)
- `actions.handleOutsidePointer()` — on pointer outside the dialog
- `actions.handleOutsideFocus()` — on focus outside the dialog

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getTriggerProps()` — spread onto the trigger button element
- `contracts.getOverlayProps()` — spread onto the overlay/backdrop element
- `contracts.getContentProps()` — spread onto the dialog content panel (returns `role: 'dialog' | 'alertdialog'` based on `type`)
- `contracts.getTitleProps()` — spread onto the dialog title element
- `contracts.getDescriptionProps()` — spread onto the dialog description element
- `contracts.getCloseButtonProps()` — spread onto a footer/generic close button
- `contracts.getHeaderCloseButtonProps()` — spread onto a header close icon button (includes `aria-label: 'Close'`)

**UIKit-only concerns (NOT in headless):**
- Lifecycle events (`cv-open`, `cv-close`, `cv-after-open`, `cv-after-close`)
- CSS transitions and animations
- Backdrop rendering and styling
- Scroll lock implementation (headless provides the signal, UIKit applies the side effect)
- Focus trap implementation (headless provides the signal, UIKit manages DOM focus)

## Minimum Test Matrix

- open/close lifecycle via actions
- `Escape` key dismissal (with and without `closeOnEscape`)
- outside pointer dismissal (with and without `closeOnOutsidePointer`)
- outside focus dismissal (with and without `closeOnOutsideFocus`)
- focus trap behavior: `isFocusTrapped` is `true` for modal, `false` for non-modal
- scroll lock: `shouldLockScroll` is `true` for modal, `false` for non-modal
- return focus to trigger on close (`restoreTargetId`)
- initial focus placement (`initialFocusTargetId`, `data-initial-focus`)
- trigger/content/title/description aria linkage consistency
- `type: 'alertdialog'` produces `role: 'alertdialog'` in content props
- `type: 'dialog'` (default) produces `role: 'dialog'` in content props
- `aria-describedby` present for alertdialog
- `getHeaderCloseButtonProps()` returns `aria-label: 'Close'` and closes the dialog
- `getCloseButtonProps()` closes the dialog
- trigger click and keyboard (Enter, Space) handlers
- overlay props reflect open state

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no `@statx/*` in headless core.
- **Layering**: `core -> interactions -> a11y-contracts -> adapters`; adapters remain thin mappings.
- **Independence**: No imports from `@project/*`, `apps/*`, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- Nested/stacked dialogs management
- Complex animations/transitions (CSS/JS animations are UIKit concerns)
