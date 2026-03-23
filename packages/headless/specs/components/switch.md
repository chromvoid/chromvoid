# Switch Component Contract

## Purpose

`Switch` provides a headless APG-aligned model for a toggle control that represents a strictly binary on/off state.

While functionally similar to a checkbox, it follows distinct APG keyboard and semantic conventions: the `switch` role uses `aria-checked` (not `aria-pressed`), and both `Space` and `Enter` toggle the state (checkbox only requires `Space`).

## Component Files

- `src/switch/index.ts` - model and public `createSwitch` API
- `src/switch/switch.test.ts` - unit behavior tests

## Public API

- `createSwitch(options)`
- `state` (signal-backed):
  - `isOn()`: `boolean`
  - `isDisabled()`: `boolean`
- `actions`:
  - `toggle()`: toggles the on/off state (no-op if disabled)
  - `setOn(value: boolean)`: explicitly sets the on state; fires `onCheckedChange` callback
  - `setDisabled(value: boolean)`: explicitly sets the disabled state
  - `handleClick()`: delegates to `toggle()`
  - `handleKeyDown(event)`: handles keyboard interaction (`Space`, `Enter`)
- `contracts`:
  - `getSwitchProps()`: returns complete ARIA and event handler attribute map for the switch element

## CreateSwitchOptions

| Option           | Type                           | Default     | Description                                             |
|------------------|--------------------------------|-------------|---------------------------------------------------------|
| `idBase`         | `string`                       | `'switch'`  | Base id prefix for generated ids                        |
| `isOn`           | `boolean`                      | `false`     | Initial on/off state                                    |
| `isDisabled`     | `boolean`                      | `false`     | Initial disabled state                                  |
| `ariaLabelledBy` | `string`                       | —           | Id reference for external label (`aria-labelledby`)     |
| `ariaDescribedBy`| `string`                       | —           | Id reference for help text / description (`aria-describedby`) |
| `onCheckedChange`| `(value: boolean) => void`     | —           | Callback fired when `isOn` changes via `setOn`          |

## State Signal Surface

| Signal       | Type            | Derived? | Description                                     |
|--------------|-----------------|----------|-------------------------------------------------|
| `isOn`       | `Atom<boolean>` | No       | Single source of truth for on/off state         |
| `isDisabled` | `Atom<boolean>` | No       | Whether user interaction is blocked             |

## APG and A11y Contract

- role: `switch` (strictly binary; no indeterminate/mixed state)
- `aria-checked`: `"true" | "false"` (reflects `isOn` state)
- `aria-disabled`: `"true" | "false"` (reflects `isDisabled` state)
- `tabindex`: `"0"` when enabled, `"-1"` when disabled
- linkage:
  - `aria-labelledby`: optional, references an external label element
  - `aria-describedby`: optional, references help text or description element

## Keyboard Contract

| Key     | Action                                           |
|---------|--------------------------------------------------|
| `Space` | Toggle the `isOn` state; calls `preventDefault`  |
| `Enter` | Toggle the `isOn` state; calls `preventDefault`  |

All keyboard actions are no-ops when `isDisabled` is `true`.

## Behavior Contract

- `Space` key toggles the on/off state.
- `Enter` key toggles the on/off state (specific to `switch` pattern in APG; checkbox only requires `Space`).
- `Click` interaction toggles the on/off state.
- Disabled switches do not respond to any toggle actions (`toggle`, `handleClick`, `handleKeyDown`).
- Unrelated keys (anything other than `Space` or `Enter`) are ignored; `preventDefault` is NOT called.

## Contract Prop Shapes

### `getSwitchProps()`
```ts
{
  id: string                          // '{idBase}-root'
  role: 'switch'
  tabindex: '0' | '-1'               // '-1' when disabled
  'aria-checked': 'true' | 'false'   // reflects isOn
  'aria-disabled': 'true' | 'false'  // reflects isDisabled
  'aria-labelledby'?: string          // present when ariaLabelledBy option is set
  'aria-describedby'?: string         // present when ariaDescribedBy option is set
  onClick: () => void                 // calls handleClick
  onKeyDown: (event) => void          // calls handleKeyDown
}
```

