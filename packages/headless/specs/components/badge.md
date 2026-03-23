# Badge Component Contract

## Purpose

`Badge` is a headless contract for a non-interactive status indicator that displays short labels, counts, or colored dots. It provides ARIA semantics for live-region announcements when badge content changes dynamically, and decorative hiding when the badge is purely visual.

## Component Files

- `src/badge/index.ts` - model and public `createBadge` API
- `src/badge/badge.test.ts` - unit behavior tests

## Options (`CreateBadgeOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `variant` | `BadgeVariant` | `'neutral'` | Visual variant: `'primary' \| 'success' \| 'neutral' \| 'warning' \| 'danger'` |
| `size` | `BadgeSize` | `'medium'` | Display size: `'small' \| 'medium' \| 'large'` |
| `dot` | `boolean` | `false` | Dot mode: hides textual content, shows a colored circle indicator |
| `pulse` | `boolean` | `false` | Whether the badge should animate to draw attention |
| `pill` | `boolean` | `false` | Whether to apply a pill (fully rounded) shape modifier |
| `isDynamic` | `boolean` | `false` | Whether content changes at runtime (enables live-region semantics) |
| `isDecorative` | `boolean` | `false` | Whether the badge is purely decorative (hides from assistive technology) |
| `ariaLabel` | `string \| undefined` | `undefined` | Accessible label override; useful in dot mode where visible text is absent |

## Type Definitions

```ts
type BadgeVariant = 'primary' | 'success' | 'neutral' | 'warning' | 'danger';
type BadgeSize = 'small' | 'medium' | 'large';
```

## Public API

### `createBadge(options?: CreateBadgeOptions): BadgeModel`

### State (signal-backed)

| Signal | Type | Description |
|--------|------|-------------|
| `variant()` | `Atom<BadgeVariant>` | Current visual variant |
| `size()` | `Atom<BadgeSize>` | Current display size |
| `dot()` | `Atom<boolean>` | Whether dot mode is active |
| `pulse()` | `Atom<boolean>` | Whether pulse animation is active |
| `pill()` | `Atom<boolean>` | Whether pill shape modifier is active |
| `isDynamic()` | `Atom<boolean>` | Whether the badge is a live region |
| `isDecorative()` | `Atom<boolean>` | Whether the badge is decorative-only |
| `isEmpty()` | `Computed<boolean>` | Derived: `true` when `dot` is `true` (content is hidden) |

### Actions

| Action | Signature | Description |
|--------|-----------|-------------|
| `setVariant` | `(value: BadgeVariant) => void` | Updates the visual variant |
| `setSize` | `(value: BadgeSize) => void` | Updates the display size |
| `setDot` | `(value: boolean) => void` | Toggles dot mode |
| `setPulse` | `(value: boolean) => void` | Toggles pulse animation |
| `setPill` | `(value: boolean) => void` | Toggles pill shape modifier |
| `setDynamic` | `(value: boolean) => void` | Toggles live-region semantics |
| `setDecorative` | `(value: boolean) => void` | Toggles decorative mode |

### Contracts

| Contract | Return type | Description |
|----------|-------------|-------------|
| `getBadgeProps()` | `BadgeProps` | Ready-to-spread ARIA attribute map for the badge element |

#### `BadgeProps` Shape

The returned object depends on the current state:

**When `isDecorative` is `true`:**

```ts
{
  role: 'presentation'
  'aria-hidden': 'true'
}
```

**When `isDynamic` is `true` (and not decorative):**

```ts
{
  role: 'status'
  'aria-live': 'polite'
  'aria-atomic': 'true'
  'aria-label'?: string   // from options.ariaLabel (recommended for dot mode)
}
```

**Default (static, non-decorative):**

```ts
{
  'aria-label'?: string   // from options.ariaLabel (recommended for dot mode)
}
```

## APG and A11y Contract

- **Dynamic badge** (content changes at runtime):
  - `role="status"` — implicit live region with polite politeness
  - `aria-live="polite"` — explicit for broader assistive technology support
  - `aria-atomic="true"` — announce the entire badge content on change
- **Decorative badge** (purely visual, no semantic meaning):
  - `role="presentation"` — removes semantic meaning
  - `aria-hidden="true"` — hidden from assistive technology
- **Static badge** (content does not change after render):
  - No role or live-region attributes needed; content is read inline
- **Dot mode**:
  - When `dot` is `true`, visible text content is hidden; `aria-label` should be provided for accessible meaning
- **Non-interactive**: no keyboard interaction, no `tabindex`, no focus management

## Keyboard Contract

Badge is not keyboard-interactive. No keyboard handling is needed.

## Behavior Contract

- All state properties are set programmatically; there are no user-driven interactions.
- `isEmpty` is derived from `dot`: when dot mode is active, the badge has no visible text content.
- `variant` accepts only the five defined values; invalid values should be ignored or defaulted to `'neutral'`.
- `size` accepts only the three defined values; invalid values should be ignored or defaulted to `'medium'`.
- `isDecorative` takes precedence over `isDynamic`: a decorative badge never becomes a live region regardless of `isDynamic` state.

## Transitions Table

