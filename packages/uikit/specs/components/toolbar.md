# cv-toolbar

Container of interactive elements that provides a single tab stop and arrow-key navigation between items, with separator support and focus memory.

**Headless:** [`createToolbar`](../../../headless/specs/components/toolbar.md)

## Anatomy

```
<cv-toolbar> (host)
└── <div part="base" role="toolbar" aria-orientation="…">
    └── <slot>                         ← accepts <cv-toolbar-item> and <cv-toolbar-separator> children
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Active item value (reflects `activeId` from headless state) |
| `orientation` | String | `"horizontal"` | Navigation axis: `horizontal` \| `vertical` |
| `wrap` | Boolean | `true` | Whether arrow navigation wraps from last to first and vice versa. When `false`, clamps at boundaries. |
| `aria-label` | String | `""` | Accessible label for the toolbar |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | `<cv-toolbar-item>` and `<cv-toolbar-separator>` children |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root layout container with `role="toolbar"` |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-toolbar-gap` | `var(--cv-space-1, 4px)` | Spacing between toolbar children |
| `--cv-toolbar-padding` | `var(--cv-space-1, 4px)` | Internal padding of the toolbar container |
| `--cv-toolbar-border-radius` | `var(--cv-radius-md, 10px)` | Border radius of the toolbar container |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Toolbar border color |
| `--cv-color-surface` | `#141923` | Toolbar background color |
| `--cv-space-1` | `4px` | Gap and padding fallback |
| `--cv-radius-md` | `10px` | Border radius fallback |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([orientation="vertical"])` | Flex direction switches to column; items stretch to fill width |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{activeId: string \| null}` | Fires on any user-driven active item change (arrow keys, click, focus) |
| `cv-change` | `{activeId: string \| null}` | Fires when active item commits (same detail as `cv-input`; both fire together on navigation) |

Both `cv-input` and `cv-change` fire when user interaction changes the active item. Programmatic `value` attribute changes that result in a headless state update also dispatch these events.

## Reactive State Mapping

`cv-toolbar` is a visual adapter over headless `createToolbar`.

### UIKit Property to Headless Binding

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `value` | attr -> action | `actions.setActive(value)` when `value` attribute changes |
| `orientation` | attr -> option | passed as `orientation` in `createToolbar(options)` |
| `wrap` | attr -> option | passed as `wrap` in `createToolbar(options)` |
| `aria-label` | attr -> option | passed as `ariaLabel` in `createToolbar(options)` |

### Headless State to DOM Reflection

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.activeId()` | state -> attr | `cv-toolbar[value]` host attribute |
| `state.activeId()` | state -> attr | `cv-toolbar-item[active]` boolean attribute on the active item element |
| `state.activeId()` | state -> prop | `cv-toolbar-item.tabIndex` set to `0` for active, `-1` for others |

### Headless Actions Called

| Action | UIKit Trigger |
|--------|---------------|
| `actions.setActive(id)` | Item receives focus or click; also called when `value` attribute changes |
| `actions.handleKeyDown(event)` | `keydown` event on the toolbar root `[part="base"]` |
| `actions.handleToolbarFocus()` | `focusin` event on toolbar root when toolbar was not previously focused (re-entry detection) |
| `actions.handleToolbarBlur()` | `focusout` event on toolbar root when `relatedTarget` is outside the toolbar (full blur detection) |

### Headless Contracts Spread

| Contract | UIKit Target |
|----------|--------------|
| `contracts.getRootProps()` | Spread onto the `[part="base"]` element (`id`, `role`, `aria-orientation`, `aria-label`) |
| `contracts.getItemProps(id)` | Spread onto each `cv-toolbar-item` element (`id`, `tabindex`, `aria-disabled`, `data-active`). The `onFocus` callback is bound to the element's `focus` event. |
| `contracts.getSeparatorProps(id)` | Spread onto each `cv-toolbar-separator` element (`id`, `role`, `aria-orientation`) |

### UIKit-Only Concerns (Not in Headless)

- **Focus management DOM calls**: Calling `.focus()` on the DOM element matching `activeId` after keyboard navigation. Headless sets state; UIKit moves DOM focus.
- **Focus-in/focus-out tracking**: UIKit must detect toolbar entry vs. internal focus moves (e.g., using a `hasFocus` flag updated on `focusin`/`focusout` with `relatedTarget` checks).
- **Separator rendering**: Visual appearance of separators (line style, thickness, spacing) is a UIKit concern. Headless only provides ARIA props.
- **Slot change handling**: Rebuilding the headless model when children are added or removed via `slotchange`.
- **`cv-input` / `cv-change` events**: Custom DOM events dispatched by the UIKit wrapper, not part of the headless model.

UIKit does not own navigation or focus-memory logic; headless state is the source of truth.

## Keyboard Interaction

| Key | Horizontal | Vertical |
|-----|-----------|----------|
| `ArrowRight` | Move to next item | — |
| `ArrowLeft` | Move to previous item | — |
| `ArrowDown` | — | Move to next item |
| `ArrowUp` | — | Move to previous item |
| `Home` | Move to first item | Move to first item |
| `End` | Move to last item | Move to last item |

- Disabled items and separators are skipped during keyboard navigation.
- When `wrap` is `true` (default), navigation wraps from last to first and vice versa.
- When `wrap` is `false`, navigation clamps at boundaries (first/last item).
- Roving tabindex: only the active item has `tabindex="0"`; all others have `tabindex="-1"`.
- Focus memory: re-entering the toolbar via Tab restores focus to the last-active item.

## Usage

```html
<cv-toolbar aria-label="Text formatting">
  <cv-toolbar-item value="bold">Bold</cv-toolbar-item>
  <cv-toolbar-item value="italic">Italic</cv-toolbar-item>
  <cv-toolbar-item value="underline">Underline</cv-toolbar-item>