## Transitions Table

| Event / Action              | Current State        | Next State / Effect                               |
|-----------------------------|----------------------|---------------------------------------------------|
| `toggle()`                  | `isOn=false`         | `isOn=true`; fires `onCheckedChange(true)`        |
| `toggle()`                  | `isOn=true`          | `isOn=false`; fires `onCheckedChange(false)`      |
| `toggle()`                  | `isDisabled=true`    | no-op                                             |
| `setOn(value)`              | any                  | `isOn=value`; fires `onCheckedChange(value)`      |
| `setDisabled(value)`        | any                  | `isDisabled=value`                                |
| `handleClick()`             | any                  | delegates to `toggle()`                           |
| `handleKeyDown(Space)`      | not disabled         | delegates to `toggle()`; `preventDefault`         |
| `handleKeyDown(Enter)`      | not disabled         | delegates to `toggle()`; `preventDefault`         |
| `handleKeyDown(other)`      | any                  | no-op; no `preventDefault`                        |
| `handleKeyDown(any)`        | `isDisabled=true`    | no-op; no `preventDefault`                        |

## Invariants

1. `isOn` is always a `boolean` (strictly binary; no third state).
2. A disabled switch cannot be toggled via `toggle()`, `handleClick()`, or `handleKeyDown()`.
3. `aria-checked` is `"true"` when `isOn` is `true`, and `"false"` otherwise.
4. `aria-disabled` is `"true"` when `isDisabled` is `true`, and `"false"` otherwise.
5. `tabindex` is `"0"` when enabled, `"-1"` when disabled.
6. `aria-labelledby` is present in props only when `ariaLabelledBy` option is provided.
7. `aria-describedby` is present in props only when `ariaDescribedBy` option is provided.
8. `getSwitchProps()` always returns a complete, ready-to-spread attribute object.

## Adapter Expectations

UIKit adapter (`cv-switch`) will:

**Signals read (reactive, drive re-renders):**
- `state.isOn()` — whether the switch is on or off
- `state.isDisabled()` — whether user interaction is blocked

**Actions called (event handlers, never mutate state directly):**
- `actions.toggle()` — toggle on/off
- `actions.setOn(value)` — programmatic state set
- `actions.setDisabled(value)` — update disabled state
- `actions.handleClick()` — on switch click
- `actions.handleKeyDown(event)` — on switch keydown

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getSwitchProps()` — spread onto the switch host element

**UIKit-only concerns (NOT in headless):**
- Toggled/untoggled content slots (on/off icons/text inside the track) — purely visual, no state or ARIA changes
- Help text slot rendering — headless provides `aria-describedby` linkage via `ariaDescribedBy` option; UIKit renders the visible help text element and generates the matching id
- CSS custom properties, animations, and size variants
- `help-text` attribute and slot
- Lifecycle events (`cv-change`, etc.)

## Minimum Test Matrix

- toggle behavior (off -> on -> off)
- keyboard `Space` interaction
- keyboard `Enter` interaction
- click interaction
- disabled state prevents state changes via all interaction paths (`toggle`, `handleClick`, `handleKeyDown`)
- correct `aria-checked` mapping (`"true"` / `"false"`)
- correct `aria-disabled` mapping
- correct `tabindex` mapping (enabled vs disabled)
- `aria-labelledby` and `aria-describedby` presence in contract props
- `onCheckedChange` callback fires on state transitions
- `preventDefault` called on `Space` and `Enter`
- `preventDefault` NOT called on unrelated keys
- unrelated keys do not toggle state

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- indeterminate state (not applicable to `switch` role)
- native form submission integration (handled by adapters/wrappers)
- toggled/untoggled content slots (UIKit visual concern)
- help text rendering (UIKit visual concern; headless provides `aria-describedby` linkage only)
