# cv-option

Individual selectable option for use as a direct child of `cv-listbox` or `cv-listbox-group`. All ARIA attributes are managed exclusively by the parent `cv-listbox` via headless `contracts.getOptionProps(id)`; `cv-option` itself sets no ARIA.

> **Note:** `cv-option` has no headless module of its own. It is a purely presentational element. See the [Parent-managed ARIA Contract](#parent-managed-aria-contract) section for the full attribute contract imposed by the parent.

## Anatomy

```
<cv-option> (host)
└── <div part="base">
    ├── <span part="prefix">
    │   └── <slot name="prefix">
    ├── <span part="label">
    │   └── <slot>
    └── <span part="suffix">
        └── <slot name="suffix">
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Unique identifier for this option. The parent `cv-listbox` reads this to register the option in the headless model. Auto-generated as `option-{n}` if omitted. |
| `disabled` | Boolean | `false` | Whether the option is disabled. Prevents selection and keyboard activation. Also reflected as `aria-disabled` by the parent via `getOptionProps`. |
| `selected` | Boolean | `false` | Whether the option is currently selected. Set by the parent `cv-listbox` as part of state synchronisation. |
| `active` | Boolean | `false` | Whether the option is the active (highlighted) option. Set by the parent `cv-listbox` as part of state synchronisation. |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Option label text. Also used as the source text for typeahead matching by the parent `cv-listbox`. |
| `prefix` | Icon or element placed before the label. |
| `suffix` | Icon or element placed after the label. |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root wrapper; receives layout, background, and transition styles. |
| `label` | `<span>` | Wrapper around the default slot (label text). |
| `prefix` | `<span>` | Wrapper around the `prefix` named slot. |
| `suffix` | `<span>` | Wrapper around the `suffix` named slot. |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-option-padding-block` | `var(--cv-space-2, 8px)` | Vertical padding inside `[part="base"]`. |
| `--cv-option-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding inside `[part="base"]`. |
| `--cv-option-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius of `[part="base"]`. |
| `--cv-option-active-background` | `color-mix(in oklab, var(--cv-color-primary, #65d7ff) 22%, transparent)` | Background applied when the option is active (highlighted). |
| `--cv-option-selected-background` | `color-mix(in oklab, var(--cv-color-primary, #65d7ff) 34%, transparent)` | Background applied when the option is selected. |
| `--cv-option-disabled-opacity` | `0.55` | Opacity applied when the option is disabled. |
| `--cv-option-focus-outline-color` | `var(--cv-color-primary, #65d7ff)` | Outline color for `:focus-visible` (roving-tabindex focus strategy). |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-text` | `#e8ecf6` | Default text color. |
| `--cv-color-primary` | `#65d7ff` | Primary accent color used for active/selected backgrounds and focus outline. |
| `--cv-duration-fast` | `120ms` | Background and color transition duration. |
| `--cv-easing-standard` | `ease` | Transition timing function. |
| `--cv-space-2` | `8px` | Fallback for vertical padding. |
| `--cv-space-3` | `12px` | Fallback for horizontal padding. |
| `--cv-radius-sm` | `6px` | Fallback for border radius. |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([active])` | Active/highlighted option; applies `--cv-option-active-background` to `[part="base"]`. |
| `:host([selected])` | Selected option; applies `--cv-option-selected-background` to `[part="base"]`. |
| `:host([disabled])` | Disabled option; applies `--cv-option-disabled-opacity` to `[part="base"]`. |
| `:host([hidden])` | Hidden option; `display: none` on the host. |
| `:host(:focus-visible)` | Focus ring when the option receives DOM focus (roving-tabindex strategy); 2px solid outline using `--cv-option-focus-outline-color`. |

## Events

`cv-option` emits no events. All interaction events (`input`, `change`) are dispatched by the parent `cv-listbox`.

## Parent-managed ARIA Contract

`cv-option` sets no ARIA attributes itself. The parent `cv-listbox` spreads `contracts.getOptionProps(id)` directly onto each `cv-option` host element. The following attributes are applied by the parent:

| Attribute | Source | Description |
|-----------|--------|-------------|
| `id` | `getOptionProps(id)` | Unique DOM id used by `aria-activedescendant` on the listbox root. |
| `role` | `getOptionProps(id)` | Always `"option"`. |
| `tabindex` | `getOptionProps(id)` | `"0"` for the active option (roving-tabindex) or `"-1"` for all options (aria-activedescendant strategy). |
| `aria-selected` | `getOptionProps(id)` | `"true"` when the option is selected; `"false"` otherwise. |
| `aria-disabled` | `getOptionProps(id)` | `"true"` when `[disabled]` is present; omitted otherwise. |
| `aria-setsize` | `getOptionProps(id)` | Total number of options in the listbox (supports virtual scrolling). |
| `aria-posinset` | `getOptionProps(id)` | 1-based position of this option within the full option list. |
| `data-active` | `getOptionProps(id)` | Present when the option is the active option; used as a CSS hook. |

These attributes must not be set directly on `cv-option` by the consumer. They are owned entirely by the parent and will be overwritten on each render cycle.

## Usage

```html
<!-- Basic usage inside a listbox -->
<cv-listbox aria-label="Fruits">
  <cv-option value="apple">Apple</cv-option>
  <cv-option value="banana">Banana</cv-option>
  <cv-option value="cherry" disabled>Cherry (unavailable)</cv-option>
</cv-listbox>

<!-- With prefix icon -->
<cv-listbox aria-label="Connections">
  <cv-option value="wifi">
    <icon-wifi slot="prefix"></icon-wifi>
    Wi-Fi
  </cv-option>
  <cv-option value="ethernet">
    <icon-ethernet slot="prefix"></icon-ethernet>
    Ethernet
  </cv-option>
</cv-listbox>

<!-- With suffix badge -->
<cv-listbox aria-label="Plans">
  <cv-option value="free">
    Free
    <cv-badge slot="suffix">current</cv-badge>
  </cv-option>
  <cv-option value="pro">
    Pro
    <cv-badge slot="suffix" variant="primary">upgrade</cv-badge>
  </cv-option>
</cv-listbox>

<!-- With both prefix and suffix -->
<cv-listbox aria-label="Files">
  <cv-option value="doc">
    <icon-file slot="prefix"></icon-file>
    document.pdf
    <span slot="suffix">12 KB</span>
  </cv-option>
  <cv-option value="img">
    <icon-image slot="prefix"></icon-image>
    photo.png
    <span slot="suffix">4.2 MB</span>
  </cv-option>
</cv-listbox>

<!-- Pre-selected option -->
<cv-listbox aria-label="Theme">
  <cv-option value="light">Light</cv-option>
  <cv-option value="dark" selected>Dark</cv-option>
  <cv-option value="system">System</cv-option>
</cv-listbox>

<!-- Inside a group -->
<cv-listbox aria-label="City">
  <cv-listbox-group label="North America">
    <cv-option value="nyc">New York</cv-option>
    <cv-option value="la">Los Angeles</cv-option>
  </cv-listbox-group>
  <cv-listbox-group label="Europe">
    <cv-option value="lon">London</cv-option>
    <cv-option value="par">Paris</cv-option>
  </cv-listbox-group>
</cv-listbox>
```
