# cv-toast-region

Container that manages a queue of toast notifications with positioning, stacking layout, and auto-dismiss lifecycle.

**Headless:** [`createToast`](../../../headless/specs/components/toast.md)

## Anatomy

```
<cv-toast-region> (host)
└── <section part="base" role="region" aria-live="polite" aria-atomic="false">
    ├── <cv-toast part="item" role="status|alert" data-level="info">
    ├── <cv-toast part="item" role="alert" data-level="error">
    └── …
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `position` | String | `"top-end"` | Positioning of the region: `top-start` \| `top-center` \| `top-end` \| `bottom-start` \| `bottom-center` \| `bottom-end` |
| `max-visible` | Number | `3` | Maximum number of toasts displayed simultaneously |

## Slots

| Slot | Description |
|------|-------------|
| _(none)_ | Content is rendered programmatically from the toast queue; no user-facing slots |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<section>` | Root region element with `role="region"` and `aria-live` |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-toast-region-gap` | `var(--cv-space-2, 8px)` | Spacing between stacked toasts |
| `--cv-toast-region-inset` | `var(--cv-space-4, 16px)` | Distance from viewport edges |
| `--cv-toast-region-z-index` | `9999` | Stacking order above page content |
| `--cv-toast-region-max-width` | `420px` | Maximum width of the toast region |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([position="top-start"])` | Region fixed to top-left |
| `:host([position="top-center"])` | Region fixed to top-center |
| `:host([position="top-end"])` | Region fixed to top-right (default) |
| `:host([position="bottom-start"])` | Region fixed to bottom-left |
| `:host([position="bottom-center"])` | Region fixed to bottom-center |
| `:host([position="bottom-end"])` | Region fixed to bottom-right |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-close` | `{ id: string }` | Fires when a toast is removed from the queue (auto-dismiss or explicit dismiss) |

## Reactive State Mapping

`cv-toast-region` is a visual adapter over headless `createToast`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `max-visible` | attr → option | Passed as `maxVisible` in `createToast(options)` |
| _(controller)_ | property | `createToastController()` wraps `createToast()` and exposes `push`, `dismiss`, `clear`, `pause`, `resume` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.visibleItems()` | state → render | Drives the rendered list of `cv-toast` items |
| `state.isPaused()` | state → internal | Tracked internally; toggled by `mouseenter`/`mouseleave` on `[part="base"]` |

- `contracts.getRegionProps()` is spread onto the inner `[part="base"]` element to apply `id`, `role="region"`, `aria-live`, and `aria-atomic`.
- `mouseenter` on `[part="base"]` calls `actions.pause()`; `mouseleave` calls `actions.resume()`.
- UIKit tracks the previous set of toast IDs across renders and dispatches a `cv-close` event for each ID that disappears from the queue.
- UIKit does not own queue logic, timer management, or visibility slicing; headless state is the source of truth.

## Usage

```html
<!-- Basic usage (imperative API via controller) -->
<cv-toast-region></cv-toast-region>

<script>
  const region = document.querySelector('cv-toast-region');
  region.controller.push({ message: 'File saved', level: 'success' });
  region.controller.push({ message: 'Connection lost', level: 'error', durationMs: 0 });
</script>

<!-- Positioned bottom-center -->
<cv-toast-region position="bottom-center"></cv-toast-region>
```

## Child Elements

### cv-toast

Individual toast notification item rendered within `cv-toast-region`. Displays a message with severity-based styling, an optional icon, and an optional dismiss button.

#### Anatomy

```
<cv-toast> (host)
└── <div part="base" role="status|alert" data-level="info">
    ├── <span part="icon">
    │   └── <slot name="icon">         ← severity icon
    ├── <div part="content">
    │   └── <span part="label">
    │       └── <slot>                  ← message text
    └── <button part="dismiss">        ← only when closable
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `level` | String | `"info"` | Severity level: `info` \| `success` \| `warning` \| `error` |
| `closable` | Boolean | `true` | Whether the dismiss button is shown |
| `toast-id` | String | `""` | Identifier for the toast, included in the `cv-close` event detail |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Message text content |
| `icon` | Severity icon; overrides the default icon for the level |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root wrapper for the toast item with `role` and `data-level` |
| `icon` | `<span>` | Wrapper around the `icon` slot |
| `content` | `<div>` | Wrapper around the message area |
| `label` | `<span>` | Wrapper around the default slot (message text) |
| `dismiss` | `<button>` | Dismiss/close button |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-toast-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding |
| `--cv-toast-padding-block` | `var(--cv-space-2, 8px)` | Vertical padding |
| `--cv-toast-border-radius` | `var(--cv-radius-md, 10px)` | Border radius |
| `--cv-toast-gap` | `var(--cv-space-2, 8px)` | Spacing between icon, content, and dismiss button |
| `--cv-toast-background` | `var(--cv-color-surface-elevated, #1d2432)` | Background color |
| `--cv-toast-border-color` | `var(--cv-color-border, #2a3245)` | Default border color |
| `--cv-toast-color` | `var(--cv-color-text, #e8ecf6)` | Text color |
| `--cv-toast-shadow` | `var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24))` | Box shadow |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Base border color |
| `--cv-color-surface-elevated` | `#1d2432` | Elevated surface background |
| `--cv-color-text` | `#e8ecf6` | Default text color |
| `--cv-color-text-muted` | `#9aa6bf` | Muted text color (dismiss button) |
| `--cv-color-primary` | `#65d7ff` | Primary accent (focus ring) |
| `--cv-color-success` | `#6ef7c8` | Success tint for border |
| `--cv-color-warning` | `#ffd36e` | Warning tint for border |
| `--cv-color-danger` | `#ff7d86` | Error/danger tint for border |
| `--cv-radius-md` | `10px` | Medium border radius |
| `--cv-radius-sm` | `6px` | Small border radius (dismiss button) |
| `--cv-space-2` | `8px` | Spacing scale |
| `--cv-space-3` | `12px` | Spacing scale |

#### Visual States

| Host selector / Part selector | Description |
|-------------------------------|-------------|
| `[data-level="info"]` | Default styling with standard border |
| `[data-level="success"]` | Border tinted with `--cv-color-success` via `color-mix()` |
| `[data-level="warning"]` | Border tinted with `--cv-color-warning` via `color-mix()` |
| `[data-level="error"]` | Border tinted with `--cv-color-danger` via `color-mix()` |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-close` | `{ id: string }` | Fires when the dismiss button is clicked; bubbles and is composed |

#### Reactive State Mapping

Each toast item is bound to headless contracts per toast ID.

| Headless Contract | Direction | DOM Binding |
|-------------------|-----------|-------------|
| `contracts.getToastProps(id)` | state → attrs | Spread onto `[part="base"]`: `id`, `role` (`status` or `alert`), `data-level` |
| `contracts.getDismissButtonProps(id)` | state → attrs | Spread onto `[part="dismiss"]`: `id`, `role="button"`, `tabindex="0"`, `aria-label`, `onClick` handler |

- `role` is determined by the headless contract based on level: `role="status"` for `info`/`success`, `role="alert"` for `warning`/`error`.
- In standalone usage, `cv-toast` computes role from its `level` property matching the headless contract logic.
- When rendered within `cv-toast-region`, the region spreads headless contract props onto each inline toast item.
- The dismiss button `onClick` handler from `getDismissButtonProps(id)` calls `actions.dismiss(id)` internally.
