# cv-dialog

Modal or non-modal dialog overlay for presenting focused content, confirmations, or alerts.

**Headless:** [`createDialog`](../../../headless/specs/components/dialog.md)

## Anatomy

```
<cv-dialog> (host)
├── <button part="trigger">
│   └── <slot name="trigger">
└── <div part="overlay"> (hidden when closed)
    └── <section part="content" role="dialog|alertdialog">
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
| `open` | Boolean | `false` | Whether the dialog is visible |
| `modal` | Boolean | `true` | Enables modal behavior (focus trap, scroll lock, backdrop) |
| `type` | String | `"dialog"` | ARIA role type: `dialog` \| `alertdialog` |
| `close-on-escape` | Boolean | `true` | Whether Escape key closes the dialog |
| `close-on-outside-pointer` | Boolean | `true` | Whether clicking outside closes the dialog |
| `close-on-outside-focus` | Boolean | `true` | Whether focusing outside closes the dialog |
| `initial-focus-id` | String | — | Id of element to focus when dialog opens |
| `no-header` | Boolean | `false` | Hides the header (title, description, header close button) |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Dialog body content |
| `trigger` | Content for the trigger button |
| `title` | Dialog title text |
| `description` | Description text below the title |
| `header-close` | Icon content for the header close button (defaults to X) |
| `footer` | Footer content (action buttons, etc.) |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `trigger` | `<button>` | Trigger button that opens the dialog |
| `overlay` | `<div>` | Backdrop/overlay container |
| `content` | `<section>` | Dialog content panel with `role="dialog"` or `role="alertdialog"` |
| `header` | `<header>` | Header area containing title, description, and close button |
| `title` | `<h2>` | Dialog title element |
| `description` | `<p>` | Dialog description element |
| `header-close` | `<button>` | Header close icon button |
| `body` | `<div>` | Body content area |
| `footer` | `<footer>` | Footer area for user-provided action buttons |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-dialog-width` | `min(560px, calc(100vw - 32px))` | Preferred dialog inline size |
| `--cv-dialog-max-height` | `calc(100dvh - 32px)` | Maximum block size before scrolling |
| `--cv-dialog-header-spacing` | `var(--cv-space-4, 16px)` | Header padding |
| `--cv-dialog-body-spacing` | `var(--cv-space-4, 16px)` | Body padding |
| `--cv-dialog-footer-spacing` | `var(--cv-space-4, 16px)` | Footer padding |
| `--cv-dialog-overlay-color` | `color-mix(in oklab, black 56%, transparent)` | Backdrop overlay color |
| `--cv-dialog-border-radius` | `var(--cv-radius-lg, 14px)` | Panel border radius |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([open])` | Dialog visible, overlay shown |
| `:host([modal])` | Modal mode active (focus trap, scroll lock, backdrop) |
| `:host([type="alertdialog"])` | Alert dialog mode with `role="alertdialog"` |
| `:host([no-header])` | Header section hidden |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{open: boolean}` | Fires when open state changes via user interaction |
| `cv-change` | `{open: boolean}` | Fires when open state commits |
| `cv-show` | — | Fires when dialog begins to open |
| `cv-after-show` | — | Fires after dialog open animation completes |
| `cv-hide` | — | Fires when dialog begins to close |
| `cv-after-hide` | — | Fires after dialog close animation completes |

`cv-input` and `cv-change` fire only for user-initiated state changes (trigger click, Escape, outside pointer, outside focus, header close). Programmatic `open` attribute changes do not emit these events.

## Reactive State Mapping

