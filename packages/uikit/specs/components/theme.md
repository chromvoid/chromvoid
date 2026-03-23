# cv-theme-provider

Provides design tokens as CSS custom properties to descendant components, with support for light, dark, and system-auto color schemes.

**Headless:** None (UIKit-only component)

## Anatomy

```
<cv-theme-provider> (host, display: contents)
└── <slot>
```

The element uses `display: contents` so it does not generate a box in the layout tree. All slotted children inherit CSS custom properties set on the host.

## Attributes

| Attribute | Type   | Default    | Description                                                                 |
| --------- | ------ | ---------- | --------------------------------------------------------------------------- |
| `theme`   | String | `""`       | Name of a registered theme to apply via the theme engine                    |
| `mode`    | String | `"system"` | Color scheme mode: `light` \| `dark` \| `system`                            |

### `mode` behavior

| Value    | Behavior                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------- |
| `light`  | Applies the light token set. Sets `color-scheme: light` on the host.                              |
| `dark`   | Applies the dark token set. Sets `color-scheme: dark` on the host.                                |
| `system` | Listens to `prefers-color-scheme` via `matchMedia` and applies the matching token set at runtime. |

When `mode` is `system`, the provider must:
1. Query `window.matchMedia('(prefers-color-scheme: dark)')` on connect.
2. Add a `change` listener to update the active scheme when the OS preference changes.
3. Remove the listener on disconnect.

## Slots

| Slot        | Description                                                    |
| ----------- | -------------------------------------------------------------- |
| `(default)` | All child content; tokens cascade via CSS custom property inheritance |

## CSS Parts

None. The provider renders only a `<slot>` with no wrapper elements.

## CSS Custom Properties

The provider defines the full design token surface. All tokens use the `--cv-` prefix. Tokens are applied either via `tokens.css` (static import) or via the theme engine (`defineTheme` + `applyTheme`) at runtime.

### Color tokens

