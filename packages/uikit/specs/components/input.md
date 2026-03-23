# cv-input

Single-line text input control supporting text-like types, clearable behavior, and password visibility toggling.

**Headless:** [`createInput`](../../../headless/specs/components/input.md)

## Anatomy

```
<cv-input> (host)
├── <span part="form-control-label">
│   └── <slot name="label">
├── <div part="base">
│   ├── <span part="prefix">
│   │   └── <slot name="prefix">
│   ├── <input part="input" />
│   ├── <span part="clear-button">
│   │   └── <slot name="clear-icon">×</slot>
│   ├── <span part="password-toggle">
│   │   └── <slot name="show-password-icon|hide-password-icon">
│   └── <span part="suffix">
│       └── <slot name="suffix">
└── <span part="form-control-help-text">
    └── <slot name="help-text">
```

## Attributes

| Attribute | Type | Default | Reflects | Description |
|-----------|------|---------|----------|-------------|
| `value` | String | `""` | no | Current input value |
| `type` | `InputType` | `"text"` | no | Input type: `text` \| `password` \| `email` \| `url` \| `tel` \| `search` |
| `placeholder` | String | `""` | no | Placeholder text displayed when the input is empty |
| `disabled` | Boolean | `false` | yes | Prevents interaction and dims the component |
| `readonly` | Boolean | `false` | yes | Prevents editing while keeping the input focusable |
| `required` | Boolean | `false` | yes | Marks the input as required for form validation |
| `clearable` | Boolean | `false` | yes | Shows a clear button when the input has a value |
| `password-toggle` | Boolean | `false` | yes | Shows a password visibility toggle (only effective when `type="password"`) |
| `size` | String | `"medium"` | yes | Component size: `small` \| `medium` \| `large` |
| `variant` | String | `"outlined"` | yes | Visual variant: `outlined` \| `filled` |
| `name` | String | `""` | no | Name for form association |

## Variants

| Variant | Description |
|---------|-------------|
| `outlined` | Default style with visible border and transparent background |
| `filled` | Subtle background fill with no visible border |

## Sizes

| Size | `--cv-input-height` | `--cv-input-padding-inline` | `--cv-input-font-size` |
|------|----------------------|-----------------------------|------------------------|
| `small` | `30px` | `var(--cv-space-2, 8px)` | `var(--cv-font-size-sm, 13px)` |
| `medium` | `36px` | `var(--cv-space-3, 12px)` | `var(--cv-font-size-base, 14px)` |
| `large` | `42px` | `var(--cv-space-4, 16px)` | `var(--cv-font-size-md, 16px)` |

## Slots

| Slot | Description |
|------|-------------|
| `prefix` | Content rendered before the input (e.g., icon) |
| `suffix` | Content rendered after the input (e.g., icon) |
| `clear-icon` | Custom icon for the clear button (default: `×`) |
| `show-password-icon` | Custom icon for the "show password" state |
| `hide-password-icon` | Custom icon for the "hide password" state |
| `label` | Label text displayed above or beside the input |
| `help-text` | Help or description text displayed below the input |