`cv-dialog` is a visual adapter over headless `createDialog`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `open` | attr → action | `actions.open()` / `actions.close()` |
| `modal` | attr → option | passed as `isModal` in `createDialog(options)` |
| `type` | attr → option | passed as `type` in `createDialog(options)` |
| `close-on-escape` | attr → option | passed as `closeOnEscape` in `createDialog(options)` |
| `close-on-outside-pointer` | attr → option | passed as `closeOnOutsidePointer` in `createDialog(options)` |
| `close-on-outside-focus` | attr → option | passed as `closeOnOutsideFocus` in `createDialog(options)` |
| `initial-focus-id` | attr → option | passed as `initialFocusId` in `createDialog(options)` |
| `no-header` | attr → DOM | controls header visibility (UIKit-only, no headless binding) |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.isOpen()` | state → attr | `[open]` host attribute |
| `state.isModal()` | state → attr | `[modal]` host attribute |
| `state.type()` | state → attr | `[type]` host attribute |
| `state.isFocusTrapped()` | state → effect | activates focus trap within the dialog |
| `state.shouldLockScroll()` | state → effect | applies `overflow: hidden` to `document.body` |
| `state.restoreTargetId()` | state → effect | focuses the trigger element on close |
| `state.initialFocusTargetId()` | state → effect | focuses the specified element on open |

- `contracts.getTriggerProps()` is spread onto `[part="trigger"]` to apply `role`, `aria-haspopup`, `aria-expanded`, `aria-controls`, `tabindex`, and click/keydown handlers.
- `contracts.getOverlayProps()` is spread onto `[part="overlay"]` to apply `hidden`, `data-open`, and outside pointer/focus handlers.
- `contracts.getContentProps()` is spread onto `[part="content"]` to apply `role` (`dialog` or `alertdialog`), `aria-modal`, `aria-labelledby`, `aria-describedby`, `tabindex`, and keydown handler.
- `contracts.getTitleProps()` is spread onto `[part="title"]` to apply the `id` for `aria-labelledby`.
- `contracts.getDescriptionProps()` is spread onto `[part="description"]` to apply the `id` for `aria-describedby`.
- `contracts.getHeaderCloseButtonProps()` is spread onto `[part="header-close"]` to apply `role`, `tabindex`, `aria-label: 'Close'`, and click handler.
- UIKit dispatches `cv-input` and `cv-change` events by observing `isOpen` changes triggered by user interaction (not by controlled `open` attribute changes).
- UIKit dispatches `cv-show`/`cv-after-show`/`cv-hide`/`cv-after-hide` lifecycle events to bracket CSS transitions.
- UIKit owns scroll lock implementation, focus trap implementation, focus restoration, backdrop rendering, and CSS transitions — headless provides signals, UIKit applies side effects.

## Usage

```html
<!-- Basic dialog -->
<cv-dialog>
  <span slot="trigger">Open</span>
  <span slot="title">Confirm action</span>
  <span slot="description">Are you sure you want to proceed?</span>
  <p>This action cannot be undone.</p>
  <div slot="footer">
    <cv-button variant="ghost">Cancel</cv-button>
    <cv-button variant="primary">Confirm</cv-button>
  </div>
</cv-dialog>

<!-- Alert dialog -->
<cv-dialog type="alertdialog">
  <span slot="trigger">Delete</span>
  <span slot="title">Delete item?</span>
  <span slot="description">This will permanently delete the item.</span>
  <div slot="footer">
    <cv-button variant="ghost">Cancel</cv-button>
    <cv-button variant="danger">Delete</cv-button>
  </div>
</cv-dialog>

<!-- Non-modal dialog -->
<cv-dialog modal="false">
  <span slot="trigger">Show info</span>
  <span slot="title">Information</span>
  <p>This dialog does not block the page.</p>
</cv-dialog>

<!-- Without header -->
<cv-dialog no-header>
  <span slot="trigger">Quick action</span>
  <p>Minimal dialog with body content only.</p>
  <div slot="footer">
    <cv-button variant="primary">OK</cv-button>
  </div>
</cv-dialog>

<!-- Custom header close icon -->
<cv-dialog>
  <span slot="trigger">Open</span>
  <span slot="title">Settings</span>
  <icon-close slot="header-close"></icon-close>
  <p>Dialog content here.</p>
</cv-dialog>
```
