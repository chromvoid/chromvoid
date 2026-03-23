# Popover Component Contract

## Purpose

`Popover` provides a headless APG-aligned non-modal overlay model for contextual content linked to a trigger. Supports progressive enhancement via the native HTML Popover API when available, with automatic fallback to manual visibility management.

## Component Files

- `src/popover/index.ts` - model and public `createPopover` API
- `src/popover/popover.test.ts` - unit behavior tests

## Public API

- `createPopover(options)`
- `state` (signal-backed):
  - `isOpen()` — current visibility state
  - `triggerId()` — active trigger identifier
  - `openedBy()` — open source (`keyboard`, `pointer`, `programmatic`)
  - `restoreTargetId()` — focus restore target after close
  - `lastDismissIntent()` — latest close intent
  - `isInteractive()` — computed: mirrors `isOpen`
  - `useNativePopover()` — whether native Popover API is active
- `actions`:
  - `setTriggerId(id)`
  - `open(source)`
  - `close(intent)`
  - `toggle(source)`
  - `handleTriggerKeyDown(event)`
  - `handleContentKeyDown(event)`
  - `handleOutsidePointer()`
  - `handleOutsideFocus()`
  - `handleNativeToggle(newState)` — sync headless state when native popover fires `toggle` event
- `contracts`:
  - `getTriggerProps()`
  - `getContentProps()`

## CreatePopoverOptions

| Option                  | Type                  | Default       | Description                                                     |
|-------------------------|-----------------------|---------------|-----------------------------------------------------------------|
| `idBase`                | `string`              | `'popover'`   | Base id prefix for all generated ids                            |
| `initialOpen`           | `boolean`             | `false`       | Whether the popover starts open                                 |
| `initialTriggerId`      | `string \| null`      | `'{idBase}-trigger'` | Trigger element id                                       |
| `ariaLabel`             | `string`              | —             | Content `aria-label`                                            |
| `ariaLabelledBy`        | `string`              | —             | Content `aria-labelledby`                                       |
| `closeOnEscape`         | `boolean`             | `true`        | Whether Escape key closes the popover                           |
| `closeOnOutsidePointer` | `boolean`             | `true`        | Whether clicking outside closes the popover                     |
| `closeOnOutsideFocus`   | `boolean`             | `true`        | Whether focusing outside closes the popover                     |
| `useNativePopover`      | `boolean`             | `false`       | Enable native HTML Popover API integration                      |

## State Signal Surface

| Signal              | Type                         | Derived? | Description                                               |
|---------------------|------------------------------|----------|-----------------------------------------------------------|
| `isOpen`            | `Atom<boolean>`              | No       | Single source of truth for visibility                     |
| `triggerId`         | `Atom<string \| null>`       | No       | Active trigger element id                                 |
| `openedBy`          | `Atom<PopoverOpenSource \| null>` | No  | How the popover was opened                                |
| `restoreTargetId`   | `Atom<string \| null>`       | No       | Element id to return focus to after close                 |
| `lastDismissIntent` | `Atom<PopoverDismissIntent \| null>` | No | Most recent dismiss intent                             |
| `isInteractive`     | `Computed<boolean>`          | Yes      | `isOpen()` — always mirrors open state                    |
| `useNativePopover`  | `Atom<boolean>`              | No       | Whether native Popover API mode is active                 |

## APG and A11y Contract

- trigger role: `button`
- trigger attributes:
  - `aria-haspopup="dialog"`
  - `aria-expanded` — reflects `isOpen`
  - `aria-controls` — points to content id
  - when native popover is active: `popovertarget` — points to content id
- content role: `dialog`
- content attributes:
  - `aria-modal="false"`
  - `aria-label` or `aria-labelledby`
  - `hidden` — reflects `!isOpen` (manual mode only)
  - when native popover is active: `popover="manual"` — native popover attribute

## Keyboard Contract

- trigger keys `Enter`, `Space`, `ArrowDown`: toggle popover
- content key `Escape`: dismiss popover (unless `closeOnEscape` is disabled)

## Behavior Contract

