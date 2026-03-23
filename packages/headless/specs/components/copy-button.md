# CopyButton Component Contract

## Purpose

`CopyButton` is a headless contract for a button that copies a value to the system clipboard. It manages a three-phase feedback cycle (`idle` -> `success`/`error` -> `idle`), supports both synchronous string values and async getters for lazy/sensitive data, and provides complete ARIA semantics including a live-region status announcement.

## Component Files

- `src/copy-button/index.ts` - model and public `createCopyButton` API
- `src/copy-button/copy-button.test.ts` - unit behavior tests

## Options (`CreateCopyButtonOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `value` | `string \| (() => Promise<string>)` | `''` | Text to copy, or async getter for lazy/sensitive values |
| `feedbackDuration` | `number` | `1500` | Milliseconds to show success/error before reverting to idle (clamped >= 0) |
| `isDisabled` | `boolean` | `false` | Whether the button starts in a disabled state |
| `ariaLabel` | `string \| undefined` | `undefined` | Accessible label for the button (e.g., `'Copy password'`) |
| `onCopy` | `(value: string) => void \| undefined` | `undefined` | Called on successful copy with the resolved value |
| `onError` | `(error: unknown) => void \| undefined` | `undefined` | Called when copy fails with the error |
| `clipboard` | `{ writeText(text: string): Promise<void> } \| undefined` | `navigator.clipboard` | Injectable clipboard adapter for testing and environments without native clipboard API |

## Type Definitions

```ts
type CopyButtonStatus = 'idle' | 'success' | 'error';
```

## Public API

### `createCopyButton(options?: CreateCopyButtonOptions): CopyButtonModel`

### State (signal-backed)

| Signal | Type | Derived? | Description |
|--------|------|----------|-------------|
| `status()` | `Atom<CopyButtonStatus>` | No | Current feedback phase: `'idle'`, `'success'`, or `'error'` |
| `isDisabled()` | `Atom<boolean>` | No | Whether the button is disabled |
| `isCopying()` | `Computed<boolean>` | Yes | `true` while the async copy operation is in-flight (between invocation and clipboard resolution) |
| `feedbackDuration()` | `Atom<number>` | No | Milliseconds to display success/error before reverting to idle |
| `value()` | `Atom<string \| (() => Promise<string>)>` | No | Current value or async getter |
| `isIdle()` | `Computed<boolean>` | Yes | Derived: `status() === 'idle'` |
| `isSuccess()` | `Computed<boolean>` | Yes | Derived: `status() === 'success'` |
| `isError()` | `Computed<boolean>` | Yes | Derived: `status() === 'error'` |
| `isUnavailable()` | `Computed<boolean>` | Yes | Derived: `isDisabled() \|\| isCopying()` — the button cannot be activated |

### Actions

| Action | Signature | Description |
|--------|-----------|-------------|
| `copy` | `() => Promise<void>` | Triggers the full copy cycle: resolve value, write to clipboard, transition to success/error, schedule revert. No-op if `isUnavailable()` is `true`. |
| `setDisabled` | `(v: boolean) => void` | Sets the disabled state |
| `setFeedbackDuration` | `(v: number) => void` | Sets feedback duration (clamped >= 0) |
| `setValue` | `(v: string \| (() => Promise<string>)) => void` | Sets the value or async getter |
| `reset` | `() => void` | Forces status back to `'idle'`, cancels any pending revert timer, clears `isCopying` |

### Contracts

| Contract | Return type | Description |
|----------|-------------|-------------|
| `getButtonProps()` | `CopyButtonProps` | Ready-to-spread ARIA attribute map and event handlers for the button element |
| `getStatusProps()` | `CopyStatusProps` | Ready-to-spread attributes for the live-region status announcement element |
| `getIconContainerProps(which)` | `CopyIconProps` | Ready-to-spread attributes for each icon container based on current status |

#### `CopyButtonProps` shape

```ts
{
  role: 'button'
  tabindex: '0' | '-1'           // '0' when interactive, '-1' when unavailable
  'aria-disabled': 'true' | 'false'  // reflects isUnavailable()
  'aria-label'?: string           // from options.ariaLabel; updates to include status feedback
  onClick: (e: Event) => void     // calls copy()
  onKeyDown: (e: KeyboardEvent) => void  // Enter triggers copy()
  onKeyUp: (e: KeyboardEvent) => void    // Space triggers copy()
}
```

