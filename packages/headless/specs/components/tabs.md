# Tabs Component Contract

## Purpose

`Tabs` provides a headless APG-aligned tablist/tab/tabpanel model.

It handles active tab focus, selected tab activation,
orientation-aware keyboard navigation, and panel linkage contracts.

## Component Files

- `src/tabs/index.ts` - model and public `createTabs` API
- `src/tabs/tabs.test.ts` - unit behavior tests

## Public API

- `createTabs(options): TabsModel`
- `state` (signal-backed): `activeTabId()`, `selectedTabId()`
- `actions`:
  - `setActive`, `select`
  - `moveNext`, `movePrev`, `moveFirst`, `moveLast`
  - `handleKeyDown`
- `contracts`:
  - `getTabListProps()`
  - `getTabProps(id)`
  - `getPanelProps(id)`

## Options (`CreateTabsOptions`)

| Option | Type | Default | Description |
|---|---|---|---|
| `tabs` | `readonly TabItem[]` | required | Tab definitions. Each `TabItem` has `id: string` and optional `disabled?: boolean`. |
| `idBase` | `string` | `'tabs'` | Prefix for generated DOM ids (`{idBase}-tablist`, `{idBase}-tab-{id}`, `{idBase}-panel-{id}`). |
| `ariaLabel` | `string \| undefined` | `undefined` | Optional `aria-label` for the tablist element. |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Determines keyboard navigation axis and `aria-orientation` value. |
| `activationMode` | `'automatic' \| 'manual'` | `'automatic'` | Whether navigation also selects (`automatic`) or only Enter/Space selects (`manual`). |
| `initialActiveTabId` | `string \| null` | falls back to `initialSelectedTabId` | Initial roving-focus tab. Normalized to first enabled tab if invalid or disabled. |
| `initialSelectedTabId` | `string \| null` | first enabled tab | Initial selected tab. Normalized to first enabled tab if invalid or disabled. |

### Initial State Resolution

1. `initialSelectedTabId` is resolved: if the candidate is a valid enabled tab id, use it; otherwise fall back to the first enabled tab id, or `null` if no enabled tabs exist.
2. `initialActiveTabId` is resolved: if provided, apply the same validation; if not provided, default to the resolved `initialSelectedTabId`.
3. If `selectedTabId` resolves to `null` but `activeTabId` is non-null, `selectedTabId` is set to `activeTabId`.

## Reactive State Contract

Headless Tabs exposes state as reactive signal-backed getters.

### State Surface

- `state.activeTabId(): string | null`
  - Current roving-focus tab id.
  - Changes on directional navigation, `setActive`, and `select`.
- `state.selectedTabId(): string | null`
  - Current selected/visible panel tab id.
  - Changes on `select`, on `setActive` in `automatic` mode, and on navigation in `automatic` mode.

### Reactivity Guarantees

- `state` values are read via getter calls (`Atom<string | null>`) and are suitable as reactive dependencies in adapters.
- Any state change MUST be observable synchronously by adapters after action execution.
- Adapters MUST treat `state` as source of truth; DOM flags are derived outputs.

## Actions

### `setActive(id: string | null)`

- If `id` is `null`, sets `activeTabId` to `null`.
- If `id` is a valid enabled tab, sets `activeTabId` to `id`.
- In `automatic` mode, also updates `selectedTabId` to match `activeTabId`.
- If `id` is disabled or unknown, no state change.

### `select(id: string)`

- If `id` is a valid enabled tab, sets both `activeTabId` and `selectedTabId` to `id`.
- If `id` is disabled or unknown, no state change.

### `moveNext()` / `movePrev()`

- Moves `activeTabId` to the next/previous enabled tab in circular (wrapping) order.
- If no enabled tabs exist, sets `activeTabId` to `null`.
- If `activeTabId` is currently `null` or invalid, resets to the first enabled tab.
- In `automatic` mode, also updates `selectedTabId`.

### `moveFirst()` / `moveLast()`

- Sets `activeTabId` to the first/last enabled tab, or `null` if none exist.
- In `automatic` mode, also updates `selectedTabId`.

### `handleKeyDown(event)`

- Accepts `Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>`.
- Maps keys through `mapListboxKeyboardIntent` with `orientation`, `selectionMode: 'single'`, `rangeSelectionEnabled: false`.
- Intent mapping:
  - `NAV_NEXT` -> `moveNext()`
  - `NAV_PREV` -> `movePrev()`
  - `NAV_FIRST` -> `moveFirst()`
  - `NAV_LAST` -> `moveLast()`
  - `ACTIVATE` / `TOGGLE_SELECTION` -> `select(activeTabId)` (if `activeTabId` is non-null)
- Unrecognized keys produce no state change.

## Transitions Table

| Event / Action | `activeTabId` | `selectedTabId` |
|---|---|---|
| `setActive(id)` where id is enabled | set to `id` | set to `id` if `automatic`; unchanged if `manual` |
| `setActive(null)` | set to `null` | unchanged |
| `setActive(id)` where id is disabled/unknown | unchanged | unchanged |
| `select(id)` where id is enabled | set to `id` | set to `id` |
| `select(id)` where id is disabled/unknown | unchanged | unchanged |
| `moveNext()` / `movePrev()` | next/prev enabled (wrapping) | follows `activeTabId` if `automatic`; unchanged if `manual` |
| `moveFirst()` / `moveLast()` | first/last enabled | follows `activeTabId` if `automatic`; unchanged if `manual` |
| `handleKeyDown` (arrow key) | delegates to `moveNext`/`movePrev` | per activation mode |
| `handleKeyDown` (Home/End) | delegates to `moveFirst`/`moveLast` | per activation mode |
| `handleKeyDown` (Enter/Space) | unchanged | set to `activeTabId` (via `select`) |
| `handleKeyDown` (unrecognized key) | unchanged | unchanged |