> **Note:** The native `<input>` element is not slottable. There is no default slot.

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Outermost wrapper element |
| `input` | `<input>` | The native input element |
| `prefix` | `<span>` | Wrapper around the `prefix` slot |
| `suffix` | `<span>` | Wrapper around the `suffix` slot |
| `clear-button` | `<span>` | The clear button wrapper |
| `password-toggle` | `<span>` | The password toggle button wrapper |
| `form-control-label` | `<span>` | Wrapper around the `label` slot |
| `form-control-help-text` | `<span>` | Wrapper around the `help-text` slot |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-input-height` | `36px` | Component block size |
| `--cv-input-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding inside the input |
| `--cv-input-font-size` | `var(--cv-font-size-base, 14px)` | Font size of the input text |
| `--cv-input-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius of the input container |
| `--cv-input-border-color` | `var(--cv-color-border, #2a3245)` | Border color in default state |
| `--cv-input-background` | `transparent` | Background color of the input container |
| `--cv-input-color` | `var(--cv-color-text, #e8ecf6)` | Text color of the input value |
| `--cv-input-placeholder-color` | `var(--cv-color-text-muted, #6b7a99)` | Placeholder text color |
| `--cv-input-focus-ring` | `0 0 0 2px var(--cv-color-primary, #65d7ff)` | Box-shadow applied on focus |
| `--cv-input-icon-size` | `1em` | Size of prefix/suffix/clear/toggle icons |
| `--cv-input-gap` | `var(--cv-space-2, 8px)` | Spacing between inner elements (prefix, input, suffix, buttons) |
| `--cv-input-transition-duration` | `var(--cv-duration-fast, 120ms)` | Transition duration for state changes |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Base border color |
| `--cv-color-surface` | `#141923` | Surface background color (used by `filled` variant) |
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
| `:host([readonly])` | Normal opacity, `cursor: default`, input text not editable |
| `:host([required])` | No visual change by default (can be styled via part selectors) |
| `:host([focused])` | Focus ring applied via `--cv-input-focus-ring` |
| `:host([filled])` | Indicates non-empty value (e.g., for floating label transitions) |
| `:host([clearable])` | Clear button space reserved in layout |
| `:host([password-toggle])` | Password toggle button space reserved in layout |
| `:host([size="small"])` | Small size overrides |
| `:host([size="large"])` | Large size overrides |
| `:host([variant="outlined"])` | Visible border, transparent background |
| `:host([variant="filled"])` | Subtle background (`--cv-color-surface`), no visible border |

## Reactive State Mapping

`cv-input` is a visual adapter over headless `createInput`.

### UIKit properties to headless actions

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` | attr/prop -> action | `actions.setValue(value)` |
| `type` | attr -> action | `actions.setType(type)` |
| `disabled` | attr -> action | `actions.setDisabled(value)` |
| `readonly` | attr -> action | `actions.setReadonly(value)` |
| `required` | attr -> action | `actions.setRequired(value)` |
| `placeholder` | attr -> action | `actions.setPlaceholder(value)` |
| `clearable` | attr -> action | `actions.setClearable(value)` |
| `password-toggle` | attr -> action | `actions.setPasswordToggle(value)` |

### Headless state to DOM reflection

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.disabled()` | state -> attr | `[disabled]` host attribute |
| `state.readonly()` | state -> attr | `[readonly]` host attribute |
| `state.required()` | state -> attr | `[required]` host attribute |
| `state.focused()` | state -> attr | `[focused]` host attribute |
| `state.filled()` | state -> attr | `[filled]` host attribute |
| `state.passwordVisible()` | state -> DOM | toggles between `show-password-icon` / `hide-password-icon` slots |
| `state.showClearButton()` | state -> DOM | shows/hides the clear button element |
| `state.showPasswordToggle()` | state -> DOM | shows/hides the password toggle element |
| `state.resolvedType()` | state -> DOM | applied as `type` attribute on the native `<input>` |

### Contract props spreading

- `contracts.getInputProps()` is spread onto the `[part="input"]` native `<input>` element to apply `id`, `type`, `aria-disabled`, `aria-readonly`, `aria-required`, `placeholder`, `disabled`, `readonly`, `tabindex`, and `autocomplete`.
- `contracts.getClearButtonProps()` is spread onto the `[part="clear-button"]` element to apply `role`, `aria-label`, `tabindex`, `hidden`, and `aria-hidden`.
- `contracts.getPasswordToggleProps()` is spread onto the `[part="password-toggle"]` element to apply `role`, `aria-label`, `aria-pressed`, `tabindex`, `hidden`, and `aria-hidden`.

### Event wiring

- Native `<input>` `input` event -> `actions.handleInput(e.target.value)` -> dispatches `cv-input` CustomEvent
- Native `<input>` `keydown` event -> `actions.handleKeyDown(e)` -> may trigger `actions.clear()` -> dispatches `cv-clear` CustomEvent
- Native `<input>` `focus` event -> `actions.setFocused(true)` -> dispatches `cv-focus` CustomEvent
- Native `<input>` `blur` event -> `actions.setFocused(false)` -> dispatches `cv-blur` CustomEvent; if value changed since focus, dispatches `cv-change` CustomEvent
- Clear button `click` -> `actions.clear()` -> dispatches `cv-clear` CustomEvent
- Password toggle `click` -> `actions.togglePasswordVisibility()`

UIKit does not own value management, type resolution, clearable logic, or password toggle logic; headless state is the source of truth.

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{ value: string }` | Fires on value change from user interaction (native input event), not from programmatic `setValue` |
| `cv-change` | `{ value: string }` | Fires on value commit (blur after the value changed since focus) |
| `cv-clear` | `{ }` | Fires when the value is cleared via the clear button or `Escape` key |
| `cv-focus` | `{ }` | Fires when the input receives focus |
| `cv-blur` | `{ }` | Fires when the input loses focus |

## Usage

```html
<!-- Basic text input -->
<cv-input placeholder="Enter text"></cv-input>

<!-- With label and help text -->
<cv-input>
  <span slot="label">Username</span>
  <span slot="help-text">Enter your username</span>
</cv-input>

<!-- Clearable -->
<cv-input clearable value="Hello world"></cv-input>

<!-- Password with toggle -->
<cv-input type="password" password-toggle placeholder="Password"></cv-input>

<!-- Filled variant, small size -->
<cv-input variant="filled" size="small" placeholder="Search..."></cv-input>

<!-- With prefix and suffix icons -->
<cv-input>
  <icon-search slot="prefix"></icon-search>
  <icon-arrow slot="suffix"></icon-arrow>
</cv-input>

<!-- Disabled -->
<cv-input disabled value="Cannot edit"></cv-input>

<!-- Readonly -->
<cv-input readonly value="Read only value"></cv-input>

<!-- Email type, required -->
<cv-input type="email" required placeholder="Email address">
  <span slot="label">Email</span>
</cv-input>

<!-- Large size, outlined variant with custom clear icon -->
<cv-input size="large" clearable>
  <icon-x slot="clear-icon"></icon-x>
</cv-input>
```
