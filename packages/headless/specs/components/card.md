# Card Component Contract

## Purpose

`Card` is a headless contract for a visual container that groups related content into a cohesive unit. It supports an optional expandable variant that follows the disclosure pattern: a trigger area (header) toggles the visibility of body content. When not expandable, the card is a simple non-interactive container with minimal ARIA semantics.

## Component Files

- `src/card/index.ts` - model and public `createCard` API
- `src/card/card.test.ts` - unit behavior tests

## Options (`CreateCardOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `idBase` | `string` | `'card'` | Base id prefix for generated ids |
| `isExpandable` | `boolean` | `false` | Whether the card has disclosure (expand/collapse) behavior |
| `isExpanded` | `boolean` | `false` | Initial expanded state (only meaningful when `isExpandable` is `true`) |
| `isDisabled` | `boolean` | `false` | Whether interaction is blocked (only meaningful when `isExpandable` is `true`) |
| `onExpandedChange` | `(isExpanded: boolean) => void` | `undefined` | Callback fired when expanded state changes |

## Public API

### `createCard(options?: CreateCardOptions): CardModel`

### State (signal-backed)

| Signal | Type | Derived? | Description |
|--------|------|----------|-------------|
| `isExpandable` | `Atom<boolean>` | No | Whether the card has disclosure behavior |
| `isExpanded` | `Atom<boolean>` | No | Whether the card body content is visible (only meaningful when expandable) |
| `isDisabled` | `Atom<boolean>` | No | Whether user interaction is blocked (only meaningful when expandable) |

### Actions

| Action | Signature | Description |
|--------|-----------|-------------|
| `toggle` | `() => void` | Toggles expanded state; no-op when not expandable or disabled |
| `expand` | `() => void` | Sets expanded to `true`; no-op when not expandable, disabled, or already expanded |
| `collapse` | `() => void` | Sets expanded to `false`; no-op when not expandable, disabled, or already collapsed |
| `setDisabled` | `(value: boolean) => void` | Updates the disabled state |
| `handleClick` | `() => void` | Delegates to `toggle()`; intended for the trigger element |
| `handleKeyDown` | `(event: Pick<KeyboardEvent, 'key'> & { preventDefault?: () => void }) => void` | Processes keyboard input on the trigger (see Keyboard Contract) |

### Contracts

| Contract | Return Type | Description |
|----------|-------------|-------------|
| `getCardProps()` | `CardProps` | Ready-to-spread ARIA attribute map for the card root element |
| `getTriggerProps()` | `CardTriggerProps` | Ready-to-spread ARIA and event handler attribute map for the expandable trigger (header) |
| `getContentProps()` | `CardContentProps` | Ready-to-spread ARIA attribute map for the expandable content region (body) |

## Contract Prop Shapes

### `getCardProps()`

**When `isExpandable` is `false` (static card):**

```ts
{
  // No role, no interactive attributes — plain container
}
```

**When `isExpandable` is `true`:**

```ts
{
  // No role — the card root is a container; trigger and content carry the ARIA semantics
}
```

The card root element does not carry interactive ARIA attributes in either mode. The expandable semantics are carried by the trigger and content sub-elements.

### `getTriggerProps()`

Only meaningful when `isExpandable` is `true`. When `isExpandable` is `false`, returns an empty object.

**When `isExpandable` is `true`:**

```ts
{
  id: string                          // '{idBase}-trigger'
  role: 'button'
  tabindex: '0' | '-1'               // '-1' when disabled
  'aria-expanded': 'true' | 'false'  // reflects isExpanded
  'aria-controls': string             // points to content region id
  'aria-disabled'?: 'true'           // present only when disabled
  onClick: () => void                 // calls handleClick
  onKeyDown: (event) => void          // calls handleKeyDown
}
```

### `getContentProps()`

Only meaningful when `isExpandable` is `true`. When `isExpandable` is `false`, returns an empty object.

**When `isExpandable` is `true`:**

```ts
{
  id: string                          // '{idBase}-content'
  role: 'region'
  'aria-labelledby': string           // points to trigger id
  hidden: boolean                     // !isExpanded
}
```

## APG and A11y Contract

### Static card (not expandable)

- No role on the card root — it is a presentational grouping container
- No keyboard interaction, no `tabindex`, no focus management
- Content is always visible

### Expandable card

- Trigger: `role="button"` with `aria-expanded`, `aria-controls`, `tabindex`
- Content region: `role="region"` with `aria-labelledby`, `hidden`
- This follows the APG Disclosure (Show/Hide) pattern
- Focus management:
  - The trigger is in the page tab sequence (`tabindex: '0'`); removed from tab order when disabled (`tabindex: '-1'`)
  - Focus remains on the trigger when toggled

## Keyboard Contract

Only applies when `isExpandable` is `true`. All keyboard actions are no-ops when `isDisabled` is `true`.

