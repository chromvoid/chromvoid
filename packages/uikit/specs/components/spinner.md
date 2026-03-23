# cv-spinner

Indeterminate loading spinner with SVG track and indicator animation.

**Headless:** [`createSpinner`](../../../headless/specs/components/spinner.md)

## Anatomy

```
<cv-spinner> (host)
└── <svg part="base" role="progressbar" aria-label="...">
    ├── <circle part="track">
    └── <circle part="indicator">
```

## Attributes

| Attribute | Type   | Default      | Description                                              |
| --------- | ------ | ------------ | -------------------------------------------------------- |
| `label`   | String | `"Loading"`  | Accessible name announced by assistive technology        |

No `size` attribute is provided. Sizing is controlled entirely via CSS `font-size` on the host element; the SVG scales relative to `1em`.

## Slots

None. The spinner is purely visual with no slotted content.

## CSS Parts

| Part        | Element    | Description                                      |
| ----------- | ---------- | ------------------------------------------------ |
| `base`      | `<svg>`    | Root SVG element with ARIA attributes             |
| `track`     | `<circle>` | Background circle (static ring)                  |
| `indicator` | `<circle>` | Animated arc indicating indeterminate progress   |

## CSS Custom Properties

| Property                       | Default                            | Description                              |
| ------------------------------ | ---------------------------------- | ---------------------------------------- |
| `--cv-spinner-track-width`     | `4px`                              | Stroke width of both track and indicator |
| `--cv-spinner-track-color`     | `var(--cv-color-border, #2a3245)`  | Color of the background track ring       |
| `--cv-spinner-indicator-color` | `var(--cv-color-primary, #65d7ff)` | Color of the animated indicator arc      |
| `--cv-spinner-speed`           | `600ms`                            | Duration of one full rotation cycle      |

## Visual States

None. The spinner is always animating when rendered; there are no conditional visual states.

## Events

None. The spinner is purely presentational and does not emit events.

## Reactive State Mapping

`cv-spinner` is a visual adapter over headless `createSpinner`.

| UIKit Property | Direction     | Headless Binding           |
| -------------- | ------------- | -------------------------- |
| `label`        | attr -> action | `actions.setLabel(value)` |

| Headless State   | Direction    | DOM Reflection                        |
| ---------------- | ------------ | ------------------------------------- |
| `state.label()`  | state -> contract | Consumed via `getSpinnerProps()` |

- `contracts.getSpinnerProps()` is spread onto the inner `[part="base"]` SVG element to apply `role="progressbar"` and `aria-label`.
- UIKit does not own ARIA semantics; headless state is the source of truth.
- `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-valuetext` are never present (indeterminate mode only).

## Usage

```html
<!-- Default spinner -->
<cv-spinner></cv-spinner>

<!-- Custom accessible label -->
<cv-spinner label="Saving changes"></cv-spinner>

<!-- Sized via CSS font-size -->
<cv-spinner style="font-size: 2rem;"></cv-spinner>

<!-- Themed via custom properties -->
<cv-spinner style="--cv-spinner-indicator-color: #ff7d86; --cv-spinner-speed: 800ms;"></cv-spinner>
```
