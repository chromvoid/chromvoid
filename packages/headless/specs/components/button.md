# Button Component Contract

## Purpose

`Button` is a headless APG-aligned contract for an interactive element that allows users to trigger an action or event. It handles activation via click and keyboard, focus management, disabled state, and loading gating.

## Component Files

- `src/button/index.ts` - model and public `createButton` API
- `src/button/button.test.ts` - unit behavior tests

## Public API

- `createButton(options)`
  - `options`:
    - `isDisabled?`: boolean signal or value
    - `isLoading?`: boolean signal or value
    - `isPressed?`: boolean signal or value (for toggle buttons)
    - `onPress?`: callback function
- `state` (signal-backed):
  - `isDisabled()` - boolean indicating if the button is disabled
  - `isLoading()` - boolean indicating if the button is loading
  - `isPressed()` - boolean indicating if the button is in a pressed state (for toggle buttons)
- `actions`:
  - `setDisabled(next)` - updates disabled state
  - `setLoading(next)` - updates loading state
  - `setPressed(next)` - controlled pressed update
  - `press()` - manually triggers the button's action
  - `handleKeyDown(event)` - processes activation keys (`Enter`, `Space`)
  - `handleKeyUp(event)` - processes `Space` key release
- `contracts`:
  - `getButtonProps()` - returns ARIA and event handler props for the button element

## APG and A11y Contract

- role: `button`
- required attributes:
  - `aria-disabled`: reflects interaction unavailability (`isDisabled || isLoading`)
  - `aria-busy`: reflects loading state
  - `aria-pressed`: reflects `isPressed` state (only for toggle buttons)
  - `tabindex`: `0` when interactive, `-1` when unavailable (`isDisabled || isLoading`)
- focus management:
  - the button is in the page tab sequence when interactive
- keyboard interaction:
  - `Enter`: triggers the button action on `keydown`
  - `Space`: triggers the button action on `keyup`

## Behavior Contract

- **Activation**:
  - clicking the button triggers the `onPress` callback
  - pressing `Enter` triggers the `onPress` callback on `keydown`
  - pressing `Space` triggers the `onPress` callback on `keyup`
- **Toggle Button**:
  - if `isPressed` is provided in options, the button acts as a toggle button
  - activation toggles the `isPressed` state
- **Unavailable State**:
  - if `isDisabled` is true, activation actions are ignored
  - if `isLoading` is true, activation actions are ignored
  - controlled actions (`setPressed`, `setDisabled`) remain available while loading

## Transitions Table

| Event | Guard | Action | Next State |
|-------|-------|--------|------------|
| click | `!isDisabled && !isLoading` | `press()` | calls `onPress`; if toggle: `isPressed = !isPressed` |
| click | `isDisabled \|\| isLoading` | — | no change |
| `keydown Enter` | `!isDisabled && !isLoading` | `handleKeyDown(e)` | calls `onPress`; if toggle: `isPressed = !isPressed` |
| `keydown Enter` | `isDisabled \|\| isLoading` | — | no change |
| `keyup Space` | `!isDisabled && !isLoading` | `handleKeyUp(e)` | calls `onPress`; if toggle: `isPressed = !isPressed` |
| `keyup Space` | `isDisabled \|\| isLoading` | — | no change |
| `setDisabled(next)` | — | `setDisabled(next)` | `isDisabled = next` |
| `setLoading(next)` | — | `setLoading(next)` | `isLoading = next` |
| `setPressed(next)` | — | `setPressed(next)` | `isPressed = next` |

## Adapter Expectations

UIKit (`cv-button`) binds to the headless contract as follows:

- **Signals read**: `state.isDisabled()`, `state.isLoading()`, `state.isPressed()` — to reflect host attributes and visual states
- **Actions called**: `actions.setDisabled(v)`, `actions.setLoading(v)`, `actions.setPressed(v)` — to sync attribute changes into headless state
- **Contracts spread**: `contracts.getButtonProps()` — spread onto the inner `[part="base"]` element to apply `role`, `aria-disabled`, `aria-busy`, `aria-pressed`, `tabindex`, and keyboard/click handlers
- **Toggle events**: UIKit dispatches `input` and `change` events by observing `isPressed` changes triggered by user activation (not by controlled `setPressed`)

## Invariants

- `aria-pressed` must only be present if the button is a toggle button
- `aria-disabled` must be `true` when `isDisabled` or `isLoading` is true
- `aria-busy` must be `true` when `isLoading` is true
- `onPress` must not be called when interaction is unavailable

## Minimum Test Matrix

- trigger `onPress` on click
- trigger `onPress` on `Enter` keydown
- trigger `onPress` on `Space` keyup
- verify `aria-disabled` reflects unavailable state (`isDisabled || isLoading`)
- verify `aria-busy` reflects `isLoading`
- verify `aria-pressed` reflects `isPressed` for toggle buttons
- ensure `onPress` is not triggered when unavailable
- verify `tabindex` behavior for interactive vs unavailable states
- verify `setPressed` remains available in controlled loading scenario

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- menu buttons (handled by `Menu` component)
- split buttons
- button groups (layout only)
