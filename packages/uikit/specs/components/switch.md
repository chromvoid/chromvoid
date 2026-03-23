# cv-switch

Toggle control that represents an on/off state, visually distinct from a checkbox.

**Headless:** [`createSwitch`](../../../headless/specs/components/switch.md)

## Anatomy

```
<cv-switch> (host)
└── <div part="base">
    ├── <div part="control" role="switch">
    │   ├── <span part="toggled" hidden>
    │   │   └── <slot name="toggled">
    │   ├── <span part="untoggled" hidden>
    │   │   └── <slot name="untoggled">
    │   └── <span part="thumb">
    ├── <span part="label">
    │   └── <slot>
    └── <span part="help-text" id="{idBase}-help-text">
        └── <slot name="help-text">
```

When `checked` is `true`, the `toggled` wrapper is visible and `untoggled` is hidden. When `checked` is `false`, the opposite applies. Both wrappers are always in the DOM; visibility is toggled via CSS or the `hidden` attribute.

The `help-text` part is rendered only when the `help-text` attribute is set or the `help-text` slot is populated.

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `checked` | Boolean | `false` | On/off state |
| `disabled` | Boolean | `false` | Prevents interaction |
| `size` | String | `"medium"` | Size: `small` \| `medium` \| `large` |
| `help-text` | String | `""` | Descriptive text displayed below the switch |

## Sizes

| Size | `--cv-switch-width` | `--cv-switch-height` | `--cv-switch-thumb-size` |
|------|---------------------|----------------------|--------------------------|
| `small` | `36px` | `20px` | `14px` |
| `medium` | `44px` | `24px` | `18px` |
| `large` | `52px` | `28px` | `22px` |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Label text displayed beside the switch |
| `toggled` | Content shown inside the track when checked (e.g., icon, text) |
| `untoggled` | Content shown inside the track when unchecked (e.g., icon, text) |
| `help-text` | Descriptive text below the switch; overrides the `help-text` attribute |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root layout wrapper (contains control + label + help-text) |
| `control` | `<div>` | Track/oval with `role="switch"` |
| `thumb` | `<span>` | Sliding knob inside the control |
| `toggled` | `<span>` | Wrapper around the `toggled` slot (visible when checked) |
| `untoggled` | `<span>` | Wrapper around the `untoggled` slot (visible when unchecked) |
| `label` | `<span>` | Wrapper around the default slot |
| `help-text` | `<span>` | Wrapper around the `help-text` slot or attribute text |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-switch-width` | `44px` | Inline size of the control track |
| `--cv-switch-height` | `24px` | Block size of the control track |
| `--cv-switch-thumb-size` | `18px` | Size of the thumb knob |
| `--cv-switch-gap` | `var(--cv-space-2, 8px)` | Spacing between control track and label |
| `--cv-switch-help-text-color` | `var(--cv-color-text-muted, #9aa6bf)` | Color of the help text |
| `--cv-switch-help-text-font-size` | `0.85em` | Font size of the help text |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([checked])` | Primary-tinted track, thumb translated to end position; `toggled` part visible, `untoggled` part hidden |
| `:host([disabled])` | Reduced opacity (`0.55`), `cursor: not-allowed` |
| `:host([size="small"])` | Small size overrides |
| `:host([size="large"])` | Large size overrides |

## Reactive State Mapping

`cv-switch` is a visual adapter over headless `createSwitch`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `checked` | attr -> action | `actions.setOn(value)` |
| `disabled` | attr -> action | `actions.setDisabled(value)` |
| `help-text` | attr -> option | When present, generates an id for the help-text element and passes it as `ariaDescribedBy` in `createSwitch(options)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.isOn()` | state -> attr | `[checked]` host attribute |
| `state.isDisabled()` | state -> attr | `[disabled]` host attribute |

- `contracts.getSwitchProps()` is spread onto the inner `[part="control"]` element to apply `role`, `aria-checked`, `aria-disabled`, `tabindex`, and keyboard/click handlers.
- When help text is present (via attribute or slot), the component generates the id `{idBase}-help-text` for the help-text element and passes it as the `ariaDescribedBy` option to `createSwitch`, which produces the `aria-describedby` attribute in `getSwitchProps()`.
- UIKit dispatches `cv-input` and `cv-change` events by observing `isOn` changes triggered by user activation (not by controlled `setOn`).
- Toggled/untoggled slot visibility is purely visual (CSS-driven); no headless state or ARIA changes are involved.
- UIKit does not own toggle or keyboard logic; headless state is the source of truth.

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{checked: boolean}` | Fires on toggle interaction |
| `cv-change` | `{checked: boolean}` | Fires when checked state commits |

## Usage

```html
<cv-switch>Dark mode</cv-switch>

<cv-switch checked>Notifications</cv-switch>

<cv-switch disabled>Locked setting</cv-switch>

<cv-switch size="small">Compact</cv-switch>

<cv-switch size="large">Large toggle</cv-switch>

<cv-switch help-text="Reduces blue light emission after sunset">
  Night mode
</cv-switch>

<cv-switch>
  Airplane mode
  <span slot="help-text">Disables all wireless connections</span>
</cv-switch>

<cv-switch checked>
  Wi-Fi
  <cv-icon slot="toggled" name="wifi-on"></cv-icon>
  <cv-icon slot="untoggled" name="wifi-off"></cv-icon>
</cv-switch>

<cv-switch>
  Sound
  <span slot="toggled">ON</span>
  <span slot="untoggled">OFF</span>
</cv-switch>
```
