# Listbox Component Contract

## Purpose

`Listbox` is a headless APG-aligned contract for focus, selection, and keyboard behavior,
with no visual layer. Supports flat and grouped options, two focus strategies, single and
multiple selection modes, typeahead, range selection, and virtual scroll attributes.

## Component Files

- `src/listbox/index.ts` - model and public `createListbox` API
- `src/listbox/listbox.test.ts` - unit behavior tests

## Public API

### `createListbox(options: CreateListboxOptions): ListboxModel`

### Option Types

```ts
interface ListboxOption {
  id: string
  label?: string
  disabled?: boolean
  groupId?: string          // references a ListboxGroup.id; ungrouped when omitted
}

interface ListboxGroup {
  id: string
  label: string
}
```

Groups and flat options coexist. An option references a group via `groupId`. Options without `groupId` are ungrouped and rendered before any groups (or interleaved per declaration order — see rendering section).

### CreateListboxOptions

```ts
interface CreateListboxOptions {
  options: readonly ListboxOption[]
  groups?: readonly ListboxGroup[]
  selectionMode?: 'single' | 'multiple'           // default 'single'
  focusStrategy?: FocusStrategy                     // default 'aria-activedescendant'
  selectionFollowsFocus?: boolean                   // default false
  rangeSelection?: boolean | { enabled?: boolean }  // default false
  orientation?: 'vertical' | 'horizontal'           // default 'vertical'
  typeahead?: boolean | { enabled?: boolean; timeoutMs?: number }
  ariaLabel?: string
  idBase?: string
  initialActiveId?: string | null
  initialSelectedIds?: readonly string[]
}
```

**Default focus strategy change**: `focusStrategy` defaults to `'aria-activedescendant'` (previously `'roving-tabindex'`). Both strategies remain fully supported via configuration.

## State Signals

| Signal | Type | Description |
| --- | --- | --- |
| `activeId()` | `Atom<string \| null>` | Currently focused option id |
| `selectedIds()` | `Atom<string[]>` | Selected option ids |
| `isOpen()` | `Atom<boolean>` | Popup visibility (for composite patterns like select) |
| `hasSelection()` | `Computed<boolean>` | `selectedIds.length > 0` |
| `selectionMode` | `'single' \| 'multiple'` | Current selection mode (from config) |
| `focusStrategy` | `FocusStrategy` | Current focus strategy (from config) |
| `orientation` | `'vertical' \| 'horizontal'` | Current orientation (from config) |
| `optionCount` | `number` | Total number of options (flat count across all groups). For `aria-setsize`. |
| `groups` | `readonly ListboxGroup[]` | Configured groups (from config, empty array when no groups) |

All reactive state is signal-backed via Reatom atoms. `selectionMode`, `focusStrategy`, `orientation`, `optionCount`, and `groups` are static config values exposed on the state object for adapter convenience.

## Actions

| Action | Signature | Description |
| --- | --- | --- |
| `open` | `() => void` | Sets `isOpen=true`, resets typeahead |
| `close` | `() => void` | Sets `isOpen=false`, resets typeahead |
| `setActive` | `(id: string \| null) => void` | Sets active option if enabled; no-op for disabled/unknown ids |
| `moveNext` | `() => void` | Moves active to next enabled option (linear across groups) |
| `movePrev` | `() => void` | Moves active to previous enabled option (linear across groups) |
| `moveFirst` | `() => void` | Sets active to first enabled option |
| `moveLast` | `() => void` | Sets active to last enabled option |
| `toggleSelected` | `(id: string) => void` | Toggles selection for the given id. Respects selection mode constraints. |
| `selectOnly` | `(id: string) => void` | Selects only the given id, clearing previous selection |
| `clearSelected` | `() => void` | Clears all selection |
| `handleKeyDown` | `(event: KeyboardEventLike) => void` | Delegates keyboard events to navigation/selection/typeahead transitions |

