# Number Component Contract

## Purpose

`Number` is a headless contract for a numeric input field that **composes** `createSpinbutton` with additional features: clearable behavior, focus tracking, draft text management (transient editing state before numeric commit), placeholder support, and required semantics. It provides a unified API surface that proxies all spinbutton state, actions, and contracts while layering on input-style features needed by UIKit's `cv-number` component.

The `createNumber` factory internally instantiates a `createSpinbutton` model and exposes its capabilities through a single coherent interface, adding the following on top:

- **Draft text management** -- while the user types, the raw text is held in `draftText` without affecting the numeric `value`. On commit (blur, Enter), the draft is parsed and applied via spinbutton's `setValue`.
- **Clearable** -- an optional clear button that resets the value to the default and invokes an `onClear` callback.
- **Focus tracking** -- `focused` signal reflecting native focus/blur events.
- **Placeholder** -- a placeholder string displayed when the input is empty.
- **Required** -- marks the field as required for accessibility.
- **Stepper visibility** -- controls whether increment/decrement buttons are rendered.

## Component Files

- `src/number/index.ts` -- model and public `createNumber` API
- `src/number/number.test.ts` -- unit behavior tests

## Public API

- `createNumber(options)`
- `CreateNumberOptions`:
  - `idBase?: string` -- base for generated IDs (default: `"number"`)
  - `value?: number` -- initial numeric value (passed to spinbutton)
  - `defaultValue?: number` -- the value to reset to on `clear()`; defaults to `min ?? 0`
  - `min?: number` -- minimum bound (passed to spinbutton)
  - `max?: number` -- maximum bound (passed to spinbutton)
  - `step?: number` -- step size (passed to spinbutton)
  - `largeStep?: number` -- large step size (passed to spinbutton)
  - `disabled?: boolean` -- initial disabled state (default: `false`)
  - `readonly?: boolean` -- initial readonly state (default: `false`)
  - `required?: boolean` -- initial required state (default: `false`)
  - `clearable?: boolean` -- whether the clear button is available (default: `false`)
  - `stepper?: boolean` -- whether stepper buttons are visible (default: `false`)
  - `placeholder?: string` -- initial placeholder text (default: `""`)
  - `ariaLabel?: string` -- accessible label
  - `ariaLabelledBy?: string` -- ID reference for labelling element
  - `ariaDescribedBy?: string` -- ID reference for description element
  - `formatValueText?: (value: number) => string` -- custom `aria-valuetext` formatter (passed to spinbutton)
  - `onValueChange?: (value: number) => void` -- callback on committed value change
  - `onClear?: () => void` -- callback when the value is cleared
- **Types**:
  - `NumberKeyboardEventLike = Pick<KeyboardEvent, 'key'> & { preventDefault?: () => void }`

## State Signal Surface

All signals are reactive (Reatom atoms/computed).

### Proxied from spinbutton

| Signal | Type | Source |
|---|---|---|
| `value()` | `number` | spinbutton `state.value` |
| `min()` | `number \| undefined` | spinbutton `state.min` |
| `max()` | `number \| undefined` | spinbutton `state.max` |
| `step()` | `number` | spinbutton `state.step` |
| `largeStep()` | `number` | spinbutton `state.largeStep` |
| `isDisabled()` | `boolean` | spinbutton `state.isDisabled` |
| `isReadOnly()` | `boolean` | spinbutton `state.isReadOnly` |
| `hasMin()` | `boolean` | spinbutton `state.hasMin` |
| `hasMax()` | `boolean` | spinbutton `state.hasMax` |

### Number-specific

| Signal | Type | Description |
|---|---|---|
| `focused()` | `boolean` | Whether the input currently has focus |
| `filled()` | `boolean` | **Derived**: `true` when `value !== defaultValue` |
| `clearable()` | `boolean` | Whether the clear button feature is enabled |
| `showClearButton()` | `boolean` | **Derived**: `clearable && filled && !isDisabled && !isReadOnly` |
| `stepper()` | `boolean` | Whether stepper (increment/decrement) buttons are visible |
| `draftText()` | `string \| null` | Transient editing text before commit; `null` when not actively editing |
| `placeholder()` | `string` | Placeholder text for the input |
| `required()` | `boolean` | Whether the field is required |
| `defaultValue()` | `number` | The value to reset to on clear |

## Actions

All state transitions go through actions. UIKit must only call actions, never mutate state directly.