| Key | Action |
|-----|--------|
| `Enter` | Toggle the `isExpanded` state; calls `preventDefault` |
| `Space` | Toggle the `isExpanded` state; calls `preventDefault` |
| `ArrowDown` / `ArrowRight` | Expand (show content) if currently collapsed; calls `preventDefault` |
| `ArrowUp` / `ArrowLeft` | Collapse (hide content) if currently expanded; calls `preventDefault` |

## Behavior Contract

- **Static Card**:
  - Acts as a non-interactive container. No state transitions occur from user interaction.
  - `toggle()`, `expand()`, `collapse()` are no-ops when `isExpandable` is `false`.
  - `getTriggerProps()` and `getContentProps()` return empty objects.
- **Expandable Card**:
  - `Enter` or `Space` on the trigger toggles the `isExpanded` state.
  - Clicking the trigger toggles the `isExpanded` state.
  - `ArrowDown` or `ArrowRight` on the trigger opens the content (no-op if already expanded).
  - `ArrowUp` or `ArrowLeft` on the trigger closes the content (no-op if already collapsed).
  - When `isDisabled` is `true`, all user-driven interactions (click, keyboard) are no-ops.
  - `setDisabled(value)` always updates the disabled state regardless of `isExpandable`.
- **Linkage** (expandable only):
  - `aria-controls` on the trigger matches the `id` of the content region.
  - `aria-expanded` on the trigger reflects the `isExpanded` state.
  - `aria-labelledby` on the content region matches the `id` of the trigger.

## Transitions Table

| Event / Action | Guard | Next State / Effect |
|----------------|-------|---------------------|
| `toggle()` | `isExpandable && !isDisabled && !isExpanded` | `isExpanded = true`; fires `onExpandedChange(true)` |
| `toggle()` | `isExpandable && !isDisabled && isExpanded` | `isExpanded = false`; fires `onExpandedChange(false)` |
| `toggle()` | `!isExpandable \|\| isDisabled` | no-op |
| `expand()` | `isExpandable && !isDisabled && !isExpanded` | `isExpanded = true`; fires `onExpandedChange(true)` |
| `expand()` | `!isExpandable \|\| isDisabled \|\| isExpanded` | no-op |
| `collapse()` | `isExpandable && !isDisabled && isExpanded` | `isExpanded = false`; fires `onExpandedChange(false)` |
| `collapse()` | `!isExpandable \|\| isDisabled \|\| !isExpanded` | no-op |
| `handleClick()` | any | delegates to `toggle()` |
| `handleKeyDown(Enter)` | `isExpandable && !isDisabled` | delegates to `toggle()`; `preventDefault` |
| `handleKeyDown(Space)` | `isExpandable && !isDisabled` | delegates to `toggle()`; `preventDefault` |
| `handleKeyDown(ArrowDown)` | `isExpandable && !isDisabled && !isExpanded` | delegates to `expand()`; `preventDefault` |
| `handleKeyDown(ArrowRight)` | `isExpandable && !isDisabled && !isExpanded` | delegates to `expand()`; `preventDefault` |
| `handleKeyDown(ArrowDown)` | `isExpandable && !isDisabled && isExpanded` | no-op (already expanded); `preventDefault` |
| `handleKeyDown(ArrowRight)` | `isExpandable && !isDisabled && isExpanded` | no-op (already expanded); `preventDefault` |
| `handleKeyDown(ArrowUp)` | `isExpandable && !isDisabled && isExpanded` | delegates to `collapse()`; `preventDefault` |
| `handleKeyDown(ArrowLeft)` | `isExpandable && !isDisabled && isExpanded` | delegates to `collapse()`; `preventDefault` |
| `handleKeyDown(ArrowUp)` | `isExpandable && !isDisabled && !isExpanded` | no-op (already collapsed); `preventDefault` |
| `handleKeyDown(ArrowLeft)` | `isExpandable && !isDisabled && !isExpanded` | no-op (already collapsed); `preventDefault` |
| `handleKeyDown(other)` | any | no-op; no `preventDefault` |
| `handleKeyDown(any)` | `!isExpandable \|\| isDisabled` | no-op; no `preventDefault` |
| `setDisabled(value)` | any | `isDisabled = value` |

## Invariants

1. `isExpandable`, `isExpanded`, and `isDisabled` are booleans.
2. When `isExpandable` is `false`, `getTriggerProps()` and `getContentProps()` return empty objects (no ARIA attributes, no event handlers).
3. When `isExpandable` is `false`, `toggle()`, `expand()`, and `collapse()` are no-ops.
4. When `isExpandable` is `true`, `aria-expanded` on the trigger is `"true"` when `isExpanded` is `true`, and `"false"` otherwise.
5. When `isExpandable` is `true`, `aria-controls` on the trigger always matches the `id` of the content region.
6. When `isExpandable` is `true`, `aria-labelledby` on the content region always matches the `id` of the trigger.
7. When `isDisabled` is `true`, user-driven interactions (`handleClick`, `handleKeyDown`) do not change `isExpanded`.
8. Arrow keys (`ArrowDown`/`ArrowRight`) only expand; they never collapse. Arrow keys (`ArrowUp`/`ArrowLeft`) only collapse; they never expand.
9. `getCardProps()` never produces interactive attributes (`tabindex`, keyboard handlers, `aria-expanded`). Interactive semantics live on the trigger.
10. `onExpandedChange` is only called when `isExpanded` actually changes value, never on no-op actions.

