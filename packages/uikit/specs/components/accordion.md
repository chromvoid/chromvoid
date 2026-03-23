# cv-accordion

Vertically stacked set of interactive sections that expand or collapse to reveal content.

**Headless:** [`createAccordion`](../../../headless/specs/components/accordion.md)

## Anatomy

```
<cv-accordion> (host)
└── <section part="base" aria-label="…">
    └── <slot>                                     ← cv-accordion-item elements
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Expanded section value (single mode). Reflects the first expanded item's `value`. |
| `allow-multiple` | Boolean | `false` | Allow multiple sections expanded simultaneously |
| `allow-zero-expanded` | Boolean | `true` | Allow all sections to be collapsed. When `false`, at least one section must remain expanded. |
| `heading-level` | Number | `3` | Heading level (1–6) for all item headers |
| `aria-label` | String | `""` | Accessible label for the accordion group |

**JS-only property:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `expandedValues` | `string[]` | `[]` | Array of expanded section values (meaningful in `allow-multiple` mode) |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | `cv-accordion-item` elements |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<section>` | Root wrapper with `aria-label` |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-accordion-gap` | `var(--cv-space-2, 8px)` | Spacing between accordion items |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([allow-multiple])` | Multiple sections can be expanded |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{value, values, activeId}` | Fires on any interaction (expand/collapse or focus change) |
| `cv-change` | `{value, values, activeId}` | Fires only when expanded sections change |

**Event detail shape:**

| Field | Type | Description |
|-------|------|-------------|
| `value` | `string \| null` | First expanded item value, or `null` if none |
| `values` | `string[]` | All expanded item values |
| `activeId` | `string \| null` | Currently focused item value |

## Usage

```html
<!-- Single mode (default) -->
<cv-accordion>
  <cv-accordion-item value="about">
    <span slot="trigger">About</span>
    <p>About section content.</p>
  </cv-accordion-item>
  <cv-accordion-item value="faq">
    <span slot="trigger">FAQ</span>
    <p>Frequently asked questions.</p>
  </cv-accordion-item>
</cv-accordion>

<!-- Multiple mode -->
<cv-accordion allow-multiple>
  <cv-accordion-item value="a" expanded>
    <span slot="trigger">Section A</span>
    <p>Content A</p>
  </cv-accordion-item>
  <cv-accordion-item value="b">
    <span slot="trigger">Section B</span>
    <p>Content B</p>
  </cv-accordion-item>
</cv-accordion>

<!-- Exact-exclusive (one must stay open) -->
<cv-accordion value="intro" :allow-zero-expanded="false">
  <cv-accordion-item value="intro">
    <span slot="trigger">Introduction</span>
    <p>Intro content.</p>
  </cv-accordion-item>
  <cv-accordion-item value="details">
    <span slot="trigger">Details</span>
    <p>Details content.</p>
  </cv-accordion-item>
</cv-accordion>

<!-- Custom heading level -->
<cv-accordion heading-level="4">
  <cv-accordion-item value="s1">
    <span slot="trigger">Under an h3</span>
    <p>Content here.</p>
  </cv-accordion-item>
</cv-accordion>

<!-- Custom icons -->
<cv-accordion>
  <cv-accordion-item value="custom">
    <span slot="trigger">Custom icons</span>
    <cv-icon name="plus" slot="expand-icon"></cv-icon>
    <cv-icon name="minus" slot="collapse-icon"></cv-icon>
    <p>Content with plus/minus icons.</p>
  </cv-accordion-item>
</cv-accordion>

<!-- Disabled item -->
<cv-accordion>
  <cv-accordion-item value="enabled">
    <span slot="trigger">Enabled</span>
    <p>This section works.</p>
  </cv-accordion-item>
  <cv-accordion-item value="locked" disabled>
    <span slot="trigger">Locked</span>
    <p>This section cannot be toggled.</p>
  </cv-accordion-item>
</cv-accordion>
```

## Child Elements

### cv-accordion-item

#### Anatomy

```
<cv-accordion-item> (host)
└── <div part="base">
    ├── <h3 part="header" id="…">          ← heading level from parent
    │   └── <button part="trigger" aria-expanded="…" aria-controls="…">
    │       ├── <slot name="trigger">       ← header label
    │       └── <span part="indicator" aria-hidden="true">
    │           ├── <slot name="expand-icon">▶</slot>   ← shown when collapsed
    │           └── <slot name="collapse-icon">▶</slot>  ← shown when expanded (rotated)
    └── <div part="panel" role="region" aria-labelledby="…">
        └── <slot>                          ← panel content
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Unique identifier for this section. Auto-generated as `section-{n}` if empty. |
| `disabled` | Boolean | `false` | Prevents toggling this section |
| `expanded` | Boolean | `false` | Whether panel content is visible (reflected, managed by parent) |
| `active` | Boolean | `false` | Whether this item's trigger has roving focus (reflected, managed by parent) |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Panel content |
| `trigger` | Header label text |
| `expand-icon` | Icon shown when the panel is collapsed. Default: `▶` |
| `collapse-icon` | Icon shown when the panel is expanded. Default: `▶` (rotated 90°) |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root wrapper |
| `header` | `<h3>` | Heading element (level controlled by parent's `heading-level`) |
| `trigger` | `<button>` | Interactive toggle button |
| `indicator` | `<span>` | Wrapper around expand/collapse icon slots |
| `panel` | `<div>` | Expandable content region |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-accordion-item-trigger-min-height` | `36px` | Minimum height of the trigger button |
| `--cv-accordion-item-trigger-padding-inline` | `var(--cv-space-3, 12px)` | Horizontal padding of trigger |
| `--cv-accordion-item-trigger-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius of trigger |
| `--cv-accordion-item-trigger-gap` | `var(--cv-space-2, 8px)` | Gap between trigger label and icon |
| `--cv-accordion-item-panel-padding` | `var(--cv-space-3, 12px)` | Padding inside the panel |
| `--cv-accordion-item-panel-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius of panel |
| `--cv-accordion-item-gap` | `var(--cv-space-1, 4px)` | Gap between trigger and panel |
| `--cv-accordion-item-indicator-size` | `16px` | Size of the indicator icon area |
| `--cv-accordion-item-duration` | `var(--cv-duration-fast, 120ms)` | Transition duration for indicator rotation |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([expanded])` | Panel visible; collapse-icon shown, expand-icon hidden; indicator rotated 90° (for default icon) |
| `:host([active])` | Trigger has roving focus; border highlighted with `--cv-color-primary` |
| `:host([disabled])` | Trigger opacity reduced (`0.55`), `cursor: not-allowed`, interaction blocked |