**`aria-label` resolution:**
- If `options.ariaLabel` is set and status is `'idle'`: returns `ariaLabel` as-is
- If `options.ariaLabel` is set and status is `'success'`: returns `'Copied'`
- If `options.ariaLabel` is set and status is `'error'`: returns `'Copy failed'`
- If `options.ariaLabel` is not set: `aria-label` is omitted (consumer provides labeling externally)

#### `CopyStatusProps` shape

```ts
{
  role: 'status'
  'aria-live': 'polite'
  'aria-atomic': 'true'
}
```

This region is always present in the DOM. Its text content is managed by the adapter:
- `'idle'`: empty or hidden
- `'success'`: "Copied" (or localized equivalent)
- `'error'`: "Copy failed" (or localized equivalent)

#### `CopyIconProps` shape

`getIconContainerProps(which: 'copy' | 'success' | 'error')` returns:

```ts
{
  'aria-hidden': 'true'          // icons are always decorative
  hidden?: boolean               // true when this icon is NOT the active one for current status
}
```

Visibility logic:
- `which === 'copy'`: visible when `status() === 'idle'`
- `which === 'success'`: visible when `status() === 'success'`
- `which === 'error'`: visible when `status() === 'error'`

## APG and A11y Contract

- role: `button`
- required attributes:
  - `aria-disabled`: reflects `isUnavailable()` (`isDisabled || isCopying`)
  - `tabindex`: `0` when interactive, `-1` when unavailable
- status announcement:
  - A sibling `role="status"` live region with `aria-live="polite"` and `aria-atomic="true"` announces copy outcome to assistive technology
- focus management:
  - The button is in the page tab sequence when interactive (`tabindex="0"`)
  - Focus is not moved programmatically after copy; the button retains focus
- keyboard interaction:
  - `Enter`: triggers copy on `keydown`
  - `Space`: triggers copy on `keyup`

## Keyboard Contract

| Key | Event | Guard | Effect |
|-----|-------|-------|--------|
| `Enter` | `keydown` | `!isUnavailable()` | Calls `copy()` |
| `Space` | `keyup` | `!isUnavailable()` | Calls `copy()` |
| `Space` | `keydown` | any | `preventDefault()` to prevent page scroll |

## Behavior Contract

- **Copy cycle**: calling `copy()` executes the following sequence:
  1. Guard: if `isUnavailable()` is `true`, return immediately (no-op)
  2. Set internal `isCopying` tracking flag to `true`
  3. Resolve value: if `value` is a function, `await value()`; otherwise use the string directly. If the getter throws, transition to `'error'` and skip clipboard write.
  4. Write to clipboard via `clipboard.writeText(resolvedValue)`
  5. On success: set `status` to `'success'`, call `onCopy(resolvedValue)` callback
  6. On failure: set `status` to `'error'`, call `onError(error)` callback
  7. Clear `isCopying` flag
  8. Schedule revert: after `feedbackDuration` ms, set `status` back to `'idle'` (only if status has not been changed by another action, e.g., `reset()`)
- **Timer management**: only one revert timer is active at a time. A new `copy()` call cancels any pending revert timer before starting a new cycle.
- **Reset**: `reset()` cancels any pending revert timer, clears `isCopying`, and forces `status` to `'idle'`.
- **Zero feedback duration**: when `feedbackDuration` is `0`, the revert to idle happens synchronously (via `setTimeout(fn, 0)`).
- **Disabled state**: when `isDisabled` is `true`, `copy()` is a no-op. `setDisabled`, `setValue`, `setFeedbackDuration`, and `reset` remain callable.

## Transitions Table

