# Checkbox Component Contract

## Purpose

`Checkbox` provides a headless APG-aligned model for a two-state or three-state (indeterminate) toggle control.

It handles checked state transitions, indeterminate state management, and standard keyboard interactions.

## Terminology (Normative)

Canonical conceptual states:

| Conceptual state | Component state (canonical) | ARIA mapping |
| --- | --- | --- |
| `unchecked` | `checked=false`, `indeterminate=false` | `aria-checked="false"` |
| `checked` | `checked=true`, `indeterminate=false` | `aria-checked="true"` |
| `indeterminate` | `checked=false`, `indeterminate=true` | `aria-checked="mixed"` |

Notes:

- `indeterminate` is the canonical component third-state term.
- `mixed` is an ARIA token only (used exclusively in `aria-checked="mixed"`).

## Component Files

- `src/checkbox/index.ts` - model and public `createCheckbox` API
- `src/checkbox/checkbox.test.ts` - unit behavior tests

## Public API

- `createCheckbox(options)`
- `state` (signal-backed):
  - `checked()`: `boolean`
  - `indeterminate()`: `boolean`
  - `isDisabled()`: `boolean`
  - `isReadOnly()`: `boolean`
- `actions`:
  - `toggle()`: toggles between checked and unchecked (see indeterminate transition)
  - `setChecked(value: boolean)`: explicitly sets `checked` (normalizes indeterminate)
  - `setIndeterminate(value: boolean)`: explicitly sets `indeterminate` (normalizes checked)
  - `handleKeyDown(event)`
- `contracts`:
  - `getCheckboxProps()`

## Form-Associated Primitives (Normative)

The headless core defines form-associated primitives and expected semantics. Adapters/wrappers MUST map these primitives to the host platform's form APIs (for example, a native `input[type="checkbox"]`).

### Primitive surface

- `name`: `string | undefined`
  - Form field name used during submission. If `name` is empty/undefined, the control does not contribute a value.
- `value`: `string | undefined`
  - Value submitted for `name` when the checkbox is submitted.
  - If not provided, the default value is `"on"` (matching HTML checkbox defaults).
- `required`: `boolean | undefined`
  - Constraint that requires the checkbox to be checked.
- `form`: `string | undefined`
  - Associates the control to a specific form owner (maps to the HTML `form` attribute). If omitted, the nearest containing form is used.
- `defaultChecked`: `boolean | undefined`
  - Initial `checked` state used for uncontrolled usage. Applied once during initialization.
- `autofocus`: `boolean | undefined`
  - If true, the rendered control SHOULD receive focus on initial mount/connection.

### Submission semantics

- The control contributes a name/value pair only when `checked=true`.
- `indeterminate` behaves as unchecked for submission: if `indeterminate=true` then the control MUST NOT submit a value.
- When submitted, the pair is `name=value` (or `name="on"` when `value` is not provided).

### Required / validity semantics

- If `required=true`, the constraint is satisfied only when `checked=true`.
- `indeterminate` does not satisfy `required` (treated as unchecked for validity).

## APG and A11y Contract

- role: `checkbox`
- `aria-checked`: `"true" | "false" | "mixed"`
- `aria-disabled`: boolean (if disabled)
- `aria-readonly`: boolean (if readonly)
- `tabindex`: `0` (or `-1` if disabled)
- linkage: supports `aria-labelledby` and `aria-describedby` via options

## Behavior Contract

- `Space` key toggles the checked state.
- `Click` interaction toggles the checked state.
- If `indeterminate` is enabled, the component can be initialized in an indeterminate state.
- User toggle transition: `indeterminate` -> `checked` (standard APG recommendation).
- Disabled or Read-only checkboxes do not respond to toggle actions.

## Cross-Spec Consistency (Normative)

This document defines the canonical checkbox state model and invariants.

- UIKit components (for example `cv-checkbox`) and any adapters/wrappers MUST preserve the same conceptual states, invariants, and user-driven transitions defined here.
- If a UIKit surface intentionally diverges, the divergence MUST be explicitly documented in both specs to prevent drift.

## Invariants

- Canonical conceptual states are exactly: `unchecked`, `checked`, `indeterminate`.
- If represented as booleans, `indeterminate=true` implies `checked=false`.
- Normalization rules:
  - When setting state, if `indeterminate=true`, then force `checked=false`.
  - If indeterminate behavior is not enabled/configured, then any attempt to set `indeterminate=true` MUST normalize to `indeterminate=false`.
- A disabled checkbox cannot be toggled via `actions.toggle()`.
- A read-only checkbox cannot be toggled via `actions.toggle()`.

## Minimum Test Matrix

- toggle behavior (false -> true -> false)
- indeterminate state initialization and transition to checked on toggle
- disabled state prevents state changes
- read-only state prevents state changes
- keyboard `Space` interaction
- correct `aria-checked` mapping for all states (including `aria-checked="mixed"` for indeterminate)

## Migration Notes (Non-normative)

This section documents known terminology/state-shape changes and the breaking-change communication policy.

### Terminology change: `mixed` -> `indeterminate`

- `indeterminate` is the canonical third-state term.
- `mixed` remains an ARIA token only (used exclusively in `aria-checked="mixed"`).

### State shape change: tri-state -> two booleans

The current runtime implementation historically used an internal tri-state value for `checked` and related options.

- Old (legacy/internal): `checked: boolean | 'mixed'` (+ optional `mixed: boolean`) and `allowMixed`.
- New (canonical/public): `checked: boolean`, `indeterminate: boolean`, and `allowIndeterminate`.

Mappings:

- `checked === 'mixed'` -> `indeterminate=true` and `checked=false`.
- `allowMixed` -> `allowIndeterminate`.

### Breaking-change communication policy

When this contract changes in a breaking way, the change MUST be documented in this section as:

- terminology changes (old term -> new term)
- state/payload shape changes (old shape -> new shape)
- a short, explicit statement that the change is breaking and requires consumer migration

### Parity matrix (Headless vs UIKit)

This matrix is intentionally short and exists to prevent drift between `packages/headless/specs/components/checkbox.md` and `packages/uikit/specs/components/checkbox.md`.

| Surface | Headless | UIKit |
| --- | --- | --- |
| Canonical third-state term | `indeterminate` | `indeterminate` attribute + event detail |
| ARIA token for third state | `aria-checked="mixed"` only | `aria-checked="mixed"` only |
| State representation | `checked:boolean`, `indeterminate:boolean` | `checked`/`indeterminate` attributes |
| User toggle transition | `indeterminate` -> `checked` | `indeterminate` -> `checked` |
| Disabled/read-only semantics | cannot toggle | cannot toggle |
| Payload on user interaction | N/A (actions/state API) | `{ checked, indeterminate, value? }` |
| Form primitives | specified (see above) | not specified on `cv-checkbox` surface |

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- native form submission integration (handled by adapters/wrappers)
- grouping logic (see `CheckboxGroup` or `Fieldset` specs)
