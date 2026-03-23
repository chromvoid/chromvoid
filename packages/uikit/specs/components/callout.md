# cv-callout

Static supplementary content block that highlights important information using `role="note"`. Unlike `cv-alert`, a callout is not a live region and does not announce dynamically.

**Headless:** [`createCallout`](../../../headless/specs/components/callout.md)

## Anatomy

```
<cv-callout> (host)
└── <div part="base" role="note">
    ├── <span part="icon">
    │   └── <slot name="icon">
    ├── <span part="message">
    │   └── <slot>
    └── <button part="close-button" aria-label="Dismiss">   ← only when [closable]
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `variant` | String | `"info"` | Visual variant: `"info"` \| `"success"` \| `"warning"` \| `"danger"` \| `"neutral"` |
| `closable` | Boolean | `false` | Renders a dismiss button and enables the `cv-close` event |
| `open` | Boolean | `true` | Controls visibility of the callout |

## Variants

| Variant | Description |
|---------|-------------|
| `info` | Default informational style using `--cv-color-info` |
| `success` | Success-tinted background and border using `--cv-color-success` |
| `warning` | Warning-tinted background and border using `--cv-color-warning` |
| `danger` | Danger-tinted background and border using `--cv-color-danger` |
| `neutral` | Muted style with surface background and border |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Main content (projected into the message area) |
| `icon` | Leading icon area before the message content |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Outer container with `role="note"`; receives headless `getCalloutProps()` attributes |
| `icon` | `<span>` | Wrapper around the `icon` slot |
| `message` | `<span>` | Wrapper around the default slot |
| `close-button` | `<button>` | Dismiss button (rendered only when `closable` is `true`) |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-callout-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding |
| `--cv-callout-padding-block` | `var(--cv-space-3, 12px)` | Vertical padding |
| `--cv-callout-gap` | `var(--cv-space-2, 8px)` | Gap between icon, message, and close button |
| `--cv-callout-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius |
| `--cv-callout-border-color` | `var(--cv-color-border, #2a3245)` | Border color (overridden per variant) |
| `--cv-callout-background` | `var(--cv-color-surface-elevated, #1d2432)` | Background color (overridden per variant) |
| `--cv-callout-color` | `var(--cv-color-text, #e8ecf6)` | Text color |
| `--cv-callout-icon-color` | `currentColor` | Icon slot color (overridden per variant) |
| `--cv-callout-font-size` | `var(--cv-font-size-base, 14px)` | Font size of callout content |
| `--cv-callout-transition-duration` | `var(--cv-duration-fast, 120ms)` | Transition duration for show/hide |
| `--cv-callout-transition-easing` | `var(--cv-easing-standard, ease)` | Transition timing function |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Base border color |
| `--cv-color-surface-elevated` | `#1d2432` | Elevated surface background color |
| `--cv-color-text` | `#e8ecf6` | Default text color |
| `--cv-color-info` | `#65d7ff` | Info accent color |
| `--cv-color-success` | `#5beba0` | Success accent color |
| `--cv-color-warning` | `#ffc857` | Warning accent color |
| `--cv-color-danger` | `#ff7d86` | Danger accent color |
| `--cv-duration-fast` | `120ms` | Transition duration |
| `--cv-easing-standard` | `ease` | Transition timing function |
| `--cv-radius-sm` | `6px` | Base radius fallback |
| `--cv-space-2` | `8px` | Medium spacing scale fallback |
| `--cv-space-3` | `12px` | Medium-large spacing scale fallback |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([open])` | Visible state; callout is rendered and visible |
| `:host(:not([open]))` | Hidden state; callout is hidden (e.g., `display: none` or fade-out transition) |
| `:host([variant="info"])` | Info-tinted background and border (default) |
| `:host([variant="success"])` | Success-tinted background and border |
| `:host([variant="warning"])` | Warning-tinted background and border |
| `:host([variant="danger"])` | Danger-tinted background and border |
| `:host([variant="neutral"])` | Muted surface background with border |
| `:host([closable])` | Close button is rendered in the template |

## Reactive State Mapping

`cv-callout` is a visual adapter over headless `createCallout`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `variant` | attr -> action | `actions.setVariant(value)` |
| `closable` | attr -> action | `actions.setClosable(value)` |
| `open` | attr -> action | `actions.show()` / programmatic visibility control |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.variant()` | state -> attr | `[variant]` host attribute |
| `state.closable()` | state -> attr | `[closable]` host attribute |
| `state.open()` | state -> attr | `[open]` host attribute |

- `contracts.getCalloutProps()` is spread onto the inner `[part="base"]` element to apply `id`, `role="note"`, and `data-variant`.
- `contracts.getCloseButtonProps()` is spread onto the inner `[part="close-button"]` element to apply `id`, `role="button"`, `tabindex="0"`, `aria-label="Dismiss"`, and `onClick` handler. The close button is only rendered when `closable` is `true`.
- UIKit dispatches `cv-close` when the headless `actions.close()` transitions `open` from `true` to `false`.
- UIKit does not own ARIA logic or close behavior; headless state is the source of truth.
- The callout root is not focusable; no `tabindex` is applied to the root element.

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-close` | `undefined` | Fires when the callout is dismissed via the close button (`closable` must be `true`) |

No `cv-input` or `cv-change` events are emitted. The callout has no user-modifiable state; closing is a one-way action.

## Usage

```html
<cv-callout>This is an informational callout.</cv-callout>

<cv-callout variant="success">Operation completed successfully.</cv-callout>

<cv-callout variant="warning">Please review before continuing.</cv-callout>

<cv-callout variant="danger">This action cannot be undone.</cv-callout>

<cv-callout variant="neutral">Additional context for this section.</cv-callout>

<cv-callout variant="warning" closable>
  This warning can be dismissed.
</cv-callout>

<cv-callout variant="info">
  <icon-info slot="icon"></icon-info>
  Callout with a leading icon.
</cv-callout>

<cv-callout variant="danger" closable>
  <icon-alert-triangle slot="icon"></icon-alert-triangle>
  Critical issue detected. Please take action.
</cv-callout>
```