- `Popover` composes `overlay-focus` in non-trapping mode (`trapFocus=false`).
- dismiss intents and open sources are captured as part of model state.
- outside pointer and outside focus closing are independently configurable.
- focus restore target is synchronized through overlay state.

### Native Popover API Integration

When `useNativePopover` is `true`:

- **Content contract** includes `popover: 'manual'` attribute. The `manual` type is used because the headless layer manages all open/close logic; `auto` type is not used because it would cause the browser to close the popover independently from the headless state.
- **Content contract** omits `hidden` attribute — native popover manages visibility via the popover attribute.
- **Trigger contract** includes `popovertarget` attribute pointing to content id, and `popovertargetaction: 'toggle'`.
- **Adapter hook**: The adapter (UIKit) is responsible for calling `showPopover()` / `hidePopover()` on the content DOM element when `isOpen` changes. The headless layer provides the state; the adapter applies the DOM side effect.
- **`handleNativeToggle(newState)`**: When the native popover fires a `toggle` event (e.g., browser-initiated close), the adapter calls this action to synchronize headless state. `newState` is `'open'` or `'closed'`.
- **Light-dismiss**: With `popover="manual"`, light-dismiss is NOT handled by the browser. The headless layer's `handleOutsidePointer` / `handleOutsideFocus` / `handleContentKeyDown` actions handle all dismiss behavior, keeping behavior consistent between native and manual modes.

When `useNativePopover` is `false` (default):

- Content uses `hidden` attribute for visibility.
- No `popover` or `popovertarget` attributes emitted.
- Outside dismiss is handled via document-level listeners in the adapter (same as current behavior).

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
  popovertarget?: string              // content id (only when useNativePopover)
  popovertargetaction?: 'toggle'      // (only when useNativePopover)
  onClick: () => void
  onKeyDown: (event) => void
}
```

### `getContentProps()`
```ts
{
  id: string                          // content element id
  role: 'dialog'
  tabindex: '-1'
  'aria-modal': 'false'
  'aria-label'?: string               // from options
  'aria-labelledby'?: string          // from options
  hidden?: boolean                    // !isOpen (only when NOT useNativePopover)
  popover?: 'manual'                  // (only when useNativePopover)
  onKeyDown: (event) => void
  onPointerDownOutside: () => void
  onFocusOutside: () => void
}
```

## Transitions Table

| Event / Action                      | Current State     | Next State / Effect                                          |
|-------------------------------------|-------------------|--------------------------------------------------------------|
| `open(source)`                      | `isOpen = false`  | `isOpen = true`; restore target cleared; `openedBy` set      |
| `close(intent)`                     | `isOpen = true`   | `isOpen = false`; `restoreTargetId` set to trigger id        |
| `close(intent)`                     | `isOpen = false`  | `lastDismissIntent` updated; no visibility change            |
| `toggle(source)`                    | `isOpen = false`  | calls `open(source)`                                         |
| `toggle(source)`                    | `isOpen = true`   | calls `close('programmatic')`                                |
| `handleTriggerKeyDown(Enter/Space/ArrowDown)` | any    | calls `toggle('keyboard')`                                   |
| `handleTriggerKeyDown(other key)`   | any               | no-op                                                        |
| `handleContentKeyDown(Escape)`      | `isOpen = true`, `closeOnEscape = true` | calls `close('escape')`                  |
| `handleContentKeyDown(Escape)`      | `closeOnEscape = false` | no-op                                                  |
| `handleOutsidePointer()`            | `isOpen = true`, `closeOnOutsidePointer = true` | calls `close('outside-pointer')` |
| `handleOutsidePointer()`            | `closeOnOutsidePointer = false` | no-op                                           |
| `handleOutsideFocus()`              | `isOpen = true`, `closeOnOutsideFocus = true` | calls `close('outside-focus')`    |
| `handleOutsideFocus()`              | `closeOnOutsideFocus = false` | no-op                                             |
| `setTriggerId(id)`                  | any               | trigger id updated; affects future `restoreTargetId`         |
| `handleNativeToggle('closed')`      | `isOpen = true`   | calls `close('programmatic')` to sync state                  |
| `handleNativeToggle('open')`        | `isOpen = false`  | calls `open('programmatic')` to sync state                   |
| `handleNativeToggle(same state)`    | any               | no-op (already in sync)                                      |

### Derived state reactions

| State Change   | `isInteractive` |
|----------------|-----------------|
| open           | `true`          |
| closed         | `false`         |

## Invariants

1. `isInteractive` must mirror `isOpen` — always derived, never set directly.
2. `aria-expanded` must always reflect `isOpen`.
3. Trigger `aria-controls` must match content `id`.
4. `lastDismissIntent` and `restoreTargetId` are updated on dismiss paths.
5. `isOpen` is the single source of truth for visibility.
6. Closing the popover must set `restoreTargetId` to the trigger element id for focus restoration.
7. When `useNativePopover` is `true`, content props must include `popover: 'manual'` and must NOT include `hidden`.
8. When `useNativePopover` is `false`, content props must include `hidden` and must NOT include `popover`.
9. `handleNativeToggle` must be idempotent — calling it with the current state must be a no-op.

## Adapter Expectations

UIKit adapters MUST bind to the headless model as follows:

**Signals read (reactive, drive re-renders):**
- `state.isOpen()` — whether the popover is visible
- `state.triggerId()` — trigger element id
- `state.openedBy()` — how the popover was opened
- `state.restoreTargetId()` — element id to focus after close
- `state.lastDismissIntent()` — most recent dismiss intent
- `state.isInteractive()` — whether the popover content is interactive
- `state.useNativePopover()` — whether native Popover API mode is active

**Actions called (event handlers, never mutate state directly):**
- `actions.open(source?)` / `actions.close(intent?)` — programmatic open/close
- `actions.toggle(source?)` — toggle open state
- `actions.setTriggerId(id)` — set custom trigger element id
- `actions.handleTriggerKeyDown(event)` — on trigger keydown
- `actions.handleContentKeyDown(event)` — on content keydown (Escape handling)
- `actions.handleOutsidePointer()` — on pointer outside the popover
- `actions.handleOutsideFocus()` — on focus outside the popover
- `actions.handleNativeToggle(newState)` — sync state from native `toggle` event

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getTriggerProps()` — spread onto the trigger button element (includes `popovertarget` when native)
- `contracts.getContentProps()` — spread onto the popover content panel (includes `popover="manual"` when native, `hidden` when manual)

