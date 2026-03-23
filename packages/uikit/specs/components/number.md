# cv-number

Numeric input field with optional stepper controls, clearable behavior, and form-field chrome (label, help-text, prefix/suffix slots).

**Headless:** [`createNumber`](../../../headless/specs/components/number.md)

## Anatomy

```
<cv-number> (host)
├── <span part="form-control-label">
│   └── <slot name="label">
├── <div part="base">
│   ├── <span part="prefix">
│   │   └── <slot name="prefix">
│   ├── <input part="input" role="spinbutton" inputmode="decimal">
│   ├── <span part="clear-button" role="button">       ← conditional on showClearButton
│   │   └── <slot name="clear-icon">×</slot>
│   ├── <span part="stepper">                           ← conditional on stepper
│   │   ├── <button part="increment" type="button">
│   │   └── <button part="decrement" type="button">
│   └── <span part="suffix">
│       └── <slot name="suffix">
└── <span part="form-control-help-text">
    └── <slot name="help-text">
```

## Attributes

| Attribute | Type | Default | Reflects | Description |
|-----------|------|---------|----------|-------------|
| `value` | Number | `0` | no | Current numeric value |
| `default-value` | Number | `min ?? 0` | no | Value to reset to on clear |
| `min` | Number | — | no | Optional minimum boundary |
| `max` | Number | — | no | Optional maximum boundary |
| `step` | Number | `1` | no | Small increment/decrement step |
| `large-step` | Number | `10` | no | Large increment/decrement step (`PageUp`/`PageDown`) |
| `name` | String | `""` | no | Form field name for submit serialization |
| `disabled` | Boolean | `false` | yes | Prevents interaction and dims the component |
| `read-only` | Boolean | `false` | yes | Keeps focusable/announced but blocks user mutation |
| `required` | Boolean | `false` | yes | Marks the field as required for form validation |
| `clearable` | Boolean | `false` | yes | Shows a clear button when the value differs from default |
| `stepper` | Boolean | `false` | yes | Shows increment/decrement stepper buttons |
| `placeholder` | String | `""` | no | Placeholder text displayed when the input is empty |
| `size` | String | `"medium"` | yes | Component size: `small` \| `medium` \| `large` |
| `variant` | String | `"outlined"` | yes | Visual variant: `outlined` \| `filled` |
| `aria-label` | String | `""` | no | Accessible label |
| `aria-labelledby` | String | `""` | no | ID reference to visible label |
| `aria-describedby` | String | `""` | no | ID reference to description |

## Variants

| Variant | Description |
|---------|-------------|
| `outlined` | Default style with visible border and transparent background |
| `filled` | Subtle background fill with no visible border |

## Sizes

| Size | `--cv-number-height` | `--cv-number-padding-inline` | `--cv-number-font-size` |
|------|----------------------|------------------------------|-------------------------|
| `small` | `30px` | `var(--cv-space-2, 8px)` | `var(--cv-font-size-sm, 13px)` |
| `medium` | `36px` | `var(--cv-space-3, 12px)` | `var(--cv-font-size-base, 14px)` |
| `large` | `42px` | `var(--cv-space-4, 16px)` | `var(--cv-font-size-md, 16px)` |

## Slots

| Slot | Description |
|------|-------------|
| `prefix` | Content rendered before the input (e.g., currency symbol icon) |
| `suffix` | Content rendered after the stepper controls (e.g., unit label) |
| `clear-icon` | Custom icon for the clear button (default: `×`) |
| `label` | Label text displayed above the input |
| `help-text` | Help or description text displayed below the input |

