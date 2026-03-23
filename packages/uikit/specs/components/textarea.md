# cv-textarea

Multi-line text input with form-field chrome, native textarea semantics, and headless state delegation.

**Headless:** [`createTextarea`](../../../headless/specs/components/textarea.md)

## Anatomy

```
<cv-textarea> (host)
├── <span part="form-control-label">
│   └── <slot name="label">
├── <div part="base">
│   └── <textarea part="textarea"></textarea>
└── <span part="form-control-help-text">
    └── <slot name="help-text">
```

## Attributes

| Attribute     | Type    | Default      | Reflects | Description                                        |
| ------------- | ------- | ------------ | -------- | -------------------------------------------------- |
| `value`       | String  | `""`         | no       | Current textarea value                             |
| `placeholder` | String  | `""`         | no       | Placeholder text                                   |
| `disabled`    | Boolean | `false`      | yes      | Prevents interaction and removes from tab sequence |
| `readonly`    | Boolean | `false`      | yes      | Prevents editing while keeping focusability        |
| `required`    | Boolean | `false`      | yes      | Marks the field as required                        |
| `rows`        | Number  | `4`          | no       | Visible row count                                  |
| `cols`        | Number  | `20`         | no       | Visible column count                               |
| `minlength`   | Number  | —            | no       | Minimum accepted value length                      |
| `maxlength`   | Number  | —            | no       | Maximum accepted value length                      |
| `resize`      | String  | `"vertical"` | yes      | Resize behavior: `vertical` \| `none`              |
| `size`        | String  | `"medium"`   | yes      | Component size: `small` \| `medium` \| `large`     |
| `variant`     | String  | `"outlined"` | yes      | Visual variant: `outlined` \| `filled`             |
| `name`        | String  | `""`         | no       | Native textarea form field name                    |

## Variants

| Variant    | Description                                                  |
| ---------- | ------------------------------------------------------------ |
| `outlined` | Default style with visible border and transparent background |
| `filled`   | Subtle filled surface with transparent border                |

## Sizes

| Size     | `--cv-textarea-min-height` | `--cv-textarea-padding-inline` | `--cv-textarea-font-size`        |
| -------- | -------------------------- | ------------------------------ | -------------------------------- |
| `small`  | `72px`                     | `var(--cv-space-2, 8px)`       | `var(--cv-font-size-sm, 13px)`   |
| `medium` | `96px`                     | `var(--cv-space-3, 12px)`      | `var(--cv-font-size-base, 14px)` |
| `large`  | `120px`                    | `var(--cv-space-4, 16px)`      | `var(--cv-font-size-md, 16px)`   |

## Slots

| Slot        | Description                                            |
| ----------- | ------------------------------------------------------ |
| `label`     | Optional label content above the textarea              |
| `help-text` | Optional helper or description text below the textarea |

> The native `<textarea>` is not slottable. There is no default slot.

## CSS Parts

| Part                     | Element      | Description                        |
| ------------------------ | ------------ | ---------------------------------- |
| `base`                   | `<div>`      | Wrapper around the native textarea |
| `textarea`               | `<textarea>` | Native multi-line text control     |
| `form-control-label`     | `<span>`     | Wrapper around `label` slot        |
| `form-control-help-text` | `<span>`     | Wrapper around `help-text` slot    |

## CSS Custom Properties

| Property                            | Default                                      | Description                                     |
| ----------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| `--cv-textarea-min-height`          | `96px`                                       | Minimum block size of textarea control          |
| `--cv-textarea-padding-inline`      | `var(--cv-space-3, 12px)`                    | Horizontal textarea padding                     |
| `--cv-textarea-padding-block`       | `var(--cv-space-2, 8px)`                     | Vertical textarea padding                       |
| `--cv-textarea-font-size`           | `var(--cv-font-size-base, 14px)`             | Textarea font size                              |
| `--cv-textarea-border-radius`       | `var(--cv-radius-sm, 6px)`                   | Border radius of wrapper and textarea           |
| `--cv-textarea-border-color`        | `var(--cv-color-border, #2a3245)`            | Border color in default state                   |
| `--cv-textarea-background`          | `transparent`                                | Background for outlined variant                 |
| `--cv-textarea-color`               | `var(--cv-color-text, #e8ecf6)`              | Foreground text color                           |
| `--cv-textarea-placeholder-color`   | `var(--cv-color-text-muted, #6b7a99)`        | Placeholder color                               |
| `--cv-textarea-focus-ring`          | `0 0 0 2px var(--cv-color-primary, #65d7ff)` | Focus ring for focused state                    |
| `--cv-textarea-transition-duration` | `var(--cv-duration-fast, 120ms)`             | Transition duration for container state changes |

