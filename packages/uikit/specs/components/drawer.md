# cv-drawer

Slide-out panel dialog anchored to a viewport edge, used for navigation, forms, or supplementary content.

**Headless:** [`createDrawer`](../../../headless/specs/components/drawer.md)

## Anatomy

```
<cv-drawer> (host)
├── <button part="trigger">
│   └── <slot name="trigger">
└── <div part="overlay"> (hidden when closed)
    └── <section part="panel" role="dialog|alertdialog" data-placement="...">
        ├── <header part="header">
        │   ├── <h2 part="title" id="...">
        │   │   └── <slot name="title">
        │   ├── <p part="description" id="...">
        │   │   └── <slot name="description">
        │   └── <button part="header-close" aria-label="Close">
        │       └── <slot name="header-close">
        ├── <div part="body">
        │   └── <slot>
        └── <footer part="footer">
            └── <slot name="footer">
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `open` | Boolean | `false` | Whether the drawer is visible |
| `modal` | Boolean | `true` | Enables modal behavior (focus trap, scroll lock, backdrop) |
| `placement` | String | `"end"` | Edge the drawer slides from: `start` \| `end` \| `top` \| `bottom` |
| `type` | String | `"dialog"` | ARIA role type: `dialog` \| `alertdialog` |
| `close-on-escape` | Boolean | `true` | Whether Escape key closes the drawer |
| `close-on-outside-pointer` | Boolean | `true` | Whether clicking outside closes the drawer |
| `close-on-outside-focus` | Boolean | `true` | Whether focusing outside closes the drawer |
| `initial-focus-id` | String | --- | Id of element to focus when drawer opens |
| `no-header` | Boolean | `false` | Hides the header (title, description, header close button) |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Drawer body content |
| `trigger` | Content for the trigger button |
| `title` | Drawer title text |
| `description` | Description text below the title |
| `header-close` | Icon content for the header close button (defaults to X) |
| `footer` | Footer content (action buttons, etc.) |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `trigger` | `<button>` | Trigger button that opens the drawer |
| `overlay` | `<div>` | Backdrop/overlay container |
| `panel` | `<section>` | Drawer panel with `role="dialog"` or `role="alertdialog"` |
| `header` | `<header>` | Header area containing title, description, and close button |
| `title` | `<h2>` | Drawer title element |
| `description` | `<p>` | Drawer description element |
| `header-close` | `<button>` | Header close icon button |
| `body` | `<div>` | Body content area |
| `footer` | `<footer>` | Footer area for user-provided action buttons |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-drawer-z-index` | `40` | Z-index of the overlay layer |
| `--cv-drawer-size` | `360px` | Inline size (for `start`/`end`) or block size (for `top`/`bottom`) of the panel |
| `--cv-drawer-max-size` | `calc(100dvh - 32px)` | Maximum size before internal scrolling (block axis for `top`/`bottom`, inline axis for `start`/`end`) |
| `--cv-drawer-header-spacing` | `var(--cv-space-4, 16px)` | Header padding |
| `--cv-drawer-body-spacing` | `var(--cv-space-4, 16px)` | Body padding |
| `--cv-drawer-footer-spacing` | `var(--cv-space-4, 16px)` | Footer padding |
| `--cv-drawer-overlay-color` | `color-mix(in oklab, black 56%, transparent)` | Backdrop overlay color |
| `--cv-drawer-overlay-transition-duration` | `0ms` | Overlay opacity transition duration |
| `--cv-drawer-overlay-closed-opacity` | `1` | Overlay opacity while the panel is animating out or before the panel animates in |
| `--cv-drawer-border-radius` | `var(--cv-radius-lg, 14px)` | Panel border radius (applied to the inward edge only) |
| `--cv-drawer-transition-duration` | `250ms` | Slide transition duration |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([open])` | Drawer visible, overlay shown |
| `:host([modal])` | Modal mode active (focus trap, scroll lock, backdrop) |
| `:host([type="alertdialog"])` | Alert dialog mode with `role="alertdialog"` |
| `:host([no-header])` | Header section hidden |
| `:host([placement="start"])` | Panel anchored to the inline-start edge (left in LTR, right in RTL) |
| `:host([placement="end"])` | Panel anchored to the inline-end edge (right in LTR, left in RTL) |
| `:host([placement="top"])` | Panel anchored to the top edge |
| `:host([placement="bottom"])` | Panel anchored to the bottom edge |

### Placement layout rules

- `start` / `end`: Panel stretches full viewport block size; inline size set by `--cv-drawer-size`. Border radius applied to the inner vertical edge.
- `top` / `bottom`: Panel stretches full viewport inline size; block size set by `--cv-drawer-size`. Border radius applied to the inner horizontal edge.
- `start` and `end` follow CSS logical directions and automatically flip in RTL layouts.

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{open: boolean}` | Fires when open state changes via user interaction |
| `cv-change` | `{open: boolean}` | Fires when open state commits |
| `cv-show` | --- | Fires when drawer begins to open |
| `cv-after-show` | --- | Fires after drawer open animation completes |
| `cv-hide` | --- | Fires when drawer begins to close |
| `cv-after-hide` | --- | Fires after drawer close animation completes |

