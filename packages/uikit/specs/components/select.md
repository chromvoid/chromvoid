# cv-select

Single or multi-selection dropdown that composes a combobox trigger with a listbox popup, following the W3C APG Select-Only Combobox pattern.

**Headless:** [`createSelect`](../../../headless/specs/components/select.md)

## Anatomy

```
<cv-select> (host)
└── <div part="base">
    ├── <div part="trigger" role="combobox">
    │   ├── <slot name="trigger"> ← fallback: selected label / placeholder
    │   ├── <button part="clear-button" aria-hidden="true"> ← only when clearable + has value
    │   └── <span part="chevron" aria-hidden="true">
    └── <div part="listbox" role="listbox">
        └── <slot> ← cv-select-option / cv-select-group children
```

## Attributes

| Attribute         | Type    | Default    | Description                                     |
| ----------------- | ------- | ---------- | ----------------------------------------------- |
| `value`           | String  | `""`       | Currently selected option value (single-select) |
| `open`            | Boolean | `false`    | Whether the listbox popup is visible            |
| `selection-mode`  | String  | `"single"` | Selection mode: `single` \| `multiple`          |
| `aria-label`      | String  | `""`       | Accessible label for the trigger                |
| `close-on-select` | Boolean | `true`     | Close popup after an option is selected         |
| `placeholder`     | String  | `""`       | Hint text when no option is selected            |
| `disabled`        | Boolean | `false`    | Prevents all interaction                        |
| `required`        | Boolean | `false`    | Marks the field as required for form validation |
| `clearable`       | Boolean | `false`    | Shows a clear button when a value is selected   |
| `size`            | String  | `"medium"` | Size: `small` \| `medium` \| `large`            |

Non-reflected properties:

| Property         | Type       | Default | Description                                               |
| ---------------- | ---------- | ------- | --------------------------------------------------------- |
| `selectedValues` | `string[]` | `[]`    | Array of selected option values (useful in multiple mode) |

## Sizes

| Size     | `--cv-select-min-height` | `--cv-select-padding-inline` | `--cv-select-padding-block` |
| -------- | ------------------------ | ---------------------------- | --------------------------- |
| `small`  | `30px`                   | `var(--cv-space-2, 8px)`     | `var(--cv-space-1, 4px)`    |
| `medium` | `36px`                   | `var(--cv-space-3, 12px)`    | `var(--cv-space-2, 8px)`    |
| `large`  | `42px`                   | `var(--cv-space-4, 16px)`    | `var(--cv-space-2, 8px)`    |

## Slots

| Slot        | Description                                                   |
| ----------- | ------------------------------------------------------------- |
| `(default)` | `cv-select-option` and `cv-select-group` children             |
| `trigger`   | Custom trigger content (replaces default selected label text) |

## CSS Parts

| Part           | Element    | Description                                                          |
| -------------- | ---------- | -------------------------------------------------------------------- |
| `base`         | `<div>`    | Root layout wrapper                                                  |
| `trigger`      | `<div>`    | Combobox trigger that opens/closes the listbox                       |
| `chevron`      | `<span>`   | Dropdown arrow indicator                                             |
| `clear-button` | `<button>` | Clear value button (only rendered when `clearable` and value is set) |
| `listbox`      | `<div>`    | Popup container holding options                                      |

## CSS Custom Properties

