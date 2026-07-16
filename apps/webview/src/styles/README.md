# Webview styles

Single entrypoint: `apps/webview/src/styles/styles.css`.

Import order (top to bottom):

1. UIKit foundation and ChromVoid product theme: `@project/theme/webview.css`
2. Font-face declarations: `apps/webview/src/styles/base/fonts.css`
3. Global reset/base element rules: `apps/webview/src/styles/base/reset.css`
4. Webview environment/runtime values: `apps/webview/src/styles/tokens/runtime.css`

Notes:

- UIKit owns reusable `--cv-*` foundation and documented component contracts.
- `@project/theme` owns ChromVoid-specific static values and product semantics.
- Webview bootstrap owns measured `--app-runtime-*` values.
- Full ownership and naming rules: `docs/css-custom-property-conventions.md`.
- Production build bundles CSS into a single file: `apps/webview/dist/assets/styles.css`.
