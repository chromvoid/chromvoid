# cv-spinbutton

Numeric spinbutton input with keyboard, stepper controls, form-associated behavior, and headless-driven ARIA contracts.

**Headless:** [`createSpinbutton`](../../../headless/specs/components/spinbutton.md)

## Anatomy

```
<cv-spinbutton> (host)
└── <div part="base">
    ├── <input part="input" role="spinbutton" inputmode="decimal">
    └── <div part="actions">
        ├── <button part="increment" type="button">
        └── <button part="decrement" type="button">
```

## Attributes

| Attribute          | Type    | Default | Description                                             |
| ------------------ | ------- | ------- | ------------------------------------------------------- |
| `name`             | String  | `""`    | Form field name for submit serialization                |
| `value`            | Number  | `0`     | Current numeric value                                   |
| `min`              | Number  | —       | Optional minimum boundary                               |
| `max`              | Number  | —       | Optional maximum boundary                               |
| `step`             | Number  | `1`     | Small increment/decrement step                          |
| `large-step`       | Number  | `10`    | Large increment/decrement step (`PageUp`/`PageDown`)    |
| `disabled`         | Boolean | `false` | Blocks interaction and omits value from form submission |
| `read-only`        | Boolean | `false` | Keeps focusable/announced but blocks user mutation      |
| `required`         | Boolean | `false` | Enables constraint-validation checks                    |
| `aria-label`       | String  | `""`    | Accessible label                                        |
| `aria-labelledby`  | String  | `""`    | ID reference to visible label                           |
| `aria-describedby` | String  | `""`    | ID reference to description                             |

## Slots

None.

## CSS Parts

| Part        | Element    | Description                                       |
| ----------- | ---------- | ------------------------------------------------- |
| `base`      | `<div>`    | Layout container for input and actions            |
| `input`     | `<input>`  | Focusable spinbutton control, editable text input |
| `actions`   | `<div>`    | Wrapper for increment/decrement controls          |
| `increment` | `<button>` | Increments value by `step`                        |
| `decrement` | `<button>` | Decrements value by `step`                        |

## CSS Custom Properties

No component-scoped `--cv-spinbutton-*` properties are currently defined.

Theme tokens used with fallbacks:

| Theme Property                | Default   | Description               |
| ----------------------------- | --------- | ------------------------- |
| `--cv-space-1`                | `4px`     | Internal spacing          |
| `--cv-radius-sm`              | `6px`     | Base radius               |
| `--cv-color-border`           | `#2a3245` | Border color              |
| `--cv-color-surface`          | `#141923` | Base background           |
| `--cv-color-surface-elevated` | `#1d2432` | Stepper button background |
| `--cv-color-text`             | `#e8ecf6` | Foreground color          |
| `--cv-color-primary`          | `#65d7ff` | Focus ring color          |

## Visual States

| Host selector        | Description                                                         |
| -------------------- | ------------------------------------------------------------------- |
| `:host([disabled])`  | Base and controls are visually muted and non-interactive            |
| `:host([read-only])` | Input remains focusable; stepper controls are muted/non-interactive |

## Reactive State Mapping

`cv-spinbutton` is a thin adapter over headless `createSpinbutton`.

| UIKit Property     | Direction     | Headless Binding                      |
| ------------------ | ------------- | ------------------------------------- |
| `value`            | attr → action | `actions.setValue(value)`             |
| `disabled`         | attr → action | `actions.setDisabled(value)`          |
| `read-only`        | attr → action | `actions.setReadOnly(value)`          |
| `min`              | attr → option | passed to `createSpinbutton(options)` |
| `max`              | attr → option | passed to `createSpinbutton(options)` |
| `step`             | attr → option | passed to `createSpinbutton(options)` |
| `large-step`       | attr → option | passed to `createSpinbutton(options)` |
| `aria-label`       | attr → option | passed as `ariaLabel`                 |
| `aria-labelledby`  | attr → option | passed as `ariaLabelledBy`            |
| `aria-describedby` | attr → option | passed as `ariaDescribedBy`           |

| Headless State/Contract               | Direction        | DOM Reflection                                               |
| ------------------------------------- | ---------------- | ------------------------------------------------------------ |
| `state.value()`                       | state → value    | `[part="input"].value` and host `value` property             |
| `contracts.getSpinbuttonProps()`      | contract → attrs | role, tabindex, and ARIA attributes on `[part="input"]`      |
| `contracts.getIncrementButtonProps()` | contract → attrs | id/tabindex/aria-disabled/aria-label on `[part="increment"]` |
| `contracts.getDecrementButtonProps()` | contract → attrs | id/tabindex/aria-disabled/aria-label on `[part="decrement"]` |

- UIKit may hold transient draft text while editing.
- Draft text commits to headless on `Enter` or `blur` only.
- UIKit does not implement keyboard stepping, clamping, snapping, or ARIA computation itself.

## Events

| Event    | Detail            | Description                                                           |
| -------- | ----------------- | --------------------------------------------------------------------- |
| `cv-input`  | `{value: number}` | Fires on each user-triggered value mutation (buttons/stepping/commit) |
| `cv-change` | `{value: number}` | Fires together with `cv-input` for the same user-triggered mutation   |

Programmatic mutations through imperative API do not emit `cv-input`/`cv-change`.

## Imperative API

| Method / Property            | Description                                             |
| ---------------------------- | ------------------------------------------------------- |
| `stepUp(times = 1)`          | Increments by `step` `times` times                      |
| `stepDown(times = 1)`        | Decrements by `step` `times` times                      |
| `pageUp(times = 1)`          | Increments by `largeStep` `times` times                 |
| `pageDown(times = 1)`        | Decrements by `largeStep` `times` times                 |
| `setValue(value)`            | Sets numeric value through headless normalization       |
| `getValue()`                 | Returns current committed numeric value                 |
| `setRange(min, max)`         | Updates range boundaries (`min`/`max`)                  |
| `focus(options?)`            | Focuses inner input control                             |
| `select()`                   | Selects text in inner input control                     |
| `checkValidity()`            | Runs current validation checks                          |
| `reportValidity()`           | Reports validation state to UA when supported           |
| `setCustomValidity(message)` | Sets/clears custom validity message                     |
| `form`                       | Form owner when form-associated internals are supported |
| `validity`                   | Current validity state when supported                   |
| `validationMessage`          | Current validation message                              |
| `willValidate`               | Whether control participates in validation              |

UA callbacks supported for form-associated lifecycle:

- `formDisabledCallback(disabled)`
- `formResetCallback()`
- `formStateRestoreCallback(state)`

## Form Association

- Component is form-associated via `ElementInternals` when available.
- Submit value is serialized as raw numeric string from committed `value`.
- `disabled` state removes form value from submission.
- Reset restores the initial `value` snapshot captured on first connection.

## Usage

```html
<cv-spinbutton name="quantity" value="2" min="0" max="10" step="1"></cv-spinbutton>

<cv-spinbutton value="50" min="0" max="100" step="5" large-step="25"></cv-spinbutton>

<cv-spinbutton value="5" aria-label="Quantity"></cv-spinbutton>

<cv-spinbutton value="3" read-only></cv-spinbutton>

<form>
  <cv-spinbutton name="items" value="1" required></cv-spinbutton>
</form>
```
