# Combobox Component Contract

## Purpose

`Combobox` provides a headless APG-aligned input + popup listbox model.

The component manages open/close, active option tracking, filtering,
and deterministic commit behavior with no visual layer.

Supports editable (autocomplete) and select-only modes, single and multi-select,
clearable behavior, and grouped options.

## Component Files

- `src/combobox/index.ts` - model and public `createCombobox` API
- `src/combobox/combobox.test.ts` - unit behavior tests

## Public API

- `createCombobox(options)`
  - options:
    - `options: readonly (ComboboxOption | ComboboxOptionGroup)[]` — flat options or grouped options (mixed allowed)
    - `type?: "editable" | "select-only"` (default `"editable"`)
    - `multiple?: boolean` (default `false`)
    - `clearable?: boolean` (default `false`)
    - `closeOnSelect?: boolean` (default `true` in single mode, `false` in multi mode)
    - `matchMode?: "includes" | "startsWith"` (default `"includes"`)
    - `filter?: (option: ComboboxOption, inputValue: string) => boolean`
    - `typeahead?: boolean | { enabled?: boolean; timeoutMs?: number }`
    - `idBase?: string`
    - `ariaLabel?: string`
    - `initialInputValue?: string`
    - `initialSelectedId?: string | null`
    - `initialSelectedIds?: string[]`
    - `initialOpen?: boolean`

### Option Types

```ts
interface ComboboxOption {
  id: string
  label: string
  disabled?: boolean
}

interface ComboboxOptionGroup {
  id: string
  label: string
  options: ComboboxOption[]
}
```

Groups and flat options can be mixed in the `options` array. A group is distinguished by the presence of a nested `options` array.

## State Signals

| Signal | Type | Description |
| --- | --- | --- |
| `inputValue()` | `string` | Current input field text |
| `isOpen()` | `boolean` | Popup visibility |
| `activeId()` | `string \| null` | Currently highlighted option id |
| `selectedId()` | `string \| null` | First (or only) selected option id. In multi mode, equals `selectedIds[0]` or `null`. |
| `selectedIds()` | `readonly string[]` | All selected option ids. In single mode, array of zero or one. |
| `hasSelection()` | `boolean` (computed) | `selectedIds.length > 0` |
| `type()` | `"editable" \| "select-only"` | Current combobox type (from config, not mutable at runtime) |
| `multiple()` | `boolean` | Whether multi-select is enabled (from config) |

### Backward Compatibility

`selectedId` remains the primary single-selection signal. In single mode it behaves identically to the pre-update API. In multi mode it is a computed alias for `selectedIds[0] ?? null`.

## Actions

| Action | Signature | Description |
| --- | --- | --- |
| `open` | `() => void` | Opens popup, resets typeahead, ensures active option is valid |
| `close` | `() => void` | Closes popup, resets typeahead |
| `setInputValue` | `(value: string) => void` | Updates input text, opens popup, revalidates active option. **No-op in select-only mode.** |
| `setActive` | `(id: string \| null) => void` | Sets active option if visible and enabled |
| `moveNext` | `() => void` | Opens popup, moves active to next enabled visible option (wrapping) |
| `movePrev` | `() => void` | Opens popup, moves active to previous enabled visible option (wrapping) |
| `moveFirst` | `() => void` | Opens popup, sets active to first enabled visible option |
| `moveLast` | `() => void` | Opens popup, sets active to last enabled visible option |
| `commitActive` | `() => void` | Commits currently active option. In single mode: sets `selectedId`/`inputValue`, closes if `closeOnSelect`. In multi mode: calls `toggleOption(activeId)`. |
| `select` | `(id: string) => void` | Commits specific option by id. In single mode: replaces selection. In multi mode: calls `toggleOption(id)`. |
| `toggleOption` | `(id: string) => void` | **Multi-mode only.** Adds id to `selectedIds` if not present, removes if present. No-op in single mode. |
| `removeSelected` | `(id: string) => void` | Removes specific id from `selectedIds`. Works in both modes. |
| `clearSelection` | `() => void` | Resets `selectedIds` to empty, `selectedId` to `null`. Does not clear `inputValue`. |
| `clear` | `() => void` | Clears both selection and input value. Resets `selectedIds` to empty, `selectedId` to `null`, `inputValue` to `""`. |
| `handleKeyDown` | `(event: KeyboardEventLike) => void` | Delegates to navigation/commit/dismiss transitions based on key |

