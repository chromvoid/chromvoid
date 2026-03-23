# Multi-Thumb Slider Component Contract

## Purpose

`SliderMultiThumb` provides a headless APG-aligned model for a range input with multiple handles (thumbs), typically used for selecting a sub-range (e.g., price range).

It handles multi-value state, thumb collision/crossing prevention, and independent keyboard navigation for each thumb.

## Component Files

- `src/slider-multi-thumb/index.ts` - model and public `createSliderMultiThumb` API
- `src/slider-multi-thumb/slider-multi-thumb.test.ts` - unit behavior tests

## Public API

- `createSliderMultiThumb(options)`
- `state` (signal-backed):
  - `values()`: `number[]`
  - `min()`: `number`
  - `max()`: `number`
  - `step()`: `number`
  - `activeThumbIndex()`: `number | null`
  - `isDisabled()`: `boolean`
- `actions`:
  - `setValue(index, value)`: sets a specific thumb's value
  - `increment(index)`, `decrement(index)`
  - `incrementLarge(index)`, `decrementLarge(index)`
  - `handleKeyDown(index, event)`
- `contracts`:
  - `getRootProps()`
  - `getThumbProps(index)`
  - `getTrackProps()`

## APG and A11y Contract

- each thumb role: `slider`
- `aria-valuenow`: current value of the specific thumb
- `aria-valuemin`: minimum possible value for this thumb (often constrained by adjacent thumbs)
- `aria-valuemax`: maximum possible value for this thumb
- `aria-orientation`: `"horizontal" | "vertical"`
- `tabindex`: `0` on each thumb
- linkage: each thumb should have an `aria-label` or `aria-labelledby` identifying its purpose (e.g., "Minimum price", "Maximum price")

## Behavior Contract

- Keyboard interactions (`Arrows`, `PageUp/Down`, `Home`, `End`) apply to the currently focused thumb.
- Thumbs are constrained by the global `min` and `max`.
- By default, thumbs cannot cross each other (e.g., `values[0] <= values[1]`).
- Moving a thumb to its limit (adjacent thumb or range boundary) stops the movement.
- Optional "push" behavior: moving one thumb can push adjacent thumbs if they collide (out of scope for baseline).

## Invariants

- `min <= values[i] <= max` for all `i`.
- `values[i] <= values[i+1]` (non-crossing invariant).
- `activeThumbIndex` refers to the thumb that last received focus or interaction.

## Minimum Test Matrix

- independent thumb movement via keyboard
- collision prevention (thumb 0 cannot exceed thumb 1)
- boundary constraints (min/max)
- Home/End behavior for each thumb (Home on thumb 1 moves it to thumb 0's value or min)
- snapping to step for all thumbs
- correct `aria-valuemin/max` updates when adjacent thumbs move

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- crossing thumbs (where `values[0] > values[1]` is allowed)
- dynamic thumb addition/removal
- non-linear scales
