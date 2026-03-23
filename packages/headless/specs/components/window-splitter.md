# Window Splitter Component Contract

## Purpose

`Window Splitter` (or Splitter) provides a headless APG-aligned model for a moveable separator between two panes, enabling users to resize them via keyboard or pointer interactions.

## Component Files

- `src/window-splitter/index.ts` - model and public `createWindowSplitter` API
- `src/window-splitter/window-splitter.test.ts` - unit behavior tests

---

## Orientation Semantics (ARIA-aligned)

The `orientation` option describes the physical orientation of the **separator bar itself**, not the layout direction. This matches ARIA conventions.

| `orientation` value | Separator bar direction | Layout split | Active arrow keys |
|---|---|---|---|
| `'vertical'` | Vertical bar (standing upright) | Left / right panes | `ArrowLeft` (decrease), `ArrowRight` (increase) |
| `'horizontal'` | Horizontal bar (lying flat) | Top / bottom panes | `ArrowUp` (decrease), `ArrowDown` (increase) |

**Important correction from earlier convention:** Prior versions of this spec had the mapping reversed (horizontal → left/right keys). The ARIA-aligned convention used here treats `orientation` as describing the separator element itself, not the axis of movement. A vertical separator divides content left and right; a horizontal separator divides content top and bottom.

The `aria-orientation` attribute exposed on the separator element reflects this same value directly.

---

## Public API

### `CreateWindowSplitterOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `idBase` | `string` | `'window-splitter'` | Base string used to derive stable element IDs and atom names. |
| `min` | `number` | `0` | Minimum allowed position value. |
| `max` | `number` | `100` | Maximum allowed position value. |
| `position` | `number` | mid-point of `[min, max]` | Initial position. |
| `step` | `number` | `1` | Amount moved per arrow-key press. |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Orientation of the separator bar (see Orientation Semantics section). |
| `isFixed` | `boolean` | `false` | When `true`, the splitter is in fixed mode: arrow keys are disabled and `Enter` toggles between min and max. |
| `ariaLabel` | `string` | — | Value for `aria-label` on the separator element. |
| `ariaLabelledBy` | `string` | — | Value for `aria-labelledby` on the separator element. |
| `primaryPaneId` | `string` | `'{idBase}-pane-primary'` | Explicit ID for the primary pane element. |
| `secondaryPaneId` | `string` | `'{idBase}-pane-secondary'` | Explicit ID for the secondary pane element. |
| `formatValueText` | `(value: number) => string` | — | Custom formatter for `aria-valuetext`. |
| `snap` | `string` | — | Optional space-separated list of snap positions. Each token is either a bare number (value in `[min, max]` units) or a percentage string ending in `%` (resolved as `min + pct/100 * (max - min)`). Example: `"25% 50% 75%"` or `"10 50 90"`. |
| `snapThreshold` | `number` | `12` | Maximum distance (in the same units as position) between the candidate position and a snap point for snapping to activate. |
| `onPositionChange` | `(value: number) => void` | — | Callback fired after position changes. Receives the post-snap, clamped value. Only called when the value actually changes. |

### State Signals

| Signal | Type | Description |
|---|---|---|
| `state.position` | `Atom<number>` | Current position, always clamped to `[min, max]`. |
| `state.min` | `Atom<number>` | Current minimum bound. |
| `state.max` | `Atom<number>` | Current maximum bound. |
| `state.orientation` | `Atom<'horizontal' \| 'vertical'>` | Current orientation of the separator bar. |
| `state.isDragging` | `Atom<boolean>` | Whether a pointer drag is in progress. |

### Actions

| Action | Signature | Description |
|---|---|---|
| `setPosition` | `(value: number) => void` | Set position to `value`. Applies snap logic then range clamping (see Snap Behavior). Fires `onPositionChange` if the value changed. |
| `moveStep` | `(direction: -1 \| 1) => void` | Move position by one `step` in the given direction. Fires `onPositionChange` if the value changed. |
| `moveToMin` | `() => void` | Move position to `min`. Fires `onPositionChange` if the value changed. |
| `moveToMax` | `() => void` | Move position to `max`. Fires `onPositionChange` if the value changed. |
| `startDragging` | `() => void` | Set `isDragging` to `true`. |
| `stopDragging` | `() => void` | Set `isDragging` to `false`. |
| `handleKeyDown` | `(event: Pick<KeyboardEvent, 'key'>) => void` | Dispatch keyboard intent to the appropriate action. |

### Contracts

