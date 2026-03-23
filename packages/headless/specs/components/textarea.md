# Textarea Component Contract

## Purpose

`Textarea` is a headless contract for a native multi-line text field. It manages value, disabled/readonly/required semantics, placeholder, geometry (`rows`, `cols`), length constraints, resize mode, and focus tracking. It provides ready-to-spread ARIA and native attribute maps for the underlying `<textarea>` element.

## Component Files

- `src/textarea/index.ts` - model and public `createTextarea` API
- `src/textarea/textarea.test.ts` - unit behavior tests

## Public API

- `createTextarea(options)`
  - `options`:
    - `idBase?`: `string` - base for generated IDs (default: `"textarea"`)
    - `value?`: `string` - initial value (default: `""`)
    - `disabled?`: `boolean` - initial disabled state (default: `false`)
    - `readonly?`: `boolean` - initial readonly state (default: `false`)
    - `required?`: `boolean` - initial required state (default: `false`)
    - `placeholder?`: `string` - initial placeholder text (default: `""`)
    - `rows?`: `number` - visible text rows (default: `4`)
    - `cols?`: `number` - visible text columns (default: `20`)
    - `minLength?`: `number` - minimum text length, omitted when unset
    - `maxLength?`: `number` - maximum text length, omitted when unset
    - `resize?`: `TextareaResize` - resize mode (default: `"vertical"`)
    - `onInput?`: `(value: string) => void` - callback on user input (`handleInput`)
- **Types**:
  - `TextareaResize = "none" | "vertical"`
- `state` (signal-backed):
  - `value()`: `string` - current value
  - `disabled()`: `boolean` - whether field is disabled
  - `readonly()`: `boolean` - whether field is readonly
  - `required()`: `boolean` - whether field is required
  - `placeholder()`: `string` - placeholder text
  - `rows()`: `number` - visible text rows
  - `cols()`: `number` - visible text columns
  - `minLength()`: `number | undefined` - min length constraint
  - `maxLength()`: `number | undefined` - max length constraint
  - `resize()`: `TextareaResize` - resize mode
  - `focused()`: `boolean` - focus state
  - `filled()`: `boolean` - **derived**: `value.length > 0`
- `actions`:
  - `setValue(value: string)`: updates value programmatically
  - `setDisabled(disabled: boolean)`: updates disabled state
  - `setReadonly(readonly: boolean)`: updates readonly state
  - `setRequired(required: boolean)`: updates required state
  - `setPlaceholder(placeholder: string)`: updates placeholder
  - `setRows(rows: number | undefined)`: updates row count when valid positive integer
  - `setCols(cols: number | undefined)`: updates col count when valid positive integer
  - `setMinLength(minLength: number | undefined)`: updates minimum length constraint
  - `setMaxLength(maxLength: number | undefined)`: updates maximum length constraint
  - `setResize(resize: TextareaResize)`: updates resize mode
  - `setFocused(focused: boolean)`: updates focus state
  - `handleInput(value: string)`: processes user input; no-op when disabled/readonly; invokes `onInput`
- `contracts`:
  - `getTextareaProps()`: returns complete attribute map for native `<textarea>`

## APG and A11y Contract

### Native `<textarea>` element

- `id`: `"{idBase}-textarea"`
- `aria-disabled`: `"true"` when disabled, otherwise omitted
- `aria-readonly`: `"true"` when readonly, otherwise omitted
- `aria-required`: `"true"` when required, otherwise omitted
- `disabled`: `true` when disabled (native form behavior)
- `readonly`: `true` when readonly (focusable, non-editable)
- `required`: `true` when required (native constraint validation)
- `placeholder`: current placeholder value, omitted when empty
- `tabindex`: `"0"` when interactive, `"-1"` when disabled
- `rows`: current rows value
- `cols`: current cols value
- `minlength`: `minLength` when set
- `maxlength`: `maxLength` when set

Note: role is not set explicitly. Native `<textarea>` semantics are used.

## Behavior Contract

### Value management

- `setValue(v)` always updates `state.value` (programmatic/controlled path).
- `handleInput(v)` updates `state.value` only when interactive and invokes `onInput(v)`.

### Disabled and readonly

- A disabled or readonly textarea ignores `handleInput(v)`.
- Disabled uses `tabindex="-1"`; readonly remains `tabindex="0"`.

### Geometry and constraints