### Proxied from spinbutton

| Action | Description |
|---|---|
| `setValue(value: number)` | Sets the numeric value with clamping and snapping; clears draft text |
| `increment()` | Increments value by `step` |
| `decrement()` | Decrements value by `step` |
| `incrementLarge()` | Increments value by `largeStep` |
| `decrementLarge()` | Decrements value by `largeStep` |
| `setFirst()` | Jumps to `min` (if defined) |
| `setLast()` | Jumps to `max` (if defined) |
| `handleKeyDown(event)` | Handles spinbutton keys (ArrowUp/Down, PageUp/Down, Home/End) AND Escape for clear |

### Number-specific

| Action | Description |
|---|---|
| `setDisabled(v: boolean)` | Updates disabled state; delegates to spinbutton |
| `setReadOnly(v: boolean)` | Updates readonly state; delegates to spinbutton |
| `setRequired(v: boolean)` | Updates required state |
| `setClearable(v: boolean)` | Updates clearable state |
| `setStepper(v: boolean)` | Updates stepper visibility state |
| `setFocused(v: boolean)` | Updates focus state; on `false` (blur), auto-commits draft |
| `setPlaceholder(v: string)` | Updates placeholder text |
| `setDraftText(v: string \| null)` | Updates transient draft text directly |
| `commitDraft()` | Parses `draftText` as a number; if valid, calls `setValue`; if empty, calls `clear()`; if invalid, reverts draft to current value display; always clears draft to `null` |
| `clear()` | Resets value to `defaultValue`, calls `onClear` callback; no-op when `isDisabled` or `isReadOnly` |
| `handleInput(text: string)` | Processes native input event; updates `draftText` to `text` |

### Action semantics

- `setValue` bypasses the disabled/readonly guard (programmatic/controlled update), consistent with spinbutton behavior. It also clears `draftText` to `null`.
- `increment`, `decrement`, `incrementLarge`, `decrementLarge`, `setFirst`, `setLast` all clear `draftText` to `null` after modifying the value.
- `handleKeyDown` extends spinbutton's handler: if `key === 'Escape'` and `clearable && filled && !isDisabled && !isReadOnly`, calls `clear()` and prevents default. Otherwise delegates to spinbutton's `handleKeyDown`. If `key === 'Enter'`, calls `commitDraft()` and prevents default.
- `setFocused(false)` triggers `commitDraft()` automatically (blur commit).

## Contracts

Contracts return ready-to-spread attribute maps for UIKit to apply directly to DOM elements.

### `getInputProps()`

Returns attributes for the native `<input>` element:

| Attribute | Value |
|---|---|
| `id` | `"{idBase}-input"` |
| `role` | `"spinbutton"` |
| `tabindex` | `"0"` when interactive, `"-1"` when `isDisabled` |
| `inputmode` | `"decimal"` |
| `aria-valuenow` | `String(value)` |
| `aria-valuemin` | `String(min)` when defined, otherwise omitted |
| `aria-valuemax` | `String(max)` when defined, otherwise omitted |
| `aria-valuetext` | Custom formatted text via `formatValueText`, otherwise omitted |
| `aria-disabled` | `"true"` when `isDisabled`, otherwise omitted |
| `aria-readonly` | `"true"` when `isReadOnly`, otherwise omitted |
| `aria-required` | `"true"` when `required`, otherwise omitted |
| `aria-label` | From options, when provided |
| `aria-labelledby` | From options, when provided |
| `aria-describedby` | From options, when provided |
| `placeholder` | Current placeholder value, omitted when empty |
| `autocomplete` | `"off"` |

### `getIncrementButtonProps()`

Proxied from spinbutton's `getIncrementButtonProps()`, with `hidden` and `aria-hidden` added based on `stepper` state:

| Attribute | Value |
|---|---|
| `id` | `"{idBase}-increment"` |
| `tabindex` | `"-1"` |
| `aria-label` | `"Increment value"` |
| `aria-disabled` | `"true"` when disabled or at max, otherwise omitted |
| `hidden` | `true` when `stepper` is `false` |
| `aria-hidden` | `"true"` when `hidden` |
| `onClick` | `increment` handler |

### `getDecrementButtonProps()`

Proxied from spinbutton's `getDecrementButtonProps()`, with `hidden` and `aria-hidden` added based on `stepper` state:

