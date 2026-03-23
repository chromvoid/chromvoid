# cv-meter

Graphical display of a numeric value within a known range, such as disk usage or password strength.

**Headless:** [`createMeter`](../../../headless/specs/components/meter.md)

## Anatomy

```
<cv-meter> (host)
└── <div part="base" role="meter">
    └── <div part="indicator" data-status="…">
        └── <span part="label">
            └── <slot>
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | Number | `0` | Current measured value |
| `min` | Number | `0` | Minimum of the range |
| `max` | Number | `100` | Maximum of the range (percentage convention) |
| `low` | Number | — | Low threshold boundary |
| `high` | Number | — | High threshold boundary |
| `optimum` | Number | — | Optimum value within the range |
| `value-text` | String | `""` | Custom `aria-valuetext` string |
| `aria-label` | String | — | Accessible label |
| `aria-labelledby` | String | — | ID of labelling element |
| `aria-describedby` | String | — | ID of describing element |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Custom label content rendered inside the indicator |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root meter element with `role="meter"` |
| `indicator` | `<div>` | Fill bar reflecting current percentage and status zone |
| `label` | `<span>` | Wrapper around the default slot inside the indicator |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-meter-height` | `10px` | Block size of the meter track |
| `--cv-meter-border-radius` | `999px` | Border radius of the track and indicator |
| `--cv-meter-transition-duration` | `var(--cv-duration-normal, 220ms)` | Transition duration for indicator width |
| `--cv-meter-optimum-color` | `var(--cv-color-success, #6ef7c8)` | Indicator color when status is `optimum` |
| `--cv-meter-suboptimum-color` | `var(--cv-color-warning, #ffbe65)` | Indicator color when status is `low` (sub-optimum) |
| `--cv-meter-danger-color` | `var(--cv-color-danger, #ff7a8a)` | Indicator color when status is `high` (danger zone) |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Track border color |
| `--cv-color-surface` | `#141923` | Track background color |
| `--cv-color-primary` | `#65d7ff` | Default indicator color (normal status) |
| `--cv-color-success` | `#6ef7c8` | Optimum zone color fallback |
| `--cv-color-warning` | `#ffbe65` | Sub-optimum (low) zone color fallback |
| `--cv-color-danger` | `#ff7a8a` | Danger (high) zone color fallback |
| `--cv-duration-normal` | `220ms` | Transition duration fallback |
| `--cv-easing-standard` | `ease` | Transition timing function |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `[data-status="normal"]` | Default indicator color using `--cv-color-primary` |
| `[data-status="optimum"]` | Indicator uses `--cv-meter-optimum-color` |
| `[data-status="low"]` | Indicator uses `--cv-meter-suboptimum-color` |
| `[data-status="high"]` | Indicator uses `--cv-meter-danger-color` |

Note: `data-status` is set on the `[part="indicator"]` element, not on the host. The status value is derived entirely from the headless model's `state.status()` computed signal.

## Reactive State Mapping

`cv-meter` is a visual adapter over headless `createMeter`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` | attr → action | `actions.setValue(value)` |
| `min` | attr → option | passed to `createMeter(options)` |
| `max` | attr → option | passed to `createMeter(options)` |
| `low` | attr → option | passed to `createMeter(options)` |
| `high` | attr → option | passed to `createMeter(options)` |
| `optimum` | attr → option | passed to `createMeter(options)` |
| `value-text` | attr → option | passed as `formatValueText` callback to `createMeter(options)` |
| `aria-label` | attr → option | passed as `ariaLabel` to `createMeter(options)` |
| `aria-labelledby` | attr → option | passed as `ariaLabelledBy` to `createMeter(options)` |
| `aria-describedby` | attr → option | passed as `ariaDescribedBy` to `createMeter(options)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.percentage()` | state → style | `--cv-meter-width` inline style on `[part="indicator"]` |
| `state.status()` | state → attr | `data-status` attribute on `[part="indicator"]` |

- `contracts.getMeterProps()` is spread onto the `[part="base"]` element to apply `role`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext`, `aria-label`, `aria-labelledby`, and `aria-describedby`.
- When `min`, `max`, `low`, `high`, `optimum`, `value-text`, or ARIA attributes change, the headless model is recreated with new options.
- When only `value` changes, `actions.setValue(value)` is called without recreating the model.
- UIKit does not compute percentage, status, or ARIA attributes itself. All derived state comes from the headless model.

## Events

None. Meter is an output-only (read-only) component with no user interaction.

## ARIA

All accessibility semantics are provided by the headless contract `getMeterProps()`:

- `role="meter"` on `[part="base"]`
- `aria-valuenow` reflecting current value
- `aria-valuemin` reflecting minimum
- `aria-valuemax` reflecting maximum
- `aria-valuetext` when `value-text` attribute is set (via `formatValueText` callback)
- `aria-label`, `aria-labelledby`, `aria-describedby` pass-through when provided

The UIKit layer does not construct any ARIA attributes directly.

## Usage

```html
<!-- Basic percentage meter -->
<cv-meter value="75"></cv-meter>

<!-- With explicit range -->
<cv-meter value="6" min="0" max="10"></cv-meter>

<!-- With thresholds for status zones -->
<cv-meter value="30" low="25" high="75" optimum="50"></cv-meter>

<!-- With accessible label -->
<cv-meter value="80" aria-label="Disk usage"></cv-meter>

<!-- With custom value text -->
<cv-meter value="80" value-text="80% used"></cv-meter>

<!-- With custom label content in default slot -->
<cv-meter value="65">
  65%
</cv-meter>

<!-- Danger zone example (value exceeds high threshold) -->
<cv-meter value="92" low="20" high="80" optimum="50">
  Critical
</cv-meter>
```