## Contracts

| Contract | Return Type | Description |
| --- | --- | --- |
| `getInputProps()` | `ComboboxInputProps` | ARIA attributes for the trigger/input element |
| `getListboxProps()` | `ComboboxListboxProps` | ARIA attributes for the popup listbox |
| `getOptionProps(id)` | `ComboboxOptionProps` | ARIA attributes for an individual option |
| `getGroupProps(groupId)` | `ComboboxGroupProps` | ARIA attributes for an option group container |
| `getGroupLabelProps(groupId)` | `ComboboxGroupLabelProps` | Attributes for the group label element |
| `getVisibleOptions()` | `readonly (ComboboxOption \| ComboboxVisibleGroup)[]` | Filtered visible options, preserving group structure when groups exist. Empty groups are omitted. |
| `getFlatVisibleOptions()` | `readonly ComboboxOption[]` | Flat list of all visible options (groups flattened), for navigation purposes |

### Contract Return Types

```ts
interface ComboboxInputProps {
  id: string
  role: 'combobox'
  tabindex: '0'
  'aria-haspopup': 'listbox'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  'aria-autocomplete'?: 'list'          // present in editable mode, omitted in select-only
  'aria-activedescendant'?: string      // present when open and active option exists
  'aria-label'?: string
  'aria-multiselectable'?: undefined    // never on combobox; lives on listbox
}

interface ComboboxListboxProps {
  id: string
  role: 'listbox'
  tabindex: '-1'
  'aria-label'?: string
  'aria-multiselectable'?: 'true'       // present only when multiple=true
}

interface ComboboxOptionProps {
  id: string
  role: 'option'
  tabindex: '-1'
  'aria-selected': 'true' | 'false'    // true for ALL selected options in multi mode
  'aria-disabled'?: 'true'
  'data-active': 'true' | 'false'
}

interface ComboboxGroupProps {
  id: string
  role: 'group'
  'aria-labelledby': string             // references the group label element id
}

interface ComboboxGroupLabelProps {
  id: string
  role: 'presentation'
}

interface ComboboxVisibleGroup {
  id: string
  label: string
  options: readonly ComboboxOption[]    // filtered, non-empty
}
```

## APG and A11y Contract

- input role: `combobox`
- popup role: `listbox`
- option role: `option`
- group role: `group` with `aria-labelledby` referencing group label element
- `aria-activedescendant` is the default active-option focus strategy
- input exposes:
  - `aria-expanded`
  - `aria-controls`
  - `aria-autocomplete="list"` (editable mode only; omitted in select-only mode)
  - `aria-activedescendant` when active option exists and popup is open
- listbox exposes:
  - `aria-multiselectable="true"` when `multiple=true`
- option exposes:
  - `aria-selected="true"` for every selected option (not just one in multi mode)

## Behavior Contract

### Editable Mode (default)

- `setInputValue` updates value, opens popup, and revalidates active option
- Arrow navigation moves active option across enabled visible options
- Enter commits active option (`selectedId`, `inputValue`, popup close only when `closeOnSelect=true`)
- Escape closes popup without clearing selected value
- disabled options are skipped during navigation and cannot be committed

### Select-Only Mode

- `setInputValue` is a no-op; the input value is not user-editable
- The trigger displays the selected option's label (or placeholder)
- `inputValue` is kept in sync with the selected option's label automatically
- Type-to-select via printable characters: printable key presses use typeahead to jump to the matching option by label prefix (same typeahead mechanism as editable mode)
- Keyboard when closed:
  - `Space` / `Enter`: opens popup
  - `ArrowDown` / `ArrowUp`: opens popup and activates first/last enabled option
