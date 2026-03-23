# cv-disclosure

Expandable panel that controls the visibility of a content area, with support for exclusive accordion-like grouping via a shared name.

**Headless:** [`createDisclosure`](../../../headless/specs/components/disclosure.md)

## Anatomy

```
<cv-disclosure> (host)
└── <div part="base">
    ├── <div part="trigger" role="button">
    │   ├── <slot name="trigger">
    │   └── <span part="trigger-icon" aria-hidden="true">
    └── <div part="panel">
        └── <slot>
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `open` | Boolean | `false` | Whether the panel content is visible |
| `disabled` | Boolean | `false` | Prevents user interaction with the trigger |
| `name` | String | `""` | Group name for exclusive accordion-like behavior; when set, opening this disclosure closes all others sharing the same `name` |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Panel content displayed when the disclosure is open |
| `trigger` | Label content rendered inside the trigger |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root layout wrapper |
| `trigger` | `<div>` | Interactive trigger element with `role="button"` |
| `trigger-icon` | `<span>` | Chevron/arrow indicator that rotates when open |
| `panel` | `<div>` | Collapsible content container |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-disclosure-duration` | `var(--cv-duration-fast, 120ms)` | Duration of expand/collapse transitions |
| `--cv-disclosure-easing` | `var(--cv-easing-standard, ease)` | Easing function for expand/collapse transitions |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Border color for trigger and panel |
| `--cv-color-surface` | `#141923` | Trigger background color |
| `--cv-color-surface-elevated` | `#1d2432` | Panel background color |
| `--cv-color-text` | `#e8ecf6` | Default text color |
| `--cv-color-text-muted` | `#9aa6bf` | Trigger icon color |
| `--cv-color-primary` | `#65d7ff` | Focus outline color |
| `--cv-radius-sm` | `6px` | Border radius for trigger and panel |
| `--cv-space-2` | `8px` | Gap between trigger and panel |
| `--cv-space-3` | `12px` | Inline padding for trigger; block and inline padding for panel |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([open])` | Panel visible; trigger icon rotated 90deg |
| `:host([disabled])` | Trigger has `opacity: 0.55`, `cursor: not-allowed`; interaction blocked |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{open: boolean}` | Fires immediately when user interaction changes the open state |
| `cv-change` | `{open: boolean}` | Fires when the open state commits after user interaction |

Events fire only on user-initiated state changes (click, keyboard). Programmatic calls to `show()` / `hide()` or attribute changes do not fire events.

## Imperative API

| Method | Return | Description |
|--------|--------|-------------|
| `show()` | `void` | Opens the panel; delegates to headless `actions.open()` |
| `hide()` | `void` | Closes the panel; delegates to headless `actions.close()` |

## Reactive State Mapping

`cv-disclosure` is a visual adapter over headless `createDisclosure`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `open` | attr -> action | `actions.open()` / `actions.close()` depending on value |
| `disabled` | attr -> action | `actions.setDisabled(value)` |
| `name` | attr -> action | `actions.setName(value)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.isOpen()` | state -> attr | `[open]` host attribute |
| `state.isDisabled()` | state -> attr | `[disabled]` host attribute |
| `state.name()` | state -> attr | `[name]` host attribute |

- `contracts.getTriggerProps()` is spread onto the inner `[part="trigger"]` element to apply `role`, `tabindex`, `aria-expanded`, `aria-controls`, `aria-disabled`, and keyboard/click handlers.
- `contracts.getPanelProps()` is spread onto the inner `[part="panel"]` element to apply `id`, `aria-labelledby`, and `hidden`.
- `show()` and `hide()` delegate directly to `actions.open()` and `actions.close()` without firing `cv-input`/`cv-change` events.
- `actions.destroy()` must be called in `disconnectedCallback` to unregister from the name group registry.
- UIKit does not own toggle, keyboard, or grouping logic; headless state is the source of truth.

## Usage

```html
<!-- Basic disclosure -->
<cv-disclosure>
  <span slot="trigger">More details</span>
  Hidden content revealed on expand.
</cv-disclosure>

<!-- Initially open -->
<cv-disclosure open>
  <span slot="trigger">Section</span>
  This content is visible by default.
</cv-disclosure>

<!-- Disabled -->
<cv-disclosure disabled>
  <span slot="trigger">Locked section</span>
  Cannot be toggled.
</cv-disclosure>

<!-- Accordion group (exclusive) -->
<cv-disclosure name="faq">
  <span slot="trigger">Question 1</span>
  Answer 1.
</cv-disclosure>

<cv-disclosure name="faq">
  <span slot="trigger">Question 2</span>
  Answer 2.
</cv-disclosure>

<cv-disclosure name="faq">
  <span slot="trigger">Question 3</span>
  Answer 3.
</cv-disclosure>

<!-- Custom animation timing -->
<cv-disclosure style="--cv-disclosure-duration: 300ms; --cv-disclosure-easing: cubic-bezier(0.4, 0, 0.2, 1);">
  <span slot="trigger">Slow reveal</span>
  Content with custom animation.
</cv-disclosure>
```
