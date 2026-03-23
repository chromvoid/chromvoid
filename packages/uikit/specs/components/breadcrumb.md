# cv-breadcrumb

Navigation landmark that displays a trail of links showing the user's current location within a hierarchical structure.

**Headless:** [`createBreadcrumb`](../../../headless/specs/components/breadcrumb.md)

## Anatomy

```
<cv-breadcrumb> (host)
└── <nav part="base" role="navigation" aria-label="Breadcrumb">
    └── <ol part="list">
        └── <slot>                              ← cv-breadcrumb-item elements
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Value of the current (active) breadcrumb item. Reflects and controls which item has `aria-current="page"`. |
| `aria-label` | String | `"Breadcrumb"` | Accessible label for the navigation landmark |
| `aria-labelledby` | String | `""` | ID of an element that labels the navigation landmark. When set, `aria-label` is omitted. |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | `cv-breadcrumb-item` elements |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<nav>` | Navigation landmark wrapper |
| `list` | `<ol>` | Ordered list container for breadcrumb items |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-breadcrumb-gap` | `var(--cv-space-2, 8px)` | Gap between breadcrumb items |

## Events

No component-specific events. Navigation uses standard link click behavior.

## Usage

```html
<cv-breadcrumb>
  <cv-breadcrumb-item value="home" href="/">Home</cv-breadcrumb-item>
  <cv-breadcrumb-item value="docs" href="/docs">Docs</cv-breadcrumb-item>
  <cv-breadcrumb-item value="api" href="/docs/api">API</cv-breadcrumb-item>
</cv-breadcrumb>

<!-- Controlled current item -->
<cv-breadcrumb value="docs">
  <cv-breadcrumb-item value="home" href="/">Home</cv-breadcrumb-item>
  <cv-breadcrumb-item value="docs" href="/docs">Docs</cv-breadcrumb-item>
  <cv-breadcrumb-item value="api" href="/docs/api">API</cv-breadcrumb-item>
</cv-breadcrumb>

<!-- Custom aria-label -->
<cv-breadcrumb aria-label="You are here">
  <cv-breadcrumb-item value="home" href="/">Home</cv-breadcrumb-item>
  <cv-breadcrumb-item value="page" href="/page">Current Page</cv-breadcrumb-item>
</cv-breadcrumb>

<!-- With prefix icons -->
<cv-breadcrumb>
  <cv-breadcrumb-item value="home" href="/">
    <cv-icon name="home" slot="prefix"></cv-icon>
    Home
  </cv-breadcrumb-item>
  <cv-breadcrumb-item value="settings" href="/settings">Settings</cv-breadcrumb-item>
</cv-breadcrumb>

<!-- Custom separator -->
<cv-breadcrumb>
  <cv-breadcrumb-item value="home" href="/">
    Home
    <span slot="separator">→</span>
  </cv-breadcrumb-item>
  <cv-breadcrumb-item value="page" href="/page">Page</cv-breadcrumb-item>
</cv-breadcrumb>
```

## Child Elements

### cv-breadcrumb-item

#### Anatomy

```
<cv-breadcrumb-item> (host)
├── <span part="prefix">
│   └── <slot name="prefix">
├── <a part="link" role="link" href="…" aria-current="page"?>
│   └── <slot>                                  ← label text
├── <span part="suffix">
│   └── <slot name="suffix">
└── <span part="separator" aria-hidden="true">
    └── <slot name="separator">/</slot>
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Unique identifier for this item. Auto-generated as `item-{n}` if empty. |
| `href` | String | `""` | URL destination. Defaults to `#` if empty. |
| `current` | Boolean | `false` | Whether this item represents the current page. Managed by parent, reflects `aria-current="page"` on the link. |
| `show-separator` | Boolean | `true` | Whether the separator is visible. Managed by parent — hidden on the last item. |

**Internal property (not reflected):**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `linkId` | String | `""` | DOM id for the link element, set by parent from headless contract |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Label text |
| `prefix` | Icon or element before the label |
| `suffix` | Icon or element after the label |
| `separator` | Separator between items. Default: `/` |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `link` | `<a>` | The anchor element |
| `prefix` | `<span>` | Prefix container |
| `suffix` | `<span>` | Suffix container |
| `separator` | `<span>` | Separator container (has `aria-hidden="true"`) |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-breadcrumb-item-gap` | `var(--cv-space-2, 8px)` | Gap between prefix, link, suffix, and separator |
| `--cv-breadcrumb-item-separator-opacity` | `0.6` | Opacity of the separator |
| `--cv-breadcrumb-item-current-font-weight` | `600` | Font weight of the current item's link |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([current])` | Current page — link has `font-weight: 600`, `aria-current="page"` |
| `:host(:not([show-separator]))` | Separator hidden (last item) |
