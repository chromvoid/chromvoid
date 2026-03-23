# Progress Component Contract

## Purpose

`Progress` provides a headless progressbar model for determinate and indeterminate loading states.

## Component Files

- `src/progress/index.ts` - model and public `createProgress` API
- `src/progress/progress.test.ts` - unit behavior tests

## Options (`CreateProgressOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `idBase` | `string` | `'progress'` | Prefix for atom debug names and generated element IDs |
| `value` | `number` | `min` | Initial value; clamped and snapped to range |
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `step` | `number` | `1` | Step size for `increment()`/`decrement()` (delegated to `createValueRange`) |
| `isIndeterminate` | `boolean` | `false` | Whether to start in indeterminate mode |
| `valueText` | `string \| undefined` | `undefined` | Static override for `aria-valuetext`; takes precedence over `formatValueText` and the percentage fallback |
| `ariaLabel` | `string \| undefined` | `undefined` | Passed through to `aria-label` |
| `ariaLabelledBy` | `string \| undefined` | `undefined` | Passed through to `aria-labelledby` |
| `ariaDescribedBy` | `string \| undefined` | `undefined` | Passed through to `aria-describedby` |
| `formatValueText` | `(value: number) => string \| undefined` | `undefined` | Custom formatter for `aria-valuetext`; used when `valueText` is not set |
| `onValueChange` | `(value: number) => void \| undefined` | `undefined` | Called when `value` actually changes (after clamping) |

## Public API

### `createProgress(options): ProgressModel`

### State (signal-backed)

| Signal | Type | Description |
|--------|------|-------------|
| `value()` | `Atom<number>` | Current value, clamped to `[min, max]` |
| `min()` | `Atom<number>` | Minimum boundary |
| `max()` | `Atom<number>` | Maximum boundary |
| `percentage()` | `Computed<number>` | Derived: `((value - min) / (max - min)) * 100` |
| `isIndeterminate()` | `Atom<boolean>` | Whether progress is in indeterminate mode |
| `isComplete()` | `Computed<boolean>` | Derived: `!isIndeterminate && value >= max` |

### Actions

| Action | Signature | Description |
|--------|-----------|-------------|
| `setValue` | `(value: number) => void` | Set value; clamped to range, fires `onValueChange` on actual change |
| `increment` | `() => void` | Increase value by `step`; clamped, fires `onValueChange` on actual change |
| `decrement` | `() => void` | Decrease value by `step`; clamped, fires `onValueChange` on actual change |
| `setIndeterminate` | `(value: boolean) => void` | Switch between determinate and indeterminate modes |

### Contracts

| Contract | Return type | Description |
|----------|-------------|-------------|
| `getProgressProps()` | `ProgressProps` | Ready-to-spread ARIA attribute map for the progressbar element |

#### `ProgressProps` shape

```ts
{
  id: string                     // `${idBase}-root`
  role: 'progressbar'
  'aria-valuenow'?: string       // present only in determinate mode
  'aria-valuemin'?: string       // present only in determinate mode
  'aria-valuemax'?: string       // present only in determinate mode
  'aria-valuetext'?: string      // present only in determinate mode (see resolution order below)
  'aria-label'?: string          // from options.ariaLabel
  'aria-labelledby'?: string     // from options.ariaLabelledBy
  'aria-describedby'?: string    // from options.ariaDescribedBy
}
```

`aria-valuetext` resolution order (determinate mode only):
1. `options.valueText` if set (static string override)
2. `options.formatValueText(value)` if provided
3. Rounded percentage fallback: `"${Math.round(percentage)}%"`

## APG and A11y Contract

- role: `progressbar`
- determinate mode attributes:
  - `aria-valuenow`
  - `aria-valuemin`
  - `aria-valuemax`
  - `aria-valuetext` (static override, custom formatter, or percentage fallback)
- indeterminate mode:
  - omit `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext`
