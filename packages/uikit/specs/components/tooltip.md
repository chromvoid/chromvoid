# cv-tooltip

Contextual information overlay that appears near a trigger element on hover, focus, click, or programmatic control.

**Headless:** [`createTooltip`](../../../headless/specs/components/tooltip.md)

## Anatomy

```
<cv-tooltip> (host)
└── <span part="base">
    ├── <span part="trigger">
    │   └── <slot name="trigger">
    └── <span part="content" role="tooltip">
        ├── <slot name="content">
        └── <span part="arrow">           ← only when [arrow]
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `open` | Boolean | `false` | Reflects tooltip visibility; can be set to programmatically show or hide |
| `disabled` | Boolean | `false` | Disables all trigger interactions; removes `aria-describedby` from trigger |
| `show-delay` | Number | `120` | Milliseconds to wait before showing the tooltip |
| `hide-delay` | Number | `80` | Milliseconds to wait before hiding the tooltip |
| `trigger` | String | `'hover focus'` | Space-separated trigger modes: `hover` \| `focus` \| `click` \| `manual` |
| `arrow` | Boolean | `false` | Renders the `part="arrow"` CSS triangle pointing toward the trigger |

## Slots

| Slot | Description |
|------|-------------|
| `trigger` | The element that activates the tooltip (receives `aria-describedby` linkage) |
| `content` | Rich HTML tooltip body content |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<span>` | Root layout wrapper, positioned relatively |
| `trigger` | `<span>` | Wrapper around the trigger slot; receives event listeners |
| `content` | `<span>` | Tooltip body container with `role="tooltip"`; hidden when not open |
| `arrow` | `<span>` | Optional CSS triangle indicator; rendered only when `[arrow]` is set |

## CSS Custom Properties

Component styles depend on theme tokens through inline fallback values:

> **Note:** Component-level `--cv-tooltip-*` custom property indirection is not implemented.
> Styles reference theme tokens directly.

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-surface-elevated` | `#1d2432` | Elevated surface background |
| `--cv-color-border` | `#2a3245` | Border color |
| `--cv-color-text` | `#e8ecf6` | Default text color |
| `--cv-shadow-1` | `0 2px 8px rgba(0, 0, 0, 0.24)` | Drop shadow |
| `--cv-radius-sm` | `6px` | Border radius |
| `--cv-space-1` | `4px` | Small spacing scale |
| `--cv-space-2` | `8px` | Medium spacing scale |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([open])` | Tooltip content is visible; `[part="content"]` has `hidden` removed |
| `:host([disabled])` | All trigger interactions are blocked; `aria-describedby` is removed |
| `:host([arrow])` | Arrow indicator (`[part="arrow"]`) is rendered and visible |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{ open: boolean }` | Fires on every open/close transition triggered by interaction |
| `cv-change` | `{ open: boolean }` | Fires when the open state commits after interaction |

Both events bubble and are composed. They are dispatched together on every transition of `isOpen`.

## Reactive State Mapping

`cv-tooltip` is a visual adapter over headless `createTooltip`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `open` | attr → action | `actions.open()` / `actions.close()` depending on value |
| `disabled` | attr → action | `actions.setDisabled(value)` |
| `show-delay` | attr → option | passed as `showDelay` to `createTooltip(options)` (recreates model) |
| `hide-delay` | attr → option | passed as `hideDelay` to `createTooltip(options)` (recreates model) |
| `trigger` | attr → option | passed as `trigger` to `createTooltip(options)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.isOpen()` | state → attr | `[open]` host attribute |
| `state.isDisabled()` | state → attr | `[disabled]` host attribute |

- `contracts.getTriggerProps()` is spread onto `[part="trigger"]` to apply `id`, `aria-describedby`, and all active event handlers (`onPointerEnter`, `onPointerLeave`, `onFocus`, `onBlur`, `onClick`, `onKeyDown`) depending on the active `trigger` modes.
- `contracts.getTooltipProps()` is spread onto `[part="content"]` to apply `id`, `role="tooltip"`, `tabindex="-1"`, and `hidden`.
- `aria-describedby` is also propagated to assigned slotted trigger elements directly via `syncTriggerAria`.
- UIKit dispatches `cv-input` and `cv-change` events by observing transitions of `isOpen` caused by interaction; programmatic `open`/`close` calls that do not change state do not re-emit.
- UIKit does not own trigger or delay logic; headless state is the source of truth.
- When `show-delay` or `hide-delay` changes, the model is recreated with the current `open` state preserved as `initialOpen`.
- Public methods `show()` and `hide()` delegate to `model.actions.show()` / `model.actions.hide()` for `manual` mode consumers.

## Usage

```html
<!-- Default: hover + focus triggers -->
<cv-tooltip>
  <button slot="trigger">Hover me</button>
  <span slot="content">Contextual info</span>
</cv-tooltip>

<!-- Click trigger only -->
<cv-tooltip trigger="click">
  <button slot="trigger">Click me</button>
  <span slot="content">Shown on click</span>
</cv-tooltip>

<!-- With arrow indicator -->
<cv-tooltip arrow>
  <button slot="trigger">With arrow</button>
  <span slot="content">Tooltip with arrow</span>
</cv-tooltip>

<!-- Disabled -->
<cv-tooltip disabled>
  <button slot="trigger">No tooltip</button>
  <span slot="content">Never shown</span>
</cv-tooltip>

<!-- Manual mode (programmatic control) -->
<cv-tooltip trigger="manual" id="my-tip">
  <button slot="trigger">Target</button>
  <span slot="content">Shown programmatically</span>
</cv-tooltip>
<script>
  document.querySelector('#my-tip').show()
</script>

<!-- Custom delays -->
<cv-tooltip show-delay="300" hide-delay="200">
  <button slot="trigger">Delayed</button>
  <span slot="content">Appears after 300ms</span>
</cv-tooltip>

<!-- Rich HTML content -->
<cv-tooltip>
  <button slot="trigger">Rich tooltip</button>
  <span slot="content">
    <strong>Title</strong><br>Supporting text
  </span>
</cv-tooltip>
```
