# cv-badge

Non-interactive status indicator that displays short labels, counts, or colored dots.

**Headless:** [`createBadge`](../../../headless/specs/components/badge.md)

## Anatomy

```
<cv-badge> (host)
└── <div part="base">
    ├── <span part="prefix">
    │   └── <slot name="prefix">
    ├── <span part="label">           ← hidden when [dot]
    │   └── <slot>
    └── <span part="suffix">
        └── <slot name="suffix">
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `variant` | String | `"neutral"` | Visual variant: `"primary"` \| `"success"` \| `"neutral"` \| `"warning"` \| `"danger"` |
| `size` | String | `"medium"` | Size: `"small"` \| `"medium"` \| `"large"` |
| `dot` | Boolean | `false` | Dot mode: hides textual content, shows a colored circle indicator |
| `pulse` | Boolean | `false` | Enables a pulsing animation to draw attention |
| `pill` | Boolean | `false` | Fully rounded edges (`border-radius: 999px`) |
| `dynamic` | Boolean | `false` | Enables live-region semantics for runtime content changes |
| `decorative` | Boolean | `false` | Hides the badge from assistive technology |

## Variants

| Variant | Description |
|---------|-------------|
| `neutral` | Default muted style with surface background and border |
| `primary` | Primary-tinted background and border using `--cv-color-primary` |
| `success` | Success-tinted background and border using `--cv-color-success` |
| `warning` | Warning-tinted background and border using `--cv-color-warning` |
| `danger` | Danger-tinted background and border using `--cv-color-danger` |

The `dot`, `pulse`, and `pill` boolean modifiers can be combined with any variant.

## Sizes

| Size | `--cv-badge-height` | `--cv-badge-padding-inline` | `--cv-badge-font-size` | `--cv-badge-dot-size` |
|------|----------------------|-----------------------------|------------------------|-----------------------|
| `small` | `20px` | `var(--cv-space-1, 4px)` | `11px` | `6px` |
| `medium` | `24px` | `var(--cv-space-2, 8px)` | `12px` | `8px` |
| `large` | `28px` | `var(--cv-space-3, 12px)` | `14px` | `10px` |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Badge label (hidden in dot mode) |
| `prefix` | Icon or element before label |
| `suffix` | Icon or element after label |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root wrapper element; receives headless `getBadgeProps()` ARIA attributes |
| `label` | `<span>` | Wrapper around the default slot (hidden when `dot` is `true`) |
| `prefix` | `<span>` | Wrapper around the `prefix` slot |
| `suffix` | `<span>` | Wrapper around the `suffix` slot |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-badge-height` | `24px` | Block size of the badge |
| `--cv-badge-padding-inline` | `var(--cv-space-2, 8px)` | Horizontal padding |
| `--cv-badge-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius for badge shape |
| `--cv-badge-gap` | `var(--cv-space-1, 4px)` | Spacing between badge content parts |
| `--cv-badge-font-size` | `12px` | Font size of badge content |
| `--cv-badge-dot-size` | `8px` | Diameter of the dot indicator in dot mode |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Base border color |
| `--cv-color-surface` | `#141923` | Surface background color |
| `--cv-color-text` | `#e8ecf6` | Default text color |
| `--cv-color-primary` | `#65d7ff` | Primary accent color |
| `--cv-color-success` | `#5beba0` | Success accent color |
| `--cv-color-warning` | `#ffc857` | Warning accent color |
| `--cv-color-danger` | `#ff7d86` | Danger accent color |
| `--cv-duration-fast` | `120ms` | Transition duration |
| `--cv-easing-standard` | `ease` | Transition timing function |
| `--cv-radius-sm` | `6px` | Base radius used for badge fallback |
| `--cv-space-1` | `4px` | Small spacing scale fallback |
| `--cv-space-2` | `8px` | Medium spacing scale fallback |
| `--cv-space-3` | `12px` | Medium-large spacing scale fallback |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([variant="neutral"])` | Default muted background with border |
| `:host([variant="primary"])` | Primary-tinted background and border |
| `:host([variant="success"])` | Success-tinted background and border |
| `:host([variant="warning"])` | Warning-tinted background and border |
| `:host([variant="danger"])` | Danger-tinted background and border |
| `:host([dot])` | Dot mode: hides label/prefix/suffix, renders a colored circle of `--cv-badge-dot-size` |
| `:host([pulse])` | Applies a repeating scale/opacity animation to draw attention |
| `:host([pill])` | Fully rounded edges (`border-radius: 999px`) |
| `:host([size="small"])` | Small size overrides |
| `:host([size="large"])` | Large size overrides |
| `:host([dot][pulse])` | Dot with pulse animation combined |
| `:host([decorative])` | Decorative mode; no visual change, ARIA-hidden via headless |

## Reactive State Mapping

`cv-badge` is a visual adapter over headless `createBadge`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `variant` | attr -> action | `actions.setVariant(value)` |
| `size` | attr -> action | `actions.setSize(value)` |
| `dot` | attr -> action | `actions.setDot(value)` |
| `pulse` | attr -> action | `actions.setPulse(value)` |
| `pill` | attr -> action | `actions.setPill(value)` |
| `dynamic` | attr -> action | `actions.setDynamic(value)` |
| `decorative` | attr -> action | `actions.setDecorative(value)` |
| `aria-label` | attr -> option | passed as `ariaLabel` in `createBadge(options)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.variant()` | state -> attr | `[variant]` host attribute |
| `state.size()` | state -> attr | `[size]` host attribute |
| `state.dot()` | state -> attr | `[dot]` host attribute |
| `state.pulse()` | state -> attr | `[pulse]` host attribute |
| `state.pill()` | state -> attr | `[pill]` host attribute |
| `state.isEmpty()` | state -> DOM | Hides `[part="label"]`, `[part="prefix"]`, `[part="suffix"]` when `true` |

- `contracts.getBadgeProps()` is spread onto the inner `[part="base"]` element to apply `role`, `aria-live`, `aria-atomic`, `aria-hidden`, and `aria-label` as applicable.
- UIKit does not own ARIA logic; headless state is the source of truth for all accessibility attributes.
- Badge is non-interactive: no `tabindex`, no keyboard handlers, no focus management.

## Events

Badge is non-interactive. No `input`, `change`, or custom events are emitted.

## Usage

```html
<cv-badge>Default</cv-badge>

<cv-badge variant="primary">New</cv-badge>

<cv-badge variant="success">Active</cv-badge>

<cv-badge variant="warning">Pending</cv-badge>

<cv-badge variant="danger">Error</cv-badge>

<cv-badge variant="danger" dot></cv-badge>

<cv-badge variant="primary" dot pulse aria-label="New notifications"></cv-badge>

<cv-badge variant="primary" pill>Badge</cv-badge>

<cv-badge variant="success" size="small">3</cv-badge>

<cv-badge variant="danger" size="large">99+</cv-badge>

<cv-badge dynamic variant="primary">5</cv-badge>

<cv-badge decorative variant="neutral">Info</cv-badge>

<cv-badge variant="primary">
  <icon-circle slot="prefix"></icon-circle>
  Online
</cv-badge>

<cv-badge variant="danger">
  Alerts
  <icon-bell slot="suffix"></icon-bell>
</cv-badge>
```