| Attribute | Value |
|---|---|
| `id` | `"{idBase}-decrement"` |
| `tabindex` | `"-1"` |
| `aria-label` | `"Decrement value"` |
| `aria-disabled` | `"true"` when disabled or at min, otherwise omitted |
| `hidden` | `true` when `stepper` is `false` |
| `aria-hidden` | `"true"` when `hidden` |
| `onClick` | `decrement` handler |

### `getClearButtonProps()`

Returns attributes for the clear button:

| Attribute | Value |
|---|---|
| `role` | `"button"` |
| `aria-label` | `"Clear value"` |
| `tabindex` | `"-1"` (not in tab order; activated by Escape key or pointer) |
| `hidden` | `true` when `showClearButton` is `false` |
| `aria-hidden` | `"true"` when `hidden` |
| `onClick` | `clear` handler |

## Transitions Table

| Event / Action | Guard | Effect | Next State |
|---|---|---|---|
| `setValue(v)` | -- | spinbutton `setValue(v)`, clear draft | `value = clamped/snapped v`; `draftText = null`; `onValueChange(v)` if changed |
| `increment()` | `!isDisabled && !isReadOnly` | spinbutton `increment()`, clear draft | `value = value + step`; `draftText = null` |
| `decrement()` | `!isDisabled && !isReadOnly` | spinbutton `decrement()`, clear draft | `value = value - step`; `draftText = null` |
| `incrementLarge()` | `!isDisabled && !isReadOnly` | spinbutton `incrementLarge()`, clear draft | `value = value + largeStep`; `draftText = null` |
| `decrementLarge()` | `!isDisabled && !isReadOnly` | spinbutton `decrementLarge()`, clear draft | `value = value - largeStep`; `draftText = null` |
| `setFirst()` | `!isDisabled && !isReadOnly && hasMin` | spinbutton `setFirst()`, clear draft | `value = min`; `draftText = null` |
| `setLast()` | `!isDisabled && !isReadOnly && hasMax` | spinbutton `setLast()`, clear draft | `value = max`; `draftText = null` |
| `handleInput(text)` | `!isDisabled && !isReadOnly` | set draft | `draftText = text` |
| `handleInput(text)` | `isDisabled \|\| isReadOnly` | -- | no change |
| `setDraftText(v)` | -- | set draft | `draftText = v` |
| `commitDraft()` | `draftText !== null && parseable` | parse, `setValue(parsed)` | `value = parsed`; `draftText = null` |
| `commitDraft()` | `draftText !== null && empty` | `clear()` | `value = defaultValue`; `draftText = null`; `onClear()` called |
| `commitDraft()` | `draftText !== null && invalid` | revert draft | `draftText = null` |
| `commitDraft()` | `draftText === null` | -- | no change |
| `clear()` | `!isDisabled && !isReadOnly` | reset to default | `value = defaultValue`; `draftText = null`; `onClear()` called |
| `clear()` | `isDisabled \|\| isReadOnly` | -- | no change |
| `keydown Escape` | `clearable && filled && !isDisabled && !isReadOnly` | `clear()` | `value = defaultValue`; `draftText = null`; `onClear()` called |
| `keydown Escape` | `!(clearable && filled) \|\| isDisabled \|\| isReadOnly` | -- | no change |
| `keydown Enter` | `draftText !== null` | `commitDraft()` | draft committed or reverted |
| `keydown ArrowUp` | -- | delegate to spinbutton | `value = value + step` |
| `keydown ArrowDown` | -- | delegate to spinbutton | `value = value - step` |
| `keydown PageUp` | -- | delegate to spinbutton | `value = value + largeStep` |
| `keydown PageDown` | -- | delegate to spinbutton | `value = value - largeStep` |
| `keydown Home` | -- | delegate to spinbutton | `value = min` or unchanged |
| `keydown End` | -- | delegate to spinbutton | `value = max` or unchanged |
| `setFocused(true)` | -- | set focused | `focused = true` |
| `setFocused(false)` | -- | set focused, commit draft | `focused = false`; `commitDraft()` triggered |
| `setDisabled(d)` | -- | delegate to spinbutton | `isDisabled = d` |
| `setReadOnly(r)` | -- | delegate to spinbutton | `isReadOnly = r` |
| `setRequired(r)` | -- | set required | `required = r` |
| `setClearable(c)` | -- | set clearable | `clearable = c` |
| `setStepper(s)` | -- | set stepper | `stepper = s` |
| `setPlaceholder(p)` | -- | set placeholder | `placeholder = p` |

