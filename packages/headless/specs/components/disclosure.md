# Disclosure Component Contract

## Purpose

`Disclosure` is a headless APG-aligned contract for a simple interactive element that controls the visibility of a single content area. It manages the open/closed state, ensures correct ARIA linkage between the trigger and the panel, and supports name-based exclusive grouping for accordion-like behavior.

## Component Files

- `src/disclosure/index.ts` - model, registry, and public `createDisclosure` API
- `src/disclosure/disclosure.test.ts` - unit behavior tests

## Public API

- `createDisclosure(options)`
  - `options`:
    - `idBase?`: string — base id prefix for generated ids (default: `'disclosure'`)
    - `isOpen?`: boolean — initial open state (default: `false`)
    - `isDisabled?`: boolean — initial disabled state (default: `false`)
    - `name?`: string — group name for exclusive accordion-like behavior; when set, opening this disclosure closes all others sharing the same `name`
    - `onOpenChange?`: `(isOpen: boolean) => void` — callback fired on state change
- `state` (signal-backed):
  - `isOpen()` — boolean indicating if the content is visible
  - `isDisabled()` — boolean indicating if user interaction is blocked
  - `name()` — current group name or `null` (reactive)
- `actions`:
  - `open()` — shows the content; if `name` is set, closes all other disclosures in the same group
  - `close()` — hides the content
  - `toggle()` — toggles visibility (delegates to `open` or `close`)
  - `setDisabled(value)` — sets the disabled state
  - `setName(value)` — updates the group name; re-registers in the new group
  - `handleClick()` — delegates to `toggle()`
  - `handleKeyDown(event)` — processes keyboard input (see Keyboard Contract)
  - `destroy()` — unregisters from the group registry; MUST be called on teardown
- `contracts`:
  - `getTriggerProps()` — returns complete ARIA and event handler attribute map for the trigger element
  - `getPanelProps()` — returns complete ARIA attribute map for the content panel

## CreateDisclosureOptions

| Option         | Type                           | Default        | Description                                              |
|----------------|--------------------------------|----------------|----------------------------------------------------------|
| `idBase`       | `string`                       | `'disclosure'` | Base id prefix for all generated ids                     |
| `isOpen`       | `boolean`                      | `false`        | Whether the disclosure starts open                       |
| `isDisabled`   | `boolean`                      | `false`        | Whether user interaction is initially blocked            |
| `name`         | `string`                       | —              | Group name for exclusive behavior                        |
| `onOpenChange` | `(isOpen: boolean) => void`    | —              | Callback fired when `isOpen` changes                     |

## State Signal Surface

| Signal       | Type              | Derived? | Description                                          |
|--------------|-------------------|----------|------------------------------------------------------|
| `isOpen`     | `Atom<boolean>`   | No       | Single source of truth for visibility                |
| `isDisabled` | `Atom<boolean>`   | No       | Whether user interaction is blocked                  |
| `name`       | `Atom<string \| null>` | No  | Group name for exclusive behavior, or `null`         |

## APG and A11y Contract

- trigger role: `button`
- panel role: none (usually a `div`)
- required attributes:
  - trigger: `aria-expanded`, `aria-controls`, `id`, `aria-disabled` (when disabled)
  - panel: `id`, `aria-labelledby`, `hidden`
- focus management:
  - the trigger is in the page tab sequence (`tabindex: '0'`); removed from tab order when disabled (`tabindex: '-1'`)
  - focus remains on the trigger when toggled, unless the content contains focusable elements that the user chooses to move focus to

## Keyboard Contract

| Key                        | Action                                                          |
|----------------------------|-----------------------------------------------------------------|
| `Enter`                    | Toggle the `isOpen` state; calls `preventDefault`               |
| `Space`                    | Toggle the `isOpen` state; calls `preventDefault`               |
| `ArrowDown` / `ArrowRight` | Expand (open) if currently closed; calls `preventDefault`      |
| `ArrowUp` / `ArrowLeft`    | Collapse (close) if currently open; calls `preventDefault`     |

All keyboard actions are no-ops when `isDisabled` is `true`.

## Behavior Contract

- **Toggle Behavior**:
  - `Enter` or `Space` on the trigger toggles the `isOpen` state
  - clicking the trigger toggles the `isOpen` state
