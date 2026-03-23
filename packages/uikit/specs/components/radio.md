# cv-radio-group

Set of mutually exclusive options where only one can be selected at a time.

**Headless:** [`createRadioGroup`](../../../headless/specs/components/radio-group.md)

## Cross-Spec Consistency

This document is the UIKit surface contract for Radio Group.

- The canonical state model, invariants, and user-driven transitions are defined by the headless spec.
- Any intentional divergence between UIKit and headless MUST be explicitly documented in both specs to prevent drift.

## Anatomy

```
<cv-radio-group> (host)
└── <div part="base" role="radiogroup">
    └── <slot>                              ← accepts <cv-radio> children
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Value of the currently selected radio |
| `orientation` | String | `"horizontal"` | Layout: `horizontal` \| `vertical` |
| `disabled` | Boolean | `false` | Prevents interaction for all radios |
| `aria-label` | String | `""` | Accessible label for the group |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | `<cv-radio>` children |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root layout container with `role="radiogroup"` |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-radio-group-gap` | `var(--cv-space-2, 8px)` | Spacing between radio items |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([disabled])` | All child radios are non-interactive |
| `:host([orientation="vertical"])` | Items stacked vertically |

## Reactive State Mapping

`cv-radio-group` is a visual adapter over headless `createRadioGroup`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` | attr → action | `actions.select(value)` on change; initial passed as `initialValue` option |
| `disabled` | attr → action | `actions.setDisabled(value)` |
| `orientation` | attr → option | passed as `orientation` in `createRadioGroup(options)` |
| `aria-label` | attr → option | passed as `ariaLabel` in `createRadioGroup(options)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.value()` | state → attr | `[value]` host attribute; reflected onto `cv-radio[checked]` |
| `state.activeId()` | state → attr | reflected onto `cv-radio[active]` |
| `state.isDisabled()` | state → attr | `[disabled]` host attribute |

- `contracts.getRootProps()` is spread onto the inner `[part="base"]` element to apply `role`, `aria-label`, `aria-disabled`, `aria-orientation`, and `onKeyDown` handler.
- `contracts.getRadioProps(id)` is spread onto each `cv-radio` child to apply `role`, `tabindex`, `aria-checked`, `aria-disabled`, `aria-describedby`, `data-active`, `onClick`, and `onKeyDown`.
- UIKit dispatches `cv-input` and `cv-change` events by observing `state.value()` changes triggered by user activation (not by controlled attribute updates).
- UIKit does not own selection or navigation logic; headless state is the source of truth.

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{value: string, activeId: string}` | Fires on user selection interaction |
| `cv-change` | `{value: string, activeId: string}` | Fires when selected value commits |

## Usage

```html
<cv-radio-group value="opt-1">
  <cv-radio value="opt-1">Option 1</cv-radio>
  <cv-radio value="opt-2">Option 2</cv-radio>
  <cv-radio value="opt-3" disabled>Option 3</cv-radio>
</cv-radio-group>

<cv-radio-group orientation="vertical" aria-label="Payment method">
  <cv-radio value="card">Credit card</cv-radio>
  <cv-radio value="paypal">PayPal</cv-radio>
  <cv-radio value="bank">Bank transfer</cv-radio>
</cv-radio-group>

<cv-radio-group disabled>
  <cv-radio value="a">Disabled A</cv-radio>
  <cv-radio value="b">Disabled B</cv-radio>
</cv-radio-group>

<cv-radio-group value="med">
  <cv-radio value="sm" size="small">Small radio</cv-radio>
  <cv-radio value="med" size="medium">Medium radio</cv-radio>
  <cv-radio value="lg" size="large">Large radio</cv-radio>
</cv-radio-group>

<cv-radio-group value="with-desc">
  <cv-radio value="with-desc">
    Primary option
    <span slot="description">Additional details about this option</span>
  </cv-radio>
  <cv-radio value="other">Other option</cv-radio>
</cv-radio-group>
```

## Child Elements

### cv-radio

Individual radio option within a radio group. Purely presentational — all state and ARIA are managed by the parent `cv-radio-group`.

#### Anatomy

```
<cv-radio> (host)
└── <div part="base">
    ├── <span part="indicator">
    │   └── <span part="dot">
    ├── <span part="label">
    │   └── <slot>
    └── <span part="description">
        └── <slot name="description">
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Unique identifier for this radio option |
| `disabled` | Boolean | `false` | Prevents interaction for this radio |
| `checked` | Boolean | `false` | Whether this radio is selected (managed by group) |
| `active` | Boolean | `false` | Whether this radio has roving focus (managed by group) |
| `size` | String | `"medium"` | Size: `small` \| `medium` \| `large` |

#### Sizes

| Size | `--cv-radio-indicator-size` | `--cv-radio-dot-size` |
|------|-----------------------------|-----------------------|
| `small` | `16px` | `6px` |
| `medium` | `20px` | `8px` |
| `large` | `24px` | `10px` |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Label text for the radio option |
| `description` | Secondary text displayed below the label |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root layout wrapper |
| `indicator` | `<span>` | Circular border container for the dot |
| `dot` | `<span>` | Inner filled circle (visible when checked) |
| `label` | `<span>` | Wrapper around the default slot |
| `description` | `<span>` | Wrapper around the `description` slot |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-radio-indicator-size` | `20px` | Outer size of the radio circle |
| `--cv-radio-dot-size` | `8px` | Inner dot size when checked |
| `--cv-radio-gap` | `var(--cv-space-2, 8px)` | Spacing between indicator and label |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([checked])` | Primary-tinted indicator border, dot visible |
| `:host([disabled])` | Reduced opacity (`0.55`), `cursor: not-allowed` |
| `:host([active])` | Focused radio in roving tabindex model |
| `:host(:focus-visible)` | Focus ring on the host element |
| `:host([size="small"])` | Small size overrides |
| `:host([size="large"])` | Large size overrides |

#### Events

None. All events are dispatched by the parent `cv-radio-group`.

## Parity Matrix (Headless vs UIKit)

| Surface | Headless | UIKit |
| --- | --- | --- |
| Selection model | single selection via `value` atom | `value` attribute on group |
| Focus model | roving tabindex via `activeId` atom | `active` attribute on radio |
| Disabled semantics | group-level + per-item | `disabled` on group + individual radio |
| Navigation | arrow keys with wrapping, Home/End | delegated to headless `handleKeyDown` |
| Description linkage | `describedBy` on `RadioGroupItem` | `description` slot with `aria-describedby` |
| Size | not applicable | `small` \| `medium` \| `large` on radio |
| Orientation | `orientation` option | `orientation` attribute on group |
| Events | N/A (actions/state API) | `cv-input` / `cv-change` with `{value, activeId}` |
