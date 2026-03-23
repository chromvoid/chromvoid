# Tooltip Component Contract

## Purpose

`Tooltip` is a headless contract for providing contextual information when a user hovers over, focuses on, clicks, or programmatically targets an element. It manages visibility state, trigger mode routing, and ARIA linkage.

## Component Files

- `src/tooltip/index.ts` - model and public `createTooltip` API
- `src/tooltip/tooltip.test.ts` - unit behavior tests

## Public API

### Factory

```ts
createTooltip(options?: CreateTooltipOptions): TooltipModel
```

### Options

| Option         | Type      | Default          | Description                                                                                                      |
|----------------|-----------|------------------|------------------------------------------------------------------------------------------------------------------|
| `idBase`       | `string`  | `'tooltip'`      | Prefix used for all generated IDs.                                                                               |
| `initialOpen`  | `boolean` | `false`          | Whether the tooltip is visible on first render.                                                                  |
| `isDisabled`   | `boolean` | `false`          | When `true`, all trigger interactions and `open` are no-ops; `aria-describedby` is removed from trigger props.  |
| `showDelay`    | `number`  | `0`              | Milliseconds before the tooltip opens (clamped to `>= 0`).                                                       |
| `hideDelay`    | `number`  | `0`              | Milliseconds before the tooltip closes (clamped to `>= 0`).                                                      |
| `trigger`      | `string`  | `'hover focus'`  | Space-separated list of trigger modes. Supported tokens: `hover`, `focus`, `click`, `manual`.                   |

#### Trigger Mode Semantics

- **`hover`** — `pointerenter` schedules open (via `showDelay`); `pointerleave` schedules close (via `hideDelay`).
- **`focus`** — `focus` schedules open; `blur` schedules close.
- **`click`** — clicking the trigger element toggles open/close. The `Escape` key still closes.
- **`manual`** — no automatic interaction handlers; only `show()` and `hide()` actions control visibility. If `manual` is the **only** token in the list, pointer, focus, and keyboard events do not open or close the tooltip.
- Multiple tokens may be combined (e.g., `'hover focus'`, `'click focus'`).
- An unknown token is silently ignored.

### Signals (State)

| Signal       | Type              | Description                                 |
|--------------|-------------------|---------------------------------------------|
| `isOpen`     | `Atom<boolean>`   | Whether the tooltip is currently visible.   |
| `isDisabled` | `Atom<boolean>`   | Whether all interactions are suppressed.    |

### Actions

| Action                    | Signature                                          | Description                                                                                                                 |
|---------------------------|----------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| `open`                    | `() => void`                                       | Immediately opens the tooltip (no delay). No-op when `isDisabled` is `true`.                                               |
| `close`                   | `() => void`                                       | Immediately closes the tooltip (clears pending timers).                                                                     |
| `show`                    | `() => void`                                       | Programmatic open respecting `showDelay`. Intended as the primary action for `manual` mode. No-op when disabled.            |
| `hide`                    | `() => void`                                       | Programmatic close respecting `hideDelay`. Intended as the primary action for `manual` mode.                                |
| `setDisabled`             | `(value: boolean) => void`                         | Updates `isDisabled`. When set to `true`, calls `close()`.                                                                  |
| `handleKeyDown`           | `(event: Pick<KeyboardEvent, 'key'>) => void`      | `Escape` calls `close()`. Other keys are no-ops. Always active regardless of trigger mode (enables keyboard dismissal).     |
| `handlePointerEnter`      | `() => void`                                       | Schedules open when `hover` is in trigger modes; otherwise no-op.                                                           |
| `handlePointerLeave`      | `() => void`                                       | Schedules close when `hover` is in trigger modes; otherwise no-op.                                                          |
| `handleFocus`             | `() => void`                                       | Schedules open when `focus` is in trigger modes; otherwise no-op.                                                           |
| `handleBlur`              | `() => void`                                       | Schedules close when `focus` is in trigger modes; otherwise no-op.                                                          |
| `handleClick`             | `() => void`                                       | Toggles `isOpen` when `click` is in trigger modes; otherwise no-op. Clears any pending timers on toggle.                   |

### Contracts

#### `getTriggerProps()`

Returns props to spread onto the trigger element. The exact set of handlers depends on the active trigger modes.

