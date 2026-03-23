# Callout Component Contract

## Purpose

`Callout` is a headless contract for static supplementary content blocks that highlight important information to the user. Unlike `Alert`, a callout is not a live region — it does not announce dynamically. It uses `role="note"` to convey that the content is parenthetic or ancillary. Callouts optionally support a closable dismiss pattern.

## Component Files

- `src/callout/index.ts` - model and public `createCallout` API
- `src/callout/callout.test.ts` - unit behavior tests

## Options (`CreateCalloutOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `idBase` | `string` | `'callout'` | Base id prefix for generated ids |
| `variant` | `CalloutVariant` | `'info'` | Visual variant for theming |
| `closable` | `boolean` | `false` | Whether the callout can be dismissed by the user |
| `open` | `boolean` | `true` | Initial visibility state |

## Type Definitions

```ts
type CalloutVariant = 'info' | 'success' | 'warning' | 'danger' | 'neutral'
```

## Public API

### `createCallout(options?: CreateCalloutOptions): CalloutModel`

### State (signal-backed)

| Signal | Type | Derived? | Description |
|--------|------|----------|-------------|
| `variant` | `Atom<CalloutVariant>` | No | Current visual variant |
| `closable` | `Atom<boolean>` | No | Whether the close button is available |
| `open` | `Atom<boolean>` | No | Whether the callout is visible |

### Actions

| Action | Signature | Description |
|--------|-----------|-------------|
| `setVariant` | `(value: CalloutVariant) => void` | Updates the visual variant |
| `setClosable` | `(value: boolean) => void` | Toggles whether the callout is closable |
| `close` | `() => void` | Sets `open` to `false`. No-op if `closable` is `false`. |
| `show` | `() => void` | Sets `open` to `true` |

### Contracts

| Contract | Return type | Description |
|----------|-------------|-------------|
| `getCalloutProps()` | `CalloutProps` | Ready-to-spread ARIA attribute map for the callout root element |
| `getCloseButtonProps()` | `CalloutCloseButtonProps` | Ready-to-spread attribute map for the close button element |

#### `CalloutProps` Shape

```ts
{
  id: string
  role: 'note'
  'data-variant': CalloutVariant
}
```

The `role` is always `'note'` — a static structural role indicating parenthetic or ancillary content. This is NOT a live region; content is not announced dynamically by assistive technologies.

#### `CalloutCloseButtonProps` Shape

```ts
{
  id: string
  role: 'button'
  tabindex: '0'
  'aria-label': 'Dismiss'
  onClick: () => void
}
```

The close button props are only meaningful when `closable` is `true`. UIKit should conditionally render the close button based on the `closable` signal.

## APG and A11y Contract

- **Role**: `role="note"` on the root element — indicates supplementary content
- **Not a live region**: No `aria-live`, no `aria-atomic`. Content is read inline when encountered, not announced on change.
- **Close button**: When `closable` is `true`, a button with `aria-label="Dismiss"` is rendered. Standard button keyboard interaction applies (Enter/Space activates).
- **Non-interactive root**: The callout root itself is not focusable and has no keyboard interactions. Only the close button (when present) is interactive.

## Keyboard Contract

| Key | Element | Condition | Action |
|-----|---------|-----------|--------|
| `Enter` | Close button | `closable` is `true` | Activates close (handled by native button or `onClick`) |
| `Space` | Close button | `closable` is `true` | Activates close (handled by native button or `onClick`) |

No keyboard handling is needed on the callout root itself.

## Behavior Contract

- `variant` is set programmatically; it affects visual theming only, not ARIA semantics.
- `closable` controls whether the close button is rendered and whether the `close` action has effect.
- `close` action: sets `open` to `false` only when `closable` is `true`; otherwise it is a no-op.
- `show` action: sets `open` to `true` unconditionally (allows programmatic re-showing after dismiss).
- `open` determines visibility; when `false`, UIKit should hide the callout (e.g., via `hidden` attribute or conditional rendering).
- The callout does not manage focus. Closing does not move focus elsewhere (UIKit may handle focus restoration if needed).
- No automatic dismissal timer. The callout remains visible until explicitly closed.

## Transitions Table

