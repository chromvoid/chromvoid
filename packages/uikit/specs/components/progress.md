# cv-progress

A read-only indicator that communicates determinate or indeterminate loading/completion progress.

**Headless:** [`createProgress`](../../../headless/specs/components/progress.md)

## Anatomy

```
<cv-progress> (host)
└── <div part="base" role="progressbar">
    └── <div part="indicator">
        └── <span part="label">
            └── <slot>
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | Number | `0` | Current progress value; clamped to `[min, max]` |
| `min` | Number | `0` | Minimum boundary |
| `max` | Number | `100` | Maximum boundary |
| `indeterminate` | Boolean | `false` | Switches to indeterminate (animated) mode |
| `value-text` | String | — | Static override for `aria-valuetext`; takes precedence over the percentage fallback |
| `aria-label` | String | — | Accessible label passed through to headless |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Label content rendered inside the indicator (e.g. percentage text) |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Outer track container with `role="progressbar"` |
| `indicator` | `<div>` | Filled portion representing current progress |
| `label` | `<span>` | Content overlay inside indicator; wraps the default slot |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-progress-height` | `10px` | Block size (height) of the track |
| `--cv-progress-track-color` | `var(--cv-color-surface, #141923)` | Background color of the track |
| `--cv-progress-indicator-color` | `var(--cv-color-primary, #65d7ff)` | Base color of the filled indicator |
| `--cv-progress-label-color` | `var(--cv-color-text, #e8ecf6)` | Text color for the label slot content |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([indeterminate])` | Animated sliding bar; indicator width fixed, translateX animation |
| `:host([data-complete])` | Success appearance when `value >= max` (uses `--cv-color-success`) |

## Reactive State Mapping

`cv-progress` is a visual adapter over headless `createProgress`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` | attr → action | `actions.setValue(value)` |
| `min` | attr → option | Passed as `min` in `createProgress(options)` |
| `max` | attr → option | Passed as `max` in `createProgress(options)` |
| `indeterminate` | attr → action | `actions.setIndeterminate(value)` |
| `value-text` | attr → option | Passed as `valueText` in `createProgress(options)` |
| `aria-label` | attr → option | Passed as `ariaLabel` in `createProgress(options)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.percentage()` | state → style | Sets `--cv-progress-width` on indicator for inline-size |
| `state.isIndeterminate()` | state → attr | `[indeterminate]` host attribute |
| `state.isComplete()` | state → attr | `[data-complete]` host attribute |

- `contracts.getProgressProps()` is spread onto the inner `[part="base"]` element to apply `role`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext`, `aria-label`, and `id`.
- ARIA value attributes are present only in determinate mode; headless omits them in indeterminate mode.
- `aria-valuetext` resolution order (determinate only): `valueText` static override > rounded percentage fallback.
- UIKit does not own clamping or completion logic; headless state is the source of truth.

## Events

None. `cv-progress` is a read-only indicator with no user-modifiable state.

## Usage

```html
<!-- Basic determinate -->
<cv-progress value="40" aria-label="Upload progress"></cv-progress>

<!-- With label slot -->
<cv-progress value="72" aria-label="Download">72%</cv-progress>

<!-- Custom range -->
<cv-progress value="3" min="0" max="10" aria-label="Steps completed"></cv-progress>

<!-- Custom aria-valuetext -->
<cv-progress value="3" max="10" value-text="Step 3 of 10" aria-label="Wizard progress"></cv-progress>

<!-- Indeterminate -->
<cv-progress indeterminate aria-label="Loading"></cv-progress>

<!-- Styled via CSS custom properties -->
<cv-progress
  value="60"
  aria-label="Battery"
  style="--cv-progress-height: 16px; --cv-progress-indicator-color: limegreen;"
></cv-progress>
```