| Prop                 | Always present | Condition                              | Value                             |
|----------------------|----------------|----------------------------------------|-----------------------------------|
| `id`                 | Yes            | —                                      | `${idBase}-trigger`               |
| `aria-describedby`   | Yes            | `undefined` when `isDisabled`          | `${idBase}-content` or `undefined`|
| `onPointerEnter`     | No             | `hover` in trigger modes               | `handlePointerEnter`              |
| `onPointerLeave`     | No             | `hover` in trigger modes               | `handlePointerLeave`              |
| `onFocus`            | No             | `focus` in trigger modes               | `handleFocus`                     |
| `onBlur`             | No             | `focus` in trigger modes               | `handleBlur`                      |
| `onClick`            | No             | `click` in trigger modes               | `handleClick`                     |
| `onKeyDown`          | Yes            | —                                      | `handleKeyDown`                   |

When `manual` is the only trigger mode, only `id`, `aria-describedby`, and `onKeyDown` are returned. No pointer, focus, or click handlers are attached.

#### `getTooltipProps()`

Returns props to spread onto the tooltip content element.

| Prop       | Value                    | Notes                                    |
|------------|--------------------------|------------------------------------------|
| `id`       | `${idBase}-content`      | Referenced by `aria-describedby`.        |
| `role`     | `'tooltip'`              | ARIA landmark role.                      |
| `tabindex` | `'-1'`                   | Tooltip is never in the tab order.       |
| `hidden`   | `!isOpen()`              | Reflects current visibility.             |

## APG and A11y Contract

- role: `tooltip`
- trigger: `aria-describedby` on the trigger links to the tooltip element ID
- behavior:
  - when `hover` is active: opens on `pointerenter`, closes on `pointerleave`
  - when `focus` is active: opens on `focus`, closes on `blur`
  - when `click` is active: toggles on click
  - `Escape` always dismisses regardless of trigger mode
  - tooltip does not receive keyboard focus (`tabindex="-1"`)
  - `aria-describedby` is omitted when the component is disabled

## Behavior Contract

### Delays

- `showDelay` applies to `scheduleOpen` (used by `hover`, `focus`, and `show`).
- `hideDelay` applies to `scheduleClose` (used by `hover`, `focus`, and `hide`).
- `handleClick` and `open`/`close` bypass delay timers and act immediately.
- Calling `scheduleOpen` cancels any pending `scheduleClose`, and vice-versa.

### Timer Cancellation Rules

| Action               | Cancels show timer | Cancels hide timer |
|----------------------|--------------------|--------------------|
| `scheduleOpen`       | Yes                | Yes                |
| `scheduleClose`      | Yes                | Yes                |
| `open` (direct)      | Yes                | Yes                |
| `close` (direct)     | Yes                | Yes                |
| `handleClick`        | Yes                | Yes                |
| `handleKeyDown (Esc)`| Yes (via `close`)  | Yes (via `close`)  |

### Disabled State

- `open`, `show`, `handlePointerEnter`, `handleFocus`, and `handleClick` are all no-ops when `isDisabled` is `true`.
- `close` and `hide` remain operative to ensure the tooltip can always be dismissed.
- `setDisabled(true)` immediately calls `close()`.
- `aria-describedby` is `undefined` in trigger props when disabled.

## State Transitions

| From state     | Trigger / Event                          | Condition                                   | To state   |
|----------------|------------------------------------------|---------------------------------------------|------------|
| closed         | `pointerenter`                           | `hover` in modes, not disabled              | opening*   |
| opening*       | `showDelay` elapsed                      | —                                           | open       |
| open           | `pointerleave`                           | `hover` in modes                            | closing*   |
| closing*       | `hideDelay` elapsed                      | —                                           | closed     |
| closed         | `focus`                                  | `focus` in modes, not disabled              | opening*   |
| open           | `blur`                                   | `focus` in modes                            | closing*   |
| closed         | `click`                                  | `click` in modes, not disabled              | open       |
| open           | `click`                                  | `click` in modes                            | closed     |
| open           | `Escape`                                 | any mode                                    | closed     |
| any            | `show()`                                 | `manual` in modes (or any), not disabled    | opening*   |
| any            | `hide()`                                 | `manual` in modes (or any)                  | closing*   |
| any            | `setDisabled(true)`                      | —                                           | closed     |
| closed/open    | `pointerenter` / `focus` / `click`       | `manual` is the only mode                   | no change  |

\* "opening" and "closing" are transient timer states, not separate signal values. `isOpen` remains unchanged until the respective timer fires.

