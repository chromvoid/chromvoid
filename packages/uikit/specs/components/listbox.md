# cv-listbox

Standalone listbox widget for single or multiple selection from a list of options, with keyboard navigation, typeahead, optional grouping, and virtual scroll support.

**Headless:** [`createListbox`](../../../headless/specs/components/listbox.md)

## Anatomy

```
<cv-listbox> (host)
└── <div part="base" role="listbox">
    └── <slot>   ← accepts <cv-option> and <cv-listbox-group> children
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `selection-mode` | String | `"single"` | Selection mode: `"single"` \| `"multiple"` |
| `orientation` | String | `"vertical"` | Layout orientation: `"vertical"` \| `"horizontal"` |
| `focus-strategy` | String | `"aria-activedescendant"` | Focus management: `"aria-activedescendant"` \| `"roving-tabindex"` |
| `selection-follows-focus` | Boolean | `false` | Auto-select focused option in single mode |
| `range-selection` | Boolean | `false` | Enable Shift+Arrow and Shift+Space range selection (multiple mode only) |
| `typeahead` | Boolean | `true` | Enable typeahead character navigation |
| `aria-label` | String | `""` | Accessible label for the listbox |

Non-reflected properties:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `value` | `string \| null` | `null` | First selected option value (single-select shorthand) |
| `selectedValues` | `string[]` | `[]` | Array of all selected option values |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | One or more `<cv-option>` or `<cv-listbox-group>` children |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root listbox element with `role="listbox"` |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-listbox-gap` | `var(--cv-space-1, 4px)` | Gap between options |
| `--cv-listbox-padding` | `var(--cv-space-1, 4px)` | Inner padding of the listbox container |
| `--cv-listbox-border-radius` | `var(--cv-radius-md, 10px)` | Border radius of the listbox container |
| `--cv-listbox-border-color` | `var(--cv-color-border, #2a3245)` | Border color |
| `--cv-listbox-background` | `var(--cv-color-surface, #141923)` | Background color |
| `--cv-listbox-focus-outline-color` | `var(--cv-color-primary, #65d7ff)` | Focus-visible outline color |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([orientation="horizontal"])` | Horizontal layout (flexbox row direction) |
| `:host([selection-mode="multiple"])` | Multiple selection mode active |
| `:host([focus-strategy="roving-tabindex"])` | Options receive DOM focus directly |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{selectedValues: string[], activeValue: string \| null}` | Fires when active option or selection changes via user interaction |
| `cv-change` | `{selectedValues: string[], activeValue: string \| null}` | Fires when selected option(s) change via user interaction |

## Keyboard Interaction

All keyboard handling is delegated to headless `actions.handleKeyDown`. The following is the resulting behavior:

| Key | Context | Action |
|-----|---------|--------|
| `ArrowDown` / `ArrowRight`* | any | Move to next enabled option |
| `ArrowUp` / `ArrowLeft`* | any | Move to previous enabled option |
| `Home` | any | Move to first enabled option |
| `End` | any | Move to last enabled option |
| `Space` / `Enter` | single mode | Select active option exclusively |
| `Space` / `Enter` | multiple mode | Toggle active option selection |
| `Escape` | any | Close (for composite patterns) |
| `Ctrl/Cmd + A` | multiple mode | Select all enabled options |
| `Shift + Arrow` | multiple + range-selection | Extend range selection |
| `Shift + Space` | multiple + range-selection | Select range from anchor to active |
| printable char | typeahead enabled | Typeahead navigation to matching option |

*Arrow key mapping depends on orientation: vertical uses Up/Down, horizontal uses Left/Right.

## Reactive State Mapping

`cv-listbox` is a visual adapter over headless `createListbox`.

### Attribute to Headless (UIKit -> Headless)

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `selection-mode` | attr -> option | passed as `selectionMode` in `createListbox(options)` |
| `orientation` | attr -> option | passed as `orientation` in `createListbox(options)` |
| `focus-strategy` | attr -> option | passed as `focusStrategy` in `createListbox(options)` |
| `selection-follows-focus` | attr -> option | passed as `selectionFollowsFocus` in `createListbox(options)` |
| `range-selection` | attr -> option | passed as `rangeSelection` in `createListbox(options)` |
| `typeahead` | attr -> option | passed as `typeahead` in `createListbox(options)` |
| `aria-label` | attr -> option | passed as `ariaLabel` in `createListbox(options)` |
| `value` (setter) | prop -> action | `actions.selectOnly(id)` / `actions.clearSelected()` |