| Method | Returns | Description |
|---|---|---|
| `getSplitterProps()` | `WindowSplitterProps` | ARIA and event props for the separator element. Must be called inside a reactive scope (reads signals). |
| `getPrimaryPaneProps()` | `WindowSplitterPaneProps` | Data attributes for the primary pane element. |
| `getSecondaryPaneProps()` | `WindowSplitterPaneProps` | Data attributes for the secondary pane element. |

### TypeScript Shapes

```ts
export interface WindowSplitterProps {
  id: string
  role: 'separator'
  tabindex: '0'
  'aria-valuenow': string
  'aria-valuemin': string
  'aria-valuemax': string
  'aria-valuetext'?: string
  'aria-orientation': WindowSplitterOrientation
  'aria-controls': string
  'aria-label'?: string
  'aria-labelledby'?: string
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface WindowSplitterPaneProps {
  id: string
  'data-pane': 'primary' | 'secondary'
  'data-orientation': WindowSplitterOrientation
}
```

---

## APG and A11y Contract

- role: `separator`
- Required attributes on the separator element:
  - `aria-valuenow`: current position (string)
  - `aria-valuemin`: minimum position (string)
  - `aria-valuemax`: maximum position (string)
  - `aria-orientation`: `'horizontal'` or `'vertical'` (see Orientation Semantics)
  - `aria-controls`: space-separated IDs of the pane elements being resized
  - `tabindex`: `'0'` — the splitter must be focusable
- Optional attributes:
  - `aria-label` or `aria-labelledby` — at least one should be provided for accessible labelling
  - `aria-valuetext` — human-readable position label via `formatValueText`

---

## Keyboard Contract

| Key | Orientation condition | Effect |
|---|---|---|
| `ArrowLeft` | `orientation === 'vertical'` | Decrease position by one `step` |
| `ArrowRight` | `orientation === 'vertical'` | Increase position by one `step` |
| `ArrowUp` | `orientation === 'horizontal'` | Decrease position by one `step` |
| `ArrowDown` | `orientation === 'horizontal'` | Increase position by one `step` |
| `Home` | any | Move position to `min` |
| `End` | any | Move position to `max` |
| `Enter` | any (`isFixed === true`) | Toggle between min and max (see Fixed Mode) |

Keys for the **inactive orientation** (e.g., `ArrowLeft`/`ArrowRight` when `orientation === 'horizontal'`) are no-ops and must not change state.

When `isFixed === true`, all arrow keys are disabled. Only `Enter`, `Home`, and `End` remain active.

---

## Fixed Mode

When `isFixed: true` is passed in options:

- Arrow keys (`ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`) are **disabled** — pressing them does nothing.
- `Home` and `End` still work as normal.
- `Enter` **toggles** position between `min` and `max`:
  - If `position <= midpoint` (where `midpoint = min + (max - min) / 2`), set position to `max`.
  - Otherwise, set position to `min`.
- `isFixed` defaults to `false`. When `false`, `Enter` has no effect.

This mode supports use cases like a collapsible sidebar where the splitter can only be "open" or "closed".

---

## Snap Behavior

When the `snap` option is provided, `setPosition` (and any action that ultimately calls it) applies snap logic before finalizing the value.

### Algorithm

1. **Parse** the `snap` string into an array of numeric positions:
   - Tokens ending in `%` are resolved as: `min + (pct / 100) * (max - min)`
   - Bare numeric tokens are used as-is (as values in `[min, max]` space)
   - Invalid tokens are ignored
2. **Clamp** the incoming position to `[min, max]`.
3. **Find** the nearest snap point from the parsed array.
4. **Snap**: if `|clampedPosition - nearestSnapPoint| <= snapThreshold`, use `nearestSnapPoint` as the final position.
5. Otherwise, use the clamped position unchanged.
6. **Fire** `onPositionChange` with the final post-snap value (only if it differs from the previous position).

### Defaults

- `snap`: not set (snapping disabled)
- `snapThreshold`: `12`

### Examples

```
min=0, max=100, snap="25% 50% 75%", snapThreshold=12
  setPosition(28)  → nearest snap = 25, distance = 3  ≤ 12  → final = 25
  setPosition(40)  → nearest snap = 50, distance = 10 ≤ 12  → final = 50
  setPosition(62)  → nearest snap = 75, distance = 13 > 12  → final = 62 (no snap)

min=0, max=200, snap="50 100 150", snapThreshold=12
  setPosition(55)  → nearest snap = 50, distance = 5  ≤ 12  → final = 50
  setPosition(70)  → nearest snap = 50, distance = 20 > 12 and to 100 distance = 30 > 12 → final = 70
```

---

## Behavior Contract

