# cv-card

Visual container that groups related content into a cohesive unit, with an optional expandable variant that follows the disclosure pattern to show/hide body content.

**Headless:** [`createCard`](../../../headless/specs/components/card.md)

## Anatomy

```
<cv-card> (host)
└── <div part="base">
    ├── <div part="image">
    │   └── <slot name="image">
    ├── <div part="header">          ← trigger when [expandable]
    │   ├── <slot name="header">
    │   └── <span part="indicator">  ← only when [expandable], chevron/arrow
    ├── <div part="body">            ← collapsible when [expandable]
    │   └── <slot>
    └── <div part="footer">
        └── <slot name="footer">
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `variant` | String | `"elevated"` | Visual variant: `elevated` \| `outlined` \| `filled` |
| `expandable` | Boolean | `false` | Enables disclosure behavior (expand/collapse body) |
| `expanded` | Boolean | `false` | Expanded state (only meaningful when `expandable` is `true`) |
| `disabled` | Boolean | `false` | Prevents interaction (only meaningful when `expandable` is `true`) |

## Variants

| Variant | Description |
|---------|-------------|
| `elevated` | Default style with box shadow for a raised appearance |
| `outlined` | Transparent background with a visible border |
| `filled` | Solid surface background without shadow or prominent border |

Variants are CSS-only concerns and carry no headless state. They are mutually exclusive and selected via the `variant` attribute.

## Slots

| Slot | Description |
|------|-------------|
| `image` | Optional image or media displayed at the top of the card |
| `header` | Card header content (title, subtitle, actions) |
| `(default)` | Main body content of the card |
| `footer` | Card footer content (actions, metadata) |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root wrapper element |
| `image` | `<div>` | Container for the `image` slot |
| `header` | `<div>` | Header area; acts as the disclosure trigger when `expandable` is `true` |
| `indicator` | `<span>` | Expand/collapse indicator icon; rendered only when `expandable` is `true` |
| `body` | `<div>` | Body content area; collapsible region when `expandable` is `true` |
| `footer` | `<div>` | Footer area |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-card-padding` | `var(--cv-space-4, 16px)` | Inner padding for card sections (header, body, footer) |
| `--cv-card-border-radius` | `var(--cv-radius-md, 8px)` | Border radius of the card |
| `--cv-card-border-color` | `var(--cv-color-border, #2a3245)` | Border color (primarily for `outlined` variant) |
| `--cv-card-background` | `var(--cv-color-surface, #141923)` | Background color of the card |
| `--cv-card-shadow` | `0 1px 3px rgba(0, 0, 0, 0.24)` | Box shadow (primarily for `elevated` variant) |
| `--cv-card-gap` | `var(--cv-space-0, 0px)` | Spacing between card sections |
| `--cv-card-indicator-size` | `var(--cv-space-4, 16px)` | Size of the expand/collapse indicator icon |
| `--cv-card-indicator-transition` | `var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease)` | Transition for indicator rotation |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Base border color |
| `--cv-color-surface` | `#141923` | Surface background color |
| `--cv-color-text` | `#e8ecf6` | Default text color |
| `--cv-duration-fast` | `120ms` | Transition duration |
| `--cv-easing-standard` | `ease` | Transition timing function |
| `--cv-radius-md` | `8px` | Base radius used for card fallback |
| `--cv-space-0` | `0px` | Zero spacing scale fallback |
| `--cv-space-4` | `16px` | Large spacing scale fallback |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([variant="elevated"])` | Applies box shadow via `--cv-card-shadow`; no visible border |
| `:host([variant="outlined"])` | Applies visible border via `--cv-card-border-color`; no shadow |
| `:host([variant="filled"])` | Solid background; no shadow, subtle or no border |
| `:host([expandable])` | Renders indicator in header; header becomes interactive trigger |
| `:host([expanded])` | Body content visible; indicator rotated to open position |
| `:host([disabled])` | Reduced opacity (`0.55`), `cursor: not-allowed` on trigger; interaction blocked |

## Reactive State Mapping

`cv-card` is a visual adapter over headless `createCard`.

### UIKit Property -> Headless Binding (input direction)

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `expandable` | attr -> option | passed as `isExpandable` in `createCard(options)` |
| `expanded` | attr -> option | passed as `isExpanded` in `createCard(options)`; updates via `actions.toggle()` / `actions.expand()` / `actions.collapse()` |
| `disabled` | attr -> action | `actions.setDisabled(value)` |

### Headless State -> DOM Reflection (output direction)

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.isExpandable()` | state -> attr | `[expandable]` host attribute |
| `state.isExpanded()` | state -> attr | `[expanded]` host attribute |
| `state.isDisabled()` | state -> attr | `[disabled]` host attribute |

### Contract Spreading

| Contract | Target Element | Notes |
|----------|---------------|-------|
| `contracts.getCardProps()` | `[part="base"]` | Spread as attributes on the card root element |
| `contracts.getTriggerProps()` | `[part="header"]` | Spread onto the header element when `isExpandable` is `true`; provides `role="button"`, `aria-expanded`, `aria-controls`, `tabindex`, and event handlers |
| `contracts.getContentProps()` | `[part="body"]` | Spread onto the body element when `isExpandable` is `true`; provides `id`, `role="region"`, `aria-labelledby`, `hidden` |

### Boundary

- UIKit dispatches `cv-input` and `cv-change` events by observing `isExpanded` changes triggered by user activation (not by controlled attribute updates).
- UIKit does not own toggle, expand/collapse, or keyboard logic; headless state is the source of truth.
- Visual variants (`elevated`, `outlined`, `filled`) are CSS-only; no headless state involved.
- Slot layout, image positioning, indicator rendering, and CSS transitions are UIKit rendering concerns.

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{expanded: boolean}` | Fires when user toggles the expanded state (click or keyboard on trigger) |
| `cv-change` | `{expanded: boolean}` | Fires when the expanded state commits after user interaction |

Events only fire when `expandable` is `true` and the state change is triggered by user action (not programmatic attribute changes). Normal (non-expandable) cards do not emit these events.

## Usage

```html
<!-- Static elevated card (default) -->
<cv-card>
  <span slot="header">Card Title</span>
  Main body content goes here.
  <span slot="footer">Footer actions</span>
</cv-card>

<!-- Outlined card with image -->
<cv-card variant="outlined">
  <img slot="image" src="hero.jpg" alt="Hero image" />
  <span slot="header">Article Title</span>
  Article preview text.
</cv-card>

<!-- Filled card -->
<cv-card variant="filled">
  <span slot="header">Settings</span>
  Configuration content.
</cv-card>

<!-- Expandable card (collapsed by default) -->
<cv-card expandable>
  <span slot="header">Expandable Section</span>
  This content is hidden until the header is clicked.
</cv-card>

<!-- Expandable card (expanded by default) -->
<cv-card expandable expanded>
  <span slot="header">Details</span>
  This content is visible on initial render.
  <span slot="footer">Last updated: today</span>
</cv-card>

<!-- Expandable card (disabled) -->
<cv-card expandable disabled>
  <span slot="header">Locked Section</span>
  This content cannot be toggled by the user.
</cv-card>

<!-- Expandable card with image and all slots -->
<cv-card expandable variant="outlined">
  <img slot="image" src="preview.jpg" alt="Preview" />
  <span slot="header">Full Example</span>
  Body content with detailed information.
  <span slot="footer">Action buttons here</span>
</cv-card>
```