When any configuration attribute changes, the headless model is rebuilt via `createListbox` with updated options, preserving current selection and active state where still valid.

### Headless to DOM (Headless -> UIKit)

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.activeId()` | state -> render | `aria-activedescendant` on `[part="base"]` (activedescendant strategy); DOM focus on active option (roving-tabindex strategy) |
| `state.selectedIds()` | state -> render | `[aria-selected]` on each `cv-option`; `selectedValues` property; `value` property |
| `state.selectionMode` | state -> attr | `[selection-mode]` host attribute |
| `state.focusStrategy` | state -> attr | `[focus-strategy]` host attribute |
| `state.orientation` | state -> attr | `[orientation]` host attribute |
| `state.optionCount` | state -> render | `aria-setsize` on each option via `getOptionProps` |

### Contract Spreading

- `contracts.getRootProps()` is spread onto `[part="base"]` -- applies `role`, `tabindex`, `aria-orientation`, `aria-label`, `aria-multiselectable`, `aria-activedescendant`
- `contracts.getOptionProps(id)` is spread onto each `cv-option` -- applies `id`, `role`, `tabindex`, `aria-selected`, `aria-disabled`, `aria-setsize`, `aria-posinset`, `data-active`
- `contracts.getGroupProps(groupId)` is spread onto each `cv-listbox-group` shadow root group container -- applies `id`, `role`, `aria-labelledby`
- `contracts.getGroupLabelProps(groupId)` is spread onto each group label element -- applies `id`, `role`
- `contracts.getGroupOptions(groupId)` drives which options render within a group
- `contracts.getUngroupedOptions()` drives which options render outside any group

### UIKit-Only Concerns (NOT in headless)

- Option visual styling (active highlight, selected highlight, disabled opacity)
- Group visual styling (label header, indentation)
- Virtual scroll viewport management and option recycling
- `cv-input` and `cv-change` event dispatch based on state diffing after user interactions
- `preventDefault` on navigation keys to prevent page scroll
- Slot change detection to rebuild the headless model when child options are added/removed

## Behavioral Contract

### Option Collection

- `cv-listbox` scans its light DOM children (direct `cv-option` and `cv-option` within `cv-listbox-group`) to build the options array for the headless model
- Each `cv-option` must have a `value` attribute; if omitted, an auto-generated fallback `option-{n}` is assigned
- The `textContent` of each `cv-option` is used as the option label for typeahead matching
- Initial selection is read from `cv-option[selected]` attributes at first render
- On `slotchange`, the model is rebuilt with the updated option list, preserving still-valid selection and active state

### Pointer Interaction

- Clicking a `cv-option` calls `actions.setActive(id)` followed by `actions.selectOnly(id)` (single) or `actions.toggleSelected(id)` (multiple)
- Pointer interactions dispatch `cv-input` and `cv-change` events based on state diffing

### Focus Management

- When `focus-strategy="aria-activedescendant"` (default): `[part="base"]` has `tabindex="0"` and receives DOM focus; `aria-activedescendant` points to the active option; all options have `tabindex="-1"`
- When `focus-strategy="roving-tabindex"`: `[part="base"]` has `tabindex="-1"`; the active option has `tabindex="0"` and receives DOM focus; other options have `tabindex="-1"`

### Virtual Scroll Support

- `aria-setsize` and `aria-posinset` from `getOptionProps` support virtual scrolling
- When using virtual scrolling, only a subset of options is rendered, but each carries correct setsize/posinset reflecting the full option list
- Virtual scroll viewport management is a UIKit concern, not headless

## Usage

```html
<!-- Basic single-select listbox -->
<cv-listbox aria-label="Fruits">
  <cv-option value="apple">Apple</cv-option>
  <cv-option value="banana">Banana</cv-option>
  <cv-option value="cherry">Cherry</cv-option>