- **Directional Expand/Collapse**:
  - `ArrowDown` or `ArrowRight` on the trigger opens the disclosure (no-op if already open)
  - `ArrowUp` or `ArrowLeft` on the trigger closes the disclosure (no-op if already closed)
- **Name-Based Exclusive Grouping**:
  - when `name` is set, the disclosure is registered in a shared group registry keyed by `name`
  - when a named disclosure opens (via any action: `open`, `toggle`, `handleKeyDown`, `handleClick`), all other disclosures in the same `name` group are closed
  - closing a disclosure does not open any other disclosure in the group
  - the registry is a module-level `Map<string, Set<DisclosureModel>>` — not global, scoped to the headless package
  - `destroy()` removes the disclosure from the registry; adapters MUST call this on `disconnectedCallback` or equivalent teardown
  - `setName(value)` re-registers: unregisters from the old group, registers in the new group
- **Linkage**:
  - `aria-controls` on the trigger must match the `id` of the panel
  - `aria-expanded` reflects the `isOpen` state
  - `aria-labelledby` on the panel must match the `id` of the trigger

## Contract Prop Shapes

### `getTriggerProps()`
```ts
{
  id: string                          // '{idBase}-trigger'
  role: 'button'
  tabindex: '0' | '-1'               // '-1' when disabled
  'aria-expanded': 'true' | 'false'  // reflects isOpen
  'aria-controls': string             // points to panel id
  'aria-disabled'?: 'true'           // present only when disabled
  onClick: () => void                 // calls handleClick
  onKeyDown: (event) => void          // calls handleKeyDown
}
```

### `getPanelProps()`
```ts
{
  id: string                          // '{idBase}-panel'
  'aria-labelledby': string           // points to trigger id
  hidden: boolean                     // !isOpen
}
```

## Transitions Table

| Event / Action                   | Current State              | Next State / Effect                                                      |
|----------------------------------|----------------------------|--------------------------------------------------------------------------|
| `open()`                         | `isOpen = false`           | `isOpen = true`; if `name` set, close all other group members            |
| `open()`                         | `isOpen = true`            | no-op                                                                    |
| `close()`                        | `isOpen = true`            | `isOpen = false`                                                         |
| `close()`                        | `isOpen = false`           | no-op                                                                    |
| `toggle()`                       | `isOpen = false`           | delegates to `open()`                                                    |
| `toggle()`                       | `isOpen = true`            | delegates to `close()`                                                   |
| `handleClick()`                  | any                        | delegates to `toggle()`                                                  |
| `handleKeyDown(Enter)`           | any, not disabled          | delegates to `toggle()`; `preventDefault`                                |
| `handleKeyDown(Space)`           | any, not disabled          | delegates to `toggle()`; `preventDefault`                                |
| `handleKeyDown(ArrowDown)`       | `isOpen = false`, not disabled | delegates to `open()`; `preventDefault`                              |
| `handleKeyDown(ArrowRight)`      | `isOpen = false`, not disabled | delegates to `open()`; `preventDefault`                              |
| `handleKeyDown(ArrowDown)`       | `isOpen = true`, not disabled  | no-op (already open); `preventDefault`                               |
| `handleKeyDown(ArrowRight)`      | `isOpen = true`, not disabled  | no-op (already open); `preventDefault`                               |
| `handleKeyDown(ArrowUp)`         | `isOpen = true`, not disabled  | delegates to `close()`; `preventDefault`                             |
| `handleKeyDown(ArrowLeft)`       | `isOpen = true`, not disabled  | delegates to `close()`; `preventDefault`                             |
| `handleKeyDown(ArrowUp)`         | `isOpen = false`, not disabled | no-op (already closed); `preventDefault`                             |
| `handleKeyDown(ArrowLeft)`       | `isOpen = false`, not disabled | no-op (already closed); `preventDefault`                             |
| `handleKeyDown(other)`           | any                        | no-op; no `preventDefault`                                               |
| `handleKeyDown(any)`             | `isDisabled = true`        | no-op; no `preventDefault`                                               |
| `setDisabled(value)`             | any                        | `isDisabled = value`                                                     |
| `setName(value)`                 | any                        | unregister from old group; `name = value`; register in new group         |
| `destroy()`                      | any                        | unregister from group registry                                           |