## Invariants

1. `value` must always satisfy spinbutton invariants (clamped, snapped, within bounds when bounds are defined).
2. `filled` must be `true` if and only if `value !== defaultValue`.
3. `showClearButton` must be `true` if and only if `clearable && filled && !isDisabled && !isReadOnly`.
4. `clear()` must be a no-op when `isDisabled` or `isReadOnly`.
5. `draftText` must be `null` when not actively editing (i.e., after any commit, clear, or spinbutton action).
6. `commitDraft()` with empty draft string must call `clear()` (reset to default).
7. `commitDraft()` with non-parseable text must revert silently (set `draftText` to `null` without changing `value`).
8. `setFocused(false)` must trigger `commitDraft()`.
9. `handleKeyDown` must handle `Escape` (clear) and `Enter` (commit) before delegating remaining keys to spinbutton.
10. `aria-disabled` on the input must be `"true"` when `isDisabled` is `true`.
11. `aria-readonly` on the input must be `"true"` when `isReadOnly` is `true`.
12. `aria-required` on the input must be `"true"` when `required` is `true`.
13. `tabindex` on the input must be `"-1"` when `isDisabled`, `"0"` otherwise.
14. Increment/decrement button contracts must have `hidden: true` when `stepper` is `false`.
15. Clear button must have `hidden: true` when `showClearButton` is `false`.
16. `defaultValue` must satisfy spinbutton normalization (clamped and snapped).
17. Spinbutton actions (`increment`, `decrement`, etc.) must clear `draftText` to prevent stale draft display.
18. `onValueChange` must not be called from `clear()` if the value is already equal to `defaultValue`.
19. `getInputProps()` must return `role: "spinbutton"` to match APG spinbutton semantics.
20. `inputmode` must be `"decimal"` to trigger numeric keyboard on mobile devices.

## Adapter Expectations

UIKit (`cv-number`) binds to the headless contract as follows:

### Signals read

- `state.value()` -- to display the formatted numeric value when not actively editing
- `state.isDisabled()` -- to reflect the `disabled` host attribute
- `state.isReadOnly()` -- to reflect the `readonly` host attribute
- `state.required()` -- to reflect the `required` host attribute
- `state.focused()` -- to apply `[focused]` styling on the host
- `state.filled()` -- to apply `[filled]` styling on the host (e.g., floating label position)
- `state.showClearButton()` -- to conditionally render the clear button
- `state.stepper()` -- to conditionally render increment/decrement buttons
- `state.draftText()` -- to display the raw editing text in the input; when `null`, display formatted `value`
- `state.placeholder()` -- read via contract, not recomputed
- `state.hasMin()`, `state.hasMax()` -- for conditional rendering or styling
- `state.min()`, `state.max()`, `state.step()` -- for display or validation hints

### Actions called

- `actions.setValue(v)` -- when syncing attribute/property changes into headless
- `actions.setDisabled(d)` -- when the `disabled` attribute changes
- `actions.setReadOnly(r)` -- when the `readonly` attribute changes
- `actions.setRequired(r)` -- when the `required` attribute changes
- `actions.setPlaceholder(p)` -- when the `placeholder` attribute changes
- `actions.setClearable(c)` -- when the `clearable` attribute changes
- `actions.setStepper(s)` -- when the `stepper` attribute changes
- `actions.setFocused(f)` -- on native `<input>` `focus`/`blur` events
- `actions.handleInput(text)` -- on native `<input>` `input` event (updates draft)
- `actions.handleKeyDown(e)` -- on native `<input>` `keydown` event
- `actions.commitDraft()` -- on native `<input>` `change` event (if needed beyond blur)
- `actions.clear()` -- on clear button click
- `actions.increment()` -- on increment button click (when stepper is visible)
- `actions.decrement()` -- on decrement button click (when stepper is visible)

### Contracts spread