## Adapter Expectations

This section defines what UIKit (`cv-card`) binds to from the headless model.

### Signals read by adapter

| Signal | UIKit usage |
|--------|-------------|
| `state.isExpandable()` | Determines whether to render the trigger and toggle content visibility; sets `expandable` host attribute |
| `state.isExpanded()` | Reflects expanded state on host; controls content region visibility |
| `state.isDisabled()` | Reflects disabled state on host; prevents interaction |

### Actions called by adapter

| Action | UIKit trigger |
|--------|--------------|
| `actions.toggle()` | Programmatic toggle (e.g., from imperative `toggle()` method on element) |
| `actions.expand()` | Programmatic expand (e.g., from imperative `expand()` method on element) |
| `actions.collapse()` | Programmatic collapse (e.g., from imperative `collapse()` method on element) |
| `actions.setDisabled(v)` | When `disabled` attribute/property changes on the host element |
| `actions.handleClick()` | Not called directly by adapter; included in `getTriggerProps()` spread |
| `actions.handleKeyDown(e)` | Not called directly by adapter; included in `getTriggerProps()` spread |

### Contracts spread by adapter

| Contract | Target element | Notes |
|----------|---------------|-------|
| `getCardProps()` | Card root element (`part="base"`) | Spread as attributes on the outermost container |
| `getTriggerProps()` | Header/trigger element (`part="header"`) | Spread onto the clickable header area; provides `role`, `aria-expanded`, `aria-controls`, `tabindex`, and event handlers. Only spread when `isExpandable` is `true`. |
| `getContentProps()` | Body/content element (`part="body"`) | Spread onto the content region; provides `id`, `role="region"`, `aria-labelledby`, `hidden`. Only spread when `isExpandable` is `true`. |

### Options passed through from UIKit attributes

| UIKit attribute | Headless option | Notes |
|-----------------|----------------|-------|
| `expandable` | `isExpandable` | Boolean attribute; enables disclosure behavior |
| `expanded` | `isExpanded` | Boolean attribute; initial expanded state |
| `disabled` | `isDisabled` | Boolean attribute; prevents interaction |

### UIKit-only concerns (NOT in headless)

- Visual variants (`elevated`, `outlined`, `filled`) are CSS-only; no headless state
- Slot layout (`header`, `(default)`, `footer`, `image`) is a rendering concern
- CSS animations for expand/collapse transitions
- Lifecycle events (`cv-expand`, `cv-collapse`)
- Imperative methods (`toggle()`, `expand()`, `collapse()`) that delegate to headless actions

## Minimum Test Matrix

- default state: `isExpandable = false`, `isExpanded = false`, `isDisabled = false`
- static card: `getCardProps()` returns empty or minimal object (no interactive attributes)
- static card: `getTriggerProps()` returns empty object
- static card: `getContentProps()` returns empty object
- static card: `toggle()`, `expand()`, `collapse()` are no-ops; `isExpanded` does not change
- expandable card: `toggle()` toggles `isExpanded` between `true` and `false`
- expandable card: `expand()` sets `isExpanded` to `true`; no-op if already expanded
- expandable card: `collapse()` sets `isExpanded` to `false`; no-op if already collapsed
- expandable card: `handleKeyDown(Enter)` toggles expanded state; calls `preventDefault`
- expandable card: `handleKeyDown(Space)` toggles expanded state; calls `preventDefault`
- expandable card: `ArrowDown` / `ArrowRight` expand a collapsed card; no-op on expanded card
- expandable card: `ArrowUp` / `ArrowLeft` collapse an expanded card; no-op on collapsed card
- expandable card: arrow keys call `preventDefault`
- expandable card: all keyboard/click interactions are no-ops when disabled
- expandable card: `aria-expanded` on trigger reflects `isExpanded`
- expandable card: `aria-controls` on trigger matches content region `id`
- expandable card: `aria-labelledby` on content matches trigger `id`
- expandable card: content region has `hidden = true` when collapsed
- expandable card: disabled trigger has `tabindex = '-1'` and `aria-disabled = 'true'`
- `onExpandedChange` fires on actual state transitions, not on no-ops
- `setDisabled(value)` updates disabled state regardless of expandable mode

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no `@statx/*` in headless core.
- **Layering**: `core -> interactions -> a11y-contracts -> adapters`; adapters remain thin mappings.
- **Independence**: No imports from `@project/*`, `apps/*`, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- visual variants (`elevated`, `outlined`, `filled`) are UIKit/CSS-only concerns
- sizes (card is a fluid container; no size state)
- slot layout and image positioning (rendering concern)
- clickable/linkable card (entire card as an anchor) — would require a separate interactive pattern
- card groups, card grids, or masonry layouts
- animation orchestration for expand/collapse (handled by UIKit visual layer)
- drag-and-drop reordering of cards
