# cv-tabs

Tabbed interface for switching between related content panels.

**Headless:** [`createTabs`](../../../headless/specs/components/tabs.md)

## Anatomy

```
<cv-tabs> (host)
└── <div part="base">
    ├── <div part="list" role="tablist">
    │   ├── <slot name="nav">            ← accepts <cv-tab> children
    │   └── <div part="indicator">       ← animated active indicator
    └── <div part="panels">
        └── <slot>                         ← accepts <cv-tab-panel> children
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Currently selected tab value |
| `orientation` | String | `"horizontal"` | Layout: `horizontal` \| `vertical` |
| `activation-mode` | String | `"automatic"` | Activation: `automatic` \| `manual` |
| `aria-label` | String | `""` | Accessible label for the tablist |

## Slots

| Slot | Description |
|------|-------------|
| `nav` | `<cv-tab>` children |
| `(default)` | `<cv-tab-panel>` children |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root layout container |
| `list` | `<div>` | Tablist wrapper |
| `indicator` | `<div>` | Animated active indicator positioned under the selected tab |
| `panels` | `<div>` | Panel container |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-tabs-indicator-color` | `var(--cv-color-primary, #65d7ff)` | Color of the active indicator |
| `--cv-tabs-indicator-size` | `3px` | Indicator thickness: height for horizontal orientation, width for vertical orientation |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-space-1` | `4px` | Gap between tabs, list padding |
| `--cv-space-2` | `8px` | Gap between list and panels |
| `--cv-space-3` | `12px` | Panels padding |
| `--cv-radius-md` | `10px` | List and panels border radius |
| `--cv-color-border` | `#2a3245` | List and panels border |
| `--cv-color-surface` | `#141923` | List and panels background |
| `--cv-color-primary` | `#65d7ff` | Focus and selected accent color |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([orientation="vertical"])` | Layout switches to vertical tablist + panel columns |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{activeTabId: string \| null, selectedTabId: string \| null}` | Fires on any active or selected state change, including active-only changes that do not change selection |
| `cv-change` | `{activeTabId: string \| null, selectedTabId: string \| null}` | Fires when selected tab changes |

`cv-input` fires on every user-driven state transition (active or selected). `cv-change` fires only when `selectedTabId` changes. Both events share the same detail shape. In `manual` activation mode, arrow-key navigation fires `cv-input` (active change) without `cv-change`; pressing `Enter`/`Space` fires both `cv-input` and `cv-change`.

## Reactive State Mapping

`cv-tabs` is a visual adapter over headless `createTabs` reactive state.

### UIKit Property to Headless Binding

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` | attr → action | `actions.select(value)` when `value` attribute changes |
| `orientation` | attr → option | passed as `orientation` in `createTabs(options)` |
| `activation-mode` | attr → option | passed as `activationMode` in `createTabs(options)` |
| `aria-label` | attr → option | passed as `ariaLabel` in `createTabs(options)` |

### Headless State to DOM Reflection

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.selectedTabId()` | state → attr | `cv-tabs[value]` host attribute |
| `state.activeTabId()` | state → attr | `cv-tab[active]` boolean attribute on the active tab element |
| `state.selectedTabId()` | state → attr | `cv-tab[selected]` boolean attribute on the selected tab element |
| `state.selectedTabId()` | state → attr | `cv-tab-panel[selected]` and `cv-tab-panel[hidden]` on panel elements |

### Headless Actions Called

| Action | UIKit Trigger |
|--------|---------------|
| `actions.select(id)` | Tab is clicked or tapped (pointer activation) |
| `actions.handleKeyDown(event)` | `keydown` event on a tab element |

### Headless Contracts Spread

| Contract | UIKit Target |
|----------|--------------|
| `contracts.getTabListProps()` | Spread onto `[part="list"]` element |
| `contracts.getTabProps(id)` | Spread onto each `cv-tab` element (via attribute sync) |
| `contracts.getPanelProps(id)` | Spread onto each `cv-tab-panel` element (via attribute sync) |

### UIKit-Only Concerns (Not in Headless)

- **Active indicator**: Positioned and animated at the UIKit layer using `selectedTabId` to determine which tab to highlight.
- **Closable tabs**: Close button rendering and close orchestration are UIKit concerns. Headless handles selection fallback implicitly through model rebuild with an updated tab list (without the closed tab).
- **`cv-input` / `cv-change` events**: Custom DOM events dispatched by the UIKit wrapper, not part of the headless model.

UIKit does not own tab selection logic; headless state is the source of truth.

## Usage

```html
<cv-tabs value="tab-1">
  <cv-tab slot="nav" value="tab-1">First</cv-tab>
  <cv-tab slot="nav" value="tab-2">Second</cv-tab>
  <cv-tab slot="nav" value="tab-3" disabled>Disabled</cv-tab>

  <cv-tab-panel tab="tab-1">Content for first tab.</cv-tab-panel>
  <cv-tab-panel tab="tab-2">Content for second tab.</cv-tab-panel>
  <cv-tab-panel tab="tab-3">Content for disabled tab.</cv-tab-panel>
</cv-tabs>

<cv-tabs orientation="vertical" activation-mode="manual">
  <cv-tab slot="nav" value="overview">Overview</cv-tab>
  <cv-tab slot="nav" value="history">History</cv-tab>
  <cv-tab-panel tab="overview">Overview panel.</cv-tab-panel>
  <cv-tab-panel tab="history">History panel.</cv-tab-panel>
</cv-tabs>

<cv-tabs value="home">
  <cv-tab slot="nav" value="home" closable>Home</cv-tab>
  <cv-tab slot="nav" value="settings" closable>Settings</cv-tab>
  <cv-tab-panel tab="home">Home content.</cv-tab-panel>
  <cv-tab-panel tab="settings">Settings content.</cv-tab-panel>
</cv-tabs>
```

## Child Elements

### cv-tab

Individual tab trigger within the tablist.

#### Anatomy

```
<cv-tab> (host)
└── <div class="tab" part="base">
    ├── <slot>
    └── <button part="close-button">     ← only when [closable]
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Unique identifier linking this tab to a panel |
| `disabled` | Boolean | `false` | Prevents selection and keyboard activation |
| `active` | Boolean | `false` | Whether this tab has roving focus (managed by parent) |
| `selected` | Boolean | `false` | Whether this tab's panel is visible (managed by parent) |
| `closable` | Boolean | `false` | Shows close affordance for removal flows |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Tab label content |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Tab interactive wrapper |
| `close-button` | `<button>` | Close affordance (rendered only when `closable` is `true`) |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([active])` | Focused tab in roving tabindex model |
| `:host([selected])` | Selected tab with visible panel |
| `:host([disabled])` | Disabled appearance and non-interactive behavior |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-close` | `{value: string}` | Requests removal of this tab when close affordance is activated |

The `cv-close` event bubbles and is composed. It is dispatched when the user activates the close button. The `value` in the detail corresponds to the tab's `value` attribute. The parent `cv-tabs` handles close orchestration: it determines a fallback tab, transitions selection if the closed tab was active or selected, and expects the consumer to remove the `cv-tab` and `cv-tab-panel` elements from the DOM.

---

### cv-tab-panel

Content panel associated with a tab.

#### Anatomy

```
<cv-tab-panel> (host)
└── <div part="base" role="tabpanel">
    └── <slot>
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `tab` | String | `""` | Value of the associated `<cv-tab>` |
| `selected` | Boolean | `false` | Whether this panel is visible (managed by parent) |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Panel content |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Panel content wrapper |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([hidden])` | Hidden when panel is not selected |
