# cv-link

Inline navigational element that directs the user to another page or resource.

**Headless:** [`createLink`](../../../headless/specs/components/link.md)

## Anatomy

```
<cv-link> (host)
└── <a part="base">
    ├── <span part="prefix">
    │   └── <slot name="prefix">
    ├── <span part="label">
    │   └── <slot>
    └── <span part="suffix">
        └── <slot name="suffix">
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `href` | String | `""` | Target URL; reflected to the inner anchor's `href` |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Link text |
| `prefix` | Icon or element before label |
| `suffix` | Icon or element after label |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<a>` | The anchor element |
| `label` | `<span>` | Wrapper around the default slot |
| `prefix` | `<span>` | Wrapper around the `prefix` slot |
| `suffix` | `<span>` | Wrapper around the `suffix` slot |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-link-color` | `var(--cv-color-primary, #65d7ff)` | Default text and icon color |
| `--cv-link-color-hover` | `color-mix(in oklab, var(--cv-color-primary, #65d7ff) 78%, white)` | Text color on hover |
| `--cv-link-color-active` | `color-mix(in oklab, var(--cv-color-primary, #65d7ff) 60%, white)` | Text color on active press |
| `--cv-link-gap` | `var(--cv-space-1, 4px)` | Space between prefix, label, and suffix |
| `--cv-link-text-decoration` | `underline` | Text decoration style |
| `--cv-link-text-decoration-hover` | `none` | Text decoration on hover |
| `--cv-link-outline-color` | `var(--cv-color-primary, #65d7ff)` | Focus-visible outline color |
| `--cv-link-outline-offset` | `2px` | Focus-visible outline offset |

Additionally, component styles depend on theme tokens through fallback values:

| Theme Property | Default | Description |
|----------------|---------|-------------|
| `--cv-color-primary` | `#65d7ff` | Primary accent color |
| `--cv-duration-fast` | `120ms` | Transition duration |
| `--cv-easing-standard` | `ease` | Transition timing function |
| `--cv-space-1` | `4px` | Small spacing scale fallback |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host(:hover)` | Applies `--cv-link-color-hover` to text color; updates text decoration |
| `:host(:focus-visible)` | Shows outline ring around the base element |
| `:host(:active)` | Applies `--cv-link-color-active` to text color |

## Reactive State Mapping

`cv-link` is a visual adapter over headless `createLink`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `href` | attr -> option | passed as `href` in `createLink(options)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| *(none)* | — | Link is stateless at the headless level |

- `contracts.getLinkProps()` is spread onto the inner `[part="base"]` element to apply `id`, `href`, and keyboard/click handlers.
- Because the inner element is a native `<a>`, `createLink` is called with `isSemanticHost: true`, so `role` and `tabindex` are omitted from the contract (the native element provides them).
- When `href` changes, the model is recreated with the new value (headless link options are immutable).
- UIKit dispatches a `press` event by providing an `onPress` callback to the headless `createLink` options.
- UIKit does not own activation logic; headless event handlers are the source of truth.

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `press` | `{href: string}` | Fires on activation (click or `Enter` keypress) |

## Usage

```html
<cv-link href="/about">About us</cv-link>

<cv-link href="/docs">
  <icon-book slot="prefix"></icon-book>
  Documentation
</cv-link>

<cv-link href="/settings">
  Settings
  <icon-arrow-right slot="suffix"></icon-arrow-right>
</cv-link>

<cv-link href="/home">
  <icon-home slot="prefix"></icon-home>
  Home
  <icon-external slot="suffix"></icon-external>
</cv-link>
```
