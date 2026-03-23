# Spinner Component Contract

## Purpose

`Spinner` is a headless contract for an indeterminate-only loading indicator. It provides ARIA semantics for a progressbar with no determinate value, ensuring assistive technology correctly announces an ongoing loading state.

## Component Files

- `src/spinner/index.ts` - model and public `createSpinner` API
- `src/spinner/spinner.test.ts` - unit behavior tests

## Options (`CreateSpinnerOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `label` | `string` | `'Loading'` | Accessible name for the spinner, announced by assistive technology |

## Public API

### `createSpinner(options?: CreateSpinnerOptions): SpinnerModel`

### State (signal-backed)

| Signal | Type | Description |
|--------|------|-------------|
| `label()` | `Atom<string>` | Current accessible name for the spinner |

### Actions

| Action | Signature | Description |
|--------|-----------|-------------|
| `setLabel` | `(value: string) => void` | Updates the accessible label |

### Contracts

| Contract | Return type | Description |
|----------|-------------|-------------|
| `getSpinnerProps()` | `SpinnerProps` | Ready-to-spread ARIA attribute map for the spinner element |

#### `SpinnerProps` Shape

```ts
{
  role: 'progressbar'
  'aria-label': string   // from state.label()
}
```

Note: `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-valuetext` are intentionally omitted because the spinner is always indeterminate.

## APG and A11y Contract

- `role="progressbar"` - indicates a loading process
- Indeterminate mode only: `aria-valuenow` is never present, signaling to assistive technology that progress is unknown
- `aria-label` provides the accessible name (defaults to `"Loading"`)
- Non-interactive: no keyboard interaction, no `tabindex`, no focus management
- Sizing is controlled entirely via CSS `font-size` on the host element (UIKit concern)

## Keyboard Contract

Spinner is not keyboard-interactive. No keyboard handling is needed.

## Behavior Contract

- The spinner is always indeterminate; there is no determinate mode.
- `label` defaults to `"Loading"` and can be updated programmatically via `setLabel`.
- The headless layer does not manage visual rendering (SVG circles, animation). That is a UIKit concern.

## Transitions Table

| Trigger | Precondition | State Change | Contract Effect |
|---------|-------------|-------------|-----------------|
| `actions.setLabel(v)` | any | `label` = v | `getSpinnerProps()` updates `aria-label` to new value |

## Invariants

- `role` must always be `'progressbar'`.
- `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-valuetext` must never be present in `getSpinnerProps()`.
- `aria-label` must always be a non-empty string; defaults to `"Loading"` if no label is provided.
- Spinner must never produce `tabindex`, keyboard event handlers, or focus-related attributes.

## Adapter Expectations

This section defines what UIKit (`cv-spinner`) binds to from the headless model.

### Signals read by adapter

| Signal | UIKit usage |
|--------|-------------|
| `state.label()` | Not read directly; consumed via `getSpinnerProps()` contract |

### Actions called by adapter

| Action | UIKit trigger |
|--------|--------------|
| `actions.setLabel(v)` | When `label` attribute/property changes on the host element |

### Contracts spread by adapter

| Contract | Target element | Notes |
|----------|---------------|-------|
| `getSpinnerProps()` | Root spinner element (`part="base"`) | Spread as attributes; provides `role` and `aria-label` |

### Options passed through from UIKit attributes

| UIKit attribute | Headless option | Notes |
|-----------------|----------------|-------|
| `label` | `label` | String, defaults to `"Loading"` |

## Minimum Test Matrix

- default state: `label` is `"Loading"`
- `getSpinnerProps()` returns `{ role: 'progressbar', 'aria-label': 'Loading' }` with defaults
- `getSpinnerProps()` never includes `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, or `aria-valuetext`
- `setLabel` updates `aria-label` in contract output
- custom `label` option is reflected in initial `getSpinnerProps()`
- spinner never produces `tabindex` or keyboard handler attributes

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no `@statx/*` in headless core.
- **Layering**: `core -> interactions -> a11y-contracts -> adapters`; adapters remain thin mappings.
- **Independence**: No imports from `@project/*`, `apps/*`, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- Determinate/progress mode (use `Progress` component instead)
- Size attribute (sizing is handled via CSS `font-size`)
- SVG rendering and animation (UIKit concern)
- Color/variant theming (UIKit concern)
- Overlay/backdrop integration
