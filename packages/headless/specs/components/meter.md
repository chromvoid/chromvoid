# Meter Component Contract

## Purpose

`Meter` provides a headless APG-aligned model for a graphical display of a numeric value within a known range (e.g., disk usage, password strength).

Unlike a progress bar, a meter represents a static measurement rather than the progress of a task.

## Component Files

- `src/meter/index.ts` - model and public `createMeter` API
- `src/meter/meter.test.ts` - unit behavior tests

## Options

`createMeter(options?: CreateMeterOptions)` accepts:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `idBase` | `string` | `'meter'` | Prefix for generated element IDs |
| `value` | `number` | `min` | Initial measured value |
| `min` | `number` | `0` | Minimum of the range |
| `max` | `number` | `100` | Maximum of the range (percentage convention) |
| `low` | `number` | — | Low threshold boundary |
| `high` | `number` | — | High threshold boundary |
| `optimum` | `number` | — | Optimum value within the range |
| `ariaLabel` | `string` | — | Accessible label |
| `ariaLabelledBy` | `string` | — | ID of labelling element |
| `ariaDescribedBy` | `string` | — | ID of describing element |
| `formatValueText` | `(value: number) => string` | — | Custom formatter for `aria-valuetext` |

## Public API

- `createMeter(options)` returns `MeterModel`
- `state` (signal-backed):
  - `value`: `Atom<number>` — current measured value
  - `min`: `Atom<number>` — minimum of the range
  - `max`: `Atom<number>` — maximum of the range
  - `percentage`: `Computed<number>` — `(value - min) / (max - min) * 100`, rounded to 4 decimal places; 0 when span is zero
  - `status`: `Computed<MeterStatus>` — derived zone: `'low' | 'high' | 'optimum' | 'normal'`
- `actions`:
  - `setValue(value: number)`: updates the measured value (clamped to `[min, max]`)
- `contracts`:
  - `getMeterProps()`: returns a spread-ready ARIA attribute map (`MeterProps`)

### `MeterProps` Shape

```ts
{
  id: string                    // `${idBase}-root`
  role: 'meter'
  'aria-valuenow': string       // String(value)
  'aria-valuemin': string       // String(min)
  'aria-valuemax': string       // String(max)
  'aria-valuetext'?: string     // formatValueText?.(value) if provided
  'aria-label'?: string         // from options
  'aria-labelledby'?: string    // from options
  'aria-describedby'?: string   // from options
}
```

## APG and A11y Contract

- role: `meter`
- `aria-valuenow`: current value (string)
- `aria-valuemin`: minimum value (string)
- `aria-valuemax`: maximum value (string)
- `aria-valuetext`: optional, produced by `formatValueText` callback
- linkage: supports `aria-label`, `aria-labelledby`, and `aria-describedby`

## Behavior Contract

- The component is read-only from a user interaction perspective (no keyboard/pointer input).
- Values are clamped between `min` and `max`.
- If `min >= max` is passed, values are swapped to enforce `min < max`.
- Thresholds (`low`, `high`, `optimum`) are normalized: clamped to `[min, max]`, and if `low > high` they are swapped.
- Status is calculated based on `low`, `high`, and `optimum` thresholds if provided in options.

### Status Derivation

Status is computed by `getMeterStatus(value, low, high, optimum)`:

1. If neither `low` nor `high` is set: return `'normal'`.
2. Determine region: `isInLowRegion = low != null && value < low`; `isInHighRegion = high != null && value > high`.
3. If `optimum` is set, check which region the optimum falls in:
   - If optimum is in the low region and value is also in the low region: `'optimum'`.
   - If optimum is in the high region and value is also in the high region: `'optimum'`.
   - If optimum is in the normal region and value is also in the normal region: `'optimum'`.
4. If value is in the low region: `'low'`.
5. If value is in the high region: `'high'`.
6. Otherwise: `'normal'`.

## Transitions Table

| Trigger | Action | State Change |
|---------|--------|-------------|
| Programmatic value update | `actions.setValue(n)` | `value` = clamp(n, min, max); `percentage` and `status` recompute |

Note: Meter has no user-interactive transitions (no keyboard/pointer). All state changes are programmatic via `setValue`.

## Invariants

- `min <= value <= max`.
- `min < max` (enforced by swapping if needed).
- If thresholds are provided: `min <= low <= high <= max` (enforced by normalization).
- `percentage` is always in `[0, 100]`.
- `status` is always one of `'low' | 'high' | 'optimum' | 'normal'`.

## Adapter Expectations

UIKit binds to the headless model as follows:

| Binding | Kind | Usage |
|---------|------|-------|
| `state.value` | signal read | Display current value |
| `state.min` | signal read | Range boundary |
| `state.max` | signal read | Range boundary |
| `state.percentage` | signal read | Indicator width (`width: ${percentage}%`) |
| `state.status` | signal read | Zone color mapping via CSS custom properties or class |
| `actions.setValue(n)` | action call | Update value from host property/attribute |
| `contracts.getMeterProps()` | contract spread | Spread onto the root meter element for ARIA compliance |

UIKit should **never** compute percentage, status, or ARIA attributes itself. All derived state comes from the headless model.

A default slot is supported in the UIKit layer for custom label content inside the indicator (visual concern only, no headless contract needed).

## Minimum Test Matrix

- value clamping at boundaries
- percentage calculation accuracy
- status derivation based on thresholds (low/high/optimum)
- correct `aria-valuenow/min/max` mapping
- `aria-valuetext` via `formatValueText` callback
- reactive updates when value changes
- threshold normalization (swap when low > high)
- min/max swap when min >= max

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- animation orchestration (handled by visual layer)
- multi-segment meters
- vertical vs horizontal orientation (semantic parity)
