# `cv-sidebar`

Persistent layout sidebar with desktop expand/collapse, mobile overlay mode, and opt-in same-page `scrollspy`.

**Headless base:** [`createSidebar`](../../../headless/specs/components/sidebar.md)

## Anatomy

```text
<cv-sidebar>
├── <div part="overlay">
└── <aside part="panel">
    ├── <header part="header">
    │   ├── <slot name="header">
    │   └── <button part="toggle">
    │       └── <slot name="toggle">
    ├── <nav part="body">
    │   └── <slot>
    └── <footer part="footer">
        └── <slot name="footer">
```

## Attributes

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `expanded` | Boolean | `true` | Desktop full-width mode |
| `collapsed` | Boolean | `false` | Desktop rail mode; inverse of `expanded` |
| `mobile` | Boolean | `false` | Mobile/overlay mode |
| `overlay-open` | Boolean | `false` | Mobile overlay visibility |
| `size` | `"small" \| "medium" \| "large"` | `"medium"` | Width preset |
| `breakpoint` | String | `"768px"` | Auto-switch breakpoint for mobile mode |
| `close-on-escape` | Boolean | `true` | Whether `Escape` closes mobile overlay |
| `close-on-outside-pointer` | Boolean | `true` | Whether outside pointer closes mobile overlay |
| `initial-focus-id` | String | --- | Initial focus target when overlay opens |
| `aria-label` | String | `"Sidebar navigation"` | Accessible label for the panel landmark/dialog |
| `scrollspy` | Boolean | `false` | Enables same-page hash navigation tracking |
| `scrollspy-offset-top` | Number | `0` | Top offset used when resolving the active section |
| `scrollspy-strategy` | `"top-anchor" \| "viewport-dominant"` | `"top-anchor"` | Strategy used to resolve the active section |
| `scrollspy-smooth-scroll` | Boolean | `true` | Uses `scrollIntoView({behavior: "smooth"})` for hash items |

## Properties

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `scrollspyRoot` | `Document \| ShadowRoot \| Element \| null` | `null` | Explicit root used for resolving section targets |
| `activeId` | `string \| null` | `null` | Readonly id of the active `scrollspy` target |

When `scrollspyRoot` is `null`, `cv-sidebar` resolves section targets in the host element root (`Document` or parent `ShadowRoot`).

## Slots

| Slot | Description |
| --- | --- |
| default | Navigation content, including `cv-sidebar-item` or plain hash anchors |
| `header` | Header content |
| `toggle` | Custom toggle icon/content |
| `footer` | Footer content |

## CSS Parts

| Part | Description |
| --- | --- |
| `overlay` | Mobile backdrop |
| `panel` | Sidebar panel |
| `header` | Header area |
| `toggle` | Expand/collapse or overlay toggle |
| `body` | Main nav body |
| `footer` | Footer area |

## CSS Custom Properties

| Property | Default |
| --- | --- |
| `--cv-sidebar-inline-size` | `280px` |
| `--cv-sidebar-rail-inline-size` | `56px` |
| `--cv-sidebar-z-index` | `30` |
| `--cv-sidebar-background` | `var(--cv-color-surface, #141923)` |
| `--cv-sidebar-border-color` | `var(--cv-color-border, #2a3245)` |
| `--cv-sidebar-padding-block` | `var(--cv-space-3, 12px)` |
| `--cv-sidebar-padding-inline` | `var(--cv-space-3, 12px)` |
| `--cv-sidebar-overlay-color` | `color-mix(in oklab, black 56%, transparent)` |
| `--cv-sidebar-transition-duration` | `var(--cv-duration-normal, 200ms)` |
| `--cv-sidebar-transition-easing` | `var(--cv-easing-standard, ease)` |

## Events

| Event | Detail | Description |
| --- | --- | --- |
| `cv-input` | `{expanded: boolean}` | Desktop user-driven expand/collapse |
| `cv-change` | `{expanded: boolean}` | Desktop committed expand/collapse |
| `cv-input` | `{overlayOpen: boolean}` | Mobile user-driven overlay open/close |
| `cv-change` | `{overlayOpen: boolean}` | Mobile committed overlay open/close |
| `cv-expand` | --- | Desktop expand lifecycle start |
| `cv-after-expand` | --- | Desktop expand lifecycle end |
| `cv-collapse` | --- | Desktop collapse lifecycle start |
| `cv-after-collapse` | --- | Desktop collapse lifecycle end |
| `cv-overlay-open` | --- | Mobile overlay open lifecycle start |
| `cv-after-overlay-open` | --- | Mobile overlay open lifecycle end |
| `cv-overlay-close` | --- | Mobile overlay close lifecycle start |
| `cv-after-overlay-close` | --- | Mobile overlay close lifecycle end |
| `cv-scrollspy-change` | `{activeId: string \| null}` | Fires when the active hash target changes |

