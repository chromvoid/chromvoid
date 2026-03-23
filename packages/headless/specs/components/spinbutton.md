# Spinbutton Component Contract

## Purpose

`Spinbutton` provides a headless APG-aligned model for a numeric input that allows users to select a value by typing or using increment/decrement controls.

It handles numeric normalization (snap-to-step), optional range constraints, keyboard-driven value adjustments, and ARIA contracts.

## Component Files

- `src/spinbutton/index.ts` - model and public `createSpinbutton` API
- `src/spinbutton/spinbutton.test.ts` - unit behavior tests

## Public API

- `createSpinbutton(options)`
- `CreateSpinbuttonOptions`:
  - `idBase?: string`
  - `value?: number`
  - `min?: number`
  - `max?: number`
  - `step?: number`
  - `largeStep?: number`
  - `isDisabled?: boolean`
  - `isReadOnly?: boolean`
  - `ariaLabel?: string`
  - `ariaLabelledBy?: string`
  - `ariaDescribedBy?: string`
  - `formatValueText?: (value: number) => string`
  - `onValueChange?: (value: number) => void`
- `state` (signal-backed):
  - `value()`: `number`
  - `min()`: `number | undefined`
  - `max()`: `number | undefined`
  - `step()`: `number`
  - `largeStep()`: `number`
  - `isDisabled()`: `boolean`
  - `isReadOnly()`: `boolean`
  - `hasMin()`: `boolean`
  - `hasMax()`: `boolean`
- `actions`:
  - `setValue(value)`: sets the value with clamping and snapping
  - `increment()`, `decrement()`
  - `incrementLarge()`, `decrementLarge()`
  - `setFirst()`, `setLast()`
  - `setDisabled(value)`, `setReadOnly(value)`
  - `handleKeyDown(event)`
- `contracts`:
  - `getSpinbuttonProps()`
  - `getIncrementButtonProps()`
  - `getDecrementButtonProps()`

Range semantics:

- `min` / `max` are optional; when both are absent the model is truly unbounded.
- When both `min` and `max` are provided in reverse order, they are normalized so `min <= max`.
- Step snapping is anchored to `min` when provided, otherwise to `0`.

## APG and A11y Contract

- role: `spinbutton`
- `aria-valuenow`: current numeric value
- `aria-valuemin`: minimum value (if defined)
- `aria-valuemax`: maximum value (if defined)
- `aria-valuetext`: optional string representation
- `aria-disabled`: boolean
- `aria-readonly`: boolean
- increment/decrement button contracts expose `aria-disabled` when interaction is blocked by disabled/read-only state or by reaching a corresponding range boundary.

## Behavior Contract

- `ArrowUp` increments the value by `step`.
- `ArrowDown` decrements the value by `step`.
- `PageUp` increments the value by a larger step (default 10 \* `step`).
- `PageDown` decrements the value by a larger step.
- `Home` sets the value to `min` (if defined).
- `End` sets the value to `max` (if defined).
- Snapping to `step` occurs on all value changes (`nearest` strategy).
- `PageUp` / `PageDown` always apply `largeStep`; range boundaries only clamp when they exist.

## Transition Table

| Trigger                    | Guard                                  | Action                         | Next Value                            |
| -------------------------- | -------------------------------------- | ------------------------------ | ------------------------------------- |
| `setValue(v)`              | `!isDisabled && !isReadOnly`           | snap + optional clamp + commit | constrained `v`                       |
| `increment()`              | `!isDisabled && !isReadOnly`           | step up                        | `value + step` (clamped/snapped)      |
| `decrement()`              | `!isDisabled && !isReadOnly`           | step down                      | `value - step` (clamped/snapped)      |
| `incrementLarge()`         | `!isDisabled && !isReadOnly`           | large-step up                  | `value + largeStep` (clamped/snapped) |
| `decrementLarge()`         | `!isDisabled && !isReadOnly`           | large-step down                | `value - largeStep` (clamped/snapped) |
| `setFirst()`               | `!isDisabled && !isReadOnly && hasMin` | jump to min                    | `min`                                 |
| `setLast()`                | `!isDisabled && !isReadOnly && hasMax` | jump to max                    | `max`                                 |
| `handleKeyDown(ArrowUp)`   | handled key                            | `increment()`                  | stepped up value                      |
| `handleKeyDown(ArrowDown)` | handled key                            | `decrement()`                  | stepped down value                    |
| `handleKeyDown(PageUp)`    | handled key                            | `incrementLarge()`             | large-stepped value                   |
| `handleKeyDown(PageDown)`  | handled key                            | `decrementLarge()`             | large-stepped value                   |
| `handleKeyDown(Home)`      | handled key                            | `setFirst()`                   | min or unchanged                      |
| `handleKeyDown(End)`       | handled key                            | `setLast()`                    | max or unchanged                      |

## Invariants

- If `min` and `max` are defined, `min <= value <= max`.
- If `min` is undefined and `max` is undefined, value is unbounded.
- `step > 0`.
- `largeStep > 0`.
- Disabled or Read-only states prevent value changes via actions.

## Adapter Expectations

- UIKit reads these signals directly: `state.value`, `state.min`, `state.max`, `state.step`, `state.largeStep`, `state.isDisabled`, `state.isReadOnly`, `state.hasMin`, `state.hasMax`.
- UIKit calls only actions for mutations: `setValue`, `increment`, `decrement`, `incrementLarge`, `decrementLarge`, `setFirst`, `setLast`, `setDisabled`, `setReadOnly`, `handleKeyDown`.
- UIKit spreads contract outputs without recomputation:
  - `contracts.getSpinbuttonProps()` on the focusable spinbutton root.
  - `contracts.getIncrementButtonProps()` on increment control.
  - `contracts.getDecrementButtonProps()` on decrement control.
- UIKit may keep transient text input state, but committed numeric state MUST come from headless `state.value()`.
- UIKit must not reconstruct ARIA values (`aria-valuenow`, bounds, disabled/readonly) from parallel state.

## Minimum Test Matrix

- increment/decrement behavior
- large step (PageUp/PageDown) behavior
- Home/End behavior with defined/undefined boundaries
- value clamping and snapping
- unbounded behavior when no bounds are defined
- boundary-specific disabled semantics for increment/decrement button contracts
- disabled and read-only state enforcement
- keyboard interaction parity with APG

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/\* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/_, apps/_, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- non-numeric spinbuttons (e.g., days of the week)
- custom string parsing (handled by adapters)
- acceleration (increasing step size when holding buttons)