- `contracts.getInputProps()` -- spread onto the native `<input>` element for `id`, `role`, `tabindex`, `inputmode`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext`, `aria-disabled`, `aria-readonly`, `aria-required`, `aria-label`, `aria-labelledby`, `aria-describedby`, `placeholder`, `autocomplete`
- `contracts.getIncrementButtonProps()` -- spread onto the increment button for `id`, `tabindex`, `aria-label`, `aria-disabled`, `hidden`, `aria-hidden`, `onClick`
- `contracts.getDecrementButtonProps()` -- spread onto the decrement button for `id`, `tabindex`, `aria-label`, `aria-disabled`, `hidden`, `aria-hidden`, `onClick`
- `contracts.getClearButtonProps()` -- spread onto the clear button for `role`, `aria-label`, `tabindex`, `hidden`, `aria-hidden`, `onClick`

### Events dispatched by UIKit

- `cv-change` CustomEvent on committed value changes (from user interaction, not programmatic `setValue`)
- `cv-clear` CustomEvent when the value is cleared via clear button or Escape key

### Input display logic (UIKit responsibility)

UIKit reads `state.draftText()` and `state.value()` to determine what to display in the native `<input>`:

- When `draftText !== null`: display `draftText` (user is actively editing)
- When `draftText === null`: display formatted `String(value)` (committed state)

## Minimum Test Matrix

### Value management
- Set initial value via options and verify `state.value()`
- Default value defaults to `min` when provided, otherwise `0`
- `setValue(v)` updates value with clamping and snapping
- `setValue(v)` clears `draftText` to `null`
- `setValue(v)` works even when disabled (programmatic/controlled update)

### Spinbutton behavior
- `increment()` / `decrement()` behavior with step
- `incrementLarge()` / `decrementLarge()` behavior with largeStep
- `Home` / `End` behavior with defined/undefined boundaries
- Value clamping and snapping
- Spinbutton actions clear `draftText` to `null`
- Disabled and readonly state prevent spinbutton mutations

### Draft text management
- `handleInput(text)` sets `draftText` to the provided text
- `handleInput(text)` is no-op when disabled
- `handleInput(text)` is no-op when readonly
- `commitDraft()` with valid numeric text parses and sets value
- `commitDraft()` with empty string calls `clear()`
- `commitDraft()` with invalid text reverts (sets `draftText` to `null`, value unchanged)
- `commitDraft()` with `draftText === null` is no-op
- `setFocused(false)` triggers `commitDraft()`

### Clearable
- `clear()` sets value to `defaultValue` and calls `onClear`
- `clear()` is no-op when disabled
- `clear()` is no-op when readonly
- `clear()` clears `draftText` to `null`
- `Escape` key clears value when clearable and filled
- `Escape` key does nothing when not clearable
- `Escape` key does nothing when value equals defaultValue (not filled)

### Keyboard
- `Enter` key calls `commitDraft()`
- `ArrowUp` / `ArrowDown` delegate to spinbutton increment/decrement
- `PageUp` / `PageDown` delegate to spinbutton large step
- `Home` / `End` delegate to spinbutton setFirst/setLast

### Focus
- `setFocused(true)` sets focused to `true`
- `setFocused(false)` sets focused to `false` and commits draft

### Derived state
- `filled` is `true` when value differs from defaultValue, `false` when equal
- `showClearButton` reflects `clearable && filled && !isDisabled && !isReadOnly`

### Contracts
- `getInputProps()` returns correct `role`, `inputmode`, `aria-valuenow`, `aria-disabled`, `aria-readonly`, `aria-required`
- `getInputProps()` returns `tabindex "-1"` when disabled, `"0"` otherwise
- `getInputProps()` returns placeholder when non-empty, omitted when empty
- `getIncrementButtonProps()` returns `hidden: true` when stepper is `false`
- `getDecrementButtonProps()` returns `hidden: true` when stepper is `false`
- `getClearButtonProps()` returns `hidden: true` when `showClearButton` is `false`
- `getClearButtonProps()` returns correct `aria-label`

### Stepper
- Stepper buttons hidden by default (`stepper` defaults to `false`)
- `setStepper(true)` makes stepper buttons visible
- `setStepper(false)` hides stepper buttons

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings. The number module sits in the interactions layer, composing the spinbutton core.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules. Only imports from `../spinbutton` (intra-package) and `@reatom/core`.
- **Composition**: `createNumber` internally creates a `createSpinbutton` instance. It does NOT duplicate spinbutton logic.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- Locale-aware number formatting and parsing (handled by adapters/UIKit)
- Thousand separators or currency formatting
- Input masking or restricted character filtering
- Validation / error state management (future form-level spec)
- Acceleration (increasing step size when holding stepper buttons)
- Native form submission integration (handled by adapters/wrappers)
- Prefix / suffix slot content management (UIKit layout concern)
- Custom parsers beyond `parseFloat` (adapters may override)