## Invariants

1. `isOpen` is always a `boolean`.
2. The tooltip content element is never in the natural tab order (`tabindex="-1"` is always set).
3. `aria-describedby` on the trigger always references the tooltip element ID, unless `isDisabled` is `true`.
4. When `isDisabled` is `true`, `isOpen` must be `false` (enforced by `setDisabled`).
5. `showDelay` and `hideDelay` are clamped to `>= 0`; negative values behave as `0`.
6. Only one show timer and one hide timer may be pending at any time.
7. When `manual` is the **only** trigger mode, `handlePointerEnter`, `handlePointerLeave`, `handleFocus`, `handleBlur`, and `handleClick` all have no effect on `isOpen`.
8. `handleClick` has no effect unless `click` is in the trigger modes.
9. `getTriggerProps()` must not include `onClick` unless `click` is an active trigger mode.
10. `getTriggerProps()` must not include `onPointerEnter`/`onPointerLeave` unless `hover` is an active trigger mode.
11. `getTriggerProps()` must not include `onFocus`/`onBlur` unless `focus` is an active trigger mode.
12. `onKeyDown` (`handleKeyDown`) is always present in trigger props, regardless of trigger mode.

## Minimum Test Matrix

### Hover mode
- hover open/close lifecycle with delays
- timer cancellation on re-enter during hide delay
- timer cancellation on leave during show delay
- zero-delay immediate open/close

### Focus mode
- focus open/close lifecycle with delays
- zero-delay immediate open/close

### Click mode
- single click opens when closed
- single click closes when open
- click does not fire when disabled
- `Escape` still closes when in click mode

### Manual mode
- `show()` opens (respects `showDelay`)
- `hide()` closes (respects `hideDelay`)
- `show()` is no-op when disabled
- `handlePointerEnter`, `handleFocus`, `handleClick` have no effect when `manual` is the only mode
- `getTriggerProps()` does not include pointer/focus/click handlers when `manual` is the only mode

### Keyboard
- `Escape` dismisses
- `Escape` cancels pending show timer
- non-`Escape` keys are ignored

### ARIA
- `aria-describedby` links trigger to tooltip ID when not disabled
- `aria-describedby` is `undefined` when disabled
- `aria-describedby` persists regardless of open state (when enabled)
- tooltip has `role="tooltip"` and `tabindex="-1"`
- `hidden` prop reflects `isOpen` state

### Disabled
- `setDisabled(true)` immediately closes
- interactions do not open when disabled
- `open()` / `show()` are no-ops when disabled
- `setDisabled(false)` re-enables interactions

### getTriggerProps handler presence
- `click` mode: `onClick` present, `onPointerEnter`/`onPointerLeave` absent (unless also `hover`)
- `hover` mode: pointer handlers present, `onClick` absent (unless also `click`)
- `manual`-only mode: only `id`, `aria-describedby`, `onKeyDown` returned
- `hover focus` (default): all four interaction handlers present, no `onClick`

### Defaults
- `createTooltip()` with no options: `isOpen=false`, `isDisabled=false`, trigger=`'hover focus'`, IDs use `'tooltip'` prefix

## Adapter Expectations

Headless adapters (e.g., the UIKit `cv-tooltip` web component, React wrappers) MUST:

1. Read the `trigger` attribute/prop as a space-separated string and pass it to `createTooltip({ trigger })`.
2. Spread `getTriggerProps()` onto the host trigger element. Adapters must not hard-code individual handler names; the returned props are the source of truth for which events to listen to.
3. Spread `getTooltipProps()` onto the tooltip content container.
4. Expose `show()` and `hide()` as public methods on the component (for `manual` mode consumers).
5. Expose `setDisabled(value)` when the host element supports a `disabled` attribute.
6. NOT attach `onclick`, `onfocus`, `onblur`, `onpointerenter`, or `onpointerleave` handlers independently—use only what `getTriggerProps()` returns.
7. Correctly forward `handleKeyDown` to the `keydown` event of the trigger element at all times.
8. Run integration tests that verify: (a) click toggle works end-to-end, (b) `show`/`hide` works in manual mode, (c) ARIA attributes are present and correctly linked.

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- rich content tooltips (use popover patterns)
- interactive tooltips (where user can move mouse into the tooltip)
- positioning logic (handled by consumer or dedicated utility like Floating UI)
