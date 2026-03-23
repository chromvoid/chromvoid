# cv-alert

Passive live-region message that announces important updates without taking focus.

**Headless:** [`createAlert`](../../../headless/specs/components/alert.md)

## Anatomy

```
<cv-alert> (host)
└── <div part="base" role="alert">
    ├── <div part="message">  ← current message text
    └── <slot>                  ← optional additional static content
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `duration-ms` | Number | `0` | Auto-hide timeout in milliseconds (`0` disables auto-hide) |
| `aria-live` | String | `"assertive"` | Live-region priority: `assertive` \| `polite` |
| `aria-atomic` | Boolean | `true` | Announces the whole region when content changes |
| `visible` | Boolean (state) | `false` | Reflected visibility state managed by component state |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Optional static, non-interactive supplementary content |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Live-region wrapper carrying role and ARIA attributes |
| `message` | `<div>` | Current message text |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-alert-gap` | `var(--cv-space-2, 8px)` | Gap between message and slotted content |
| `--cv-alert-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding for alert container |
| `--cv-alert-padding-block` | `var(--cv-space-2, 8px)` | Vertical padding for alert container |
| `--cv-alert-radius` | `var(--cv-radius-sm, 6px)` | Border radius |
| `--cv-alert-border-color` | `var(--cv-color-border, #2a3245)` | Border color |
| `--cv-alert-background` | `var(--cv-color-surface-elevated, #1d2432)` | Background color |
| `--cv-alert-color` | `var(--cv-color-text, #e8ecf6)` | Text color |
| `--cv-alert-transition-duration` | `var(--cv-duration-fast, 120ms)` | Transition duration for show/hide |
| `--cv-alert-transition-easing` | `var(--cv-easing-standard, ease)` | Transition timing function |
| `--cv-alert-hidden-translate-y` | `-2px` | Vertical offset when hidden |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([visible])` | Visible state; base is fully opaque and interactive |
| `:host(:not([visible]))` | Hidden state; base fades and translates slightly upward |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{visible: boolean, message: string}` | Fires when alert state updates |
| `cv-change` | `{visible: boolean, message: string}` | Fires when visibility toggles |

## Accessibility

- Root element always uses `role="alert"`.
- `aria-live` and `aria-atomic` are sourced from headless `getAlertProps()`.
- Component is passive and does not move focus or manage keyboard interaction.
- For interactive/decision-required flows, use `cv-alert-dialog`.

## Usage

```html
<cv-alert id="saved-alert"></cv-alert>

<script type="module">
  const alert = document.getElementById('saved-alert')
  alert.show('Configuration saved successfully')
</script>
```