- labeling:
  - `aria-label` or `aria-labelledby`
  - optional `aria-describedby`

## Keyboard Contract

- `Progress` is not keyboard-interactive as a widget role.
- `increment`/`decrement` actions are programmatic state APIs.

## Behavior Contract

- Value handling is delegated to `createValueRange` for clamping and step behavior.
- `onValueChange` fires only when value actually changes (after clamping).
- Completion state is computed as `!isIndeterminate && value >= max`.

## Transitions Table

| Trigger | Precondition | State change | Side effect |
|---------|-------------|-------------|-------------|
| `actions.setValue(v)` | any | `value` = clamp(v, min, max) | `onValueChange` if value changed |
| `actions.increment()` | any | `value` = clamp(value + step, min, max) | `onValueChange` if value changed |
| `actions.decrement()` | any | `value` = clamp(value - step, min, max) | `onValueChange` if value changed |
| `actions.setIndeterminate(true)` | determinate | `isIndeterminate` = true | `isComplete` recomputes to false |
| `actions.setIndeterminate(false)` | indeterminate | `isIndeterminate` = false | `isComplete` recomputes based on value/max |

## Invariants

- `value` must remain clamped to `[min, max]`.
- `isComplete` must be `false` whenever `isIndeterminate` is `true`.
- ARIA value attributes (`aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext`) must be present only in determinate mode.
- `aria-valuetext` resolution order: `valueText` > `formatValueText(value)` > rounded percentage string.
- `percentage` must equal `0` when `min === max`.

## Adapter Expectations

This section defines what UIKit (`cv-progress`) binds to from the headless model.

### Signals read by adapter

| Signal | UIKit usage |
|--------|-------------|
| `state.value()` | Not read directly; consumed via contracts |
| `state.percentage()` | Sets `--cv-progress-value` CSS custom property for indicator width |
| `state.isIndeterminate()` | Sets `indeterminate` attribute on host for CSS animation switching |
| `state.isComplete()` | Sets `complete` attribute on host for visual feedback |

### Actions called by adapter

| Action | UIKit trigger |
|--------|--------------|
| `actions.setValue(v)` | When `value` attribute/property changes on the host element |
| `actions.setIndeterminate(v)` | When `indeterminate` attribute/property changes on the host element |

Note: `increment()` and `decrement()` are available for programmatic use but have no direct DOM event trigger in UIKit.

### Contracts spread by adapter

| Contract | Target element | Notes |
|----------|---------------|-------|
| `getProgressProps()` | Root progressbar element (`part="base"`) | Spread as attributes; provides `role`, `aria-*`, and `id` |

### Options passed through from UIKit attributes

| UIKit attribute | Headless option | Notes |
|-----------------|----------------|-------|
| `value` | `value` | Numeric, synced via `setValue` action |
| `min` | `min` | Numeric |
| `max` | `max` | Numeric |
| `indeterminate` | `isIndeterminate` | Boolean attribute |
| `value-text` | `valueText` | Static string override for `aria-valuetext` |
| `aria-label` | `ariaLabel` | Labeling |
| `aria-labelledby` | `ariaLabelledBy` | Labeling |
| `aria-describedby` | `ariaDescribedBy` | Labeling |

## Minimum Test Matrix

- determinate aria value contract
- indeterminate aria omission contract
- `valueText` static override takes precedence over formatter and percentage
- `formatValueText` custom formatter produces expected `aria-valuetext`
- increment/decrement with clamping
- completion-state transitions
- `onValueChange` callback behavior
- `setIndeterminate` toggles aria attribute presence

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no `@statx/*` in headless core.
- **Layering**: `core -> interactions -> a11y-contracts -> adapters`; adapters remain thin mappings.
- **Independence**: No imports from `@project/*`, `apps/*`, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- buffer/secondary-progress tracks
- animated interpolation and transitions
- cancellation/error state orchestration
- adapter-level rendering and styling concerns
