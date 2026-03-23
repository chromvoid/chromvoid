# cv-window-splitter

A resizable pane separator that lets users drag or keyboard-navigate to redistribute space between two adjacent panels.

**Headless:** [`createWindowSplitter`](../../../headless/specs/components/window-splitter.md)

## Anatomy

```
<cv-window-splitter> (host)
└── <div part="base" data-orientation="vertical|horizontal">
    ├── <div part="pane" data-pane="primary" data-orientation="vertical|horizontal">
    │   └── <slot name="primary">
    ├── <div part="separator" role="separator" tabindex="0"
    │        aria-valuenow aria-valuemin aria-valuemax
    │        aria-orientation aria-controls
    │        data-orientation="vertical|horizontal">
    │   └── <span part="separator-handle">
    │       └── <slot name="separator">   ← custom handle content
    └── <div part="pane" data-pane="secondary" data-orientation="vertical|horizontal">
        └── <slot name="secondary">
```

> The `separator-handle` span renders a default glyph (`⋮` for vertical, `⋯` for horizontal) when the `separator` slot is empty.

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `position` | Number | `50` | Current splitter position within `[min, max]`. Reflected as an attribute. |
| `min` | Number | `0` | Minimum allowed position (inclusive). |
| `max` | Number | `100` | Maximum allowed position (inclusive). |
| `step` | Number | `1` | Step size applied per arrow-key press. |
| `orientation` | String | `"horizontal"` | Axis of the separator bar: `"vertical"` (vertical bar, left/right split) \| `"horizontal"` (horizontal bar, top/bottom split). Matches `aria-orientation`. |
| `fixed` | Boolean | `false` | Enables fixed (toggle) mode. Arrow keys are disabled; `Enter` toggles position between `min` and `max`. |
| `snap` | String | — | Space-separated snap positions, e.g. `"25 50 75"` or `"25% 50% 75%"`. Values ending in `%` are resolved as percentages of the `[min, max]` range. Snap logic runs inside headless `setPosition`. |
| `snap-threshold` | Number | `12` | Maximum distance from a snap point within which `setPosition` snaps instead of using the raw value. Expressed in the same unit as `position`. |
| `aria-label` | String | `""` | Accessible label applied to the separator element. |
| `aria-labelledby` | String | `""` | ID(s) of element(s) that label the separator. |

## Variants

| Variant | Attribute | Description |
|---------|-----------|-------------|
| Default | _(none)_ | Continuous slider; arrow keys adjust position by `step`. |
| Fixed | `fixed` | Toggle mode; `Enter` collapses/restores. Arrow keys are disabled. |

> `orientation` is a configuration attribute, not a visual variant — both orientations share the same variant rows above.

## Slots

| Slot | Description |
|------|-------------|
| `primary` | Content of the primary (first) pane. |
| `secondary` | Content of the secondary (second) pane. |
| `separator` | Custom handle content rendered inside `[part="separator-handle"]`. Replaces the default orientation glyph when provided. |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root grid container. Receives `data-orientation` and the inline `--cv-window-splitter-primary-size` variable. |
| `pane` | `<div>` | Either pane. Carries `data-pane="primary"` or `data-pane="secondary"`, and `data-orientation`. |
| `separator` | `<div>` | The focusable, interactive separator element with `role="separator"`. Receives all ARIA and `data-orientation` attributes. |
| `separator-handle` | `<span>` | Visual drag handle inside the separator. Renders the default glyph or the `separator` slot content. |

### Data attributes on `[part="pane"]`

| Data attribute | Values | Description |
|----------------|--------|-------------|
| `data-pane` | `"primary"` \| `"secondary"` | Identifies which pane this element is. |
| `data-orientation` | `"vertical"` \| `"horizontal"` | Mirrors the host `orientation` attribute for CSS targeting. |

### Data attributes on `[part="separator"]`

| Data attribute | Values | Description |
|----------------|--------|-------------|
| `data-orientation` | `"vertical"` \| `"horizontal"` | Mirrors the host `orientation` attribute for cursor and layout CSS. |
| `data-dragging` | Present when dragging | Set while a pointer drag is active (set on `pointerdown`, removed on `pointerup`/`pointercancel`). |

## CSS Custom Properties

### Component properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-window-splitter-primary-size` | `50%` | Computed percentage size of the primary pane, set inline on `[part="base"]` as the grid track size. Updated continuously during drag and keyboard interaction. |
| `--cv-window-splitter-divider-size` | `8px` | Width (vertical orientation) or height (horizontal orientation) of the separator track in the grid layout. |

### Theme tokens consumed (via fallback values)

| Theme property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-surface` | `#141923` | Used (mixed with black) for the separator background. |
| `--cv-color-border` | `#2a3245` | Separator border color. |
| `--cv-color-text-muted` | `#9aa6bf` | Separator handle icon color. |
| `--cv-color-primary` | `#65d7ff` | Focus ring color on the separator. |

## Visual States

| Selector | Description |
|----------|-------------|
| `[part="base"][data-orientation="vertical"]` | Vertical separator bar; `[part="base"]` uses `grid-template-columns` with three tracks (primary size, divider size, `1fr`); cursor on separator is `col-resize`. |
| `[part="base"][data-orientation="horizontal"]` | Horizontal separator bar; `[part="base"]` uses `grid-template-rows` with three tracks (primary size, divider size, `1fr`); cursor on separator is `row-resize`. |
| `:host([fixed])` | Fixed/toggle mode. No visual difference by default; host styles may suppress drag-cursor or reduce separator opacity as desired. (`fixed` is a reflected boolean property, so `:host([fixed])` is a valid CSS hook for consumers.) |
| `[part="separator"]:focus-visible` | `outline: 2px solid var(--cv-color-primary, #65d7ff)` with `outline-offset: 1px`. |
| `[part="separator"][data-dragging]` | Applied while a pointer drag is in progress. Can be targeted in CSS for active drag styles (e.g. highlight, elevated `z-index`). |

