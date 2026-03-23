# Getting Started

## Install

```bash
npm i @chromvoid/uikit lit
```

For monorepo usage:

```bash
npm i -w packages/uikit
```

## Register components

`@chromvoid/uikit` exports a single registration function for all web components.

```ts
import {registerUikit} from '@chromvoid/uikit'
import '@chromvoid/uikit/src/theme/tokens.css'

registerUikit()
```

## Render in HTML

```html
<cv-button>Primary action</cv-button>
<cv-switch checked></cv-switch>
<cv-progress value="40" max="100"></cv-progress>
```

## Local docs and demo

```bash
npm run docs:dev -w packages/uikit
npm run demo -w packages/uikit
```