</cv-toolbar>

<cv-toolbar aria-label="Actions" wrap="false">
  <cv-toolbar-item value="cut">Cut</cv-toolbar-item>
  <cv-toolbar-item value="copy">Copy</cv-toolbar-item>
  <cv-toolbar-separator></cv-toolbar-separator>
  <cv-toolbar-item value="paste">Paste</cv-toolbar-item>
</cv-toolbar>

<cv-toolbar orientation="vertical" aria-label="Tools">
  <cv-toolbar-item value="brush">Brush</cv-toolbar-item>
  <cv-toolbar-item value="eraser">Eraser</cv-toolbar-item>
  <cv-toolbar-separator></cv-toolbar-separator>
  <cv-toolbar-item value="fill">Fill</cv-toolbar-item>
  <cv-toolbar-item value="picker" disabled>Picker</cv-toolbar-item>
</cv-toolbar>
```

## Child Elements

### cv-toolbar-item

Interactive element within a toolbar that participates in roving tabindex navigation.

#### Anatomy

```
<cv-toolbar-item> (host)
└── <div part="base">
    └── <slot>
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Unique identifier for this item. Auto-generated as `item-{n}` if empty. |
| `disabled` | Boolean | `false` | Prevents this item from receiving focus via keyboard navigation |
| `active` | Boolean | `false` | Whether this item is the current roving-focus target (managed by parent) |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Item content (text, icon, or any inline content) |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root interactive wrapper |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-toolbar-item-min-height` | `32px` | Minimum block size of the item |
| `--cv-toolbar-item-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding |
| `--cv-toolbar-item-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-border` | `#2a3245` | Item border color |
| `--cv-color-surface` | `#141923` | Item background color |
| `--cv-color-text` | `#e8ecf6` | Item text color |
| `--cv-color-primary` | `#65d7ff` | Active state accent color |
| `--cv-duration-fast` | `120ms` | Transition duration |
| `--cv-easing-standard` | `ease` | Transition timing function |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([active])` | Primary-tinted border and blended background using `--cv-color-primary` |
| `:host([disabled])` | Reduced opacity (`0.55`) |
| `:host(:focus-visible)` | Focus ring: `2px solid var(--cv-color-primary)` with `1px` offset |

---

### cv-toolbar-separator

Non-interactive visual divider within a toolbar. Separators are skipped by keyboard navigation and cannot receive focus.

#### Anatomy

```
<cv-toolbar-separator> (host)
└── <div part="base" role="separator" aria-orientation="…">
```

The separator's `aria-orientation` is perpendicular to the toolbar's orientation: a horizontal toolbar renders vertical separators, and vice versa.

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Identifier used to match the separator in the headless item list |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Separator line element with `role="separator"` |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-toolbar-separator-size` | `1px` | Thickness of the separator line |
| `--cv-toolbar-separator-color` | `var(--cv-color-border, #2a3245)` | Color of the separator line |
| `--cv-toolbar-separator-margin` | `var(--cv-space-1, 4px)` | Margin around the separator |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host` | In a horizontal toolbar: vertical line (`height: auto`, `width: --cv-toolbar-separator-size`). In a vertical toolbar: horizontal line (`width: auto`, `height: --cv-toolbar-separator-size`). Orientation is communicated via the parent spreading `getSeparatorProps`. |