| Event / Action | Guard | Current Status | Next Status | Side Effects |
|----------------|-------|----------------|-------------|--------------|
| `copy()` | `isUnavailable()` | any | no change | no-op |
| `copy()` (value resolves, clipboard succeeds) | `!isUnavailable()` | `idle` | `success` | `isCopying`: true -> false; `onCopy(value)` called; revert timer scheduled |
| `copy()` (value resolves, clipboard fails) | `!isUnavailable()` | `idle` | `error` | `isCopying`: true -> false; `onError(err)` called; revert timer scheduled |
| `copy()` (async getter throws) | `!isUnavailable()` | `idle` | `error` | `isCopying`: true -> false; `onError(err)` called; revert timer scheduled |
| `copy()` during feedback | `!isUnavailable()` | `success` / `error` | `success` / `error` | Previous revert timer cancelled; new cycle begins |
| revert timer fires | status unchanged since schedule | `success` / `error` | `idle` | timer reference cleared |
| `reset()` | none | any | `idle` | Pending revert timer cancelled; `isCopying` cleared |
| `setDisabled(true)` | none | any | no status change | `isDisabled` = true; `isUnavailable` recomputes |
| `setDisabled(false)` | none | any | no status change | `isDisabled` = false; `isUnavailable` recomputes |
| `setValue(v)` | none | any | no status change | `value` updated |
| `setFeedbackDuration(v)` | none | any | no status change | `feedbackDuration` updated (clamped >= 0); does not affect running timers |

### Derived state reactions

| State Change | Derived Signal | Recomputation |
|-------------|----------------|---------------|
| `status` changes | `isIdle`, `isSuccess`, `isError` | Recomputed from `status()` |
| `isDisabled` or `isCopying` changes | `isUnavailable` | Recomputed as `isDisabled() \|\| isCopying()` |
| `status` changes | `getButtonProps()` | `aria-disabled`, `tabindex`, `aria-label` recomputed |
| `status` changes | `getIconContainerProps(which)` | `hidden` recomputed per icon |

## Invariants

1. `status` must be one of `'idle'`, `'success'`, or `'error'` at all times.
2. `isUnavailable` must be `true` whenever `isDisabled` or `isCopying` is `true`.
3. `copy()` must be a no-op when `isUnavailable()` is `true` — no clipboard write, no state change, no callbacks.
4. At most one revert timer may be active at any time. Starting a new copy cycle or calling `reset()` cancels the previous timer.
5. `isCopying` must be `true` only during the async window between copy invocation and clipboard resolution; it must be `false` at all other times.
6. `aria-disabled` must reflect `isUnavailable()`, not just `isDisabled()`.
7. `tabindex` must be `'0'` when the button is interactive, `'-1'` when `isUnavailable()` is `true`.
8. `getIconContainerProps(which)` must set `hidden` to `true` for exactly two of the three icon types at any time (only the icon matching current `status` is visible).
9. `onCopy` must only be called on successful clipboard write; `onError` must only be called on failure.
10. `feedbackDuration` must be clamped to `>= 0`. Negative values are treated as `0`.
11. After `reset()`, `status` must be `'idle'`, `isCopying` must be `false`, and no revert timer may be pending.
12. The status live region (`getStatusProps()`) must always have `role="status"`, `aria-live="polite"`, and `aria-atomic="true"` regardless of component state.

## Adapter Expectations

This section defines what UIKit (`cv-copy-button`) binds to from the headless model.

### Signals read by adapter

| Signal | UIKit usage |
|--------|-------------|
| `state.status()` | Maps to `status` host attribute for CSS state styling; drives icon visibility and status text content |
| `state.isDisabled()` | Maps to `disabled` host attribute; reflects native disabled styling |
| `state.isCopying()` | Maps to `copying` host attribute for loading indicator styling (e.g., spinner) |
| `state.isUnavailable()` | Used to determine if click/keyboard should be suppressed; reflected in ARIA via contracts |
| `state.isIdle()` | Controls visibility of the copy icon slot |
| `state.isSuccess()` | Controls visibility of the success icon slot |
| `state.isError()` | Controls visibility of the error icon slot |

### Actions called by adapter

| Action | UIKit trigger |
|--------|--------------|
| `actions.copy()` | Internal: called from headless contract handlers (click, Enter, Space) — adapter does NOT call directly |
| `actions.setDisabled(v)` | When `disabled` attribute/property changes on the host element |
| `actions.setFeedbackDuration(v)` | When `feedback-duration` attribute/property changes on the host element |
| `actions.setValue(v)` | When `value` property changes on the host element |
| `actions.reset()` | Programmatic API; exposed as a method on the custom element |