| Property                        | Dark value                                                                     | Light value                                                                    | Description                      |
| ------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------- |
| `--cv-color-bg`                 | `#0b0d12`                                                                      | `#f8f9fb`                                                                      | Page background                  |
| `--cv-color-surface`            | `#141923`                                                                      | `#ffffff`                                                                      | Card / panel background          |
| `--cv-color-surface-2`          | `#1d2432`                                                                      | `#f0f2f5`                                                                      | Elevated surface level 2         |
| `--cv-color-surface-3`          | `#242c3d`                                                                      | `#e6e9ee`                                                                      | Elevated surface level 3         |
| `--cv-color-surface-4`          | `#2b3447`                                                                      | `#dce0e7`                                                                      | Elevated surface level 4         |
| `--cv-color-surface-elevated`   | `var(--cv-color-surface-2)`                                                    | `var(--cv-color-surface-2)`                                                    | Alias: elevated surface          |
| `--cv-color-surface-secondary`  | `var(--cv-color-surface-2)`                                                    | `var(--cv-color-surface-2)`                                                    | Alias: secondary surface         |
| `--cv-color-surface-tertiary`   | `var(--cv-color-surface-3)`                                                    | `var(--cv-color-surface-3)`                                                    | Alias: tertiary surface          |
| `--cv-color-surface-hover`      | `color-mix(in oklab, var(--cv-color-primary) 8%, var(--cv-color-surface))`     | `color-mix(in oklab, var(--cv-color-primary) 6%, var(--cv-color-surface))`     | Surface hover highlight          |
| `--cv-color-text`               | `#e8ecf6`                                                                      | `#1a1f2e`                                                                      | Default text color               |
| `--cv-color-text-primary`       | `var(--cv-color-text)`                                                         | `var(--cv-color-text)`                                                         | Alias: primary text              |
| `--cv-color-text-muted`         | `#9aa6bf`                                                                      | `#5c6577`                                                                      | De-emphasized text               |
| `--cv-color-text-secondary`     | `var(--cv-color-text-muted)`                                                   | `var(--cv-color-text-muted)`                                                   | Alias: secondary text            |
| `--cv-color-text-subtle`        | `#7f8aa3`                                                                      | `#7a8394`                                                                      | Subtle / placeholder text        |
| `--cv-color-text-strong`        | `#f5f7fc`                                                                      | `#0e1219`                                                                      | Emphasized text                  |
| `--cv-color-text-strongest`     | `#ffffff`                                                                      | `#000000`                                                                      | Maximum contrast text            |
| `--cv-color-border`             | `#2a3245`                                                                      | `#d0d5de`                                                                      | Default border color             |
| `--cv-color-border-muted`       | `color-mix(in oklab, var(--cv-color-border) 55%, transparent)`                 | `color-mix(in oklab, var(--cv-color-border) 55%, transparent)`                 | Subtle border                    |
| `--cv-color-border-strong`      | `color-mix(in oklab, var(--cv-color-border) 82%, white 18%)`                   | `color-mix(in oklab, var(--cv-color-border) 82%, black 18%)`                   | Strong border                    |
| `--cv-color-border-accent`      | `color-mix(in oklab, var(--cv-color-primary) 35%, var(--cv-color-border))`     | `color-mix(in oklab, var(--cv-color-primary) 35%, var(--cv-color-border))`     | Accent-tinted border             |
| `--cv-color-brand`              | `var(--cv-color-primary)`                                                      | *(inherits)*                                                                   | Alias: brand color               |
| `--cv-color-primary`            | `#65d7ff`                                                                      | `#0e8ab4`                                                                      | Primary accent                   |
| `--cv-color-primary-dark`       | `#36bae8`                                                                      | `#0b7199`                                                                      | Darker primary shade             |
| `--cv-color-primary-darker`     | `#1794c2`                                                                      | `#085a7a`                                                                      | Darkest primary shade            |
| `--cv-color-primary-subtle`     | `color-mix(in oklab, var(--cv-color-primary) 12%, var(--cv-color-surface))`    | `color-mix(in oklab, var(--cv-color-primary) 8%, var(--cv-color-surface))`     | Subtle primary tint              |
| `--cv-color-primary-muted`      | `color-mix(in oklab, var(--cv-color-primary) 22%, var(--cv-color-surface))`    | `color-mix(in oklab, var(--cv-color-primary) 15%, var(--cv-color-surface))`    | Muted primary tint               |
| `--cv-color-on-primary`         | `#03151c`                                                                      | `#ffffff`                                                                      | Text on primary background       |
| `--cv-color-accent`             | `#b388ff`                                                                      | `#7c3aed`                                                                      | Secondary accent (purple)        |
| `--cv-color-accent-light`       | `color-mix(in oklab, var(--cv-color-accent) 70%, white)`                       | `color-mix(in oklab, var(--cv-color-accent) 70%, white)`                       | Light accent shade               |
| `--cv-color-accent-dark`        | `color-mix(in oklab, var(--cv-color-accent) 70%, black)`                       | `color-mix(in oklab, var(--cv-color-accent) 70%, black)`                       | Dark accent shade                |
| `--cv-color-accent-hover`       | `color-mix(in oklab, var(--cv-color-accent) 85%, white)`                       | `color-mix(in oklab, var(--cv-color-accent) 85%, black)`                       | Accent hover state               |
| `--cv-color-accent-contrast`    | `#14001f`                                                                      | `#ffffff`                                                                      | Text on accent background        |
| `--cv-color-cyan`               | `var(--cv-color-primary)`                                                      | *(inherits)*                                                                   | Alias: cyan                      |
| `--cv-color-cyan-light`         | `color-mix(in oklab, var(--cv-color-cyan) 70%, white)`                         | *(inherits)*                                                                   | Light cyan shade                 |
| `--cv-color-cyan-dark`          | `color-mix(in oklab, var(--cv-color-cyan) 70%, black)`                         | *(inherits)*                                                                   | Dark cyan shade                  |
| `--cv-color-success`            | `#6ef7c8`                                                                      | `#16a367`                                                                      | Success color                    |
| `--cv-color-success-dark`       | `#32cca0`                                                                      | `#0f8553`                                                                      | Dark success shade               |
| `--cv-color-success-text`       | `#e8fff5`                                                                      | `#052e1a`                                                                      | Text on success background       |
| `--cv-color-warning`            | `#ffd36e`                                                                      | `#b8860b`                                                                      | Warning color                    |
| `--cv-color-warning-dark`       | `#d3a74a`                                                                      | `#9a7209`                                                                      | Dark warning shade               |
| `--cv-color-warning-text`       | `#fff8e6`                                                                      | `#3d2c04`                                                                      | Text on warning background       |
| `--cv-color-danger`             | `#ff7d86`                                                                      | `#dc2c3e`                                                                      | Danger color                     |
| `--cv-color-danger-dark`        | `#e14f5b`                                                                      | `#b82232`                                                                      | Dark danger shade                |
| `--cv-color-danger-text`        | `#fff1f2`                                                                      | `#450a10`                                                                      | Text on danger background        |
| `--cv-color-info`               | `var(--cv-color-primary)`                                                      | *(inherits)*                                                                   | Info color                       |
| `--cv-color-info-text`          | `var(--cv-color-text)`                                                         | `var(--cv-color-text)`                                                         | Text on info background          |
| `--cv-color-focus`              | `var(--cv-color-primary)`                                                      | *(inherits)*                                                                   | Focus indicator color            |
| `--cv-color-focus-ring`         | `var(--cv-color-primary)`                                                      | *(inherits)*                                                                   | Focus ring color                 |
| `--cv-color-hover`              | `color-mix(in oklab, var(--cv-color-primary) 10%, var(--cv-color-surface))`    | `color-mix(in oklab, var(--cv-color-primary) 8%, var(--cv-color-surface))`     | General hover state              |
| `--cv-color-active`             | `color-mix(in oklab, var(--cv-color-primary) 18%, transparent)`                | `color-mix(in oklab, var(--cv-color-primary) 14%, transparent)`                | General active / pressed state   |
| `--cv-color-selected`           | `color-mix(in oklab, var(--cv-color-primary) 16%, var(--cv-color-surface))`    | `color-mix(in oklab, var(--cv-color-primary) 12%, var(--cv-color-surface))`    | Selected item background         |
| `--cv-color-overlay`            | `rgba(4, 7, 13, 0.72)`                                                        | `rgba(15, 20, 30, 0.38)`                                                      | Modal / overlay backdrop         |

