# Slider Component Contract

## Purpose

`Slider` provides a headless APG-aligned model for an input where the user selects a value from within a given range.

It handles range constraints, step increments, and standard keyboard navigation for single-thumb sliders.

## Component Files

- `src/slider/index.ts` - model and public `createSlider` API
- `src/slider/slider.test.ts` - unit behavior tests

## Public API

- `createSlider(options)`
- `state` (signal-backed):
  - `value()`: `number`
  - `min()`: `number`
  - `max()`: `number`
  - `step()`: `number`
  - `percentage()`: `number` (0 to 100)
  - `isDisabled()`: `boolean`
- `actions`:
  - `setValue(value)`: sets the value within constraints
  - `increment()`, `decrement()`
  - `incrementLarge()`, `decrementLarge()`
  - `setFirst()`, `setLast()`
  - `handleKeyDown(event)`
- `contracts`:
  - `getRootProps()`
  - `getThumbProps()`
  - `getTrackProps()`

## APG and A11y Contract

- thumb role: `slider`
- `aria-valuenow`: current value
- `aria-valuemin`: minimum value
- `aria-valuemax`: maximum value
- `aria-valuetext`: optional string representation of the value
- `aria-orientation`: `"horizontal" | "vertical"`
- `aria-disabled`: boolean
- `tabindex`: `0` on the thumb

## Behavior Contract

- `ArrowRight` / `ArrowUp` increments the value by `step`.
- `ArrowLeft` / `ArrowDown` decrements the value by `step`.
- `PageUp` increments the value by a larger step (default 10% of range).
- `PageDown` decrements the value by a larger step.
- `Home` sets the value to `min`.
- `End` sets the value to `max`.
- Values are always clamped between `min` and `max`.
- Values are always snapped to the nearest `step` increment.

## Invariants

- `min <= value <= max`
- `min < max`
- `step > 0`

## Minimum Test Matrix

- value clamping at min/max boundaries
- step increment/decrement behavior
- large step (PageUp/PageDown) behavior
- Home/End key behavior
- vertical orientation keyboard parity
- snapping to nearest step on manual `setValue`
- disabled state prevents value changes

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- multiple thumbs (see `SliderMultiThumb` spec)
- non-linear scales (logarithmic, etc.)
- inverted ranges (max < min)