- `Window Splitter` manages the numerical state of the split. The actual resizing of DOM elements is handled by the adapter (e.g., via CSS variables or direct style updates).
- `orientation` determines which arrow keys are active (see Orientation Semantics and Keyboard Contract).
- `step` size for keyboard navigation is configurable via `CreateWindowSplitterOptions`.
- `onPositionChange` is only fired when the position value **actually changes** (comparing pre- and post-action values). No spurious calls on no-ops.

---

## Invariants

- `position` must always be clamped between `min` and `max`.
- `aria-valuenow` must be updated in real-time during dragging or keyboard interaction.
- The splitter must be focusable (tabindex `'0'`) to allow keyboard users to resize panes.
- Arrow keys for the inactive orientation must have no effect on state.
- `onPositionChange` must never fire when the position did not change.

---

## Adapter Expectations

The UIKit adapter (e.g., a Solid.js or Angular binding) is expected to:

### Signals read by the adapter

| Signal | Usage |
|---|---|
| `state.position` | Drive CSS variable or style for pane size |
| `state.isDragging` | Apply a drag-active CSS class or `user-select: none` |
| `state.orientation` | Conditionally apply layout CSS |

### Actions called by the adapter

| Action | When |
|---|---|
| `startDragging()` | On `pointerdown` on the separator element |
| `setPosition(value)` | On `pointermove` while dragging (adapter computes pixel-to-unit value) |
| `stopDragging()` | On `pointerup` |
| `handleKeyDown(event)` | On `keydown` on the separator element |

### Contracts spread by the adapter

The adapter calls `getSplitterProps()`, `getPrimaryPaneProps()`, and `getSecondaryPaneProps()` inside a reactive computation and spreads the returned objects directly onto the corresponding DOM elements.

### Pointer event drag contract

```
pointerdown on separator
  → actions.startDragging()
  → element.setPointerCapture(event.pointerId)

pointermove (while captured)
  → actions.setPosition(computedValue)   // adapter converts pointer offset to numeric position

pointerup / pointercancel
  → actions.stopDragging()
  → element.releasePointerCapture(event.pointerId)  // optional; browser releases automatically on pointerup
```

### Snap and `snapThreshold` pass-through

The UIKit adapter reads `snap` and `snapThreshold` from element attributes (or component props) and passes them directly to `createWindowSplitter`. The adapter does not implement snap logic itself — it is fully handled inside the headless model.

---

## Minimum Test Matrix

| Test case | What is verified |
|---|---|
| Arrow keys move position (vertical orientation) | `ArrowLeft` decreases, `ArrowRight` increases; `ArrowUp`/`ArrowDown` are no-ops |
| Arrow keys move position (horizontal orientation) | `ArrowUp` decreases, `ArrowDown` increases; `ArrowLeft`/`ArrowRight` are no-ops |
| Inactive-orientation keys are no-ops | Neither signal changes nor `onPositionChange` fires |
| `Home` moves to `min` | Position becomes `min` regardless of current position |
| `End` moves to `max` | Position becomes `max` regardless of current position |
| Clamping at boundaries | `setPosition` beyond `max` clamps to `max`; below `min` clamps to `min` |
| `aria-valuenow` synchronization | Reflects current position after every update |
| Drag lifecycle | `startDragging` → `isDragging === true`; `stopDragging` → `isDragging === false` |
| `aria-controls` linkage | `getSplitterProps()['aria-controls']` contains both pane IDs |
| `onPositionChange` only fires on actual change | Calling `setPosition(currentValue)` does not invoke the callback |
| Fixed mode — Enter toggles to max | When `position <= midpoint`, Enter sets position to `max` |
| Fixed mode — Enter toggles to min | When `position > midpoint`, Enter sets position to `min` |
| Fixed mode — arrow keys disabled | Arrow keys do nothing when `isFixed === true` |
| Snap within threshold | `setPosition` value within `snapThreshold` of a snap point → snaps to that point |
| Snap beyond threshold | `setPosition` value beyond `snapThreshold` of all snap points → no snap |
| Snap percentage resolution | `"50%"` with `min=0, max=200` resolves to `100` |
| Snap no-op when `snap` not set | Normal `setPosition` behavior without snap string |
| `onPositionChange` receives post-snap value | Callback value equals the snapped position, not the raw input |

---

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no `@statx/*` in headless core.
- **Layering**: core → interactions → a11y-contracts → adapters; adapters remain thin mappings.
- **Independence**: No imports from `@project/*`, `apps/*`, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

---

## Out of Scope (Current)

- Multiple splitters in a single container (nested splitters)
- "Collapsible" panes (where the pane can be hidden completely)
- Persistent state (saving position to localStorage)
- Touch-specific gesture optimization (should be handled in the adapter)