### Spacing tokens

| Property       | Value  | Description       |
| -------------- | ------ | ----------------- |
| `--cv-space-1` | `4px`  | Extra-small space |
| `--cv-space-2` | `8px`  | Small space       |
| `--cv-space-3` | `12px` | Medium space      |
| `--cv-space-4` | `16px` | Default space     |
| `--cv-space-5` | `20px` | Large space       |
| `--cv-space-6` | `24px` | Extra-large space |
| `--cv-space-7` | `32px` | 2x-large space    |
| `--cv-space-8` | `40px` | 3x-large space    |

### Radius tokens

| Property          | Value                | Description           |
| ----------------- | -------------------- | --------------------- |
| `--cv-radius-1`   | `6px`                | Base small radius     |
| `--cv-radius-2`   | `10px`               | Base medium radius    |
| `--cv-radius-3`   | `14px`               | Base large radius     |
| `--cv-radius-4`   | `18px`               | Base extra-large      |
| `--cv-radius-s`   | `var(--cv-radius-1)` | Alias: small          |
| `--cv-radius-sm`  | `var(--cv-radius-1)` | Alias: small          |
| `--cv-radius-m`   | `var(--cv-radius-2)` | Alias: medium         |
| `--cv-radius-md`  | `var(--cv-radius-2)` | Alias: medium         |
| `--cv-radius-lg`  | `var(--cv-radius-3)` | Alias: large          |
| `--cv-radius-xl`  | `var(--cv-radius-4)` | Alias: extra-large    |
| `--cv-radius-pill` | `999px`             | Pill shape            |
| `--cv-radius-full` | `9999px`            | Full circle           |

