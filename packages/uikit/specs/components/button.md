# cv-button

Interactive element that triggers an action or toggles a pressed state.

**Headless:** [`createButton`](../../../headless/specs/components/button.md)

## Anatomy

```
<cv-button> (host)
└── <button part="base" type="button" role="button">
    ├── <span part="spinner" aria-hidden="true">   ← only when [loading]
    ├── <span part="prefix">
    │   └── <slot name="prefix">
    ├── <span part="label">
    │   └── <slot>
    └── <span part="suffix">
        └── <slot name="suffix">
```

## Attributes

| Attribute  | Type    | Default     | Description                                                   |
| ---------- | ------- | ----------- | ------------------------------------------------------------- |
| `disabled` | Boolean | `false`     | Prevents interaction                                          |
| `toggle`   | Boolean | `false`     | Enables toggle (pressed) behavior                             |
| `pressed`  | Boolean | `false`     | Pressed state (only meaningful when `toggle` is `true`)       |
| `loading`  | Boolean | `false`     | Shows spinner and blocks interaction                          |
| `variant`  | String  | `"default"` | Visual variant: `default` \| `primary` \| `danger` \| `ghost` |
| `outline`  | Boolean | `false`     | Outlined appearance (transparent background, visible border)  |
| `pill`     | Boolean | `false`     | Fully rounded edges (`border-radius: 999px`)                  |
| `size`     | String  | `"medium"`  | Size: `small` \| `medium` \| `large`                          |
| `type`     | String  | `"button"`  | Form action type: `button` \| `submit` \| `reset`             |

## Form Behavior

- `type="button"`: no form action.
- `type="submit"`: triggers form submission for nearest form owner.
- `type="reset"`: triggers form reset for nearest form owner.
- Form owner resolution order:
  1. host `[form="..."]` attribute by element id
  2. nearest ancestor `form` via `closest('form')`
- If `disabled` or `loading` is active, submit/reset actions are blocked.

## Variants

| Variant   | Description                                                     |
| --------- | --------------------------------------------------------------- |
| `default` | Default filled style with surface background and border         |
| `primary` | Primary-tinted background and border using `--cv-color-primary` |
| `danger`  | Danger-tinted background and border using `--cv-color-danger`   |
| `ghost`   | Transparent background and border                               |

The `outline` boolean modifier can be combined with any variant to produce an outlined appearance (transparent background, visible border tinted by variant color).

## Sizes

| Size     | `--cv-button-min-height` | `--cv-button-padding-inline` | `--cv-button-padding-block` | `--cv-button-font-size`          |
| -------- | ------------------------ | ---------------------------- | --------------------------- | -------------------------------- |
| `small`  | `30px`                   | `var(--cv-space-2, 8px)`     | `var(--cv-space-1, 4px)`    | `var(--cv-font-size-sm, 13px)`   |
| `medium` | `36px`                   | `var(--cv-space-3, 12px)`    | `var(--cv-space-2, 8px)`    | `var(--cv-font-size-base, 14px)` |
| `large`  | `42px`                   | `var(--cv-space-4, 16px)`    | `var(--cv-space-2, 8px)`    | `var(--cv-font-size-md, 16px)`   |

## Slots

| Slot        | Description                  |
| ----------- | ---------------------------- |
| `(default)` | Button label                 |
| `prefix`    | Icon or element before label |
| `suffix`    | Icon or element after label  |

## CSS Parts

| Part      | Element    | Description                                              |
| --------- | ---------- | -------------------------------------------------------- |
| `base`    | `<button>` | Root interactive element with `role="button"`            |
| `label`   | `<span>`   | Wrapper around the default slot                          |
| `prefix`  | `<span>`   | Wrapper around the `prefix` slot                         |
| `suffix`  | `<span>`   | Wrapper around the `suffix` slot                         |
| `spinner` | `<span>`   | Loading spinner (rendered only when `loading` is `true`) |

## CSS Custom Properties

