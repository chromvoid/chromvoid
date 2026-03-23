# Radio Group Component Contract

## Purpose

`RadioGroup` provides a headless APG-aligned model for a set of checkable buttons where only one can be checked at a time.

It handles roving tabindex, arrow-key navigation with automatic selection, and group-level state management.

## Component Files

- `src/radio-group/index.ts` - model and public `createRadioGroup` API
- `src/radio-group/radio-group.test.ts` - unit behavior tests

## Public API

- `createRadioGroup(options)`
  - `items`: `readonly RadioGroupItem[]` — radio definitions
  - `idBase?`: `string` — prefix for generated ids
  - `orientation?`: `'horizontal' | 'vertical'` — navigation axis (default `'horizontal'`)
  - `isDisabled?`: `boolean` — initial group-level disabled state
  - `ariaLabel?`: `string` — accessible label for the group
  - `ariaLabelledBy?`: `string` — id reference for external label
  - `initialValue?`: `string | null` — initially checked radio id
  - `initialActiveId?`: `string | null` — initially focused radio id
- `RadioGroupItem`:
  - `id`: `string` — unique identifier
  - `disabled?`: `boolean` — per-item disabled state
  - `describedBy?`: `string` — id reference for description element (`aria-describedby`)

### State (signal-backed)

- `value()`: `string | null` — id of the checked radio
- `activeId()`: `string | null` — id of the focused radio (roving tabindex target)
- `isDisabled()`: `boolean` — group-level disabled state
- `orientation`: `'horizontal' | 'vertical'` — navigation orientation (static after creation)

### Actions

- `select(id)`: checks the radio with the given id (no-op if disabled or id is not enabled)
- `moveNext()`: moves focus and selection to the next enabled radio
- `movePrev()`: moves focus and selection to the previous enabled radio
- `moveFirst()`: moves focus and selection to the first enabled radio
- `moveLast()`: moves focus and selection to the last enabled radio
- `handleKeyDown(event)`: delegates to navigation/selection based on key
- `setDisabled(value)`: updates group-level disabled state

### Contracts

- `getRootProps()` — returns `RadioGroupRootProps`:
  - `role`: `'radiogroup'`
  - `aria-label?`: `string`
  - `aria-labelledby?`: `string`
  - `aria-disabled?`: `'true'` (present only when disabled)
  - `aria-orientation`: `'horizontal' | 'vertical'`
  - `onKeyDown`: keyboard handler

- `getRadioProps(id)` — returns `RadioProps`:
  - `id`: `string` (generated: `{idBase}-radio-{id}`)
  - `role`: `'radio'`
  - `tabindex`: `'0' | '-1'` (roving tabindex)
  - `aria-checked`: `'true' | 'false'`
  - `aria-disabled?`: `'true'` (present when group or item is disabled)
  - `aria-describedby?`: `string` (present when item has `describedBy`)
  - `data-active`: `'true' | 'false'` (tracks focus, not selection)
  - `onClick`: click handler
  - `onKeyDown`: keyboard handler

## APG and A11y Contract

- root role: `radiogroup`
- item role: `radio`
- `aria-checked`: `"true" | "false"` on each radio
- `aria-disabled`: on root (when entire group disabled) or individual radios
- `aria-describedby`: on individual radios when description content is associated
- `aria-orientation`: on root, reflects navigation axis
- focus strategy: `roving-tabindex`
  - only the active radio (checked, or first enabled when none checked) is in the tab sequence.
  - if no radio is checked, the first enabled radio is in the tab sequence.
- linkage: root supports `aria-label` and `aria-labelledby`

## Behavior Contract

- `ArrowDown` / `ArrowRight` moves focus to the next radio and checks it.
- `ArrowUp` / `ArrowLeft` moves focus to the previous radio and checks it.
- Navigation wraps around from last to first and vice versa.
- `Home` moves focus and selection to the first enabled radio.
- `End` moves focus and selection to the last enabled radio.
- `Space` checks the focused radio if not already checked.
- Disabled radios are skipped during arrow navigation.
- If a radio is disabled, it cannot be checked.
- When the entire group is disabled, all keyboard and click actions are no-ops.

## Transitions

| Event / Action | Current State | Next State | Notes |
| --- | --- | --- | --- |
| `select(id)` | `value=X, activeId=Y` | `value=id, activeId=id` | No-op if `isDisabled` or item disabled |
| `moveNext()` | `activeId=current` | `value=next, activeId=next` | Wraps; skips disabled; no-op if group disabled |
| `movePrev()` | `activeId=current` | `value=prev, activeId=prev` | Wraps; skips disabled; no-op if group disabled |
| `moveFirst()` | any | `value=first, activeId=first` | First enabled item; no-op if group disabled |
| `moveLast()` | any | `value=last, activeId=last` | Last enabled item; no-op if group disabled |
| `handleKeyDown(ArrowRight/Down)` | any | delegates to `moveNext()` | |
| `handleKeyDown(ArrowLeft/Up)` | any | delegates to `movePrev()` | |
| `handleKeyDown(Home)` | any | delegates to `moveFirst()` | |
| `handleKeyDown(End)` | any | delegates to `moveLast()` | |
| `handleKeyDown(Space)` | `activeId=id` | `value=id` | Selects focused radio; no-op if group disabled |
| `setDisabled(v)` | `isDisabled=old` | `isDisabled=v` | Does not change value or activeId |

## Invariants

- At most one radio can be checked at any time.
- `activeId` must always be an enabled radio id (unless no enabled radios exist).
- `value` and `activeId` are synchronized during arrow navigation (selection follows focus).
- `value` is `null` or an enabled radio id.
- `getRadioProps(id)` throws for unknown ids.
- When `isDisabled` is `true`, `getRootProps()` includes `aria-disabled="true"`.
- `tabindex="0"` is assigned to exactly one radio (the active one) when it is enabled; all others get `"-1"`.

## Minimum Test Matrix

- single selection behavior (checking one unchecks the previous)
- arrow navigation with automatic selection and wrapping
- skipping disabled radios during navigation
- Home/End key behavior
- initial state with no selection (first radio is tabbable)
- initial state with selection (selected radio is tabbable)
- group-level disabled blocks all interactions
- `aria-describedby` present when item has `describedBy`

## Adapter Expectations

UIKit adapter (`cv-radio-group` + `cv-radio`) will:
- **Read**: `state.value`, `state.activeId`, `state.isDisabled`, `state.orientation`
- **Call**: `actions.select`, `actions.moveNext`, `actions.movePrev`, `actions.moveFirst`, `actions.moveLast`, `actions.handleKeyDown`, `actions.setDisabled`
- **Spread**: `contracts.getRootProps()` onto the radio-group host/container, `contracts.getRadioProps(id)` onto each radio element
- **Size** (`small | medium | large`): UIKit-only visual concern; does not affect headless contracts
- **Description slot**: UIKit renders a secondary text slot; headless provides `aria-describedby` linkage via `RadioGroupItem.describedBy`

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- nested radio groups
- manual activation mode (where arrows move focus but not selection)
- native form submission integration (handled by adapters/wrappers)