### Typography tokens

| Property                    | Value                                                                       | Description              |
| --------------------------- | --------------------------------------------------------------------------- | ------------------------ |
| `--cv-font-family-primary`  | `'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | Primary font stack   |
| `--cv-font-family-body`     | `var(--cv-font-family-primary)`                                             | Body text font           |
| `--cv-font-family-display`  | `'Satoshi', var(--cv-font-family-primary)`                                  | Display / heading font   |
| `--cv-font-family-sans`     | `var(--cv-font-family-primary)`                                             | Alias: sans-serif        |
| `--cv-font-family-code`     | `'JetBrains Mono', 'SF Mono', 'Monaco', 'Consolas', monospace`             | Monospace font           |
| `--cv-font-size-xs`         | `0.75rem`                                                                   | Extra-small text         |
| `--cv-font-size-sm`         | `0.875rem`                                                                  | Small text               |
| `--cv-font-size-base`       | `1rem`                                                                      | Base text size           |
| `--cv-font-size-md`         | `var(--cv-font-size-base)`                                                  | Alias: medium            |
| `--cv-font-size-lg`         | `1.125rem`                                                                  | Large text               |
| `--cv-font-size-xl`         | `1.25rem`                                                                   | Extra-large text         |
| `--cv-font-size-2xl`        | `1.5rem`                                                                    | 2x-large text            |
| `--cv-font-size-3xl`        | `1.875rem`                                                                  | 3x-large text            |
| `--cv-font-size-4xl`        | `2.25rem`                                                                   | 4x-large text            |
| `--cv-font-size-5xl`        | `3rem`                                                                      | 5x-large text            |
| `--cv-font-size-6xl`        | `3.75rem`                                                                   | 6x-large text            |
| `--cv-font-weight-thin`     | `100`                                                                       | Thin weight              |
| `--cv-font-weight-light`    | `300`                                                                       | Light weight             |
| `--cv-font-weight-normal`   | `400`                                                                       | Normal weight            |
| `--cv-font-weight-regular`  | `var(--cv-font-weight-normal)`                                              | Alias: regular           |
| `--cv-font-weight-medium`   | `500`                                                                       | Medium weight            |
| `--cv-font-weight-semibold` | `600`                                                                       | Semi-bold weight         |
| `--cv-font-weight-bold`     | `700`                                                                       | Bold weight              |
| `--cv-font-weight-extrabold`| `800`                                                                       | Extra-bold weight        |
| `--cv-font-weight-black`    | `900`                                                                       | Black weight             |

### Shadow tokens

| Property           | Dark value                                                              | Light value                                                             | Description         |
| ------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------- |
| `--cv-shadow-sm`   | `0 2px 8px rgba(0, 0, 0, 0.24)`                                        | `0 2px 8px rgba(0, 0, 0, 0.08)`                                        | Small shadow        |
| `--cv-shadow-md`   | `0 8px 28px rgba(0, 0, 0, 0.32)`                                       | `0 8px 28px rgba(0, 0, 0, 0.12)`                                       | Medium shadow       |
| `--cv-shadow-lg`   | `0 16px 48px rgba(0, 0, 0, 0.38)`                                      | `0 16px 48px rgba(0, 0, 0, 0.14)`                                      | Large shadow        |
| `--cv-shadow-xl`   | `0 24px 64px rgba(0, 0, 0, 0.42)`                                      | `0 24px 64px rgba(0, 0, 0, 0.16)`                                      | Extra-large shadow  |
| `--cv-shadow-glow` | `0 0 40px color-mix(in oklab, var(--cv-color-cyan) 15%, transparent)`   | `0 0 40px color-mix(in oklab, var(--cv-color-cyan) 10%, transparent)`   | Glow effect         |
| `--cv-shadow-1`    | `var(--cv-shadow-sm)`                                                   | `var(--cv-shadow-sm)`                                                   | Alias: level 1      |
| `--cv-shadow-2`    | `var(--cv-shadow-md)`                                                   | `var(--cv-shadow-md)`                                                   | Alias: level 2      |
| `--cv-shadow-3`    | `var(--cv-shadow-lg)`                                                   | `var(--cv-shadow-lg)`                                                   | Alias: level 3      |
| `--cv-shadow-4`    | `var(--cv-shadow-xl)`                                                   | `var(--cv-shadow-xl)`                                                   | Alias: level 4      |

### Motion tokens

| Property                | Value                       | Description               |
| ----------------------- | --------------------------- | ------------------------- |
| `--cv-duration-instant`  | `0ms`                      | No transition             |
| `--cv-duration-fast`     | `120ms`                    | Fast transition           |
| `--cv-duration-normal`   | `220ms`                    | Standard transition       |
| `--cv-duration-slow`     | `320ms`                    | Slow transition           |
| `--cv-duration-slower`   | `500ms`                    | Slower transition         |
| `--cv-duration-slowest`  | `800ms`                    | Slowest transition        |
| `--cv-easing-standard`   | `cubic-bezier(0.2, 0, 0, 1)` | Standard easing        |
| `--cv-easing-accelerate` | `cubic-bezier(0.4, 0, 1, 1)` | Accelerate easing      |
| `--cv-easing-decelerate` | `cubic-bezier(0, 0, 0.2, 1)` | Decelerate easing      |
| `--cv-easing-spring`     | `cubic-bezier(0.16, 1, 0.3, 1)` | Spring easing       |

### Z-index tokens

| Property         | Value  | Description      |
| ---------------- | ------ | ---------------- |
| `--cv-z-base`    | `0`    | Base layer       |
| `--cv-z-overlay` | `1000` | Overlay layer    |
| `--cv-z-modal`   | `1100` | Modal layer      |
| `--cv-z-toast`   | `1200` | Toast layer      |

### Sizing tokens

| Property                  | Value  | Description               |
| ------------------------- | ------ | ------------------------- |
| `--cv-size-control-height`| `48px` | Default control height    |

## Visual States

| Host selector        | Description                                           |
| -------------------- | ----------------------------------------------------- |
| `:host([mode="light"])` | Light color scheme active; `color-scheme: light`    |
| `:host([mode="dark"])`  | Dark color scheme active; `color-scheme: dark`      |
| `:host([mode="system"])` | Follows OS preference; `color-scheme` set dynamically |

The provider also sets a `data-cv-theme` attribute on the host element when a named theme is applied via the theme engine. This attribute can be used for CSS targeting:

```css
cv-theme-provider[data-cv-theme="my-theme"] { /* overrides */ }
```

## Events

None. The theme provider does not emit events. Theme changes propagate via CSS custom property inheritance.

## Accessibility

- No ARIA roles are required. The provider is invisible infrastructure.
- All color token pairings (text on surface, text on primary, etc.) must meet WCAG AA contrast ratios: 4.5:1 for normal text, 3:1 for large text and UI components.
- The `color-scheme` CSS property must be set on the host to ensure native form controls (inputs, selects, scrollbars) render with the correct system appearance.

## Theme Engine API

The theme engine (`theme-engine.ts`) provides a runtime API for registering and applying named themes programmatically. It is independent of the `cv-theme-provider` element and can target any `HTMLElement`, `ShadowRoot`, or `Document`.

### Types

```ts
type CVThemeTokenName = `--cv-${string}`
type CVThemeTokens = Record<CVThemeTokenName, string>