- Keyboard when open:
  - `ArrowDown` / `ArrowUp`: navigate active option
  - `Enter`: commits active option and closes
  - `Space`: commits active option and closes
  - `Escape`: closes without changing selection
  - `Home` / `End`: navigate to first/last enabled option
- Filtering is not applicable in select-only mode; all non-disabled options are always visible

### Multi-Select Mode

- `commitActive` calls `toggleOption(activeId)` instead of replacing selection
- `select(id)` calls `toggleOption(id)` instead of replacing selection
- `toggleOption(id)` adds the id to `selectedIds` if absent, removes if present
- `closeOnSelect` defaults to `false` (popup stays open after each selection)
- `inputValue` is NOT automatically set to a label on commit (since multiple items are selected)
- In editable multi mode, `inputValue` drives filtering but is not overwritten on commit
- In select-only multi mode, `inputValue` is always `""` (the trigger shows tags/chips instead)
- `getOptionProps(id)` returns `aria-selected: "true"` for every option in `selectedIds`
- `getListboxProps()` returns `aria-multiselectable: "true"`

### Clearable

- `clear()` resets both selection state and input value
- `clearSelection()` resets only selection state (preserves `inputValue`)
- Adapter uses `hasSelection` to determine clear button visibility

### Option Groups

- Config `options` accepts a mix of `ComboboxOption` and `ComboboxOptionGroup`
- Flat options provided at top level are treated as ungrouped
- `getVisibleOptions()` returns grouped structure: `ComboboxVisibleGroup` entries preserve nesting, with empty groups filtered out
- `getFlatVisibleOptions()` returns all visible options in document order, groups flattened — used for keyboard navigation
- Filtering operates within groups; if all options in a group are filtered out, the group is omitted from `getVisibleOptions()`
- `getGroupProps(groupId)` returns `{ id, role: "group", "aria-labelledby": "<label-id>" }`
- `getGroupLabelProps(groupId)` returns `{ id: "<label-id>", role: "presentation" }`
- Navigation (moveNext/movePrev/moveFirst/moveLast) operates on the flat enabled visible list; group boundaries do not affect navigation order

## Transition Model

State is signal-backed, transitions are explicit and testable, and invariants are machine-checkable.

### Core Transitions (all modes)

| Event / action | Preconditions | Next state |
| --- | --- | --- |
| `open()` | none | `isOpen=true`; `activeId` is first enabled visible option or `null` |
| `close()` | none | `isOpen=false`; `selectedId` and `inputValue` unchanged |
| `moveNext()` / `movePrev()` | none | `isOpen=true`; `activeId` cycles within enabled visible options, or `null` when none |
| `moveFirst()` / `moveLast()` | none | `isOpen=true`; `activeId` becomes first/last enabled visible option, or `null` when none |
| `setActive(id)` | `id` must be visible and enabled | `activeId=id`; invalid/disabled/non-visible ids are ignored |
| `clearSelection()` | none | `selectedIds=[]`; `selectedId=null`; `inputValue` unchanged |
| `clear()` | none | `selectedIds=[]`; `selectedId=null`; `inputValue=""`; `isOpen` unchanged |
| `handleKeyDown(ArrowUp/ArrowDown/Home/End/Enter/Escape)` | keyboard intent recognized | delegates to explicit transitions above |

### Editable Mode Transitions

| Event / action | Preconditions | Next state |
| --- | --- | --- |
| `setInputValue(value)` | `type="editable"` | `inputValue=value`; `isOpen=true`; `activeId` revalidated against enabled visible options |
| `commitActive()` (single) | `activeId!=null`, enabled, `multiple=false` | `selectedId=activeId`; `selectedIds=[activeId]`; `inputValue=selected label`; closes when `closeOnSelect=true` |
| `commitActive()` (multi) | `activeId!=null`, enabled, `multiple=true` | `toggleOption(activeId)`; `inputValue` unchanged; closes when `closeOnSelect=true` |
| `select(id)` (single) | `id` exists, enabled, `multiple=false` | same as single `commitActive` for that id |
| `select(id)` (multi) | `id` exists, enabled, `multiple=true` | `toggleOption(id)`; `inputValue` unchanged; closes when `closeOnSelect=true` |

