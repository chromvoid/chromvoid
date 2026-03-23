# Theming

UIKit tokens follow the `--cv-*` naming scheme and can be changed at runtime.

## Define a custom theme

```ts
import {defineTheme, applyTheme} from '@chromvoid/uikit'

defineTheme('sunset', {
  '--cv-color-bg': '#101722',
  '--cv-color-surface': '#1b2231',
  '--cv-color-primary': '#ff8a65',
  '--cv-color-success': '#73f4c8',
  '--cv-color-text': '#f1f5ff',
  '--cv-color-border': '#31415b',
})

applyTheme(document, 'sunset')
```

## Use `cv-theme-provider` for scoped theming

```html
<cv-theme-provider theme="sunset">
  <cv-button>Scoped theme button</cv-button>
  <cv-checkbox checked>Scoped checkbox</cv-checkbox>
</cv-theme-provider>
```

## Default token source

UIKit ships baseline tokens in:

`src/theme/tokens.css`

Use this file as a baseline and override only the tokens you need per product.