</cv-listbox>

<!-- Multi-select listbox -->
<cv-listbox selection-mode="multiple" aria-label="Toppings">
  <cv-option value="cheese">Cheese</cv-option>
  <cv-option value="peppers">Peppers</cv-option>
  <cv-option value="onions">Onions</cv-option>
  <cv-option value="olives" disabled>Olives</cv-option>
</cv-listbox>

<!-- With pre-selected options -->
<cv-listbox selection-mode="multiple" aria-label="Languages">
  <cv-option value="js" selected>JavaScript</cv-option>
  <cv-option value="ts" selected>TypeScript</cv-option>
  <cv-option value="py">Python</cv-option>
  <cv-option value="rs">Rust</cv-option>
</cv-listbox>

<!-- Roving tabindex focus strategy -->
<cv-listbox focus-strategy="roving-tabindex" aria-label="Colors">
  <cv-option value="red">Red</cv-option>
  <cv-option value="green">Green</cv-option>
  <cv-option value="blue">Blue</cv-option>
</cv-listbox>

<!-- Horizontal orientation -->
<cv-listbox orientation="horizontal" aria-label="Alignment">
  <cv-option value="left">Left</cv-option>
  <cv-option value="center">Center</cv-option>
  <cv-option value="right">Right</cv-option>
</cv-listbox>

<!-- With range selection -->
<cv-listbox selection-mode="multiple" range-selection aria-label="Files">
  <cv-option value="file1">document.pdf</cv-option>
  <cv-option value="file2">image.png</cv-option>
  <cv-option value="file3">notes.txt</cv-option>
  <cv-option value="file4">data.csv</cv-option>
</cv-listbox>

<!-- With option groups -->
<cv-listbox aria-label="City">
  <cv-listbox-group label="North America">
    <cv-option value="nyc">New York</cv-option>
    <cv-option value="la">Los Angeles</cv-option>
    <cv-option value="tor">Toronto</cv-option>
  </cv-listbox-group>
  <cv-listbox-group label="Europe">
    <cv-option value="lon">London</cv-option>
    <cv-option value="par">Paris</cv-option>
    <cv-option value="ber">Berlin</cv-option>
  </cv-listbox-group>
</cv-listbox>

<!-- Mixed grouped and ungrouped options -->
<cv-listbox aria-label="Items">
  <cv-option value="misc1">Miscellaneous A</cv-option>
  <cv-listbox-group label="Category 1">
    <cv-option value="cat1a">Item 1A</cv-option>
    <cv-option value="cat1b">Item 1B</cv-option>
  </cv-listbox-group>
  <cv-option value="misc2">Miscellaneous B</cv-option>
</cv-listbox>
```

## Child Elements

### cv-option

Individual selectable option within a `cv-listbox` or `cv-listbox-group`. The parent `cv-listbox` manages all ARIA attributes on this element via headless contracts.

#### Anatomy

```
<cv-option> (host)
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
| `:host([selected])` | Option is currently selected (primary tint at 34%) |
| `:host([active])` | Option is the active/highlighted option (primary tint at 22%) |
| `:host([disabled])` | Option is disabled (opacity 0.55) |
| `:host(:focus-visible)` | Focus ring when option receives DOM focus (roving-tabindex strategy) |

---

### cv-listbox-group

Groups related options under a visible label header. Must be a direct child of `cv-listbox`.

#### Anatomy

```
<cv-listbox-group> (host)
├── <div part="label">   ← group label text
└── <slot>               ← accepts <cv-option> children
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `label` | String | `""` | Visible group header text. Also used for `aria-labelledby` linkage via headless `getGroupLabelProps`. |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | One or more `<cv-option>` children |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `label` | `<div>` | Group label text element |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-listbox-group-label-color` | `var(--cv-color-text-muted, #8892a6)` | Group label text color |
| `--cv-listbox-group-label-font-size` | `0.85em` | Group label font size |
| `--cv-listbox-group-gap` | `var(--cv-space-1, 4px)` | Gap between group label and options |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host` | Block display with group role and aria-labelledby |
