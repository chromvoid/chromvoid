# cv-progress-ring

A read-only circular indicator that communicates determinate or indeterminate loading/completion progress via an SVG ring.

**Headless:** [`createProgress`](../../../headless/specs/components/progress.md)

## Anatomy

```
<cv-progress-ring> (host)
└── <div part="base" role="progressbar">
    └── <svg part="svg" viewBox="0 0 100 100">
    │   ├── <circle part="track">
    │   └── <circle part="indicator">
    └── <span part="label">
        └── <slot>
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | Number | `0` | Current progress value; clamped to `[min, max]` |
| `min` | Number | `0` | Minimum boundary |
| `max` | Number | `100` | Maximum boundary |
| `indeterminate` | Boolean | `false` | Switches to indeterminate (spinning animation) mode |
| `value-text` | String | — | Static override for `aria-valuetext`; takes precedence over the percentage fallback |
| `aria-label` | String | — | Accessible label passed through to headless |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Label content rendered inside the ring (e.g. percentage text) |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Outer container with `role="progressbar"` |
| `svg` | `<svg>` | SVG element containing track and indicator circles |
| `track` | `<circle>` | Background circle representing the full track |
| `indicator` | `<circle>` | Foreground arc representing current progress |
| `label` | `<span>` | Content overlay centered inside the ring; wraps the default slot |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-progress-ring-size` | `80px` | Diameter of the ring (sets both inline-size and block-size) |
| `--cv-progress-ring-track-width` | `4px` | Stroke width of the background track circle |
| `--cv-progress-ring-indicator-width` | `4px` | Stroke width of the progress indicator arc |
| `--cv-progress-ring-track-color` | `var(--cv-color-surface, #141923)` | Background color of the track circle stroke |
| `--cv-progress-ring-indicator-color` | `var(--cv-color-primary, #65d7ff)` | Color of the filled indicator arc stroke |
| `--cv-progress-ring-label-color` | `var(--cv-color-text, #e8ecf6)` | Text color for the label slot content |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([indeterminate])` | Spinning/rotating animation on the indicator arc; indicator has a fixed arc length |
| `:host([data-complete])` | Success appearance when `value >= max` (indicator stroke uses `--cv-color-success`) |

## Reactive State Mapping

`cv-progress-ring` is a visual adapter over headless `createProgress`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` | attr -> action | `actions.setValue(value)` |
| `min` | attr -> option | Passed as `min` in `createProgress(options)` |
| `max` | attr -> option | Passed as `max` in `createProgress(options)` |
| `indeterminate` | attr -> action | `actions.setIndeterminate(value)` |
| `value-text` | attr -> option | Passed as `valueText` in `createProgress(options)` |
| `aria-label` | attr -> option | Passed as `ariaLabel` in `createProgress(options)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.percentage()` | state -> style | Sets `stroke-dashoffset` on the indicator `<circle>` to represent the filled arc |
| `state.isIndeterminate()` | state -> attr | `[indeterminate]` host attribute |
| `state.isComplete()` | state -> attr | `[data-complete]` host attribute |

- `contracts.getProgressProps()` is spread onto the inner `[part="base"]` element to apply `role`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext`, `aria-label`, and `id`.
- ARIA value attributes are present only in determinate mode; headless omits them in indeterminate mode.
- `aria-valuetext` resolution order (determinate only): `valueText` static override > rounded percentage fallback.
- UIKit does not own clamping, completion, or percentage logic; headless state is the source of truth.

## Events

None. `cv-progress-ring` is a read-only indicator with no user-modifiable state.

## Usage

```html
<!-- Basic determinate -->
<cv-progress-ring value="40" aria-label="Upload progress"></cv-progress-ring>

<!-- With label slot -->
<cv-progress-ring value="72" aria-label="Download">72%</cv-progress-ring>

<!-- Custom range -->
<cv-progress-ring value="3" min="0" max="10" aria-label="Steps completed">
  3/10
</cv-progress-ring>

<!-- Custom aria-valuetext -->
<cv-progress-ring value="3" max="10" value-text="Step 3 of 10" aria-label="Wizard progress">
</cv-progress-ring>

<!-- Indeterminate -->
<cv-progress-ring indeterminate aria-label="Loading"></cv-progress-ring>

<!-- Custom sizing and stroke widths -->
<cv-progress-ring
  value="60"
  aria-label="Battery"
  style="
    --cv-progress-ring-size: 120px;
    --cv-progress-ring-track-width: 8px;
    --cv-progress-ring-indicator-width: 8px;
    --cv-progress-ring-indicator-color: limegreen;
  "
>60%</cv-progress-ring>

<!-- Small ring with thin stroke -->
<cv-progress-ring
  value="80"
  aria-label="Completion"
  style="
    --cv-progress-ring-size: 40px;
    --cv-progress-ring-track-width: 2px;
    --cv-progress-ring-indicator-width: 3px;
  "
></cv-progress-ring>
```
