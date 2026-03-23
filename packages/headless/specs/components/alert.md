# Alert Component Contract

## Purpose

`Alert` is a headless contract for passive live region announcements. It is used to communicate important and usually time-sensitive information without interrupting the user's flow.

## Component Files

- `src/alert/index.ts` - model and public `createAlert` API
- `src/alert/alert.test.ts` - unit behavior tests

## Public API

- `createAlert(options)`
- `state` (signal-backed):
  - `isVisible()`
  - `message()`
- `actions`:
  - `show(message)`, `hide`
- `contracts`:
  - `getAlertProps()`

## APG and A11y Contract

- role: `alert`
- required attributes:
  - `aria-live="assertive"`
  - `aria-atomic="true"`
- behavior:
  - assistive technologies should announce the content immediately when it changes
  - does not take focus

## Behavior Contract

- `show`: updates `message` and sets `isVisible` to `true`
- `hide`: sets `isVisible` to `false`
- passive: does not manage focus or keyboard interactions
- automatic dismissal: can be configured via `duration` option

## Invariants

- `isVisible` is a boolean
- `role="alert"` is always present on the root element
- `aria-live` is set to `assertive` by default to ensure immediate announcement

## Minimum Test Matrix

- visibility state transitions
- message update reactivity
- correct ARIA attributes (`role`, `aria-live`, `aria-atomic`)
- verification that it does not interfere with focus
- auto-dismiss timer verification (if enabled)

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- interactive alerts (use `alert-dialog`)
- multiple concurrent alerts (handled by consumer or higher-level toast manager)
- rich content within alerts