### Select-Only Mode Transitions

| Event / action | Preconditions | Next state |
| --- | --- | --- |
| `setInputValue(value)` | `type="select-only"` | **no-op** |
| `commitActive()` (single) | `activeId!=null`, enabled, `multiple=false` | `selectedId=activeId`; `selectedIds=[activeId]`; `inputValue=selected label`; closes when `closeOnSelect=true` |
| `commitActive()` (multi) | `activeId!=null`, enabled, `multiple=true` | `toggleOption(activeId)`; `inputValue=""`; closes when `closeOnSelect=true` |
| `handleKeyDown(Space)` (closed) | `type="select-only"`, `isOpen=false` | `open()` |
| `handleKeyDown(Space)` (open) | `type="select-only"`, `isOpen=true` | `commitActive()` |
| `handleKeyDown(printable char)` | `type="select-only"` | typeahead navigation (jump to matching option by label prefix) |

### Multi-Select Transitions

| Event / action | Preconditions | Next state |
| --- | --- | --- |
| `toggleOption(id)` | `id` exists, enabled, `multiple=true` | if `id` in `selectedIds`: remove it; else: add it. `activeId` set to `id`. |
| `toggleOption(id)` | `multiple=false` | **no-op** |
| `removeSelected(id)` | `id` in `selectedIds` | removes `id` from `selectedIds`; `selectedId` recomputed |
| `removeSelected(id)` | `id` not in `selectedIds` | **no-op** |

## Typeahead Contract

- optional typeahead support for active-option navigation
- configuration via `options.typeahead`:
  - `boolean`
  - `{ enabled?: boolean; timeoutMs?: number }`
- repeated same-character key cycling is supported
- buffered matching uses timeout-based reset
- disabled visible options are skipped during typeahead matching
- In select-only mode, typeahead is always active for printable characters (regardless of `typeahead` config), matching the APG select-only combobox pattern
- In editable mode, typeahead is used only when the popup is open and the key is not consumed by the input field

## Filtering Contract

- default filter:
  - case-insensitive `includes` when `matchMode="includes"`
  - case-insensitive `startsWith` when `matchMode="startsWith"`
- custom filter hook can be provided via `options.filter`
- active option must always be valid for current filtered visible options or `null`
- **Filtering is disabled in select-only mode**: all options are always visible regardless of `inputValue`
- When groups are used, filtering operates per-option within each group; empty groups are excluded from visible results

## Invariants

- `selectedId` is either a valid option id or `null`
- `selectedId` equals `selectedIds[0]` when `selectedIds` is non-empty, `null` otherwise
- In single mode (`multiple=false`), `selectedIds` has at most one element
- `activeId` is either a valid enabled visible option id or `null`
- commit behavior is deterministic for the same state and active option
- `getOptionProps(id)` returns `aria-selected: "true"` for every id in `selectedIds`
- `getListboxProps()` returns `aria-multiselectable: "true"` if and only if `multiple=true`
- `getInputProps()` includes `aria-autocomplete: "list"` if and only if `type="editable"`
- In select-only mode, `setInputValue` must be a no-op
- Every group referenced via `getGroupProps(groupId)` must have a corresponding `getGroupLabelProps(groupId)` with matching `aria-labelledby` linkage
- Group ids are unique and do not collide with option ids

These invariants are machine-checkable through deterministic assertions in
`src/combobox/combobox.test.ts`.

## Adapter / Consumer Mapping

- headless contracts are the single source of ARIA mapping truth:
  - `getInputProps()` maps signal state to combobox input attributes
  - `getListboxProps()` maps popup identity and role
  - `getOptionProps(id)` maps option active/selected/disabled semantics
  - `getGroupProps(groupId)` maps group container identity and role
  - `getGroupLabelProps(groupId)` maps group label identity