| Trigger | Precondition | State Change | Contract Effect |
|---------|-------------|-------------|-----------------|
| `actions.setVariant(v)` | valid variant | `variant` = v | `getCalloutProps()` updates `data-variant` |
| `actions.setVariant(v)` | invalid variant | no change | no effect |
| `actions.setClosable(v)` | any | `closable` = v | UIKit conditionally renders close button |
| `actions.close()` | `closable` = `true`, `open` = `true` | `open` = `false` | UIKit hides callout; emits `cv-close` event |
| `actions.close()` | `closable` = `false` | no change | no-op |
| `actions.close()` | `open` = `false` | no change | no-op |
| `actions.show()` | `open` = `false` | `open` = `true` | UIKit shows callout |
| `actions.show()` | `open` = `true` | no change | no-op |

## Invariants

1. `role` is always `'note'` on the root element — never changes regardless of variant or state.
2. No `aria-live` or `aria-atomic` attributes are ever produced. Callout is not a live region.
3. `variant` must always be one of `'info' | 'success' | 'warning' | 'danger' | 'neutral'`. Invalid values are rejected.
4. `variant` defaults to `'info'` when not specified or when an invalid value is provided.
5. `close` action is a no-op when `closable` is `false`.
6. `getCloseButtonProps()` always returns the button attribute map, but UIKit must only render the button when `closable` is `true`.
7. Callout must never produce `tabindex` or focus-related attributes on the root element.
8. `open` defaults to `true` (callout is visible by default).

## Adapter Expectations

This section defines what UIKit (`cv-callout`) binds to from the headless model.

### Signals read by adapter

| Signal | UIKit usage |
|--------|-------------|
| `state.variant()` | Maps to `variant` host attribute and CSS class for color theming |
| `state.closable()` | Determines whether the close button is rendered in the template |
| `state.open()` | Controls visibility of the callout; maps to `open` attribute on host |

### Actions called by adapter

| Action | UIKit trigger |
|--------|--------------|
| `actions.setVariant(v)` | When `variant` attribute/property changes on the host element |
| `actions.setClosable(v)` | When `closable` attribute/property changes on the host element |
| `actions.close()` | When the close button is clicked; emits `cv-close` event |
| `actions.show()` | When programmatically re-showing the callout |

### Contracts spread by adapter

| Contract | Target element | Notes |
|----------|---------------|-------|
| `getCalloutProps()` | Root callout element (`part="base"`) | Spread as attributes; provides `id`, `role`, `data-variant` |
| `getCloseButtonProps()` | Close button element (`part="close-button"`) | Spread as attributes; only rendered when `closable` is `true` |

### Options passed through from UIKit attributes

| UIKit attribute | Headless option | Notes |
|-----------------|----------------|-------|
| `variant` | `variant` | String enum, defaults to `'info'` |
| `closable` | `closable` | Boolean attribute, defaults to `false` |
| `open` | `open` | Boolean attribute, defaults to `true` |

## Minimum Test Matrix

- default state: `variant='info'`, `closable=false`, `open=true`
- `getCalloutProps()` returns `role='note'` and `data-variant` matching current variant
- `getCalloutProps()` never includes `aria-live` or `aria-atomic`
- `setVariant` updates variant signal; invalid values rejected
- all five variant values are accepted: `info`, `success`, `warning`, `danger`, `neutral`
- `close()` sets `open` to `false` when `closable` is `true`
- `close()` is a no-op when `closable` is `false`
- `show()` sets `open` to `true`
- `getCloseButtonProps()` returns `role='button'`, `tabindex='0'`, `aria-label='Dismiss'`
- clicking close button (calling `onClick` from props) triggers `close` action
- callout never produces `tabindex` on root element

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no `@statx/*` in headless core.
- **Layering**: `core -> interactions -> a11y-contracts -> adapters`; adapters remain thin mappings.
- **Independence**: No imports from `@project/*`, `apps/*`, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- Rich content slots (icon, title, description) — handled by UIKit template only
- Collapsible/expandable content within the callout
- Auto-dismiss timer (use `Alert` for time-sensitive announcements)
- Live region behavior (use `Alert` for dynamic announcements)
- Focus management on close (UIKit concern if needed)
- Animation/transition on show/hide (UIKit/CSS concern)
