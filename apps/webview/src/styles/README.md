# Webview styles

Single entrypoint: `apps/webview/src/styles/styles.css`.

Import order (top to bottom):

1. ChromVoid CV token layer: `apps/webview/src/styles/tokens/chromvoid.css`
2. Editorial token layer (vars + keyframes only): `apps/webview/src/styles/tokens/editorial.css`
3. Fonts and font-related vars: `apps/webview/src/styles/base/fonts.css`
4. Global reset/base element rules: `apps/webview/src/styles/base/reset.css`
5. App tokens (breakpoints/touch/layout helpers): `apps/webview/src/styles/tokens/app.css`

Notes:

- `--cv-*` is the canonical design-token contract.
- `--app-*` stays for app-specific layout and interaction constants.
- Production build bundles CSS into a single file: `apps/webview/dist/assets/styles.css`.