**UIKit-only concerns (NOT in headless):**
- Calling `showPopover()` / `hidePopover()` on the content DOM element (when `useNativePopover` is active)
- Listening for native `toggle` / `beforetoggle` events on the content element and calling `handleNativeToggle`
- Document-level `pointerdown` and `focusin` listeners for outside dismiss
- CSS transitions, animations, placement, arrow rendering
- Focus restoration DOM side effect (reading `restoreTargetId` and calling `element.focus()`)
- Lifecycle events (`toggle`, `beforetoggle` naming per design decision #4)

## Minimum Test Matrix

- trigger keyboard open (`Enter`, `Space`, `ArrowDown`) and escape close
- role and aria linkage (`aria-controls` matches content `id`)
- `aria-expanded` reflects `isOpen`
- outside pointer close policy enable/disable
- outside focus close policy enable/disable
- dismiss intent and restore-target synchronization
- `useNativePopover = true`: content props include `popover: 'manual'`, no `hidden`
- `useNativePopover = true`: trigger props include `popovertarget`
- `useNativePopover = false`: content props include `hidden`, no `popover`
- `handleNativeToggle('closed')` syncs state from open to closed
- `handleNativeToggle('open')` syncs state from closed to open
- `handleNativeToggle` is idempotent when state is already in sync

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no `@statx/*` in headless core.
- **Layering**: `core -> interactions -> a11y-contracts -> adapters`; adapters remain thin mappings.
- **Independence**: No imports from `@project/*`, `apps/*`, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- collision/placement engine
- nested popover orchestration
- modal focus trapping behavior
- portal/layer manager concerns (adapter-level)
- `popover="auto"` type (headless manages all dismiss logic; `manual` is used exclusively)
