# cv-copy-button

Button that copies a value to the system clipboard with three-state visual feedback (idle, success, error).

**Headless:** [`createCopyButton`](../../../headless/specs/components/copy-button.md)

## Anatomy

```
<cv-copy-button> (host)
└── <div part="base" role="button">
    ├── <span part="copy-icon">
    │   └── <slot name="copy-icon"> (default: clipboard icon)
    ├── <span part="success-icon">
    │   └── <slot name="success-icon"> (default: check icon)
    ├── <span part="error-icon">
    │   └── <slot name="error-icon"> (default: x icon)
    └── <span part="status" role="status" aria-live="polite">
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `''` | Text to copy. Property also accepts `(() => Promise<string>)` for lazy/sensitive values (property-only, not reflected as attribute for security) |
| `disabled` | Boolean | `false` | Prevents interaction |
| `feedback-duration` | Number | `1500` | Milliseconds to show success/error feedback before reverting to idle |
| `size` | String | `"medium"` | Size: `small` \| `medium` \| `large` |

## Sizes

| Size | `--cv-copy-button-size` |
|------|-------------------------|
| `small` | `30px` |
| `medium` | `36px` |
| `large` | `42px` |

## Slots

| Slot | Description |
|------|-------------|
| `copy-icon` | Icon shown in idle state (default: clipboard icon) |
| `success-icon` | Icon shown after successful copy (default: check icon) |
| `error-icon` | Icon shown after copy failure (default: x icon) |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root interactive element with `role="button"` |
| `copy-icon` | `<span>` | Wrapper around the `copy-icon` slot |
| `success-icon` | `<span>` | Wrapper around the `success-icon` slot |
| `error-icon` | `<span>` | Wrapper around the `error-icon` slot |
| `status` | `<span>` | Live region for assistive technology announcements |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-copy-button-size` | `36px` | Overall button size (width and height) |
| `--cv-copy-button-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius for button shape |
| `--cv-copy-button-success-color` | `var(--cv-color-success, #4ade80)` | Color applied during success state |
| `--cv-copy-button-error-color` | `var(--cv-color-danger, #ff7d86)` | Color applied during error state |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Base border color |
| `--cv-color-surface` | `#141923` | Surface background color |
| `--cv-color-text` | `#e8ecf6` | Default text/icon color |
| `--cv-color-success` | `#4ade80` | Success accent color |
| `--cv-color-danger` | `#ff7d86` | Danger accent color |
| `--cv-duration-fast` | `120ms` | Transition duration |
| `--cv-easing-standard` | `ease` | Transition timing function |
| `--cv-radius-sm` | `6px` | Base radius fallback |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([disabled])` | Reduced opacity (`0.55`), `cursor: not-allowed` |
| `:host([status="idle"])` | Default state; copy icon visible, success/error icons hidden |
| `:host([status="success"])` | Success color applied via `--cv-copy-button-success-color`; success icon visible |
| `:host([status="error"])` | Error color applied via `--cv-copy-button-error-color`; error icon visible |
| `:host([copying])` | Shown while async copy is in-flight; `cursor: progress` |
| `:host([size="small"])` | Small size overrides |
| `:host([size="large"])` | Large size overrides |

## Reactive State Mapping

`cv-copy-button` is a visual adapter over headless `createCopyButton`.

### UIKit properties to headless actions

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `disabled` | attr -> action | `actions.setDisabled(value)` |
| `feedback-duration` | attr -> action | `actions.setFeedbackDuration(value)` |
| `value` | prop -> action | `actions.setValue(value)` |

### Headless state to DOM reflection

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.status()` | state -> attr | `[status]` host attribute (`"idle"` \| `"success"` \| `"error"`) |
| `state.isDisabled()` | state -> attr | `[disabled]` host attribute |
| `state.isCopying()` | state -> attr | `[copying]` host attribute |

### Headless contracts to DOM elements

| Contract | Target Element | Notes |
|----------|---------------|-------|
| `contracts.getButtonProps()` | Inner `[part="base"]` | Spread as attributes; provides `role`, `aria-disabled`, `tabindex`, `aria-label`, `onClick`, `onKeyDown`, `onKeyUp` |
| `contracts.getStatusProps()` | Inner `[part="status"]` | Spread as attributes; provides `role="status"`, `aria-live="polite"`, `aria-atomic="true"` |
| `contracts.getIconContainerProps('copy')` | Inner `[part="copy-icon"]` | Spread as attributes; provides `aria-hidden`, `hidden` |
| `contracts.getIconContainerProps('success')` | Inner `[part="success-icon"]` | Spread as attributes; provides `aria-hidden`, `hidden` |
| `contracts.getIconContainerProps('error')` | Inner `[part="error-icon"]` | Spread as attributes; provides `aria-hidden`, `hidden` |

### Headless options passed from UIKit attributes

| UIKit Attribute | Headless Option | Notes |
|-----------------|----------------|-------|
| `value` | `value` | Property-only; accepts `string \| (() => Promise<string>)` |
| `feedback-duration` | `feedbackDuration` | Numeric attribute, defaults to `1500` |
| `disabled` | `isDisabled` | Boolean attribute |
| `aria-label` | `ariaLabel` | Standard ARIA labeling |

### UIKit-only concerns (not in headless)

- Icon rendering via slotted content (`copy-icon`, `success-icon`, `error-icon` slots with default SVG icons)
- CSS custom properties for sizing and colors (`--cv-copy-button-*`)
- `size` attribute controlling icon/button dimensions
- `cv-copy` and `cv-error` custom events dispatched on the host element
- Pulse/scale animation on copy activation

### Headless-owned concerns (UIKit does NOT reimplement)

- Copy cycle logic (resolve value, write to clipboard, transition status, schedule revert)
- Keyboard interaction (Enter on keydown, Space on keyup)
- Click handling
- ARIA attribute computation (`aria-disabled`, `tabindex`, `aria-label`)
- Timer management (revert timer, cancellation)
- `isCopying` re-entrant guard

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-copy` | `{ value: string }` | Fired on successful clipboard write |
| `cv-error` | `{ error: unknown }` | Fired on clipboard write failure or async value getter failure |

Events are dispatched by the UIKit adapter by providing `onCopy` and `onError` callbacks to `createCopyButton`:
- `onCopy(value)` -> dispatches `cv-copy` with `{ detail: { value } }`
- `onError(error)` -> dispatches `cv-error` with `{ detail: { error } }`

## Usage

```html
<!-- Basic usage -->
<cv-copy-button value="text to copy"></cv-copy-button>

<!-- With aria-label for accessible context -->
<cv-copy-button value="secret123" aria-label="Copy password"></cv-copy-button>

<!-- Small size -->
<cv-copy-button value="hello" size="small"></cv-copy-button>

<!-- Custom feedback duration (3 seconds) -->
<cv-copy-button value="hello" feedback-duration="3000"></cv-copy-button>

<!-- Custom icons via slots -->
<cv-copy-button value="hello">
  <svg slot="copy-icon"><!-- custom copy icon --></svg>
  <svg slot="success-icon"><!-- custom success icon --></svg>
  <svg slot="error-icon"><!-- custom error icon --></svg>
</cv-copy-button>

<!-- Disabled -->
<cv-copy-button value="hello" disabled></cv-copy-button>

<!-- Async value (property-only, set via JS) -->
<cv-copy-button id="lazy-copy"></cv-copy-button>
<script>
  document.querySelector('#lazy-copy').value = async () => {
    const res = await fetch('/api/secret');
    return res.text();
  };
</script>

<!-- Listening for events -->
<cv-copy-button value="hello"
  @cv-copy="${(e) => console.log('Copied:', e.detail.value)}"
  @cv-error="${(e) => console.error('Failed:', e.detail.error)}">
</cv-copy-button>
```