- UIKit adapter (`cv-combobox`) must consume these contracts directly instead of
  recomputing ARIA state.
- consumers that compose combobox behavior (for example command palette)
  interact via `state`, `actions`, and `contracts` without bypassing invariants.

## Adapter Expectations

UIKit adapter will:

**Signals read (reactive, drive re-renders):**
- `state.inputValue()` — current input text
- `state.isOpen()` — popup visibility
- `state.activeId()` — highlighted option id
- `state.selectedId()` — first selected option id (single mode primary)
- `state.selectedIds()` — all selected ids (multi mode primary)
- `state.hasSelection()` — whether any option is selected (clearable button visibility)
- `state.type()` — determines trigger rendering (input vs button-like)
- `state.multiple()` — determines single vs multi rendering

**Actions called (event handlers, never mutate state directly):**
- `actions.open()` / `actions.close()` — popup toggle
- `actions.setInputValue(value)` — on input change (editable mode)
- `actions.setActive(id)` — on pointer hover over option
- `actions.moveNext()` / `actions.movePrev()` — arrow key navigation
- `actions.moveFirst()` / `actions.moveLast()` — Home/End navigation
- `actions.commitActive()` — Enter/Space commit
- `actions.select(id)` — direct option click
- `actions.toggleOption(id)` — multi-mode option click (adapter may use `select` which delegates)
- `actions.removeSelected(id)` — tag/chip dismiss in multi mode
- `actions.clear()` — clear button click (clearable mode)
- `actions.clearSelection()` — programmatic selection reset
- `actions.handleKeyDown(event)` — keyboard delegation

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getInputProps()` — spread onto trigger/input element
- `contracts.getListboxProps()` — spread onto popup listbox container
- `contracts.getOptionProps(id)` — spread onto each option element
- `contracts.getGroupProps(groupId)` — spread onto group container element
- `contracts.getGroupLabelProps(groupId)` — spread onto group label element
- `contracts.getVisibleOptions()` — drives option rendering (supports grouped structure)
- `contracts.getFlatVisibleOptions()` — available for navigation index calculations

**UIKit-only concerns (NOT in headless):**
- Tag/chip rendering for multi-select selected items
- "+N more" overflow display for multi-select
- Clear button rendering and visibility (uses `hasSelection` + `clearable` config)
- Select-only trigger visual (button-like with selected label + expand icon)
- Option group visual styling (indentation, separator)
- Popup positioning and animation

## Minimum Test Matrix

- open/close transitions
- Arrow/Home/End navigation behavior
- Enter commit behavior
- Escape close behavior
- disabled option skip behavior
- active descendant id integrity
- custom filter hook behavior
- typeahead cycling and timeout reset behavior
- select-only: `setInputValue` is no-op
- select-only: Space opens popup when closed
- select-only: Space commits active option when open
- select-only: `aria-autocomplete` is absent from input props
- select-only: type-to-select via printable characters
- multi-select: `toggleOption` adds and removes from `selectedIds`
- multi-select: `commitActive` toggles instead of replacing
- multi-select: `selectedId` equals `selectedIds[0]`
- multi-select: `getOptionProps` returns `aria-selected: "true"` for all selected
- multi-select: `getListboxProps` returns `aria-multiselectable: "true"`
- multi-select: `closeOnSelect` defaults to `false`
- multi-select: `removeSelected` removes specific id
- clearable: `clear()` resets selection and input value
- clearable: `clearSelection()` resets selection but preserves input value
- option groups: `getVisibleOptions` returns grouped structure
- option groups: empty groups are filtered out
- option groups: `getGroupProps` returns correct ARIA
- option groups: navigation crosses group boundaries seamlessly
- option groups: `getFlatVisibleOptions` returns flat list

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- async option loading
- free-text custom value creation
- inline autocomplete completion rendering

## Optional Advanced Behaviors (Future Scope)

These are intentionally optional and not required for current compatibility:

- custom-value commit policy (`allowCustomValue`) when no option is active
