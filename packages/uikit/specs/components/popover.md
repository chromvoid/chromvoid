# cv-popover

Non-modal overlay anchored to a trigger element for contextual content such as menus, tooltips, or forms.

**Headless:** [`createPopover`](../../../headless/specs/components/popover.md)

## Anatomy

```
<cv-popover> (host)
└── <div part="base">
    ├── <button part="trigger" type="button">
    │   └── <slot name="trigger">
    ├── <div part="content" role="dialog">
    │   ├── <slot>
    │   └── <span part="arrow">
    │       └── <slot name="arrow">
    └── (document-level listeners for outside dismiss)
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `open` | Boolean | `false` | Whether the popover content is visible |
| `placement` | String | `"bottom-start"` | Content placement relative to the anchor: `top` \| `top-start` \| `top-end` \| `bottom` \| `bottom-start` \| `bottom-end` \| `left` \| `left-start` \| `left-end` \| `right` \| `right-start` \| `right-end` |
| `anchor` | String | `"trigger"` | Positioning reference: `trigger` \| `host` |
| `offset` | Number | `4` | Distance (in px) between anchor and content |
| `arrow` | Boolean | `false` | Show an arrow pointing toward the anchor |
| `close-on-escape` | Boolean | `true` | Whether Escape key closes the popover |
| `close-on-outside-pointer` | Boolean | `true` | Whether clicking outside closes the popover |
| `close-on-outside-focus` | Boolean | `true` | Whether focusing outside closes the popover |
| `aria-label` | String | `""` | Accessible label for content panel |
| `aria-labelledby` | String | `""` | Id of element labelling the content panel |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Popover content |
| `trigger` | Trigger element (defaults to a styled button) |
| `arrow` | Custom arrow content (replaces default arrow) |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root layout wrapper with `position: relative` |
| `trigger` | `<button>` | Trigger element that opens/closes the popover |
| `content` | `<div>` | Popover content panel with `role="dialog"` |
| `arrow` | `<span>` | Arrow element pointing toward the anchor |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-popover-offset` | `var(--cv-space-1, 4px)` | Distance between anchor and content |
| `--cv-popover-min-inline-size` | `max(220px, 100%)` | Minimum width of content panel |
| `--cv-popover-max-inline-size` | `min(560px, calc(100vw - 32px))` | Maximum width of content panel |
| `--cv-popover-padding` | `var(--cv-space-3, 12px)` | Content panel padding |
| `--cv-popover-border-radius` | `var(--cv-radius-md, 10px)` | Content panel border radius |
| `--cv-popover-z-index` | `20` | Content panel stacking order |
| `--cv-popover-arrow-size` | `8px` | Width and height of the arrow element |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Border color for trigger and content |
| `--cv-color-surface` | `#141923` | Trigger background color |
| `--cv-color-surface-elevated` | `#1d2432` | Content panel background color |
| `--cv-color-text` | `#e8ecf6` | Default text color |
| `--cv-color-primary` | `#65d7ff` | Focus ring color |
| `--cv-shadow-1` | `0 2px 8px rgba(0, 0, 0, 0.24)` | Content panel box shadow |
| `--cv-radius-sm` | `6px` | Trigger border radius fallback |
| `--cv-radius-md` | `10px` | Content border radius fallback |
| `--cv-space-1` | `4px` | Small spacing scale fallback |
| `--cv-space-2` | `8px` | Medium spacing scale fallback |
| `--cv-space-3` | `12px` | Medium-large spacing scale fallback |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([open])` | Content panel is visible |
| `:host(:not([open]))` | Content panel is hidden |
| `:host([placement="top"])` | Content positioned above anchor, centered |
| `:host([placement="top-start"])` | Content positioned above anchor, start-aligned |
| `:host([placement="top-end"])` | Content positioned above anchor, end-aligned |
| `:host([placement="bottom"])` | Content positioned below anchor, centered |
| `:host([placement="bottom-start"])` | Content positioned below anchor, start-aligned (default) |
| `:host([placement="bottom-end"])` | Content positioned below anchor, end-aligned |
| `:host([placement="left"])` | Content positioned to the left, centered |
| `:host([placement="left-start"])` | Content positioned to the left, start-aligned |
| `:host([placement="left-end"])` | Content positioned to the left, end-aligned |
| `:host([placement="right"])` | Content positioned to the right, centered |
| `:host([placement="right-start"])` | Content positioned to the right, start-aligned |
| `:host([placement="right-end"])` | Content positioned to the right, end-aligned |
| `:host([anchor="host"])` | Content positioned relative to host instead of trigger |
| `:host([arrow])` | Arrow element is visible |

## Events

| Event | Detail | Cancelable | Description |
|-------|--------|------------|-------------|
| `beforetoggle` | `{open: boolean, openedBy: string \| null, dismissIntent: string \| null}` | Yes (on open) | Fires before the open state changes. Canceling (via `preventDefault()`) when opening prevents the popover from opening. Not cancelable on close. |
| `toggle` | `{open: boolean, openedBy: string \| null, dismissIntent: string \| null}` | No | Fires after the open state has changed |

Event detail fields:
- `open` — the new visibility state (`true` when opening, `false` when closing)
- `openedBy` — how the popover was opened: `"keyboard"` \| `"pointer"` \| `"programmatic"` \| `null`
- `dismissIntent` — why the popover was closed: `"escape"` \| `"outside-pointer"` \| `"outside-focus"` \| `"programmatic"` \| `null`

## Reactive State Mapping

`cv-popover` is a visual adapter over headless `createPopover`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `open` | attr -> action | `actions.open(source)` / `actions.close(intent)` based on boolean value |
| `close-on-escape` | attr -> option | `closeOnEscape` passed to `createPopover(options)` |
| `close-on-outside-pointer` | attr -> option | `closeOnOutsidePointer` passed to `createPopover(options)` |
| `close-on-outside-focus` | attr -> option | `closeOnOutsideFocus` passed to `createPopover(options)` |
| `aria-label` | attr -> option | `ariaLabel` passed to `createPopover(options)` |
| `aria-labelledby` | attr -> option | `ariaLabelledBy` passed to `createPopover(options)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.isOpen()` | state -> attr | `[open]` host attribute |
| `state.openedBy()` | state -> event | Included in `beforetoggle` / `toggle` event detail |
| `state.lastDismissIntent()` | state -> event | Included in `beforetoggle` / `toggle` event detail |
| `state.restoreTargetId()` | state -> DOM | Focus restored to trigger element after close |
| `state.useNativePopover()` | state -> DOM | Controls native `showPopover()` / `hidePopover()` calls |

- `contracts.getTriggerProps()` is spread onto the inner `[part="trigger"]` element to apply `role`, `aria-haspopup`, `aria-expanded`, `aria-controls`, `tabindex`, `popovertarget` (when native), and keyboard/click handlers.
- `contracts.getContentProps()` is spread onto the inner `[part="content"]` element to apply `role`, `aria-modal`, `aria-label`, `aria-labelledby`, `tabindex`, `hidden` (when manual mode), `popover="manual"` (when native), and keyboard/outside-dismiss handlers.
- UIKit dispatches `beforetoggle` (cancelable on open) and `toggle` events by observing `isOpen` changes from user activation.
- UIKit does not own open/close, keyboard, or dismiss logic; headless state is the source of truth.
- When `beforetoggle` is canceled on open, UIKit calls `actions.close()` to revert headless state.

### Native Popover API Progressive Enhancement

UIKit auto-detects native Popover API support via feature check (`typeof HTMLElement.prototype.showPopover === 'function'`). When supported:

1. `useNativePopover: true` is passed to `createPopover(options)`.
2. Content element receives `popover="manual"` attribute (from headless contract) instead of `hidden`.
3. UIKit calls `contentElement.showPopover()` when `state.isOpen()` transitions to `true`.
4. UIKit calls `contentElement.hidePopover()` when `state.isOpen()` transitions to `false`.
5. UIKit listens for native `toggle` events on the content element and calls `actions.handleNativeToggle(newState)` to synchronize headless state.

When the native Popover API is not available, the component falls back to `hidden` attribute-based visibility management. Behavior is identical in both modes; the headless layer manages all open/close logic regardless.

### Placement (UIKit-only)

Placement is CSS-only (no Floating UI). The `placement` attribute maps to `data-placement` on the content element, which drives absolute positioning rules via CSS selectors. The `anchor` attribute controls whether the content panel is positioned relative to the trigger button or the host element. The `offset` attribute maps to `--cv-popover-offset`.

### Arrow (UIKit-only)

When the `arrow` boolean attribute is present, the `[part="arrow"]` element is rendered inside the content panel. It is positioned via CSS to point toward the anchor, with its direction derived from the current `placement`. The `arrow` slot allows custom arrow content. Arrow size is controlled by `--cv-popover-arrow-size`.

## Usage

```html
<!-- Basic popover -->
<cv-popover>
  <span slot="trigger">Options</span>
  <p>Popover content here</p>
</cv-popover>

<!-- Custom placement -->
<cv-popover placement="top" offset="8">
  <span slot="trigger">Help</span>
  <p>Helpful information</p>
</cv-popover>

<!-- With arrow -->
<cv-popover arrow placement="bottom">
  <span slot="trigger">Info</span>
  <p>Content with arrow pointer</p>
</cv-popover>

<!-- Close policies disabled -->
<cv-popover close-on-escape="false" close-on-outside-pointer="false">
  <span slot="trigger">Sticky</span>
  <p>Only closes via trigger toggle</p>
</cv-popover>

<!-- Anchored to host -->
<cv-popover anchor="host" placement="bottom-end">
  <span slot="trigger">Menu</span>
  <nav>Navigation items</nav>
</cv-popover>

<!-- Programmatic open -->
<cv-popover open>
  <span slot="trigger">Already open</span>
  <p>Visible on mount</p>
</cv-popover>

<!-- With custom arrow -->
<cv-popover arrow placement="top">
  <span slot="trigger">Custom arrow</span>
  <svg slot="arrow" viewBox="0 0 16 8"><polygon points="8,0 16,8 0,8" /></svg>
  <p>Content</p>
</cv-popover>
```