## Scrollspy behavior

- `scrollspy` only manages same-page hash items (`href="#section-id"`).
- Slotted `cv-sidebar-item` elements receive `active` state automatically.
- Slotted plain anchors receive `aria-current="location"` automatically.
- Same-page hash clicks are intercepted and resolved by the sidebar scrollspy controller.
- No `scroll` listeners are used. Active state is derived from `IntersectionObserver`.
- `top-anchor` keeps classic TOC semantics based on the section closest to the configured top anchor.
- `viewport-dominant` resolves the active section from effective viewport dominance using visible coverage, distance to viewport center, and hysteresis.
- In `viewport-dominant`, same-page hash clicks scroll the target to the viewport center instead of the top edge.
- In `viewport-dominant`, same-page hash clicks do not optimistically switch `activeId`; the active item updates only after observer-driven recompute.

## `cv-sidebar-item`

Lightweight sidebar navigation item that adapts to expanded and collapsed rail modes.

### Anatomy

```text
<cv-sidebar-item>
└── <a part="base">
    ├── <span part="prefix">
    │   └── <slot name="prefix">
    ├── <span part="label">
    │   └── <slot>
    └── <span part="suffix">
        └── <slot name="suffix">
```

### Attributes

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `href` | String | `""` | Item target |
| `active` | Boolean | `false` | Current/active state |
| `disabled` | Boolean | `false` | Disables interaction |

### Slots

| Slot | Description |
| --- | --- |
| default | Label |
| `prefix` | Leading icon/content |
| `suffix` | Trailing badge/indicator |

### CSS Parts

| Part | Description |
| --- | --- |
| `base` | Root anchor |
| `prefix` | Prefix wrapper |
| `label` | Label wrapper |
| `suffix` | Suffix wrapper |

### CSS Custom Properties

| Property | Default |
| --- | --- |
| `--cv-sidebar-item-gap` | `var(--cv-space-2, 8px)` |
| `--cv-sidebar-item-min-block-size` | `32px` |
| `--cv-sidebar-item-padding-block` | `var(--cv-space-2, 8px)` |
| `--cv-sidebar-item-padding-inline` | `var(--cv-space-3, 12px)` |
| `--cv-sidebar-item-border-radius` | `var(--cv-radius-sm, 6px)` |
| `--cv-sidebar-item-color` | `var(--cv-color-text-muted, #9aa6bf)` |
| `--cv-sidebar-item-color-hover` | `var(--cv-color-text, #e8ecf6)` |
| `--cv-sidebar-item-color-active` | `var(--cv-color-primary, #65d7ff)` |
| `--cv-sidebar-item-background` | `transparent` |
| `--cv-sidebar-item-background-hover` | mixed surface highlight |
| `--cv-sidebar-item-background-active` | `transparent` |
| `--cv-sidebar-item-indicator-width` | `2px` |
| `--cv-sidebar-item-indicator-color` | `var(--cv-color-primary, #65d7ff)` |

`cv-sidebar` propagates `collapsed` and `mobile` context to direct child `cv-sidebar-item` elements so labels and suffix content are visually hidden in desktop rail mode without consumer-specific wiring.

## Usage

```html
<cv-sidebar>
  <span slot="header">Threat Model</span>

  <cv-sidebar-item href="#assets">
    <cv-icon slot="prefix" name="database"></cv-icon>
    Assets
  </cv-sidebar-item>

  <cv-sidebar-item href="#crypto" active>
    <cv-icon slot="prefix" name="shield"></cv-icon>
    Crypto
    <cv-badge slot="suffix">Active</cv-badge>
  </cv-sidebar-item>
</cv-sidebar>
```

```html
<cv-sidebar scrollspy scrollspy-offset-top="80">
  <span slot="header">On this page</span>
  <cv-sidebar-item href="#assets">Assets</cv-sidebar-item>
  <cv-sidebar-item href="#trust-boundaries">Trust Boundaries</cv-sidebar-item>
  <cv-sidebar-item href="#crypto">Crypto</cv-sidebar-item>
</cv-sidebar>
```