## Contracts

Contracts return ready-to-spread ARIA attribute maps.

### `getTabListProps(): TabListProps`

```ts
interface TabListProps {
  id: string                              // '{idBase}-tablist'
  role: 'tablist'
  'aria-orientation': 'horizontal' | 'vertical'
  'aria-label'?: string                   // from options.ariaLabel
}
```

### `getTabProps(id: string): TabProps`

Throws `Error` if `id` is not a known tab.

```ts
interface TabProps {
  id: string                              // '{idBase}-tab-{id}'
  role: 'tab'
  tabindex: '0' | '-1'                   // '0' if active, '-1' otherwise
  'aria-selected': 'true' | 'false'      // 'true' if selected
  'aria-controls': string                // '{idBase}-panel-{id}'
  'aria-disabled'?: 'true'               // present only when tab is disabled
  'data-active': 'true' | 'false'        // matches activeTabId
  'data-selected': 'true' | 'false'      // matches selectedTabId
}
```

### `getPanelProps(id: string): TabPanelProps`

Throws `Error` if `id` is not a known tab.

```ts
interface TabPanelProps {
  id: string                              // '{idBase}-panel-{id}'
  role: 'tabpanel'
  tabindex: '0' | '-1'                   // '0' if selected, '-1' otherwise
  'aria-labelledby': string              // '{idBase}-tab-{id}'
  hidden: boolean                         // true if not selected
}
```

## APG and A11y Contract

- tablist role: `tablist`
- tab role: `tab`
- panel role: `tabpanel`
- tablist exposes `aria-orientation`
- tablist optionally exposes `aria-label`
- each tab exposes `aria-controls` pointing to its panel id
- each panel exposes `aria-labelledby` pointing to its tab id
- roving tabindex: active tab has `tabindex="0"`, all others `tabindex="-1"`
- selected tab has `aria-selected="true"`, all others `aria-selected="false"`
- disabled tabs expose `aria-disabled="true"`

## Activation Modes

- `automatic`:
  - moving active tab (via navigation or `setActive`) also updates selected tab
- `manual`:
  - active tab changes on navigation and `setActive`
  - selected tab changes only on `select` or activation keys (`Enter` / `Space`)

## Keyboard Contract

- Orientation-aware navigation: `ArrowRight`/`ArrowLeft` for horizontal, `ArrowDown`/`ArrowUp` for vertical
- `Home`/`End` for first/last tab
- Activation via `Enter` or `Space`
- Disabled tabs are skipped by navigation and cannot be selected
- Navigation wraps circularly (last -> first, first -> last)

## Invariants

1. `activeTabId` is `null` or an enabled tab id.
2. `selectedTabId` is `null` or an enabled tab id.
3. Selected panel visibility derives only from `selectedTabId`.
4. State transitions never select or activate disabled tabs.
5. Navigation wraps circularly through enabled tabs only.
6. `getTabProps` and `getPanelProps` throw for unknown tab ids.
7. When all tabs are disabled, both `activeTabId` and `selectedTabId` are `null` and all actions are no-ops.

## Adapter Expectations

This section lists exactly what the UIKit adapter layer binds to.

### Signals Read

| Signal | UIKit Usage |
|---|---|
| `state.activeTabId()` | Determines roving tabindex; drives `data-active` attribute on tab elements; used for focus management. |
| `state.selectedTabId()` | Determines `aria-selected` on tabs; drives panel visibility (`hidden`); drives `data-selected` attribute; used for active indicator positioning. |

### Actions Called

| Action | UIKit Trigger |
|---|---|
| `setActive(id)` | Tab receives focus (e.g., pointer click on a tab). |
| `select(id)` | Tab is clicked or tapped (pointer activation). |
| `handleKeyDown(event)` | `keydown` event on the tablist or individual tab. |
| `moveNext()` / `movePrev()` | Not called directly by UIKit; delegated through `handleKeyDown`. |
| `moveFirst()` / `moveLast()` | Not called directly by UIKit; delegated through `handleKeyDown`. |

### Contracts Spread

| Contract | UIKit Target |
|---|---|
| `getTabListProps()` | Spread onto the tablist container element. |
| `getTabProps(id)` | Spread onto each tab trigger element. |
| `getPanelProps(id)` | Spread onto each tab panel element. |

### UIKit-Only Concerns (Not in Headless)

- **Active indicator animation**: Positioned and animated at the UIKit layer using `selectedTabId` to determine which tab to highlight.
- **Closable tabs**: Close button rendering and close orchestration are UIKit concerns. Headless handles selection fallback implicitly through model rebuild with an updated tab list (without the closed tab).
- **`input` / `change` events**: Custom DOM events dispatched by the UIKit wrapper, not part of the headless model.

## Minimum Test Matrix

- automatic activation behavior
- manual activation behavior
- Home/End behavior
- disabled-tab skip and rejection behavior
- vertical orientation behavior
- aria linkage integrity (`aria-controls`, `aria-labelledby`)
- initial state resolution (invalid/disabled initial ids)
- all-disabled edge case (null-safe behavior)
- wrapping navigation
- unsupported key no-op behavior
- `setActive` auto-activation in automatic mode

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- dynamic tab insertion/removal orchestration
- lazy panel mount orchestration

**Note on closable tabs**: Close orchestration (close button, remove animation, user confirmation) is a UIKit-layer concern. Headless handles selection fallback implicitly through model rebuild with an updated tab list (i.e., the adapter recreates the model without the closed tab, and initial state resolution picks the appropriate fallback).