interface CVThemeDefinition {
  name: string
  tokens: CVThemeTokens
}

type CVThemeTarget = HTMLElement | ShadowRoot | Document
```

### `defineTheme(name: string, tokens: CVThemeTokens): CVThemeDefinition`

Registers a named theme in the global theme registry.

- `name` must be a non-empty string.
- All keys in `tokens` must start with `--cv-`. Invalid keys throw an `Error`.
- Returns a defensive copy of the registered definition.
- Calling `defineTheme` with an existing name overwrites the previous definition.

### `getTheme(name: string): CVThemeDefinition | undefined`

Retrieves a registered theme definition by name.

- Returns `undefined` if no theme is registered with the given name.
- Returns a defensive copy; mutations do not affect the registry.

### `applyTheme(target: CVThemeTarget, name: string): HTMLElement`

Applies a registered theme to a target element.

- Resolves the target: `HTMLElement` is used directly; `Document` resolves to `document.documentElement`; `ShadowRoot` resolves to `shadowRoot.host`.
- Removes all CSS custom properties previously applied to the target by a prior `applyTheme` call (tracked via a `WeakMap`).
- Sets each token as an inline `style.setProperty(key, value)` on the resolved element.
- Sets the `data-cv-theme` attribute on the resolved element to the theme name.
- Throws an `Error` if the named theme is not registered.
- Returns the resolved `HTMLElement`.

### Token prefix rule

All theme tokens must use the `--cv-` prefix. The engine validates this at registration time and rejects tokens that do not conform.

## Light / Dark CSS Cascade Strategy

Light and dark tokens are defined entirely in `tokens.css` using CSS selectors and a media query — no JavaScript token switching is needed.

```
1. :root, cv-theme-provider          → dark tokens (default)
2. cv-theme-provider[mode="light"]   → light token overrides
3. @media (prefers-color-scheme: light) {
     :root,
     cv-theme-provider[mode="system"] → light token overrides
   }
