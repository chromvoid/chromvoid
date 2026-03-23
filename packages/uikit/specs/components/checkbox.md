# cv-checkbox

Two-state or three-state (indeterminate) toggle control with a visual indicator.

**Headless:** [`createCheckbox`](../../../headless/specs/components/checkbox.md)

## Cross-Spec Consistency

This document is the UIKit surface contract for Checkbox.

- The canonical state model, invariants, and user-driven transitions are defined by the headless spec.
- Any intentional divergence between UIKit and headless MUST be explicitly documented in both specs to prevent drift.

## Anatomy

```
<cv-checkbox> (host)
└── <div part="base" role="checkbox">
    ├── <span part="indicator">
    │   └── <span part="checkmark">
    └── <slot>                          ← label
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `checked` | Boolean | `false` | Checked state |
| `indeterminate` | Boolean | `false` | Indeterminate state (takes precedence over `checked` visually) |
| `disabled` | Boolean | `false` | Prevents interaction |
| `read-only` | Boolean | `false` | Visible but not toggleable |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Label text or content next to the indicator |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root interactive element with `role="checkbox"` |
| `indicator` | `<span>` | Box that contains the checkmark |
| `checkmark` | `<span>` | Visual mark inside the indicator (square when checked, line when indeterminate) |

## CSS Custom Properties

No component-specific custom properties. Styling uses design tokens:

- `--cv-space-2` — gap between indicator and label
- `--cv-radius-sm` — indicator border radius
- `--cv-color-border` — indicator border color
- `--cv-color-surface` — indicator background
- `--cv-color-primary` — checked/indeterminate accent color
- `--cv-color-text` — label text color
- `--cv-duration-fast` — transition duration
- `--cv-easing-standard` — transition easing

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([checked])` | Primary-tinted indicator border and background, solid checkmark |
| `:host([indeterminate])` | Horizontal line checkmark (2px height, full width) |
| `:host([disabled])` | Reduced opacity (`0.55`), `cursor: not-allowed` |

## ARIA

- When `checked=true` and `indeterminate=false`, `aria-checked="true"`.
- When `checked=false` and `indeterminate=true`, `aria-checked="mixed"`.
- When `checked=false` and `indeterminate=false`, `aria-checked="false"`.

## State Invariants and Transitions

- Canonical conceptual states are exactly: `unchecked`, `checked`, `indeterminate`.
- If represented as booleans, `indeterminate=true` implies `checked=false`.
- User toggle transition: `indeterminate` -> `checked`.
- Disabled or read-only checkboxes do not respond to toggle actions.

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{ checked: boolean, indeterminate: boolean, value?: string }` | Fires on toggle |
| `cv-change` | `{ checked: boolean, indeterminate: boolean, value?: string }` | Fires when state commits |

## Usage

```html
<cv-checkbox>Accept terms</cv-checkbox>

<cv-checkbox checked>Remember me</cv-checkbox>

<cv-checkbox indeterminate>Select all (partial)</cv-checkbox>

<cv-checkbox disabled>Unavailable option</cv-checkbox>
```

## Migration Notes (Non-normative)

This section documents known terminology/payload changes and the breaking-change communication policy.

### Terminology change: `mixed` -> `indeterminate`

- `indeterminate` is the canonical third-state term.
- `mixed` remains an ARIA token only (used exclusively in `aria-checked="mixed"`).

### Payload change: legacy detail -> current detail

- Old (legacy docs): `{ value: boolean | "mixed", checked: boolean, mixed: boolean }`.
- New (current contract): `{ checked: boolean, indeterminate: boolean, value?: string }`.

Mappings:

- `value === "mixed"` or `mixed === true` -> `indeterminate=true` and `checked=false`.
- Prefer reading `indeterminate` and `checked` instead of interpreting `value`.

### Breaking-change communication policy

This change is breaking for consumers that relied on legacy terminology (`mixed`) or the legacy event detail shape.

When this contract changes in a breaking way, this section MUST explicitly document:

- terminology changes (old term -> new term)
- payload shape changes (old shape -> new shape)
- a short statement that the change is breaking and requires consumer migration

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
| Form primitives | specified (see headless spec) | not specified on `cv-checkbox` surface |
