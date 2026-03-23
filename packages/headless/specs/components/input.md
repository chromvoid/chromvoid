# Input Component Contract

## Purpose

`Input` is a headless APG-aligned contract for a single-line text input control. It manages value state, input type resolution (text, password, email, url, tel, search), disabled/readonly/required semantics, clearable behavior, password visibility toggling, and focus tracking. It provides ready-to-spread ARIA attribute maps for the native input element, the clear button, and the password toggle button.

## Component Files

- `src/input/index.ts` - model and public `createInput` API
- `src/input/input.test.ts` - unit behavior tests

## Public API

- `createInput(options)`
  - `options`:
    - `idBase?`: `string` - base for generated IDs (default: `"input"`)
    - `value?`: `string` - initial value (default: `""`)
    - `type?`: `InputType` - initial input type (default: `"text"`)
    - `disabled?`: `boolean` - initial disabled state (default: `false`)
    - `readonly?`: `boolean` - initial readonly state (default: `false`)
    - `required?`: `boolean` - initial required state (default: `false`)
    - `placeholder?`: `string` - initial placeholder text (default: `""`)
    - `clearable?`: `boolean` - whether the clear button is available (default: `false`)
    - `passwordToggle?`: `boolean` - whether the password toggle is available (default: `false`)
    - `onInput?`: `(value: string) => void` - callback on value change via user action
    - `onClear?`: `() => void` - callback when the value is cleared
- **Types**:
  - `InputType = "text" | "password" | "email" | "url" | "tel" | "search"`
- `state` (signal-backed):
  - `value()`: `string` - current input value
  - `type()`: `InputType` - configured input type
  - `disabled()`: `boolean` - whether the input is disabled
  - `readonly()`: `boolean` - whether the input is readonly
  - `required()`: `boolean` - whether the input is required
  - `placeholder()`: `string` - placeholder text
  - `clearable()`: `boolean` - whether the clear button is enabled
  - `passwordToggle()`: `boolean` - whether the password toggle is enabled
  - `passwordVisible()`: `boolean` - whether password text is currently revealed
  - `focused()`: `boolean` - whether the input has focus
  - `filled()`: `boolean` - **derived**: `true` when `value.length > 0`
  - `resolvedType()`: `string` - **derived**: the effective `type` attribute for the native `<input>` element; equals `"text"` when `type === "password" && passwordVisible === true`, otherwise equals `type`
  - `showClearButton()`: `boolean` - **derived**: `true` when `clearable && filled && !disabled && !readonly`
  - `showPasswordToggle()`: `boolean` - **derived**: `true` when `type === "password" && passwordToggle`
- `actions`:
  - `setValue(value: string)`: updates the value; calls `onInput` callback
  - `setType(type: InputType)`: updates the input type; resets `passwordVisible` to `false`
  - `setDisabled(disabled: boolean)`: updates disabled state
  - `setReadonly(readonly: boolean)`: updates readonly state
  - `setRequired(required: boolean)`: updates required state
  - `setPlaceholder(placeholder: string)`: updates placeholder text
  - `setClearable(clearable: boolean)`: updates clearable state
  - `setPasswordToggle(toggle: boolean)`: updates password toggle state; resets `passwordVisible` to `false` when `toggle` becomes `false`
  - `togglePasswordVisibility()`: toggles `passwordVisible`; no-op if `type !== "password"` or `passwordToggle === false`
  - `setFocused(focused: boolean)`: updates focus state
  - `clear()`: sets value to `""`, calls `onClear` callback; no-op if `disabled` or `readonly`
  - `handleInput(value: string)`: processes native input event; delegates to `setValue`
  - `handleKeyDown(event: Pick<KeyboardEvent, "key"> & { preventDefault?: () => void })`: handles `Escape` key to clear (when clearable and filled)
- `contracts`:
  - `getInputProps()`: returns attribute map for the native `<input>` element
  - `getClearButtonProps()`: returns attribute map for the clear button
  - `getPasswordToggleProps()`: returns attribute map for the password toggle button

## APG and A11y Contract

### Native `<input>` element

- `id`: `"{idBase}-input"`
- `type`: `resolvedType` (resolved from `type` and `passwordVisible`)
- `aria-disabled`: `"true"` when `disabled`, otherwise omitted
- `aria-readonly`: `"true"` when `readonly`, otherwise omitted
- `aria-required`: `"true"` when `required`, otherwise omitted
- `aria-invalid`: reserved for future validation integration; omitted by default
- `placeholder`: current placeholder value, omitted when empty
- `disabled`: `true` when `disabled` (native attribute for form semantics)
- `readonly`: `true` when `readonly` (native attribute for form semantics)
- `tabindex`: `"0"` when interactive, `"-1"` when `disabled`
- `autocomplete`: `"off"` when `type === "password"` (prevents autofill conflicts with toggle)

### Clear button