`cv-input` and `cv-change` fire only for user-initiated state changes (trigger click, Escape, outside pointer, outside focus, header close). Programmatic `open` attribute changes do not emit these events.

## Reactive State Mapping

`cv-drawer` is a visual adapter over headless `createDrawer`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `open` | attr -> action | `actions.open()` / `actions.close()` |
| `modal` | attr -> option | passed as `isModal` in `createDrawer(options)` |
| `placement` | attr -> action | `actions.setPlacement(placement)` and passed as `placement` in `createDrawer(options)` |
| `type` | attr -> option | passed as `type` in `createDrawer(options)` |
| `close-on-escape` | attr -> option | passed as `closeOnEscape` in `createDrawer(options)` |
| `close-on-outside-pointer` | attr -> option | passed as `closeOnOutsidePointer` in `createDrawer(options)` |
| `close-on-outside-focus` | attr -> option | passed as `closeOnOutsideFocus` in `createDrawer(options)` |
| `initial-focus-id` | attr -> option | passed as `initialFocusId` in `createDrawer(options)` |
| `no-header` | attr -> DOM | controls header visibility (UIKit-only, no headless binding) |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.isOpen()` | state -> attr | `[open]` host attribute |
| `state.isModal()` | state -> attr | `[modal]` host attribute |
| `state.type()` | state -> attr | `[type]` host attribute |
| `state.placement()` | state -> attr | `[placement]` host attribute |
| `state.isFocusTrapped()` | state -> effect | activates focus trap within the drawer |
| `state.shouldLockScroll()` | state -> effect | applies `overflow: hidden` to `document.body` |
| `state.restoreTargetId()` | state -> effect | focuses the trigger element on close |
| `state.initialFocusTargetId()` | state -> effect | focuses the specified element on open |

- `contracts.getTriggerProps()` is spread onto `[part="trigger"]` to apply `role`, `aria-haspopup`, `aria-expanded`, `aria-controls`, `tabindex`, and click/keydown handlers.
- `contracts.getOverlayProps()` is spread onto `[part="overlay"]` to apply `hidden`, `data-open`, and outside pointer/focus handlers.
- `contracts.getPanelProps()` is spread onto `[part="panel"]` to apply `role` (`dialog` or `alertdialog`), `aria-modal`, `aria-labelledby`, `aria-describedby`, `data-placement`, `tabindex`, and keydown handler.
- `contracts.getTitleProps()` is spread onto `[part="title"]` to apply the `id` for `aria-labelledby`.
- `contracts.getDescriptionProps()` is spread onto `[part="description"]` to apply the `id` for `aria-describedby`.
- `contracts.getHeaderCloseButtonProps()` is spread onto `[part="header-close"]` to apply `role`, `tabindex`, `aria-label: 'Close'`, and click handler.
- UIKit dispatches `cv-input` and `cv-change` events by observing `isOpen` changes triggered by user interaction (not by controlled `open` attribute changes).
- UIKit dispatches `cv-show`/`cv-after-show`/`cv-hide`/`cv-after-hide` lifecycle events to bracket CSS transitions.
- UIKit owns scroll lock implementation, focus trap implementation, focus restoration, backdrop rendering, slide animations, and CSS transitions -- headless provides signals, UIKit applies side effects.

## Usage

```html
<!-- Basic drawer (slides from end) -->
<cv-drawer>
  <span slot="trigger">Open drawer</span>
  <span slot="title">Settings</span>
  <p>Drawer body content here.</p>
  <div slot="footer">
    <cv-button variant="ghost">Cancel</cv-button>
    <cv-button variant="primary">Save</cv-button>
  </div>
</cv-drawer>

<!-- Left-side navigation drawer -->
<cv-drawer placement="start">
  <span slot="trigger">Menu</span>
  <span slot="title">Navigation</span>
  <nav>
    <a href="/home">Home</a>
    <a href="/settings">Settings</a>
  </nav>
</cv-drawer>

<!-- Bottom sheet drawer -->
<cv-drawer placement="bottom">
  <span slot="trigger">Show details</span>
  <span slot="title">Details</span>
  <p>Content slides up from the bottom.</p>
</cv-drawer>

<!-- Top drawer -->
<cv-drawer placement="top">
  <span slot="trigger">Notifications</span>
  <span slot="title">Notifications</span>
  <p>Notification content slides down from the top.</p>
</cv-drawer>

<!-- Non-modal drawer -->
<cv-drawer modal="false">
  <span slot="trigger">Show panel</span>
  <span slot="title">Side panel</span>
  <p>This drawer does not block the page.</p>
</cv-drawer>

<!-- Alert drawer -->
<cv-drawer type="alertdialog">
  <span slot="trigger">Delete account</span>
  <span slot="title">Are you sure?</span>
  <span slot="description">This action is permanent and cannot be undone.</span>
  <div slot="footer">
    <cv-button variant="ghost">Cancel</cv-button>
    <cv-button variant="danger">Delete</cv-button>
  </div>
</cv-drawer>

<!-- Without header -->
<cv-drawer no-header>
  <span slot="trigger">Quick panel</span>
  <p>Minimal drawer with body content only.</p>
  <div slot="footer">
    <cv-button variant="primary">Done</cv-button>
  </div>
</cv-drawer>
```