## Visual States

| Host selector                 | Description                                        |
| ----------------------------- | -------------------------------------------------- |
| `:host([disabled])`           | Reduced opacity (`0.55`), no pointer interaction   |
| `:host([readonly])`           | Editable appearance with default cursor semantics  |
| `:host([required])`           | Required semantic state (no default visual marker) |
| `:host([focused])`            | Focus ring shown on wrapper                        |
| `:host([filled])`             | Non-empty state for styling hooks                  |
| `:host([resize="vertical"])`  | Native textarea vertical resize enabled            |
| `:host([resize="none"])`      | Native textarea resize disabled                    |
| `:host([size="small"])`       | Small size token overrides                         |
| `:host([size="large"])`       | Large size token overrides                         |
| `:host([variant="outlined"])` | Outlined variant                                   |
| `:host([variant="filled"])`   | Filled variant                                     |

## Reactive State Mapping

`cv-textarea` is a visual adapter over headless `createTextarea`.

### UIKit properties to headless actions

| UIKit Property | Direction           | Headless Binding                |
| -------------- | ------------------- | ------------------------------- |
| `value`        | attr/prop -> action | `actions.setValue(value)`       |
| `disabled`     | attr -> action      | `actions.setDisabled(value)`    |
| `readonly`     | attr -> action      | `actions.setReadonly(value)`    |
| `required`     | attr -> action      | `actions.setRequired(value)`    |
| `placeholder`  | attr -> action      | `actions.setPlaceholder(value)` |
| `rows`         | attr -> action      | `actions.setRows(value)`        |
| `cols`         | attr -> action      | `actions.setCols(value)`        |
| `minlength`    | attr -> action      | `actions.setMinLength(value)`   |
| `maxlength`    | attr -> action      | `actions.setMaxLength(value)`   |
| `resize`       | attr -> action      | `actions.setResize(value)`      |

### Headless state to DOM reflection

| Headless State     | Direction     | DOM Reflection              |
| ------------------ | ------------- | --------------------------- |
| `state.disabled()` | state -> attr | `[disabled]` host attribute |
| `state.readonly()` | state -> attr | `[readonly]` host attribute |
| `state.required()` | state -> attr | `[required]` host attribute |
| `state.focused()`  | state -> attr | `[focused]` host attribute  |
| `state.filled()`   | state -> attr | `[filled]` host attribute   |
| `state.resize()`   | state -> attr | `[resize]` host attribute   |

### Contract props spreading

- `contracts.getTextareaProps()` is spread onto `[part="textarea"]` to apply `id`, `aria-disabled`, `aria-readonly`, `aria-required`, `placeholder`, `disabled`, `readonly`, `required`, `tabindex`, `rows`, `cols`, `minlength`, and `maxlength`.

### Event wiring

- Native `textarea` `input` -> `actions.handleInput(e.target.value)` -> dispatch `cv-input`
- Native `textarea` `focus` -> `actions.setFocused(true)` -> dispatch `cv-focus`
- Native `textarea` `blur` -> `actions.setFocused(false)` -> dispatch `cv-blur`; if value changed since focus, dispatch `cv-change`

UIKit does not own ARIA computation, disabled/readonly guards, or filled-state derivation.

## Events

| Event       | Detail              | Description                                  |
| ----------- | ------------------- | -------------------------------------------- |
| `cv-input`  | `{ value: string }` | Fires when user input mutates value          |
| `cv-change` | `{ value: string }` | Fires on blur when value changed since focus |
| `cv-focus`  | `{ }`               | Fires when textarea receives focus           |
| `cv-blur`   | `{ }`               | Fires when textarea loses focus              |

## Usage

```html
<cv-textarea placeholder="Write a comment"></cv-textarea>

<cv-textarea required rows="6">
  <span slot="label">Comment</span>
  <span slot="help-text">Be specific and concise.</span>
</cv-textarea>

<cv-textarea variant="filled" size="small" resize="none"></cv-textarea>

<cv-textarea disabled value="Read-only snapshot"></cv-textarea>
```