| Trigger | Precondition | State Change | Contract Effect |
|---------|-------------|-------------|-----------------|
| `actions.setVariant(v)` | valid variant | `variant` = v | no ARIA change |
| `actions.setSize(v)` | valid size | `size` = v | no ARIA change |
| `actions.setDot(v)` | any | `dot` = v; `isEmpty` recomputes | no ARIA change; UIKit hides/shows content |
| `actions.setPulse(v)` | any | `pulse` = v | no ARIA change |
| `actions.setPill(v)` | any | `pill` = v | no ARIA change |
| `actions.setDynamic(v)` | any | `isDynamic` = v | `getBadgeProps()` adds/removes `role="status"`, `aria-live`, `aria-atomic` |
| `actions.setDecorative(v)` | any | `isDecorative` = v | `getBadgeProps()` switches to `role="presentation"` + `aria-hidden="true"` or reverts |

## Invariants

- `isDecorative` takes precedence: when `true`, `getBadgeProps()` always returns `{ role: 'presentation', 'aria-hidden': 'true' }` regardless of `isDynamic`.
- `isEmpty` must be `true` if and only if `dot` is `true`.
- `variant` must always be one of `'primary' | 'success' | 'neutral' | 'warning' | 'danger'`.
- `size` must always be one of `'small' | 'medium' | 'large'`.
- Badge must never produce `tabindex`, keyboard event handlers, or focus-related attributes.
- When `isDynamic` is `true` and `isDecorative` is `false`, `role` must be `'status'` and `aria-live` must be `'polite'`.

## Adapter Expectations

This section defines what UIKit (`cv-badge`) binds to from the headless model.

### Signals read by adapter

| Signal | UIKit usage |
|--------|-------------|
| `state.variant()` | Maps to `variant` host attribute and CSS class for color theming |
| `state.size()` | Maps to `size` host attribute and CSS class for dimension styling |
| `state.dot()` | Sets `dot` attribute on host; conditionally hides default slot content |
| `state.pulse()` | Sets `pulse` attribute on host; toggles CSS pulse animation |
| `state.pill()` | Sets `pill` attribute on host; applies fully rounded border radius |
| `state.isEmpty()` | Used to conditionally suppress content rendering in dot mode |

### Actions called by adapter

| Action | UIKit trigger |
|--------|--------------|
| `actions.setVariant(v)` | When `variant` attribute/property changes on the host element |
| `actions.setSize(v)` | When `size` attribute/property changes on the host element |
| `actions.setDot(v)` | When `dot` attribute/property changes on the host element |
| `actions.setPulse(v)` | When `pulse` attribute/property changes on the host element |
| `actions.setPill(v)` | When `pill` attribute/property changes on the host element |
| `actions.setDynamic(v)` | When `dynamic` attribute/property changes on the host element |
| `actions.setDecorative(v)` | When `decorative` attribute/property changes on the host element |

### Contracts spread by adapter

| Contract | Target element | Notes |
|----------|---------------|-------|
| `getBadgeProps()` | Root badge element (`part="base"`) | Spread as attributes; provides `role`, `aria-live`, `aria-atomic`, `aria-hidden`, `aria-label` as applicable |

### Options passed through from UIKit attributes

| UIKit attribute | Headless option | Notes |
|-----------------|----------------|-------|
| `variant` | `variant` | String enum, defaults to `'neutral'` |
| `size` | `size` | String enum, defaults to `'medium'` |
| `dot` | `dot` | Boolean attribute |
| `pulse` | `pulse` | Boolean attribute |
| `pill` | `pill` | Boolean attribute |
| `dynamic` | `isDynamic` | Boolean attribute; enables live-region semantics |
| `decorative` | `isDecorative` | Boolean attribute; hides from assistive technology |
| `aria-label` | `ariaLabel` | Labeling; recommended when `dot` is `true` |

## Minimum Test Matrix

- default state: `variant='neutral'`, `size='medium'`, all booleans `false`
- `getBadgeProps()` returns no role/live-region attrs for static non-decorative badge
- `getBadgeProps()` returns `role="status"`, `aria-live="polite"`, `aria-atomic="true"` when `isDynamic` is `true`
- `getBadgeProps()` returns `role="presentation"`, `aria-hidden="true"` when `isDecorative` is `true`
- `isDecorative` takes precedence over `isDynamic` in contract output
- `isEmpty` is `true` when `dot` is `true`, `false` otherwise
- `setVariant` updates variant signal; invalid values rejected
- `setSize` updates size signal; invalid values rejected
- `setDot(true)` makes `isEmpty` compute to `true`
- `aria-label` is included in props when provided
- badge never produces `tabindex` or keyboard handler attributes

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no `@statx/*` in headless core.
- **Layering**: `core -> interactions -> a11y-contracts -> adapters`; adapters remain thin mappings.
- **Independence**: No imports from `@project/*`, `apps/*`, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- notification count management or capping (consumer responsibility)
- positioning relative to parent element (layout/CSS concern)
- removable/dismissible badges (would require interactive contract)
- animation orchestration for pulse (handled by visual layer)
- badge groups or stacking