- `rows` and `cols` accept positive finite integers only.
- `minLength` and `maxLength` accept non-negative finite integers or `undefined`.
- `resize` is constrained to `"none" | "vertical"`.

### Focus management

- `setFocused(true)` / `setFocused(false)` reflects native focus/blur.

## Transitions Table

| Event / Action      | Guard                                    | Effect                       | Next State        |
| ------------------- | ---------------------------------------- | ---------------------------- | ----------------- | --- | --------- |
| `handleInput(v)`    | `!disabled && !readonly`                 | set value, call `onInput(v)` | `value = v`       |
| `handleInput(v)`    | `disabled                                |                              | readonly`         | --  | no change |
| `setValue(v)`       | --                                       | set value                    | `value = v`       |
| `setDisabled(d)`    | --                                       | set disabled                 | `disabled = d`    |
| `setReadonly(r)`    | --                                       | set readonly                 | `readonly = r`    |
| `setRequired(r)`    | --                                       | set required                 | `required = r`    |
| `setPlaceholder(p)` | --                                       | set placeholder              | `placeholder = p` |
| `setRows(n)`        | `n` is positive integer                  | set rows                     | `rows = n`        |
| `setRows(n)`        | invalid `n`                              | --                           | no change         |
| `setCols(n)`        | `n` is positive integer                  | set cols                     | `cols = n`        |
| `setCols(n)`        | invalid `n`                              | --                           | no change         |
| `setMinLength(n)`   | `n` is non-negative integer or undefined | set minLength                | `minLength = n`   |
| `setMaxLength(n)`   | `n` is non-negative integer or undefined | set maxLength                | `maxLength = n`   |
| `setResize(mode)`   | --                                       | set resize                   | `resize = mode`   |
| `setFocused(f)`     | --                                       | set focused                  | `focused = f`     |

## Adapter Expectations

UIKit (`cv-textarea`) binds to the headless contract as follows:

- **Signals read**:
  - `state.value()` - value reflection to DOM
  - `state.disabled()` - host `[disabled]` reflection
  - `state.readonly()` - host `[readonly]` reflection
  - `state.required()` - host `[required]` reflection
  - `state.focused()` - host `[focused]` reflection
  - `state.filled()` - host `[filled]` reflection
  - `state.resize()` - host `[resize]` reflection
- **Actions called**:
  - `setValue`, `setDisabled`, `setReadonly`, `setRequired`, `setPlaceholder`, `setRows`, `setCols`, `setMinLength`, `setMaxLength`, `setResize`
  - `setFocused` on native focus/blur
  - `handleInput` on native input
- **Contracts spread**:
  - `contracts.getTextareaProps()` - spread onto native `<textarea>`
- **Events dispatched by UIKit**:
  - `cv-input` on user input
  - `cv-change` on blur commit when value changed since focus
  - `cv-focus` / `cv-blur` on focus transitions

## Invariants

1. `filled` is `true` iff `value.length > 0`.
2. `handleInput` is a no-op when `disabled` or `readonly`.
3. `setValue` remains available while `disabled`/`readonly` (programmatic updates).
4. `tabindex` is `"-1"` when disabled, `"0"` otherwise.
5. `aria-disabled` is `"true"` only when disabled.
6. `aria-readonly` is `"true"` only when readonly.
7. `aria-required` is `"true"` only when required.
8. `rows` and `cols` are always positive integers.
9. `minLength` and `maxLength` are undefined or non-negative integers.
10. `resize` is always `"none"` or `"vertical"`.

## Minimum Test Matrix

- initial defaults for all state values
- `handleInput(v)` updates value and calls `onInput`
- `handleInput(v)` no-op for disabled
- `handleInput(v)` no-op for readonly
- `setValue(v)` updates while disabled
- `setValue(v)` updates while readonly
- `filled` derives from value emptiness
- `setRows` and `setCols` accept valid positive integers
- `setRows` and `setCols` ignore invalid numbers
- `setMinLength` / `setMaxLength` set and clear constraints
- `getTextareaProps()` returns proper ARIA and native attributes
- `getTextareaProps()` omits role
- `setFocused` updates focus state

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/\* in headless core.
- **Layering**: core/interactions/a11y-contracts/adapters boundaries preserved.
- **Independence**: no monorepo app imports.
- **Verification**: standalone headless tests via package command.

## Out of Scope (Current)

- auto-growing textarea height based on content
- validation message state and error modeling
- rich text / markdown semantics
- custom keyboard shortcuts beyond native textarea behavior