UIKit must only call actions, never mutate state atoms directly.

## Contracts

| Contract | Return Type | Description |
| --- | --- | --- |
| `getRootProps()` | `ListboxRootProps` | ARIA attributes for the listbox root element |
| `getOptionProps(id)` | `ListboxOptionProps` | ARIA attributes for an individual option |
| `getGroupProps(groupId)` | `ListboxGroupProps` | ARIA attributes for a group container |
| `getGroupLabelProps(groupId)` | `ListboxGroupLabelProps` | Attributes for the group label element |
| `getGroupOptions(groupId)` | `readonly ListboxOption[]` | Options belonging to a group, in declaration order |
| `getUngroupedOptions()` | `readonly ListboxOption[]` | Options not assigned to any group |

### Contract Return Types

```ts
interface ListboxRootProps {
  role: 'listbox'
  tabindex: '0' | '-1'
  'aria-label'?: string
  'aria-orientation': 'vertical' | 'horizontal'
  'aria-multiselectable'?: 'true'
  'aria-activedescendant'?: string    // present when focusStrategy='aria-activedescendant' and activeId != null
}

interface ListboxOptionProps {
  id: string
  role: 'option'
  tabindex: '0' | '-1'
  'aria-disabled'?: 'true'
  'aria-selected': 'true' | 'false'
  'aria-setsize': string              // total option count (flat, across all groups)
  'aria-posinset': string             // 1-based position in the flat option list
  'data-active': 'true' | 'false'
}

interface ListboxGroupProps {
  id: string
  role: 'group'
  'aria-labelledby': string           // references the group label element id
}

interface ListboxGroupLabelProps {
  id: string
  role: 'presentation'
}
```

### `getRootProps()` behavior

- `role` is always `'listbox'`
- `tabindex` is `'0'` when `focusStrategy='aria-activedescendant'`, `'-1'` otherwise
- `aria-multiselectable` is `'true'` only when `selectionMode='multiple'`
- `aria-activedescendant` is present only when `focusStrategy='aria-activedescendant'` and `activeId` is not `null`

### `getOptionProps(id)` behavior

- `tabindex` is `'0'` for the active option when `focusStrategy='roving-tabindex'`, `'-1'` for all others
- `aria-selected` reflects whether the option is in `selectedIds`
- `aria-setsize` is the total number of options across all groups (flat count)
- `aria-posinset` is the 1-based position of this option in the flat option list (declaration order)
- `data-active` indicates whether this option is the currently active option

### `getGroupProps(groupId)` behavior

- Returns `{ id, role: "group", "aria-labelledby": "<label-element-id>" }`
- The `aria-labelledby` value references the DOM id returned by `getGroupLabelProps(groupId).id`
- Throws if `groupId` is unknown

### `getGroupLabelProps(groupId)` behavior

- Returns `{ id: "<label-element-id>", role: "presentation" }`
- The id is deterministic: `${idBase}-group-${groupId}-label`
- Throws if `groupId` is unknown

## APG and A11y Contract

- root role: `listbox`
- item role: `option`
- group role: `group` with `aria-labelledby` referencing group label element
- focus strategies:
  - `aria-activedescendant` (default)
  - `roving-tabindex`
- selection modes:
  - `single`
  - `multiple`
- required attributes:
  - root: `aria-label`, `aria-multiselectable`, `aria-orientation`, `aria-activedescendant`
  - option: `aria-selected`, `aria-disabled`, `tabindex`, `aria-setsize`, `aria-posinset`
  - group: `role="group"`, `aria-labelledby`

## Option Group Behavior

- `groups` is an optional array of `ListboxGroup` objects on `CreateListboxOptions`
- Each option may reference a group via its `groupId` field
- Options without `groupId` are ungrouped
- `getGroupOptions(groupId)` returns options belonging to that group in declaration order
- `getUngroupedOptions()` returns options not assigned to any group
- Navigation is group-unaware (linear): arrow keys traverse ALL options in flat declaration order, crossing group boundaries seamlessly
- Typeahead operates on the flat option list across all groups
- Range selection operates on the flat option list across all groups
- Group ids must not collide with option ids

