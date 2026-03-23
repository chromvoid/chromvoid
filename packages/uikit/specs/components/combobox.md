# cv-combobox

Combobox input with popup listbox, supporting editable and select-only modes, single and multi-select, clearable behavior, and grouped options.

**Headless:** [`createCombobox`](../../../headless/specs/components/combobox.md)

## Cross-Spec Consistency

This document is the UIKit surface contract for Combobox.

- Headless `createCombobox` is the source of truth for state, transitions, and invariants.
- UIKit mirrors headless contracts through DOM attributes and events.
- Any intentional divergence between UIKit and headless MUST be documented in both specs.

## Anatomy

### Editable mode (default)

```
<cv-combobox> (host)
└── <div part="base">
    ├── <div part="input-wrapper">
    │   ├── <div part="tags">                    ← only when [multiple], contains selected tags
    │   │   ├── <span part="tag">                ← one per selected item (up to max-tags-visible)
    │   │   │   ├── <span part="tag-label">
    │   │   │   └── <button part="tag-remove">
    │   │   └── <span part="tag-overflow">       ← "+N more" when overflow
    │   ├── <input part="input" role="combobox">
    │   ├── <button part="clear-button">         ← only when [clearable] and value is present
    │   └── <span part="expand-icon">
    └── <div part="listbox" role="listbox">
        ├── <div part="group" role="group">      ← one per cv-combobox-group
        │   ├── <div part="group-label" role="presentation">
        │   └── <slot>                           ← accepts <cv-combobox-option> within group
        └── <slot>                               ← accepts <cv-combobox-option> (ungrouped)
```

### Select-only mode

