# Link Component Contract

## Purpose

`Link` is a headless APG-aligned contract for a hyperlink that allows users to navigate to another page or a different portion of the current page. It handles activation, focus management, and keyboard interaction.

Per strict APG guidance, links do not support a disabled state. If a link destination is unavailable, the link should be removed from the UI or replaced with static text by the consuming application.

## Component Files

- `src/link/index.ts` - model and public `createLink` API
- `src/link/link.test.ts` - unit behavior tests

## Public API

- `createLink(options)`
  - `options`:
    - `idBase?`: string - prefix for generated element IDs (default: `"link"`)
    - `href?`: string - target URL for navigation
    - `isSemanticHost?`: boolean - set `true` when the host element is a native `<a>` tag (omits `role` and `tabindex` from contract)
    - `onPress?`: callback function - invoked on activation (click or `Enter` keydown)
- `state` (signal-backed):
  - *(none)* - link has no mutable headless state; all configuration is immutable from options
- `actions`:
  - `press()` - manually triggers the link's `onPress` callback
  - `handleClick(event?)` - handles click events; delegates to `press()`
  - `handleKeyDown(event)` - processes activation keys (`Enter`); delegates to `press()`
- `contracts`:
  - `getLinkProps()` - returns a ready-to-spread ARIA prop object for the link element

## State Signal Surface

| Signal | Type | Description |
|--------|------|-------------|
| *(none)* | — | Link is stateless at the headless level; all behavior derives from immutable options |

## Actions

| Action | Signature | Description |
|--------|-----------|-------------|
| `press` | `() => void` | Invokes `onPress` callback if provided |
| `handleClick` | `(event?) => void` | Click handler; delegates to `press()` |
| `handleKeyDown` | `(event: {key: string; preventDefault?: () => void}) => void` | Keyboard handler; calls `press()` on `Enter`, ignores other keys |

## Contracts

### `getLinkProps() -> LinkProps`

Returns a complete attribute map to spread onto the link host element.

| Property | Type | Value |
|----------|------|-------|
| `id` | `string` | `"{idBase}-root"` |
| `role` | `"link" \| undefined` | `"link"` for non-semantic hosts; `undefined` when `isSemanticHost` is `true` |
| `href` | `string \| undefined` | Passthrough of `options.href` |
| `tabindex` | `"0" \| undefined` | `"0"` for non-semantic hosts; `undefined` when `isSemanticHost` is `true` |
| `onClick` | `(event?) => void` | Bound to `handleClick` action |
| `onKeyDown` | `(event) => void` | Bound to `handleKeyDown` action |

## APG and A11y Contract

- role: `link`
- required attributes:
  - `role="link"` (only for non-semantic elements; omitted for native `<a>`)
  - `tabindex="0"` (only for non-semantic elements; omitted for native `<a>`)
- focus management:
  - links are always in the page tab sequence
- keyboard interaction:
  - `Enter`: triggers the link action

## Behavior Contract

- **Activation**:
  - clicking the link triggers the `onPress` callback
  - pressing `Enter` triggers the `onPress` callback
  - non-`Enter` keys are ignored by `handleKeyDown`
- **Semantic vs Non-Semantic Host**:
  - when `isSemanticHost` is `true`, `role` and `tabindex` are omitted from `getLinkProps()` because the native `<a>` element provides them
  - when `isSemanticHost` is `false` (default), `role="link"` and `tabindex="0"` are included
- **No Disabled State**:
  - per APG guidance, links must not be disabled
  - if a destination is unavailable, the link should be removed or replaced with static text at the application level

## Transitions Table

| Event | Guard | Action | Next State |
|-------|-------|--------|------------|
| click | — | `handleClick(e)` -> `press()` | calls `onPress` |
| `keydown Enter` | `key === "Enter"` | `handleKeyDown(e)` -> `press()` | calls `onPress` |
| `keydown` (other) | `key !== "Enter"` | — | no change |

## Invariants

- a link must have an accessible name (enforced by UIKit adapter or consumer)
- `role="link"` must be present when the host is not a native `<a>` element
- `tabindex="0"` must be present when the host is not a native `<a>` element
- `href` is always passed through from options (never conditionally removed)
- `onPress` is always invoked on activation (no gating — there is no disabled state)

## Adapter Expectations

UIKit (`cv-link`) binds to the headless contract as follows:

- **Signals read**: *(none)* — link has no mutable headless state
- **Actions called**: *(none directly)* — activation is handled via event handlers wired through the contract
- **Contracts spread**: `contracts.getLinkProps()` — spread onto the inner `<a>` element (or `[part="base"]`) to apply `id`, `role`, `href`, `tabindex`, and keyboard/click handlers
- **Slots**: UIKit provides `prefix` and `suffix` slots for icon placement (visual-layer concern, not headless)
- **Attribute reflection**: `href` attribute on the host is forwarded to `createLink` options; `isSemanticHost` is determined by the adapter based on whether the inner element is a native `<a>`

## Minimum Test Matrix

- trigger `onPress` on click
- trigger `onPress` on `Enter` keydown
- trigger `onPress` via direct `press()` action
- verify non-`Enter` keys are ignored by `handleKeyDown`
- verify `getLinkProps()` returns `role="link"` and `tabindex="0"` for non-semantic host
- verify `getLinkProps()` omits `role` and `tabindex` for semantic host
- verify `getLinkProps()` includes `href` from options
- verify deterministic `id` based on `idBase`
- verify no error when `onPress` is not provided

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- link previews/tooltips
- download link specific attributes (`download` attribute)
- security attributes (`rel="noopener noreferrer"`) - handled by visual layer or adapter
- disabled state (removed per APG guidance — links must not be disabled)
