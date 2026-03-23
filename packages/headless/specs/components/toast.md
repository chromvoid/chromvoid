# Toast Component Contract

## Purpose

`Toast` provides a headless notification queue model with dismiss, auto-dismiss, and pause/resume timing behavior. Composite architecture: `cv-toast-region` (container) + `cv-toast` (per-item).

## Component Files

- `src/toast/index.ts` - model and public `createToast` API
- `src/toast/toast.test.ts` - unit behavior tests

## Public API

- `createToast(options)`
- `state` (signal-backed):
  - `items()` - full toast queue
  - `visibleItems()` - top `maxVisible` slice
  - `isPaused()` - pause state for timers
- `actions`:
  - `push(item)` - enqueue toast and return generated id
  - `dismiss(id)`
  - `clear()`
  - `pause()`
  - `resume()`
- `contracts`:
  - `getRegionProps()`
  - `getToastProps(id)`
  - `getDismissButtonProps(id)`

## CreateToastOptions

| Option            | Type                       | Default     | Description                                      |
|-------------------|----------------------------|-------------|--------------------------------------------------|
| `idBase`          | `string`                   | `'toast'`   | Base id prefix for all generated ids             |
| `initialItems`    | `readonly ToastItem[]`     | `[]`        | Pre-populated toast items                        |
| `maxVisible`      | `number`                   | `3`         | Maximum number of toasts shown (clamped >= 1)    |
| `defaultDurationMs` | `number`                | `5000`      | Default auto-dismiss duration (clamped >= 0)     |
| `ariaLive`        | `'polite' \| 'assertive'` | `'polite'`  | `aria-live` value for the region                 |

## State Signal Surface

| Signal         | Type                   | Derived? | Description                                        |
|----------------|------------------------|----------|----------------------------------------------------|
| `items`        | `Atom<ToastItem[]>`    | No       | Full toast queue, newest-first                     |
| `visibleItems` | `Computed<ToastItem[]>`| Yes      | `items().slice(0, maxVisible)`                     |
| `isPaused`     | `Atom<boolean>`        | No       | Whether auto-dismiss timers are paused             |

## APG and A11y Contract

- region role: `region`
- region attributes:
  - `aria-live` (`polite` or `assertive`)
  - `aria-atomic="false"`
- toast item role:
  - `status` for `info`/`success`
  - `alert` for `warning`/`error`
- dismiss button role: `button`

## Keyboard Contract

- model-level keyboard behavior is intentionally minimal
- keyboard bindings for dismiss shortcuts are adapter-level
- dismiss action is exposed through dismiss-button contract handlers

## Behavior Contract

- pushing a toast prepends it to queue (`newest-first`).
- queue visibility is constrained by `maxVisible`.
- auto-dismiss timers are tracked per toast id.
- pause computes and stores remaining durations; resume continues from remaining time.
- no auto-dismiss is scheduled when duration is `<= 0`.

## Contract Prop Shapes

### `getRegionProps()`
```ts
{
  id: string                          // '{idBase}-region'
  role: 'region'
  'aria-live': 'polite' | 'assertive' // from options.ariaLive
  'aria-atomic': 'false'
}
```

### `getToastProps(id)`
```ts
{
  id: string                          // '{idBase}-item-{id}'
  role: 'status' | 'alert'           // 'status' for info/success, 'alert' for warning/error
  'data-level': ToastLevel            // 'info' | 'success' | 'warning' | 'error'
}
```

### `getDismissButtonProps(id)`
```ts
{
  id: string                          // '{idBase}-dismiss-{id}'
  role: 'button'
  tabindex: '0'
  'aria-label': 'Dismiss notification'
  onClick: () => void                 // calls dismiss(id)
}
```

## Transitions Table

| Event / Action            | Current State           | Next State / Effect                                                |
|---------------------------|-------------------------|--------------------------------------------------------------------|
| `push(item)`              | any                     | New toast prepended to `items`; auto-dismiss timer scheduled; returns generated id |
| `push(item)` (paused)     | `isPaused = true`       | New toast prepended to `items`; remaining duration stored but no timer started |
| `dismiss(id)`             | toast exists in `items` | Toast removed from `items`; timer and tracking data cleared        |
| `clear()`                 | any                     | All items removed; all timers and tracking data cleared            |
| `pause()`                 | `isPaused = false`      | `isPaused = true`; all running timers stopped; remaining durations computed and stored |
| `pause()`                 | `isPaused = true`       | no-op                                                              |
| `resume()`                | `isPaused = true`       | `isPaused = false`; auto-dismiss timers rescheduled from remaining durations |
| `resume()`                | `isPaused = false`      | no-op                                                              |
| timer fires (auto-dismiss)| toast exists, timer done| `dismiss(id)` called; toast removed from queue                     |

### Derived state reactions

| State Change              | `visibleItems`                              |
|---------------------------|---------------------------------------------|
| `items` changes           | Recomputed as `items().slice(0, maxVisible)` |

## Invariants

1. `visibleItems` always equals `items().slice(0, maxVisible)`.
2. `clear` removes all queue items and all timer tracking data.
3. No auto-dismiss is scheduled when duration is `<= 0`.
4. Role mapping is level-dependent: `role="status"` for `info`/`success`, `role="alert"` for `warning`/`error`.
5. `getToastProps(id)` throws if the toast id is not found in `items`.
6. `pause()` is idempotent when already paused; `resume()` is idempotent when not paused.
7. Remaining duration after pause/resume must preserve elapsed time accurately.

## Adapter Expectations

UIKit adapters MUST bind to the headless model as follows:

**Signals read (reactive, drive re-renders):**
- `state.items()` — full toast queue for iteration
- `state.visibleItems()` — sliced queue for rendering visible toasts
- `state.isPaused()` — whether auto-dismiss timers are paused (for hover pause behavior)

**Actions called (event handlers, never mutate state directly):**
- `actions.push(item)` — enqueue a new toast notification
- `actions.dismiss(id)` — dismiss a specific toast
- `actions.clear()` — dismiss all toasts
- `actions.pause()` — pause auto-dismiss timers (e.g., on mouse enter region)
- `actions.resume()` — resume auto-dismiss timers (e.g., on mouse leave region)

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getRegionProps()` — spread onto the `cv-toast-region` container element
- `contracts.getToastProps(id)` — spread onto each `cv-toast` item element (returns `role: 'status' | 'alert'` based on toast level)
- `contracts.getDismissButtonProps(id)` — spread onto the dismiss button inside each toast (includes `onClick` handler)

**UIKit-only concerns (NOT in headless):**
- Positioning and stacking layout (`position` attribute on `cv-toast-region`)
- Entry/exit animations and transitions
- Icon slot rendering per severity level
- Closable attribute controlling dismiss button visibility
- Lifecycle events (`cv-dismiss`, etc.)
- Mouse enter/leave region handlers that call `pause()`/`resume()`

## Minimum Test Matrix

- push/dismiss queue operations
- auto-dismiss timing behavior
- pause/resume preserving remaining duration
- max-visible slicing behavior
- role mapping for different toast levels (`status` for info/success, `alert` for warning/error)
- `getRegionProps` returns correct `aria-live` and `role`
- `getDismissButtonProps` onClick calls dismiss
- `getToastProps` throws for unknown id
- clear removes all items and tracking
- push while paused stores duration without starting timer

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- animation and transition orchestration
- swipe/gesture dismissal
- viewport positioning and stacking rules
- cross-tab or persistent notification history
- progress bar or loading variant
- title field (message-only content)
