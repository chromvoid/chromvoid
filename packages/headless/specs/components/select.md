# Select Component Contract

## Purpose

`Select` provides a headless single- or multi-selection model composed from trigger + listbox behavior, following the W3C APG Select-Only Combobox pattern.

## Component Files

- `src/select/index.ts` - model and public `createSelect` API
- `src/select/select.test.ts` - unit behavior tests

## Public API

- `createSelect(options)`
  - `options` — `readonly ListboxOption[]`
  - `idBase` — optional id prefix
  - `ariaLabel` — optional accessible label
  - `initialOpen` — optional initial popup state
  - `initialSelectedId` — optional initial selected id (single convenience)
  - `initialSelectedIds` — optional initial selected ids array
  - `selectionMode` — `'single'` (default) or `'multiple'`
  - `closeOnSelect` — close popup on selection (default `true`)
  - `placeholder` — fallback value text
  - `disabled` — initial disabled state (default `false`)
  - `required` — initial required state (default `false`)
  - `onSelectedIdChange` — callback on first-selected-id change
- `state` (signal-backed):
  - `isOpen()` - popup visibility
  - `activeId()` - currently focused option id
  - `selectedIds()` - selected ids array
  - `selectedId()` - computed first selected id
  - `selectedLabel()` - computed first selected label
  - `selectedLabels()` - computed ordered labels for all selected ids
  - `restoreTargetId()` - trigger restore target after close
  - `disabled()` - whether the select is disabled
  - `required()` - whether the select is required
- `actions`:
  - `open`, `close`, `toggle`
  - `select(id)` — in single mode calls `selectOnly`; in multiple mode calls `toggleSelected`
  - `clear()`
  - `setDisabled(value)` — update disabled state
  - `setRequired(value)` — update required state
  - `handleTriggerKeyDown`
  - `handleListboxKeyDown`
- `contracts`:
  - `getTriggerProps()` — returns combobox ARIA props including `aria-activedescendant` when open
  - `getListboxProps()` — includes `aria-multiselectable: 'true'` when `selectionMode='multiple'`
  - `getOptionProps(id)`
  - `getValueText()` — single: first label; multiple: comma-joined labels; fallback: placeholder

## APG and A11y Contract

Follows the W3C APG Select-Only Combobox pattern. DOM focus stays on the trigger; visual focus is managed via `aria-activedescendant`.

- trigger role: `combobox`
- trigger attributes:
  - `aria-haspopup="listbox"`
  - `aria-expanded`
  - `aria-controls`
  - `aria-activedescendant` — references the active option DOM id when open
  - `aria-disabled` — when `disabled` is `true`
  - `aria-required` — when `required` is `true`
  - `aria-label` — optional accessible label
- popup role: `listbox`
- popup attributes:
  - `aria-multiselectable` (when `selectionMode='multiple'`)
  - `hidden`
- option role: `option`
- option attributes:
  - `aria-selected`
  - `aria-disabled` (when disabled)

## Keyboard Contract

- trigger (closed):
  - `ArrowDown` / `Home`: open and focus first option
  - `ArrowUp` / `End`: open and focus last option
  - `Enter` / `Space`: toggle popup
- listbox (open — DOM focus remains on trigger, visual focus via `aria-activedescendant`):
  - `ArrowDown` / `ArrowUp` / `Home` / `End`: navigation delegated to listbox keyboard contract
  - `Enter` / `Space`: select active option (single: `selectOnly`; multiple: `toggleSelected`)
  - `Escape` / `Tab`: close and restore focus target
- when disabled: all keyboard handlers are no-ops

## Behavior Contract

- `Select` reuses `createListbox` with configurable `selectionMode`.
- Opening behavior chooses initial focus strategy (`selected`, `first`, `last`).
- `select(id)` in single mode calls `selectOnly`; in multiple mode calls `toggleSelected`.
- Selection callback `onSelectedIdChange` fires only on actual first-selected-id changes.
- `getValueText()` returns comma-joined labels in multiple mode, first label in single mode, fallback placeholder, or empty string.
- When `disabled` is `true`, all interaction actions (`open`, `close`, `toggle`, `select`, `clear`, keyboard handlers) are no-ops.
- `disabled` and `required` are mutable via `setDisabled`/`setRequired` actions for dynamic updates.

## Invariants

- `selectedId` must equal `selectedIds[0]` when present.
- `selectedLabel` must resolve from `selectedId` and option map.
- `selectedLabels` must resolve from `selectedIds` and option map, preserving order.
- Trigger `data-selected-id` / `data-selected-label` must reflect computed selection state.
- Close path must set `restoreTargetId` to trigger id.
- When open, trigger `aria-activedescendant` must reference the active option DOM id.
- When disabled, `aria-disabled="true"` must be present on trigger props.
- When required, `aria-required="true"` must be present on trigger props.

## Minimum Test Matrix

- trigger keyboard open/close flow
- trigger/listbox role and `aria-controls` linkage (trigger role is `combobox`)
- trigger `aria-activedescendant` references active option when open
- active option selection with `Enter`
- selected state and value text synchronization
- open-on-arrow-up path focusing last option
- multi-select toggle via `select()` — `selectedIds` grows/shrinks
- multi-select `getValueText()` — comma-joined labels
- multi-select `getListboxProps()` — `aria-multiselectable: 'true'`
- multi-select + `closeOnSelect: false` — popup stays open
- `selectedLabels` computed — returns ordered labels
- disabled blocks all interactions (open, select, keyboard)
- disabled `getTriggerProps()` includes `aria-disabled: 'true'`
- required `getTriggerProps()` includes `aria-required: 'true'`
- `clear()` is no-op when disabled

## Adapter Expectations

UIKit adapter will:
- Read: `state.isOpen`, `state.activeId`, `state.selectedId`, `state.selectedLabel`, `state.selectedIds`, `state.selectedLabels`, `state.disabled`, `state.required`, `state.restoreTargetId`
- Call: `actions.open`, `actions.close`, `actions.toggle`, `actions.select`, `actions.clear`, `actions.setDisabled`, `actions.setRequired`, `actions.handleTriggerKeyDown`, `actions.handleListboxKeyDown`
- Spread: `contracts.getTriggerProps()` onto trigger element, `contracts.getListboxProps()` onto listbox container, `contracts.getOptionProps(id)` onto each option
- Display: `contracts.getValueText()` as trigger display text

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- async option loading and virtualization
- option grouping and section headers (visual-only, UIKit concern)
- native `<select>` form submission parity edge cases