## Virtual Scroll Support

`aria-setsize` and `aria-posinset` are returned by `getOptionProps(id)` to support virtual scrolling.

- `aria-setsize` = total number of options in the listbox (flat count across all groups)
- `aria-posinset` = 1-based index of the option in the flat declaration-order list
- When options are grouped, setsize/posinset reflect the FULL flat list count, not per-group counts
- These values are stable for a given option set. When using virtual scrolling, the adapter renders only a subset of options but each option still carries the correct setsize/posinset from the full list
- For dynamic option lists (e.g., async loading), the adapter should recreate the listbox model with the updated options array; setsize/posinset will be recomputed accordingly

## Typeahead Behavior

- supports single-character typeahead navigation
- supports buffered typeahead queries within configurable timeout window
- supports repeated same-character cycling across matching options
- skips disabled options in typeahead matching
- operates on the flat option list across all groups
- configuration: `typeahead` option (`boolean` or `{ enabled?: boolean; timeoutMs?: number }`)

## Range Selection Behavior

- optional, available only in `multiple` mode
- configuration: `rangeSelection` option (`boolean` or `{ enabled?: boolean }`)
- supports `Shift+Arrow` contiguous range selection
- supports `Shift+Space` range selection from anchor to active option
- skips disabled options while building selected range
- operates on the flat option list across all groups
- keeps behavior unchanged when range selection is disabled

## Transition Model

### Core Transitions

| Event / Action | Preconditions | Next State |
| --- | --- | --- |
| `open()` | none | `isOpen=true`; typeahead reset |
| `close()` | none | `isOpen=false`; typeahead reset |
| `setActive(id)` | `id` must be enabled | `activeId=id`; if `selectionFollowsFocus` and single mode: `selectedIds=[id]` |
| `setActive(null)` | none | `activeId=null` |
| `moveNext()` | none | `activeId` = next enabled option in flat order, or unchanged at end |
| `movePrev()` | none | `activeId` = previous enabled option in flat order, or unchanged at start |
| `moveFirst()` | none | `activeId` = first enabled option, or `null` |
| `moveLast()` | none | `activeId` = last enabled option, or `null` |
| `toggleSelected(id)` | `id` must be enabled | In single mode: toggles id in/out. In multiple mode: adds/removes id. Updates range anchor. |
| `selectOnly(id)` | `id` must be enabled | `selectedIds=[id]`; updates range anchor |
| `clearSelected()` | none | `selectedIds=[]`; range anchor reset |

### Keyboard Transitions (via `handleKeyDown`)

| Key | Modifiers | Context | Action |
| --- | --- | --- | --- |
| `ArrowDown` / `ArrowRight`* | none | any | `moveNext()` |
| `ArrowUp` / `ArrowLeft`* | none | any | `movePrev()` |
| `Home` | none | any | `moveFirst()` |
| `End` | none | any | `moveLast()` |
| `Space` | none | single mode | `selectOnly(activeId)` |
| `Space` | none | multiple mode | `toggleSelected(activeId)` |
| `Enter` | none | single mode | `selectOnly(activeId)` |
| `Enter` | none | multiple mode | `toggleSelected(activeId)` |
| `Escape` | none | any | `close()` |
| `Ctrl/Cmd + A` | none | multiple mode | select all enabled options |
| `Shift + ArrowDown/ArrowUp` | shift | multiple + rangeSelection | range extend: move + select range from anchor |
| `Shift + Space` | shift | multiple + rangeSelection | select range from anchor to active |
| printable char | none | typeahead enabled | typeahead navigation |

*Arrow key mapping depends on orientation: vertical uses Up/Down, horizontal uses Left/Right.

## Invariants