| Property                     | Default                   | Description                       |
| ---------------------------- | ------------------------- | --------------------------------- |
| `--cv-select-inline-size`    | `260px`                   | Inline size of the host element   |
| `--cv-select-min-height`     | `36px`                    | Minimum block size of the trigger |
| `--cv-select-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding of the trigger |
| `--cv-select-padding-block`  | `var(--cv-space-2, 8px)`  | Vertical padding of the trigger   |

## Visual States

| Host selector                        | Description                                                     |
| ------------------------------------ | --------------------------------------------------------------- |
| `:host([open])`                      | Listbox popup is visible                                        |
| `:host([selection-mode="multiple"])` | Multiple selection mode active                                  |
| `:host([disabled])`                  | Reduced opacity, `cursor: not-allowed`, all interaction blocked |
| `:host([required])`                  | Field is required                                               |
| `:host([clearable])`                 | Clear button visible when value is set                          |
| `:host([size="small"])`              | Small size overrides                                            |
| `:host([size="large"])`              | Large size overrides                                            |

## Events

| Event       | Detail                                                                               | Description                                         |
| ----------- | ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `cv-input`  | `{value: string \| null, values: string[], activeId: string \| null, open: boolean}` | Fires on any state change (selection, active, open) |
| `cv-change` | `{value: string \| null, values: string[], activeId: string \| null, open: boolean}` | Fires only when selected value(s) change            |

## Keyboard Interaction

### Trigger focused (listbox closed)

| Key                  | Action                              |
| -------------------- | ----------------------------------- |
| `ArrowDown` / `Home` | Open listbox and focus first option |
| `ArrowUp` / `End`    | Open listbox and focus last option  |
| `Enter` / `Space`    | Toggle listbox open/close           |

### Listbox open (DOM focus remains on trigger)

| Key               | Action                                            |
| ----------------- | ------------------------------------------------- |
| `ArrowDown`       | Move visual focus to next option                  |
| `ArrowUp`         | Move visual focus to previous option              |
| `Home`            | Move visual focus to first option                 |
| `End`             | Move visual focus to last option                  |
| `Enter` / `Space` | Select active option (close if `close-on-select`) |
| `Escape` / `Tab`  | Close listbox without changing selection          |

### When disabled

All keyboard handlers are no-ops.

## ARIA Contract

| Element | Attribute               | Value                                     |
| ------- | ----------------------- | ----------------------------------------- |
| trigger | `role`                  | `combobox`                                |
| trigger | `tabindex`              | `0`                                       |
| trigger | `aria-haspopup`         | `listbox`                                 |
| trigger | `aria-expanded`         | `true` / `false`                          |
| trigger | `aria-controls`         | listbox element id                        |
| trigger | `aria-activedescendant` | id of visually focused option (when open) |
| trigger | `aria-disabled`         | `true` (when disabled)                    |
| trigger | `aria-required`         | `true` (when required)                    |
| trigger | `aria-label`            | accessible label text                     |
| listbox | `role`                  | `listbox`                                 |
| listbox | `aria-activedescendant` | id of focused option                      |
| listbox | `aria-multiselectable`  | `true` (when `selection-mode="multiple"`) |
| option  | `role`                  | `option`                                  |
| option  | `aria-selected`         | `true` / `false`                          |
| option  | `aria-disabled`         | `true` (when disabled)                    |

## Reactive State Mapping

| UIKit Property   | Direction | Headless Binding                      |
| ---------------- | --------- | ------------------------------------- |
| `value`          | →         | `actions.select(id)` on change        |
| `disabled`       | →         | `actions.setDisabled(value)`          |
| `required`       | →         | `actions.setRequired(value)`          |
| `open`           | ←         | `state.isOpen()`                      |
| `selectedValues` | ←         | `state.selectedIds()`                 |
| trigger ARIA     | ←         | `contracts.getTriggerProps()` spread  |
| listbox ARIA     | ←         | `contracts.getListboxProps()` spread  |
| option ARIA      | ←         | `contracts.getOptionProps(id)` spread |
| trigger label    | ←         | `contracts.getValueText()`            |

## Usage

```html
<!-- Basic single-select -->
<cv-select placeholder="Choose a fruit">
  <cv-select-option value="apple">Apple</cv-select-option>
  <cv-select-option value="banana">Banana</cv-select-option>
  <cv-select-option value="cherry">Cherry</cv-select-option>
</cv-select>

<!-- Pre-selected value -->
<cv-select value="banana">
  <cv-select-option value="apple">Apple</cv-select-option>
  <cv-select-option value="banana">Banana</cv-select-option>
  <cv-select-option value="cherry">Cherry</cv-select-option>
</cv-select>