| Property                     | Default                          | Description                          |
| ---------------------------- | -------------------------------- | ------------------------------------ |
| `--cv-button-min-height`     | `36px`                           | Minimum block size of the button     |
| `--cv-button-padding-inline` | `var(--cv-space-3, 12px)`        | Horizontal padding                   |
| `--cv-button-padding-block`  | `var(--cv-space-2, 8px)`         | Vertical padding                     |
| `--cv-button-border-radius`  | `var(--cv-radius-sm, 6px)`       | Border radius for button shape       |
| `--cv-button-gap`            | `var(--cv-space-2, 8px)`         | Spacing between button content parts |
| `--cv-button-font-size`      | `var(--cv-font-size-base, 14px)` | Font size of button content          |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property         | Default   | Description                          |
| ---------------------- | --------- | ------------------------------------ |
| `--cv-color-border`    | `#2a3245` | Base border color                    |
| `--cv-color-surface`   | `#141923` | Surface background color             |
| `--cv-color-text`      | `#e8ecf6` | Default text color                   |
| `--cv-color-primary`   | `#65d7ff` | Primary accent color                 |
| `--cv-color-danger`    | `#ff7d86` | Danger accent color                  |
| `--cv-duration-fast`   | `120ms`   | Transition duration                  |
| `--cv-easing-standard` | `ease`    | Transition timing function           |
| `--cv-radius-sm`       | `6px`     | Base radius used for button fallback |
| `--cv-space-1`         | `4px`     | Small spacing scale fallback         |
| `--cv-space-2`         | `8px`     | Medium spacing scale fallback        |
| `--cv-space-3`         | `12px`    | Medium-large spacing scale fallback  |
| `--cv-space-4`         | `16px`    | Large spacing scale fallback         |

## Visual States

| Host selector                | Description                                                       |
| ---------------------------- | ----------------------------------------------------------------- |
| `:host([disabled])`          | Reduced opacity (`0.55`), `cursor: not-allowed`                   |
| `:host([pressed])`           | Primary-tinted background (per variant)                           |
| `:host([loading])`           | Shows spinner, label reduced opacity (`0.72`), `cursor: progress` |
| `:host([variant="default"])` | Default surface background with border                            |
| `:host([variant="primary"])` | Primary-tinted background and border                              |
| `:host([variant="danger"])`  | Danger-tinted background and border                               |
| `:host([variant="ghost"])`   | Transparent background and border                                 |
| `:host([outline])`           | Transparent background, visible border (tinted by variant)        |
| `:host([pill])`              | Fully rounded edges                                               |
| `:host([size="small"])`      | Small size overrides                                              |
| `:host([size="large"])`      | Large size overrides                                              |

## Reactive State Mapping

`cv-button` is a visual adapter over headless `createButton`.

| UIKit Property | Direction     | Headless Binding                                          |
| -------------- | ------------- | --------------------------------------------------------- |
| `disabled`     | attr → action | `actions.setDisabled(value)`                              |
| `loading`      | attr → action | `actions.setLoading(value)`                               |
| `pressed`      | attr → action | `actions.setPressed(value)`                               |
| `toggle`       | attr → option | passed as `isPressed` presence in `createButton(options)` |

| Headless State       | Direction    | DOM Reflection              |
| -------------------- | ------------ | --------------------------- |
| `state.isDisabled()` | state → attr | `[disabled]` host attribute |
| `state.isLoading()`  | state → attr | `[loading]` host attribute  |
| `state.isPressed()`  | state → attr | `[pressed]` host attribute  |

- `contracts.getButtonProps()` is spread onto the inner `[part="base"]` element to apply `role`, `aria-disabled`, `aria-busy`, `aria-pressed`, `tabindex`, and keyboard/click handlers.
- UIKit dispatches `cv-input` and `cv-change` events by observing `isPressed` changes triggered by user activation (not by controlled `setPressed`).
- UIKit does not own activation or toggle logic; headless state is the source of truth.

## Events

| Event    | Detail                                | Description                                           |
| -------- | ------------------------------------- | ----------------------------------------------------- |
| `cv-input`  | `{pressed: boolean, toggle: boolean}` | Fires on activation in toggle mode only               |
| `cv-change` | `{pressed: boolean}`                  | Fires when `pressed` state changes (toggle mode only) |

Normal (non-toggle) buttons rely on the native `click` event.

## Legacy Button Migration Mapping

### Variant mapping

- `brand` -> `primary`
- `neutral` -> `default`
- `secondary` -> `default`
- `plain` -> `ghost`
- `text` -> `ghost`
- `primary` -> `primary`
- `danger` -> `danger`
- `ghost` -> `ghost`

### Slot mapping

- `slot="start"` -> `slot="prefix"`
- `slot="end"` -> `slot="suffix"`

## Usage

```html
<cv-button>Click me</cv-button>

<cv-button variant="primary">Save</cv-button>

<cv-button variant="danger" outline>Delete</cv-button>

<cv-button variant="primary" outline size="small">Small outline</cv-button>

<cv-button pill>Rounded</cv-button>

<cv-button variant="danger" loading>Deleting…</cv-button>

<cv-button toggle pressed>Bold</cv-button>

<cv-button>
  <icon-plus slot="prefix"></icon-plus>
  Add item
</cv-button>

<cv-button>
  Settings
  <icon-chevron slot="suffix"></icon-chevron>
</cv-button>
```