### Contracts spread by adapter

| Contract | Target element | Notes |
|----------|---------------|-------|
| `getButtonProps()` | Inner button element (`part="base"`) | Spread as attributes; provides `role`, `aria-disabled`, `tabindex`, `aria-label`, `onClick`, `onKeyDown`, `onKeyUp` |
| `getStatusProps()` | Status live region element (`part="status"`) | Spread as attributes; provides `role="status"`, `aria-live`, `aria-atomic` |
| `getIconContainerProps('copy')` | Copy icon container (`part="copy-icon"`) | Spread as attributes; provides `aria-hidden`, `hidden` |
| `getIconContainerProps('success')` | Success icon container (`part="success-icon"`) | Spread as attributes; provides `aria-hidden`, `hidden` |
| `getIconContainerProps('error')` | Error icon container (`part="error-icon"`) | Spread as attributes; provides `aria-hidden`, `hidden` |

### Options passed through from UIKit attributes

| UIKit attribute | Headless option | Notes |
|-----------------|----------------|-------|
| `value` | `value` | Property-only (not reflected as attribute for security); accepts `string \| (() => Promise<string>)` |
| `feedback-duration` | `feedbackDuration` | Numeric attribute, defaults to `1500` |
| `disabled` | `isDisabled` | Boolean attribute |
| `aria-label` | `ariaLabel` | Labeling |

### UIKit-only concerns (NOT in headless)

- Icon rendering (slot content for `copy-icon`, `success-icon`, `error-icon`)
- Pulse/scale animation on copy activation
- CSS custom properties for sizing (`--cv-copy-button-size`)
- Slotted content variant (showing slot content until hover)
- `cv-copy` success event dispatched on host element with `{ detail: { value } }`
- `cv-error` error event dispatched on host element with `{ detail: { error } }`

## Minimum Test Matrix

- `copy()` writes resolved value to clipboard and transitions status to `'success'`
- `copy()` transitions status to `'error'` when clipboard.writeText rejects
- `copy()` transitions status to `'error'` when async value getter throws
- `copy()` is a no-op when `isDisabled` is `true`
- `copy()` is a no-op when `isCopying` is `true` (re-entrant guard)
- `isCopying` is `true` during async resolution, `false` after
- status reverts to `'idle'` after `feedbackDuration` ms
- `reset()` forces status to `'idle'` and cancels pending revert timer
- `reset()` clears `isCopying` if currently in-flight
- `getButtonProps()` returns correct `role`, `tabindex`, `aria-disabled` for all states
- `getButtonProps()` onClick calls `copy()`
- `getButtonProps()` keyboard: Enter on keydown triggers copy, Space on keyup triggers copy
- `getStatusProps()` always returns `role="status"`, `aria-live="polite"`, `aria-atomic="true"`
- `getIconContainerProps('copy')` is visible only when idle
- `getIconContainerProps('success')` is visible only when success
- `getIconContainerProps('error')` is visible only when error
- `onCopy` callback fires on success with resolved value
- `onError` callback fires on failure with error
- new `copy()` cancels previous revert timer
- `feedbackDuration` of `0` still reverts (async via setTimeout 0)
- `setFeedbackDuration` clamps negative values to `0`
- async value getter is supported (function returning Promise<string>)
- injectable `clipboard` adapter is used when provided

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no `@statx/*` in headless core.
- **Layering**: `core -> interactions -> a11y-contracts -> adapters`; adapters remain thin mappings.
- **Independence**: No imports from `@project/*`, `apps/*`, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- Built-in tooltip integration (composable externally)
- Auto-wipe of clipboard after timeout (domain concern, handled by consumer)
- Copy-to-clipboard permission prompts or fallback strategies (e.g., `document.execCommand`)
- Animation orchestration for icon transitions
- Internationalization of status announcement text (adapter responsibility)
- Multiple value formats (e.g., HTML, rich text) — only plain text via `clipboard.writeText`