```
<cv-combobox type="select-only"> (host)
└── <div part="base">
    ├── <div part="input-wrapper">
    │   ├── <div part="tags">                    ← only when [multiple]
    │   │   └── (same tag structure as editable)
    │   ├── <div part="trigger" role="combobox"> ← replaces <input> in select-only
    │   │   └── <span part="label">             ← selected value text or placeholder
    │   ├── <button part="clear-button">         ← only when [clearable] and value is present
    │   └── <span part="expand-icon">
    └── <div part="listbox" role="listbox">
        └── (same listbox structure as editable)
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Selected option id. In multi mode, space-delimited string of selected option values. |
| `input-value` | String | `""` | Editable input text. Read-only in select-only mode. |
| `open` | Boolean | `false` | Popup open state |
| `type` | String | `"editable"` | Combobox mode: `"editable"` \| `"select-only"` |
| `multiple` | Boolean | `false` | Enables multi-select behavior |
| `clearable` | Boolean | `false` | Shows clear button when a value is selected |
| `max-tags-visible` | Number | `3` | Maximum tags shown before "+N more" overflow. `0` = unlimited. Only meaningful when `multiple` is `true`. |
| `open-on-focus` | Boolean | `true` | Opens popup when input receives focus |
| `open-on-click` | Boolean | `true` | Opens popup on input/trigger click when closed |
| `close-on-select` | Boolean | `true` (single) / `false` (multi) | Closes popup after selection commit. Default depends on `multiple`. |
| `match-mode` | String | `"includes"` | Default filter mode: `includes` \| `startsWith`. Ignored in select-only mode. |
| `placeholder` | String | `""` | Placeholder text for input or trigger |
| `disabled` | Boolean | `false` | Prevents interaction |
| `size` | String | `"medium"` | Size: `small` \| `medium` \| `large` |
| `aria-label` | String | `""` | Accessible label for input/listbox |

## Sizes

| Size | `--cv-combobox-min-height` | `--cv-combobox-padding-inline` |
|------|----------------------------|-------------------------------|
| `small` | `30px` | `var(--cv-space-2, 8px)` |
| `medium` | `36px` | `var(--cv-space-3, 12px)` |
| `large` | `42px` | `var(--cv-space-4, 16px)` |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | One or more `<cv-combobox-option>` or `<cv-combobox-group>` children |
| `prefix` | Icon or element before the input/trigger |
| `suffix` | Icon or element after the input/trigger (before expand icon) |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root layout container |
| `input-wrapper` | `<div>` | Wrapper around input/trigger, tags, clear button, and expand icon |
| `cv-input` | `<input>` | Editable combobox control (editable mode only) |
| `trigger` | `<div>` | Button-like trigger control (select-only mode only) |
| `label` | `<span>` | Selected value text inside trigger (select-only mode) |
| `listbox` | `<div>` | Popup listbox container |
| `tags` | `<div>` | Container for selected item tags (multi-select only) |
| `tag` | `<span>` | Individual selected item tag (multi-select only) |
| `tag-label` | `<span>` | Text label inside a tag |
| `tag-remove` | `<button>` | Remove button inside a tag |
| `tag-overflow` | `<span>` | "+N more" overflow indicator |
| `clear-button` | `<button>` | Clear selection button (clearable mode only) |
| `expand-icon` | `<span>` | Dropdown expand/collapse indicator icon |
| `group` | `<div>` | Option group container inside the listbox |
| `group-label` | `<div>` | Group header label inside the listbox |
| `prefix` | `<span>` | Wrapper around the `prefix` slot |
| `suffix` | `<span>` | Wrapper around the `suffix` slot |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-combobox-min-width` | `260px` | Minimum inline size of the host |
| `--cv-combobox-min-height` | `36px` | Minimum block size of the input/trigger |
| `--cv-combobox-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding of the input/trigger |
| `--cv-combobox-max-height` | `220px` | Maximum block size of the listbox popup |
| `--cv-combobox-border-color` | `var(--cv-color-border, #2a3245)` | Border color for input/trigger and listbox |
| `--cv-combobox-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius of the input/trigger |
| `--cv-combobox-listbox-radius` | `var(--cv-radius-md, 10px)` | Border radius of the listbox popup |
| `--cv-combobox-gap` | `var(--cv-space-1, 4px)` | Gap between base layout sections |
| `--cv-combobox-tag-gap` | `var(--cv-space-1, 4px)` | Gap between tags in multi-select |
| `--cv-combobox-tag-radius` | `var(--cv-radius-sm, 6px)` | Border radius of tag chips |
| `--cv-combobox-font-size` | `inherit` | Font size of the input/trigger text |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([disabled])` | Reduced opacity (`0.55`), `cursor: not-allowed` |
| `:host([open])` | Popup listbox is visible |
| `:host([type="select-only"])` | Trigger is a button-like element instead of an input |
| `:host([multiple])` | Multi-select mode with tag chips |
| `:host([clearable])` | Clear button may be shown |
| `:host([size="small"])` | Small size overrides |
| `:host([size="large"])` | Large size overrides |

## ARIA Contract

### Editable mode

- Input role is `combobox`
- Input exposes `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`
- When popup is open and active option exists, input exposes `aria-activedescendant`

### Select-only mode

- Trigger role is `combobox`
- Trigger exposes `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`
- `aria-autocomplete` is **not** present (no text input)
- When popup is open and active option exists, trigger exposes `aria-activedescendant`

### Common

- Popup role is `listbox`
- Options use role `option`
- When `multiple=true`, listbox exposes `aria-multiselectable="true"`
- Each selected option exposes `aria-selected="true"` (all selected in multi mode, not just one)
- Option groups use `role="group"` with `aria-labelledby` pointing to the group label element
- Group label elements use `role="presentation"`

All ARIA attributes are derived from headless contracts (`getInputProps`, `getListboxProps`, `getOptionProps`, `getGroupProps`, `getGroupLabelProps`). UIKit does not compute ARIA state independently.

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{value: string \| null, inputValue: string, activeId: string \| null, open: boolean, selectedIds: string[]}` | Fires when combobox interaction changes observable state |
| `cv-change` | `{value: string \| null, inputValue: string, activeId: string \| null, open: boolean, selectedIds: string[]}` | Fires when selected option(s) change |
| `cv-clear` | `{}` | Fires when the clear button is clicked |

In multi mode, `cv-input` fires on each toggle and `cv-change` fires on each toggle (since every toggle changes selection). The `selectedIds` array in the detail reflects all currently selected option ids.

## Reactive State Mapping

`cv-combobox` is a visual adapter over headless `createCombobox` reactive state.

### Attribute to Headless (UIKit -> Headless)

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` | attr -> action | `actions.select(id)` / `actions.clearSelection()`. In multi mode, parsed as space-delimited ids. |
| `input-value` | attr -> action | `actions.setInputValue(value)` |
| `open` | attr -> action | `actions.open()` / `actions.close()` |
| `type` | attr -> option | passed as `type` in `createCombobox(options)` |
| `multiple` | attr -> option | passed as `multiple` in `createCombobox(options)` |
| `clearable` | attr -> option | passed as `clearable` in `createCombobox(options)` |
| `close-on-select` | attr -> option | passed as `closeOnSelect` in `createCombobox(options)` |
| `match-mode` | attr -> option | passed as `matchMode` in `createCombobox(options)` |
| `aria-label` | attr -> option | passed as `ariaLabel` in `createCombobox(options)` |

### Headless to DOM (Headless -> UIKit)

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.selectedId()` | state -> attr | `[value]` host attribute (single mode) |
| `state.selectedIds()` | state -> attr | `[value]` host attribute as space-delimited string (multi mode) |
| `state.inputValue()` | state -> attr | `[input-value]` host attribute |
| `state.isOpen()` | state -> attr | `[open]` host attribute |
| `state.activeId()` | state -> render | `aria-activedescendant` on input/trigger |
| `state.hasSelection()` | state -> render | clear button visibility |
| `state.type()` | state -> render | determines input vs trigger rendering |
| `state.multiple()` | state -> render | determines tag rendering |

### Contract Spreading

- `contracts.getInputProps()` is spread onto `[part="input"]` (editable) or `[part="trigger"]` (select-only) -- applies `role`, `aria-haspopup`, `aria-expanded`, `aria-controls`, `aria-autocomplete` (editable only), `aria-activedescendant`, `aria-label`
- `contracts.getListboxProps()` is spread onto `[part="listbox"]` -- applies `role`, `tabindex`, `aria-label`, `aria-multiselectable` (multi only)
- `contracts.getOptionProps(id)` is spread onto each `cv-combobox-option` -- applies `role`, `tabindex`, `aria-selected`, `aria-disabled`, `data-active`
- `contracts.getGroupProps(groupId)` is spread onto each `[part="group"]` -- applies `role`, `aria-labelledby`
- `contracts.getGroupLabelProps(groupId)` is spread onto each `[part="group-label"]` -- applies `id`, `role`
- `contracts.getVisibleOptions()` drives option/group visibility (supports grouped structure; empty groups are hidden)
- `contracts.getFlatVisibleOptions()` available for navigation index calculations

### UIKit-Only Concerns (NOT in headless)

- Tag/chip rendering for multi-select selected items
- "+N more" overflow display for multi-select (controlled by `max-tags-visible`)
- Clear button rendering and visibility (uses `state.hasSelection()` + `clearable` attribute)
- Select-only trigger visual (button-like with selected label + expand icon)
- Option group visual styling (indentation, group header)
- Popup positioning and animation
- `cv-clear` event dispatch
- Size variants (`small` / `medium` / `large`)

## Behavioral Contract

### Editable Mode (default)

- Text input updates `input-value`, opens popup, and filters visible options
- Focus opens popup only when `open-on-focus=true`
- Input click opens popup only when `open-on-click=true`
- Arrow/Home/End navigation follows headless combobox behavior
- Enter commits active option (`value`, `input-value`, popup closes only when `close-on-select=true`)
- Escape closes popup without clearing committed selection
- Clicking outside closes popup
- `match-mode="startsWith"` uses case-insensitive starts-with filtering
- Slot changes rebuild model while preserving still-valid selected value

### Select-Only Mode

- `input-value` is not user-editable; `setInputValue` is a no-op in headless
- Trigger displays the selected option's label (or placeholder when no selection)
- Keyboard when closed: `Space`/`Enter` opens popup; `ArrowDown`/`ArrowUp` opens and activates first/last option
- Keyboard when open: `ArrowDown`/`ArrowUp` navigate; `Enter`/`Space` commit active option; `Escape` closes; `Home`/`End` navigate to first/last
- Type-to-select via printable characters: typeahead jumps to matching option by label prefix
- Filtering is disabled; all non-disabled options are always visible

### Multi-Select

- `commitActive` toggles the active option in `selectedIds` instead of replacing selection
- `select(id)` toggles the option instead of replacing
- Listbox stays open after each selection (default `close-on-select=false`)
- `input-value` is NOT overwritten on commit (it drives filtering in editable multi mode)
- In select-only multi mode, `inputValue` is always `""` (trigger shows tags instead)
- Tags/chips are rendered inside `[part="tags"]` for each selected item
- When `selectedIds.length > max-tags-visible`, overflow shows "+N more" in `[part="tag-overflow"]`
- Clicking `[part="tag-remove"]` calls `actions.removeSelected(id)`
- `value` attribute reflects all selected ids as a space-delimited string

### Clearable

- Clear button `[part="clear-button"]` is visible when `clearable=true` and `state.hasSelection()` is true
- Clicking the clear button calls `actions.clear()` (resets both selection and input value)
- `cv-clear` event is dispatched when the clear button is clicked

### Option Groups

- `<cv-combobox-group label="Name">` wraps `<cv-combobox-option>` children into a visual group
- Groups are rendered as `[part="group"]` with `role="group"` and `aria-labelledby` pointing to `[part="group-label"]`
- Groups with all options filtered out are hidden
- Navigation crosses group boundaries seamlessly (headless handles this via flat visible options)

### Disabled State

- When `disabled=true`, the combobox is non-interactive: input/trigger cannot be focused, popup cannot open, clear/tag-remove buttons are inert

## Optional Advanced Behaviors (Future Scope)

These behaviors are optional and currently not required on `cv-combobox`:

- free-text/custom value commit when no option is active
- async option loading
- inline autocomplete completion rendering

## Usage

```html
<!-- Basic editable combobox -->
<cv-combobox aria-label="Search">
  <cv-combobox-option value="a">Alpha</cv-combobox-option>
  <cv-combobox-option value="b">Beta</cv-combobox-option>
  <cv-combobox-option value="c" disabled>Gamma</cv-combobox-option>
</cv-combobox>

<!-- Select-only combobox -->
<cv-combobox type="select-only" aria-label="Country" placeholder="Select a country">
  <cv-combobox-option value="us">United States</cv-combobox-option>
  <cv-combobox-option value="uk">United Kingdom</cv-combobox-option>
  <cv-combobox-option value="de">Germany</cv-combobox-option>
</cv-combobox>

<!-- Multi-select editable -->
<cv-combobox multiple aria-label="Tags" placeholder="Add tags...">
  <cv-combobox-option value="js">JavaScript</cv-combobox-option>
  <cv-combobox-option value="ts">TypeScript</cv-combobox-option>
  <cv-combobox-option value="py">Python</cv-combobox-option>
  <cv-combobox-option value="rs">Rust</cv-combobox-option>
</cv-combobox>

<!-- Multi-select select-only with max tags -->
<cv-combobox type="select-only" multiple max-tags-visible="2" aria-label="Assignees">
  <cv-combobox-option value="alice">Alice</cv-combobox-option>
  <cv-combobox-option value="bob">Bob</cv-combobox-option>
  <cv-combobox-option value="carol">Carol</cv-combobox-option>
  <cv-combobox-option value="dave">Dave</cv-combobox-option>
</cv-combobox>

<!-- Clearable combobox -->
<cv-combobox clearable aria-label="Fruit">
  <cv-combobox-option value="apple">Apple</cv-combobox-option>
  <cv-combobox-option value="banana">Banana</cv-combobox-option>
  <cv-combobox-option value="cherry">Cherry</cv-combobox-option>
</cv-combobox>

<!-- Grouped options -->
<cv-combobox aria-label="City">
  <cv-combobox-group label="North America">
    <cv-combobox-option value="nyc">New York</cv-combobox-option>
    <cv-combobox-option value="la">Los Angeles</cv-combobox-option>
    <cv-combobox-option value="tor">Toronto</cv-combobox-option>
  </cv-combobox-group>
  <cv-combobox-group label="Europe">
    <cv-combobox-option value="lon">London</cv-combobox-option>
    <cv-combobox-option value="par">Paris</cv-combobox-option>
    <cv-combobox-option value="ber">Berlin</cv-combobox-option>
  </cv-combobox-group>
</cv-combobox>

<!-- With prefix/suffix slots -->
<cv-combobox aria-label="Search" clearable>
  <icon-search slot="prefix"></icon-search>
  <cv-combobox-option value="a">Alpha</cv-combobox-option>
  <cv-combobox-option value="b">Beta</cv-combobox-option>
</cv-combobox>

<!-- Small size -->
<cv-combobox size="small" aria-label="Quick select">
  <cv-combobox-option value="a">Alpha</cv-combobox-option>
  <cv-combobox-option value="b">Beta</cv-combobox-option>
</cv-combobox>
```

## Child Elements

### cv-combobox-option

Individual option within a combobox. The parent `cv-combobox` manages all ARIA attributes on this element via headless contracts.

#### Anatomy

```
<cv-combobox-option> (host)
└── <div part="base">
    └── <slot>
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Unique identifier for this option. Auto-generated as `option-{n}` if omitted. |
| `disabled` | Boolean | `false` | Whether the option is disabled |
| `selected` | Boolean | `false` | Whether the option is selected. Managed by parent. |
| `active` | Boolean | `false` | Whether the option is the active (highlighted) option. Managed by parent. |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Option label content |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root wrapper for the option content |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([selected])` | Option is currently selected |
| `:host([active])` / `:host([data-active="true"])` | Option is the active (highlighted) option |
| `:host([disabled])` | Option is disabled |
| `:host([hidden])` | Option is filtered out or popup is closed |

### cv-combobox-group

Groups related options under a labeled header. Must be a direct child of `cv-combobox`.

#### Anatomy

```
<cv-combobox-group> (host)
└── <slot>           ← accepts <cv-combobox-option> children
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `label` | String | `""` | Visible group header text. Also used for `aria-labelledby` linkage via headless `getGroupLabelProps`. |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | One or more `<cv-combobox-option>` children |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([hidden])` | All options in this group are filtered out |