- `focus` and `selection` are independent (except when `selectionFollowsFocus=true`)
- a disabled option cannot become active or selected
- in `single` mode, `selectedIds` contains at most one id
- `Ctrl/Cmd + A` is supported only in `multiple` mode
- `aria-setsize` on every option equals total option count
- `aria-posinset` on every option is unique and in range `[1, optionCount]`
- every group referenced via `getGroupProps(groupId)` must have a corresponding `getGroupLabelProps(groupId)` with matching `aria-labelledby` linkage
- group ids are unique and do not collide with option ids
- navigation order is the flat declaration order of options, regardless of grouping
- when `focusStrategy='aria-activedescendant'`, root `tabindex` is `'0'` and all options have `tabindex='-1'`
- when `focusStrategy='roving-tabindex'`, root `tabindex` is `'-1'` and active option has `tabindex='0'`

## Adapter Expectations

UIKit adapter will:

**Signals read (reactive, drive re-renders):**
- `state.activeId()` — currently focused option id
- `state.selectedIds()` — selected option ids
- `state.isOpen()` — popup visibility
- `state.hasSelection()` — whether any option is selected
- `state.selectionMode` — single vs multiple (static, for conditional rendering)
- `state.focusStrategy` — focus management mode (static, for conditional rendering)
- `state.orientation` — layout orientation (static)
- `state.optionCount` — total flat option count (static, for virtual scroll)
- `state.groups` — group definitions (static, for rendering group structure)

**Actions called (event handlers, never mutate state directly):**
- `actions.open()` / `actions.close()` — popup lifecycle
- `actions.setActive(id)` — pointer hover / programmatic focus
- `actions.moveNext()` / `actions.movePrev()` — arrow key navigation
- `actions.moveFirst()` / `actions.moveLast()` — Home/End navigation
- `actions.toggleSelected(id)` — selection toggle
- `actions.selectOnly(id)` — exclusive selection
- `actions.clearSelected()` — clear all selection
- `actions.handleKeyDown(event)` — keyboard delegation

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getRootProps()` — spread onto listbox root element
- `contracts.getOptionProps(id)` — spread onto each option element
- `contracts.getGroupProps(groupId)` — spread onto group container element
- `contracts.getGroupLabelProps(groupId)` — spread onto group label element

**Contracts called for rendering:**
- `contracts.getGroupOptions(groupId)` — options to render within a group
- `contracts.getUngroupedOptions()` — options to render outside any group

**UIKit-only concerns (NOT in headless):**
- Group visual styling (indentation, separators, headers)
- Virtual scroll viewport management and option recycling
- Popup positioning and animation
- Visual active/selected indicators

## Minimum Test Matrix

- initialize `activeId` while skipping disabled options
- arrow navigation while skipping disabled options
- `selectionFollowsFocus` in single-select mode
- toggle behavior in multi-select mode
- `Ctrl/Cmd + A` in multi-select mode
- range selection behavior (`Shift+Arrow`, `Shift+Space`) when enabled
- horizontal orientation parity for navigation and range selection
- correct `getRootProps/getOptionProps` behavior for both focus strategies
- default focus strategy is `aria-activedescendant`
- `getOptionProps` returns correct `aria-setsize` and `aria-posinset`
- `aria-setsize` equals total flat option count when groups are used
- `aria-posinset` is 1-based and reflects flat declaration order
- option groups: `getGroupProps` returns correct `role` and `aria-labelledby`
- option groups: `getGroupLabelProps` returns matching label id
- option groups: navigation crosses group boundaries seamlessly
- option groups: `getGroupOptions` returns correct subset
- option groups: `getUngroupedOptions` returns correct subset
- option groups: options with unknown `groupId` are treated as ungrouped
- typeahead operates across group boundaries

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Next Steps

- add optional APG extended shortcuts (`Ctrl+Shift+Home`, `Ctrl+Shift+End`)
- split keyboard-heavy tests into dedicated `listbox.keyboard.test.ts`