<!-- With size variant -->
<cv-select size="small" placeholder="Small select">
  <cv-select-option value="a">Option A</cv-select-option>
  <cv-select-option value="b">Option B</cv-select-option>
</cv-select>

<!-- Disabled -->
<cv-select disabled placeholder="Cannot interact">
  <cv-select-option value="a">Option A</cv-select-option>
</cv-select>

<!-- Clearable -->
<cv-select clearable value="apple">
  <cv-select-option value="apple">Apple</cv-select-option>
  <cv-select-option value="banana">Banana</cv-select-option>
</cv-select>

<!-- Required -->
<cv-select required placeholder="Required field">
  <cv-select-option value="yes">Yes</cv-select-option>
  <cv-select-option value="no">No</cv-select-option>
</cv-select>

<!-- Grouped options -->
<cv-select placeholder="Choose a color">
  <cv-select-group label="Warm">
    <cv-select-option value="red">Red</cv-select-option>
    <cv-select-option value="orange">Orange</cv-select-option>
  </cv-select-group>
  <cv-select-group label="Cool">
    <cv-select-option value="blue">Blue</cv-select-option>
    <cv-select-option value="green">Green</cv-select-option>
  </cv-select-group>
</cv-select>

<!-- Multiple selection -->
<cv-select selection-mode="multiple" placeholder="Select tags">
  <cv-select-option value="a11y">Accessibility</cv-select-option>
  <cv-select-option value="perf">Performance</cv-select-option>
  <cv-select-option value="ux">UX</cv-select-option>
</cv-select>

<!-- Disabled option -->
<cv-select>
  <cv-select-option value="active">Active</cv-select-option>
  <cv-select-option value="archived" disabled>Archived</cv-select-option>
</cv-select>

<!-- Keep open after selection -->
<cv-select selection-mode="multiple" close-on-select="false">
  <cv-select-option value="a">Option A</cv-select-option>
  <cv-select-option value="b">Option B</cv-select-option>
</cv-select>
```

## Child Elements

### cv-select-option

Selectable item within a `cv-select` or `cv-select-group`.

#### Anatomy

```
<cv-select-option> (host)
└── <div part="base" class="option">
    └── <slot>
```

#### Attributes

| Attribute  | Type    | Default | Description                                       |
| ---------- | ------- | ------- | ------------------------------------------------- |
| `value`    | String  | `""`    | Option value submitted to the parent select       |
| `disabled` | Boolean | `false` | Prevents selection                                |
| `selected` | Boolean | `false` | Reflects selected state (managed by parent)       |
| `active`   | Boolean | `false` | Reflects active/focused state (managed by parent) |

#### Slots

| Slot        | Description       |
| ----------- | ----------------- |
| `(default)` | Option label text |

#### CSS Parts

| Part   | Element | Description         |
| ------ | ------- | ------------------- |
| `base` | `<div>` | Option root wrapper |

#### Visual States

| Host selector       | Description                                     |
| ------------------- | ----------------------------------------------- |
| `:host([active])`   | Option has keyboard focus (primary tint at 24%) |
| `:host([selected])` | Option is selected (primary tint at 32%)        |
| `:host([disabled])` | Option is non-selectable (opacity 0.5)          |
| `:host([hidden])`   | Option is hidden when listbox is closed         |

---

### cv-select-group

Groups related options under a visible label.

#### Anatomy

```
<cv-select-group> (host)
├── <div part="label" class="label"> ← group label text
└── <slot> ← cv-select-option children
```

#### Attributes

| Attribute | Type   | Default | Description      |
| --------- | ------ | ------- | ---------------- |
| `label`   | String | `""`    | Group label text |

#### Slots

| Slot        | Description                 |
| ----------- | --------------------------- |
| `(default)` | `cv-select-option` children |

#### CSS Parts

| Part    | Element | Description              |
| ------- | ------- | ------------------------ |
| `label` | `<div>` | Group label text element |

#### Visual States

| Host selector     | Description                            |
| ----------------- | -------------------------------------- |
| `:host([hidden])` | Group is hidden when listbox is closed |