### Group Side Effects

| Trigger              | Side Effect on Other Group Members                          |
|----------------------|-------------------------------------------------------------|
| `open()` with `name` | all other disclosures with the same `name` receive `close()` |
| `close()` with `name`| none                                                        |

## Invariants

1. `isOpen` is a boolean.
2. `aria-expanded` is `"true"` when `isOpen` is `true`, and `"false"` otherwise.
3. If the trigger is disabled, `toggle`, `open`, `close`, and `handleKeyDown` actions are no-ops for user interactions.
4. `aria-controls` on the trigger always matches the `id` of the panel.
5. `aria-labelledby` on the panel always matches the `id` of the trigger.
6. When `name` is set, at most one disclosure in the group can be open at any time (exclusive constraint).
7. Arrow keys (`ArrowDown`/`ArrowRight`) only open; they never close. Arrow keys (`ArrowUp`/`ArrowLeft`) only close; they never open.
8. `destroy()` must remove the disclosure from the group registry; failure to call `destroy()` constitutes a memory leak.

## Name-Based Group Registry

The registry is a module-level data structure within `src/disclosure/index.ts`:

```ts
// Module-level registry — not exported, internal implementation detail
const groupRegistry = new Map<string, Set<DisclosureModel>>()
```

**Registration lifecycle:**
- On `createDisclosure({ name })`: if `name` is provided, add the model to `groupRegistry.get(name)`
- On `setName(newName)`: remove from old group set, add to new group set
- On `destroy()`: remove from current group set; clean up empty sets from the map

**Exclusive open enforcement:**
- When `open()` is called on a model with a `name`, iterate `groupRegistry.get(name)` and call `close()` on every other model in the set
- This is an internal side effect of `open()`, not a separate action

## Adapter Expectations

UIKit adapters MUST bind to the headless model as follows:

**Signals read (reactive, drive re-renders):**
- `state.isOpen()` — whether the disclosure content is visible
- `state.isDisabled()` — whether user interaction is blocked
- `state.name()` — current group name (used for registration lifecycle)

**Actions called (event handlers, never mutate state directly):**
- `actions.open()` / `actions.close()` — programmatic show/hide
- `actions.toggle()` — toggle visibility
- `actions.setDisabled(value)` — update disabled state
- `actions.setName(value)` — update group name
- `actions.handleClick()` — on trigger click
- `actions.handleKeyDown(event)` — on trigger keydown
- `actions.destroy()` — on `disconnectedCallback` or equivalent teardown

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getTriggerProps()` — spread onto the trigger button element
- `contracts.getPanelProps()` — spread onto the content panel element

**UIKit-only concerns (NOT in headless):**
- CSS animations and transitions for open/close
- `show()` / `hide()` imperative methods (delegate to `actions.open()` / `actions.close()`)
- CSS custom properties and animation tokens
- Lifecycle events (`cv-open`, `cv-close`)

## Minimum Test Matrix

- initialize in both open and closed states
- toggle state via `toggle()` action
- toggle state via `Enter` and `Space` keys on the trigger
- `ArrowDown` and `ArrowRight` open a closed disclosure
- `ArrowDown` and `ArrowRight` are no-ops on an already open disclosure
- `ArrowUp` and `ArrowLeft` close an open disclosure
- `ArrowUp` and `ArrowLeft` are no-ops on an already closed disclosure
- arrow keys call `preventDefault`
- arrow keys are no-ops when disabled (no `preventDefault`)
- verify `aria-expanded` updates correctly
- verify `aria-controls` matches panel `id`
- verify `aria-labelledby` matches trigger `id`
- ensure disabled trigger does not toggle state
- `onOpenChange` callback fires on state transitions
- named group: opening one disclosure closes the other in the same group
- named group: closing a disclosure does not affect others in the group
- named group: disclosures with different names are independent
- named group: `destroy()` removes from registry
- named group: `setName()` re-registers in new group
- named group: ungrouped disclosures (no `name`) are not affected by grouped ones

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- multiple panels controlled by one trigger
- hover-based disclosure (not APG compliant for this pattern)
- animation state management (UIKit concern)
- `allowZeroExpanded` constraint within a named group (all can be closed)