## Reactive State Mapping

`cv-window-splitter` is a visual adapter over headless `createWindowSplitter`.

### UIKit attributes → headless options / actions

| UIKit Attribute | Direction | Headless Binding |
|-----------------|-----------|------------------|
| `position` | attr → action | `actions.setPosition(value)` on change |
| `min` | attr → option | `createWindowSplitter({ min })` (model recreated) |
| `max` | attr → option | `createWindowSplitter({ max })` (model recreated) |
| `step` | attr → option | `createWindowSplitter({ step })` (model recreated) |
| `orientation` | attr → option | `createWindowSplitter({ orientation })` (model recreated) |
| `fixed` | attr → option | `createWindowSplitter({ isFixed })` (model recreated) |
| `snap` | attr → option | `createWindowSplitter({ snap })` (model recreated) |
| `snap-threshold` | attr → option | `createWindowSplitter({ snapThreshold })` (model recreated) |
| `aria-label` | attr → option | `createWindowSplitter({ ariaLabel })` (model recreated) |
| `aria-labelledby` | attr → option | `createWindowSplitter({ ariaLabelledBy })` (model recreated) |

> Model recreation: when any option-only attribute changes, the entire headless model is recreated via `createWindowSplitter(...)` with the latest values.

### Headless state → DOM reflection

| Headless Signal | Direction | DOM / CSS Reflection |
|-----------------|-----------|----------------------|
| `state.position()` | state → CSS | `--cv-window-splitter-primary-size` inline on `[part="base"]`; `position` host attribute updated |
| `state.isDragging()` | state → attr | `[data-dragging]` on `[part="separator"]` |
| `state.orientation()` | state → attr | `data-orientation` on `[part="base"]`, `[part="separator"]`, and both `[part="pane"]` elements |

### Contract spreading

`contracts.getSplitterProps()` is spread onto `[part="separator"]` to apply:
- `role="separator"`
- `tabindex="0"`
- `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext` (if `formatValueText` provided)
- `aria-orientation`
- `aria-controls` (space-separated IDs of both pane elements)
- `aria-label` / `aria-labelledby` (when set)
- `onKeyDown` handler bound to the `keydown` event

`contracts.getPrimaryPaneProps()` is spread onto the primary `[part="pane"]` to apply `id`, `data-pane="primary"`, and `data-orientation`.

`contracts.getSecondaryPaneProps()` is spread onto the secondary `[part="pane"]` to apply `id`, `data-pane="secondary"`, and `data-orientation`.

### Pointer event drag contract (target state)

The implementation MUST use pointer events with capture for reliable cross-boundary dragging:

1. **`pointerdown`** on `[part="separator"]` (primary button only):
   - Call `event.preventDefault()` and focus the separator.
   - Call `actions.startDragging()`.
   - Call `separatorEl.setPointerCapture(event.pointerId)` so subsequent `pointermove`/`pointerup` events are routed to the separator regardless of cursor position.
   - Set `[data-dragging]` on the separator.
   - Compute and apply the initial position via `actions.setPosition(...)`.

2. **`pointermove`** on `[part="separator"]` (while captured):
   - Convert `event.clientX` / `event.clientY` to a position value relative to `[part="base"]` bounding rect, clamped to `[0, 1]` ratio.
   - Call `actions.setPosition(computedValue)` (snap logic applied inside headless).
   - Dispatch `cv-input` event with `{ position }`.

3. **`pointerup`** / **`pointercancel`** on `[part="separator"]`:
   - Compute final position.
   - Call `actions.stopDragging()`.
   - Call `separatorEl.releasePointerCapture(event.pointerId)`.
   - Remove `[data-dragging]` from the separator.
   - If position changed during the drag, dispatch `cv-change` event with `{ position }`.

> Note: The current implementation uses `mousedown`/`mousemove`/`mouseup` on `document`. The target state described above replaces this with pointer capture on the separator element. `IMPL_UIKIT` will perform this migration.

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{ position: number }` | Fires on every position change during drag (`pointermove`) or keyboard interaction. Bubbles and is composed. |
| `cv-change` | `{ position: number }` | Fires on committed changes: keyboard key release that caused a position change, or `pointerup` when position changed during the drag. Bubbles and is composed. |

Both events are dispatched as `CustomEvent` with `bubbles: true` and `composed: true`. The `cv-input` event fires continuously during interaction; `cv-change` fires once per committed gesture.

## Usage

```html
<!-- Default: horizontal separator (top/bottom split) -->
<cv-window-splitter position="40" min="20" max="80">
  <div slot="primary">
    <p>Primary pane content</p>
  </div>
  <div slot="secondary">
    <p>Secondary pane content</p>
  </div>
</cv-window-splitter>

<!-- Vertical separator (left/right split) with snap points -->
<cv-window-splitter
  orientation="vertical"
  position="50"
  snap="25% 50% 75%"
  snap-threshold="10"
  aria-label="Resize panels"
>
  <nav slot="primary">Navigation</nav>
  <main slot="secondary">Content</main>
</cv-window-splitter>

<!-- Fixed (toggle) mode -->
<cv-window-splitter orientation="vertical" fixed position="30">
  <aside slot="primary">Sidebar</aside>
  <section slot="secondary">Main content</section>
</cv-window-splitter>

<!-- Custom separator handle -->
<cv-window-splitter orientation="vertical">
  <div slot="primary">Left</div>
  <div slot="secondary">Right</div>
  <span slot="separator">⠿</span>
</cv-window-splitter>
```