- `role`: `"button"`
- `aria-label`: `"Clear input"` (localizable by adapter)
- `tabindex`: `"-1"` (not in tab order; activated by Escape key or pointer)
- `hidden`: `true` when `showClearButton` is `false`
- `aria-hidden`: `"true"` when `hidden` (prevents screen readers from announcing an unavailable control)

### Password toggle button

- `role`: `"button"`
- `aria-label`: `"Show password"` when `passwordVisible === false`, `"Hide password"` when `passwordVisible === true`
- `aria-pressed`: `"true"` when `passwordVisible`, `"false"` otherwise
- `tabindex`: `"0"` when visible, `"-1"` when hidden
- `hidden`: `true` when `showPasswordToggle` is `false`
- `aria-hidden`: `"true"` when `hidden`

## Behavior Contract

### Value management

- Setting a value via `setValue` or `handleInput` updates `state.value` and calls the `onInput` callback.
- `clear()` sets value to `""`, calls `onClear`, and is a no-op when `disabled` or `readonly`.

### Clearable

- When `clearable` is `true`, the clear button becomes visible if the input is non-empty and not disabled/readonly.
- Pressing `Escape` while the input is focused clears the value when `clearable && filled` are both true.
- After clearing, the input retains focus.

### Password toggle

- When `type === "password"` and `passwordToggle === true`, the toggle button is visible.
- Activating the toggle switches `passwordVisible`, which changes `resolvedType` between `"password"` and `"text"`.
- `togglePasswordVisibility()` is a no-op when `type !== "password"` or `passwordToggle === false`.
- Changing `type` away from `"password"` resets `passwordVisible` to `false`.
- Disabling `passwordToggle` resets `passwordVisible` to `false`.

### Focus management

- `setFocused(true)` / `setFocused(false)` reflect the native focus/blur events.
- UIKit listens for `focus`/`blur` on the native `<input>` and calls `setFocused`.

### Disabled and readonly

- A disabled input does not respond to `clear()`, `handleInput()`, or keyboard interactions.
- A readonly input does not respond to `clear()` or `handleInput()`, but retains focus and keyboard navigation.
- `setValue` bypasses the disabled/readonly guard (controlled/programmatic update).

## Transitions Table

| Event / Action | Guard | Effect | Next State |
|---|---|---|---|
| `handleInput(v)` | `!disabled && !readonly` | `setValue(v)` | `value = v`; `onInput(v)` called |
| `handleInput(v)` | `disabled \|\| readonly` | -- | no change |
| `clear()` | `!disabled && !readonly` | `setValue("")` | `value = ""`; `onClear()` called |
| `clear()` | `disabled \|\| readonly` | -- | no change |
| `keydown Escape` | `clearable && filled && !disabled && !readonly` | `clear()` | `value = ""`; `onClear()` called |
| `keydown Escape` | `!(clearable && filled) \|\| disabled \|\| readonly` | -- | no change |
| `togglePasswordVisibility()` | `type === "password" && passwordToggle` | toggle | `passwordVisible = !passwordVisible` |
| `togglePasswordVisibility()` | `type !== "password" \|\| !passwordToggle` | -- | no change |
| `setValue(v)` | -- | set value | `value = v`; `onInput(v)` called |
| `setType(t)` | -- | set type | `type = t`; `passwordVisible = false` |
| `setDisabled(d)` | -- | set disabled | `disabled = d` |
| `setReadonly(r)` | -- | set readonly | `readonly = r` |
| `setRequired(r)` | -- | set required | `required = r` |
| `setPlaceholder(p)` | -- | set placeholder | `placeholder = p` |
| `setClearable(c)` | -- | set clearable | `clearable = c` |
| `setPasswordToggle(t)` | -- | set toggle | `passwordToggle = t`; if `!t`: `passwordVisible = false` |
| `setFocused(f)` | -- | set focused | `focused = f` |

## Adapter Expectations

UIKit (`cv-input`) binds to the headless contract as follows:

- **Signals read**:
  - `state.value()` - to reflect the current value and sync with the native `<input>`
  - `state.disabled()` - to reflect the `disabled` host attribute
  - `state.readonly()` - to reflect the `readonly` host attribute
  - `state.required()` - to reflect the `required` host attribute
  - `state.focused()` - to apply `:focus` / `[focused]` styling on the host
  - `state.filled()` - to apply `[filled]` styling on the host (e.g., floating label position)
  - `state.passwordVisible()` - to update the toggle button icon
  - `state.showClearButton()` - to conditionally render the clear button
  - `state.showPasswordToggle()` - to conditionally render the password toggle
  - `state.resolvedType()` - UIKit does NOT recompute this; reads directly from headless