> **Note:** The native `<input>` element is not slottable. There is no default slot.

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Outermost wrapper element containing input and controls |
| `input` | `<input>` | The native input element with `role="spinbutton"` |
| `prefix` | `<span>` | Wrapper around the `prefix` slot |
| `suffix` | `<span>` | Wrapper around the `suffix` slot |
| `clear-button` | `<span>` | The clear button wrapper (conditionally visible) |
| `stepper` | `<span>` | Wrapper around increment/decrement buttons (conditionally visible) |
| `increment` | `<button>` | Increment stepper button |
| `decrement` | `<button>` | Decrement stepper button |
| `form-control-label` | `<span>` | Wrapper around the `label` slot |
| `form-control-help-text` | `<span>` | Wrapper around the `help-text` slot |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-number-height` | `36px` | Component block size |
| `--cv-number-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding inside the input container |
| `--cv-number-font-size` | `var(--cv-font-size-base, 14px)` | Font size of the input text |
| `--cv-number-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius of the input container |
| `--cv-number-border-color` | `var(--cv-color-border, #2a3245)` | Border color in default state |
| `--cv-number-background` | `transparent` | Background color of the input container |
| `--cv-number-color` | `var(--cv-color-text, #e8ecf6)` | Text color of the input value |
| `--cv-number-placeholder-color` | `var(--cv-color-text-muted, #6b7a99)` | Placeholder text color |
| `--cv-number-focus-ring` | `0 0 0 2px var(--cv-color-primary, #65d7ff)` | Box-shadow applied on focus |
| `--cv-number-icon-size` | `1em` | Size of prefix/suffix/clear icons |
| `--cv-number-gap` | `var(--cv-space-2, 8px)` | Spacing between inner elements (prefix, input, buttons, suffix) |
| `--cv-number-transition-duration` | `var(--cv-duration-fast, 120ms)` | Transition duration for state changes |
| `--cv-number-stepper-width` | `24px` | Width of each stepper button |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Base border color |
| `--cv-color-surface` | `#141923` | Surface background color (used by `filled` variant) |
| `--cv-color-surface-elevated` | `#1d2432` | Stepper button background |
| `--cv-color-text` | `#e8ecf6` | Default text color |
| `--cv-color-text-muted` | `#6b7a99` | Muted text color for placeholder |
| `--cv-color-primary` | `#65d7ff` | Primary accent color for focus ring |
| `--cv-duration-fast` | `120ms` | Transition duration |
| `--cv-easing-standard` | `ease` | Transition timing function |
| `--cv-radius-sm` | `6px` | Base border radius fallback |
| `--cv-font-size-sm` | `13px` | Small font size |
| `--cv-font-size-base` | `14px` | Base font size |
| `--cv-font-size-md` | `16px` | Medium font size |
| `--cv-space-2` | `8px` | Spacing scale: small |
| `--cv-space-3` | `12px` | Spacing scale: medium |
| `--cv-space-4` | `16px` | Spacing scale: large |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([disabled])` | Reduced opacity (`0.55`), `cursor: not-allowed`, no interaction |
| `:host([read-only])` | Normal opacity, `cursor: default`, input text not editable |
| `:host([required])` | No visual change by default (can be styled via part selectors) |
| `:host([focused])` | Focus ring applied via `--cv-number-focus-ring` |
| `:host([filled])` | Indicates value differs from default (e.g., for floating label transitions) |
| `:host([clearable])` | Clear button space reserved in layout |
| `:host([stepper])` | Stepper buttons rendered and visible |
| `:host([size="small"])` | Small size overrides |
| `:host([size="large"])` | Large size overrides |
| `:host([variant="outlined"])` | Visible border, transparent background |
| `:host([variant="filled"])` | Subtle background (`--cv-color-surface`), no visible border |

## Reactive State Mapping

`cv-number` is a visual adapter over headless `createNumber`.

### UIKit properties to headless actions

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` | attr/prop -> action | `actions.setValue(value)` |
| `disabled` | attr -> action | `actions.setDisabled(value)` |
| `read-only` | attr -> action | `actions.setReadOnly(value)` |
| `required` | attr -> action | `actions.setRequired(value)` |
| `placeholder` | attr -> action | `actions.setPlaceholder(value)` |
| `clearable` | attr -> action | `actions.setClearable(value)` |
| `stepper` | attr -> action | `actions.setStepper(value)` |
| `min` | attr -> option | passed to `createNumber(options)` |
| `max` | attr -> option | passed to `createNumber(options)` |
| `step` | attr -> option | passed to `createNumber(options)` |
| `large-step` | attr -> option | passed to `createNumber(options)` |
| `default-value` | attr -> option | passed as `defaultValue` to `createNumber(options)` |
| `aria-label` | attr -> option | passed as `ariaLabel` to `createNumber(options)` |
| `aria-labelledby` | attr -> option | passed as `ariaLabelledBy` to `createNumber(options)` |
| `aria-describedby` | attr -> option | passed as `ariaDescribedBy` to `createNumber(options)` |

### Headless state to DOM reflection

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.isDisabled()` | state -> attr | `[disabled]` host attribute |
| `state.isReadOnly()` | state -> attr | `[read-only]` host attribute |
| `state.required()` | state -> attr | `[required]` host attribute |
| `state.focused()` | state -> attr | `[focused]` host attribute |
| `state.filled()` | state -> attr | `[filled]` host attribute |
| `state.showClearButton()` | state -> DOM | shows/hides the clear button element |
| `state.stepper()` | state -> DOM | shows/hides the stepper buttons |
| `state.draftText()` | state -> DOM | when non-null, displayed in the input; when null, displays formatted `String(value)` |
| `state.value()` | state -> DOM | displayed in the input when `draftText` is null |
| `state.placeholder()` | state -> DOM | applied as placeholder on the native input |
| `state.hasMin()` / `state.hasMax()` | state -> DOM | for conditional styling or rendering hints |

### Contract props spreading

- `contracts.getInputProps()` is spread onto the `[part="input"]` native `<input>` element to apply `id`, `role`, `tabindex`, `inputmode`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext`, `aria-disabled`, `aria-readonly`, `aria-required`, `aria-label`, `aria-labelledby`, `aria-describedby`, `placeholder`, and `autocomplete`.
- `contracts.getIncrementButtonProps()` is spread onto the `[part="increment"]` button to apply `id`, `tabindex`, `aria-label`, `aria-disabled`, `hidden`, `aria-hidden`, and `onClick`.
- `contracts.getDecrementButtonProps()` is spread onto the `[part="decrement"]` button to apply `id`, `tabindex`, `aria-label`, `aria-disabled`, `hidden`, `aria-hidden`, and `onClick`.
- `contracts.getClearButtonProps()` is spread onto the `[part="clear-button"]` element to apply `role`, `aria-label`, `tabindex`, `hidden`, `aria-hidden`, and `onClick`.

### Event wiring

- Native `<input>` `input` event -> `actions.handleInput(e.target.value)` (updates draft text)
- Native `<input>` `keydown` event -> `actions.handleKeyDown(e)` (handles ArrowUp/Down, PageUp/Down, Home/End, Enter, Escape)
- Native `<input>` `focus` event -> `actions.setFocused(true)` -> dispatches `cv-focus` CustomEvent
- Native `<input>` `blur` event -> `actions.setFocused(false)` (triggers draft commit) -> dispatches `cv-blur` CustomEvent; if value changed since focus, dispatches `cv-change` CustomEvent
- Clear button `click` -> `actions.clear()` -> dispatches `cv-clear` CustomEvent
- Increment button `click` -> `actions.increment()` -> dispatches `cv-change` CustomEvent
- Decrement button `click` -> `actions.decrement()` -> dispatches `cv-change` CustomEvent

### Input display logic (UIKit responsibility)

UIKit reads `state.draftText()` and `state.value()` to determine what to display in the native `<input>`:

- When `draftText !== null`: display `draftText` (user is actively editing)
- When `draftText === null`: display formatted `String(value)` (committed state)

UIKit does not own value management, clamping, snapping, draft commit logic, or ARIA computation; headless state is the source of truth.

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-change` | `{ value: number }` | Fires on committed value change from user interaction (stepper click, keyboard step, draft commit on blur/Enter). Does not fire from programmatic `setValue`. |
| `cv-clear` | `{ }` | Fires when the value is cleared via the clear button or `Escape` key |
| `cv-focus` | `{ }` | Fires when the input receives focus |
| `cv-blur` | `{ }` | Fires when the input loses focus |

## Usage

```html
<!-- Basic number input -->
<cv-number value="0" placeholder="Enter a number"></cv-number>

<!-- With label and help text -->
<cv-number>
  <span slot="label">Quantity</span>
  <span slot="help-text">Enter a value between 1 and 100</span>
</cv-number>

<!-- With min, max, and step -->
<cv-number value="5" min="0" max="100" step="5" large-step="25"></cv-number>

<!-- Stepper buttons visible -->
<cv-number value="1" min="0" max="10" stepper></cv-number>

<!-- Clearable -->
<cv-number value="42" clearable></cv-number>

<!-- With prefix (currency symbol) and suffix (unit) -->
<cv-number>
  <span slot="prefix">$</span>
  <span slot="suffix">.00</span>
</cv-number>

<!-- Filled variant, small size -->
<cv-number variant="filled" size="small" placeholder="0"></cv-number>

<!-- Large size, outlined variant with stepper and clearable -->
<cv-number size="large" stepper clearable value="10" min="0" max="99"></cv-number>

<!-- Disabled -->
<cv-number disabled value="50"></cv-number>

<!-- Read-only -->
<cv-number read-only value="100"></cv-number>

<!-- Required with label -->
<cv-number required>
  <span slot="label">Age</span>
</cv-number>

<!-- With accessible label -->
<cv-number aria-label="Quantity" value="1" min="1" max="99" stepper></cv-number>
```
