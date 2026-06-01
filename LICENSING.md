# ChromVoid Licensing

ChromVoid uses an `AGPL-3.0-only + Commercial` split, with `packages/headless-ui`
kept permissive under `MIT`.

The intent is:

- cryptography, client apps, and product-specific UI stay auditable and copyleft
- the standalone headless accessibility package stays broadly reusable
- backend services, relay infrastructure, paid features, and internal business
  assets remain commercial / proprietary

## License Matrix

| Path | License | Notes |
| --- | --- | --- |
| `crates/core` | `AGPL-3.0-only` | vault crypto, storage, core domain logic |
| `crates/protocol` | `AGPL-3.0-only` | secure transport and protocol framing |
| `crates/cli` | `AGPL-3.0-only` | CLI built on the public core |
| `crates/tauri-plugin-ios-push-bridge` | `AGPL-3.0-only` | app-side platform bridge |
| `apps/chromvoid` | `AGPL-3.0-only` | desktop/mobile application shell |
| `apps/webview` | `AGPL-3.0-only` | shared WebView application UI |
| `apps/browser-extensions` | `AGPL-3.0-only` | browser extension client |
| `packages/uikit` | `AGPL-3.0-only` | product-specific visual UI kit |
| `packages/ui` | `AGPL-3.0-only` | app-level shared UI package |
| `packages/passmanager` | `AGPL-3.0-only` | password-manager domain package |
| `packages/password-import` | `AGPL-3.0-only` | import workflows and parsers |
| `packages/scheme` | `AGPL-3.0-only` | generated client contracts from core |
| `packages/headless-ui` | `MIT` | standalone headless primitives |
| `packages/i18n` | `MIT` | small reusable i18n runtime |
| `packages/utils` | `ISC` | retained permissive utility package |
| `crates/fuser` | `MIT` | third-party upstream/fork; see local license |
| `apps/relay/**` | Commercial / Proprietary | relay service and operations code |

## Notes

- When a package manifest declares its own license field, that declaration is
  authoritative for that package.
- Components under commercial / proprietary paths are not granted any open-source
  rights by the presence of AGPL or MIT components elsewhere in this monorepo.
- Canonical license references live in `LICENSES/AGPL-3.0.txt`,
  `LICENSES/MIT.txt`, and `LICENSES/COMMERCIAL.txt`.
- Public mirror/export rules are enforced separately through the private-sync
  workflow and `.private` markers.