- **Actions called**:
  - `actions.setValue(v)` - when syncing attribute/property changes into headless
  - `actions.setType(t)` - when the `type` attribute changes
  - `actions.setDisabled(d)` - when the `disabled` attribute changes
  - `actions.setReadonly(r)` - when the `readonly` attribute changes
  - `actions.setRequired(r)` - when the `required` attribute changes
  - `actions.setPlaceholder(p)` - when the `placeholder` attribute changes
  - `actions.setClearable(c)` - when the `clearable` attribute changes
  - `actions.setPasswordToggle(t)` - when the `password-toggle` attribute changes
  - `actions.setFocused(f)` - on native `<input>` `focus`/`blur` events
  - `actions.handleInput(v)` - on native `<input>` `input` event
  - `actions.handleKeyDown(e)` - on native `<input>` `keydown` event
  - `actions.clear()` - on clear button click
  - `actions.togglePasswordVisibility()` - on password toggle button click
- **Contracts spread**:
  - `contracts.getInputProps()` - spread onto the native `<input>` element for `id`, `type`, `aria-disabled`, `aria-readonly`, `aria-required`, `placeholder`, `disabled`, `readonly`, `tabindex`, `autocomplete`
  - `contracts.getClearButtonProps()` - spread onto the clear button `<button>` for `role`, `aria-label`, `tabindex`, `hidden`, `aria-hidden`
  - `contracts.getPasswordToggleProps()` - spread onto the toggle button `<button>` for `role`, `aria-label`, `aria-pressed`, `tabindex`, `hidden`, `aria-hidden`
- **Events dispatched by UIKit**:
  - `cv-input` CustomEvent on value changes (from user interaction, not programmatic `setValue`)
  - `cv-clear` CustomEvent when the value is cleared via clear button or Escape key

## Invariants

1. `resolvedType` must equal `"text"` when `type === "password" && passwordVisible === true`; otherwise it must equal `type`.
2. `filled` must be `true` if and only if `value.length > 0`.
3. `showClearButton` must be `true` if and only if `clearable && filled && !disabled && !readonly`.
4. `showPasswordToggle` must be `true` if and only if `type === "password" && passwordToggle`.
5. `passwordVisible` must be `false` whenever `type !== "password"` or `passwordToggle === false`.
6. `clear()` must be a no-op when `disabled` or `readonly`.
7. `togglePasswordVisibility()` must be a no-op when `type !== "password"` or `passwordToggle === false`.
8. `aria-disabled` on the input must be `"true"` when `disabled` is `true`.
9. `aria-readonly` on the input must be `"true"` when `readonly` is `true`.
10. `aria-required` on the input must be `"true"` when `required` is `true`.
11. The clear button must have `hidden: true` whenever `showClearButton` is `false`.
12. The password toggle must have `hidden: true` whenever `showPasswordToggle` is `false`.
13. The password toggle `aria-pressed` must reflect `passwordVisible`.
14. `tabindex` on the native input must be `"-1"` when `disabled`, `"0"` otherwise.
15. `onInput` must not be called from `clear()`; `onClear` is called instead.
16. `setType` must always reset `passwordVisible` to `false`.

## Minimum Test Matrix

- set initial value via options and verify `state.value()`
- `handleInput(v)` updates value and calls `onInput`
- `handleInput(v)` is no-op when disabled
- `handleInput(v)` is no-op when readonly
- `clear()` sets value to `""` and calls `onClear`
- `clear()` is no-op when disabled
- `clear()` is no-op when readonly
- `Escape` key clears value when clearable and filled
- `Escape` key does nothing when not clearable
- `Escape` key does nothing when value is empty
- `togglePasswordVisibility()` toggles `passwordVisible` when type is password and toggle enabled
- `togglePasswordVisibility()` is no-op when type is not password
- `togglePasswordVisibility()` is no-op when password toggle is disabled
- `resolvedType` returns `"text"` when password is visible
- `resolvedType` returns `"password"` when password is not visible
- `setType` resets `passwordVisible` to false
- `setPasswordToggle(false)` resets `passwordVisible` to false
- `filled` is true when value is non-empty, false when empty
- `showClearButton` reflects `clearable && filled && !disabled && !readonly`
- `showPasswordToggle` reflects `type === "password" && passwordToggle`
- `getInputProps()` returns correct `aria-disabled`, `aria-readonly`, `aria-required`
- `getInputProps()` returns `tabindex "-1"` when disabled, `"0"` otherwise
- `getInputProps()` returns `resolvedType` as the `type` attribute
- `getClearButtonProps()` returns `hidden: true` when clear button should not show
- `getClearButtonProps()` returns correct `aria-label`
- `getPasswordToggleProps()` returns correct `aria-pressed` reflecting visibility
- `getPasswordToggleProps()` returns correct `aria-label` based on visibility
- `getPasswordToggleProps()` returns `hidden: true` when toggle should not show
- `setValue` works even when disabled (programmatic/controlled update)
- `setFocused` correctly updates focused state

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- validation / error state management (future `ValidatedInput` or form-level spec)
- multi-line input / textarea (separate `Textarea` component)
- input masking or formatting
- prefix / suffix slot content management (UIKit layout concern)
- autofill / autocomplete beyond password `autocomplete="off"`
- native form submission integration (handled by adapters/wrappers)
- number, date, time, or other non-text input types