```

| `mode` value | Resolution |
| ------------ | ---------- |
| `dark`       | Uses the default dark block (no extra selector needed) |
| `light`      | Matched by `[mode="light"]` selector |
| `system`     | Matched by `@media` + `[mode="system"]` when OS is light; falls through to dark default when OS is dark |

The `:root` selector inside the `@media` block handles the no-provider case (bare `import 'tokens.css'`).

The light block overrides only color-varying tokens (colors, shadows, overlay). Scheme-invariant tokens (spacing, radius, typography, motion, z-index, sizing) are defined once in the default block and shared.

## Usage

### Basic dark theme

```html
<cv-theme-provider mode="dark">
  <cv-button variant="primary">Save</cv-button>
</cv-theme-provider>
```

### System-auto (default)

```html
<cv-theme-provider>
  <!-- Follows OS light/dark preference -->
  <my-app></my-app>
</cv-theme-provider>
```

### Named theme via engine

```html
<script type="module">
  import { defineTheme } from '@chromvoid/uikit/theme'

  defineTheme('brand', {
    '--cv-color-primary': '#ff6600',
    '--cv-color-bg': '#1a1a2e',
  })
</script>

<cv-theme-provider theme="brand">
  <cv-button variant="primary">Branded</cv-button>
</cv-theme-provider>
```

### Nested providers (scoped override)

```html
<cv-theme-provider mode="dark">
  <main>
    <cv-theme-provider theme="sidebar-theme">
      <nav><!-- tokens scoped to sidebar --></nav>
    </cv-theme-provider>
  </main>
</cv-theme-provider>
```

### CSS targeting via data attribute

```css
cv-theme-provider[data-cv-theme="brand"] {
  --cv-color-accent: #ff9900;
}
```
