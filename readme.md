# ChromVoid

Privacy-first encrypted vault. Stores passwords, files, and secrets locally with end-to-end encryption. No accounts, no cloud lock-in, no trust required.

## How it works

All data lives in encrypted chunks on your device. The core is written in Rust and handles cryptography, storage, and sync. The UI runs in a WebView and talks to the core through an RPC layer over Tauri IPC or a Noise Protocol secure channel.

**Storage model**: Segmented catalog — Root Index + Shard Snapshots + Delta Logs. Optimized for 10k+ entries, incremental sync, and plausible deniability. Chunk names are deterministic but key-dependent; all payloads use AEAD encryption (ChaCha20-Poly1305) with context binding.

**Sync**: Devices pair via Noise Protocol (Noise_XX_25519_ChaChaPoly_BLAKE2s) over WebRTC, WSS, or USB. No central server required. Append-only deltas minimize traffic.

**Emergency access**: Dead man's switch via escrow service. Split-key design — the server never sees plaintext. Owner can cancel during delay window.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Applications                   │
│  Desktop (Tauri)  ·  Browser Extension  ·  Relay │
├─────────────────────────────────────────────────┤
│                    WebView UI                     │
│        Lit + Reatom · UIKit · Headless a11y      │
├─────────────────────────────────────────────────┤
│               RPC / Secure Channel               │
│       Noise Protocol · Tauri IPC · WebRTC        │
├─────────────────────────────────────────────────┤
│                    Rust Core                      │
│   Crypto · Storage · Catalog · Sync · PassMgr    │
└─────────────────────────────────────────────────┘
```

### Rust Core (`crates/`)

- `core` — encryption, vault storage format, RPC router, catalog, sync engine
- `protocol` — Noise Protocol secure channel framing, transport abstractions
- `fuser` — FUSE mount for vault-as-filesystem
- `cli` — command-line interface

### Applications (`apps/`)

- `chromvoid` — Tauri desktop app (macOS, Windows, Linux)
- `webview` — shared WebView UI for desktop and mobile
- `browser-extensions` — Chrome/Firefox extension for autofill
- `relay` — relay server for device-to-device connectivity

### Shared Packages (`packages/`)

- `headless` — framework-agnostic WAI-ARIA APG headless components (Reatom v1000)
- `uikit` — Lit web components, visual design system
- `passmanager` — password manager domain model and service layer
- `scheme` — shared TypeScript types generated from Rust via ts-rs
- `i18n` — localization
- `ui` — shared UI utilities
- `utils` — common utilities
- `password-import` — import from 1Password, Bitwarden, Chrome, etc.

## Security model

- **Zero-knowledge** — vault is encrypted at rest and in transit. The server (if used) never accesses plaintext.
- **AEAD encryption** — ChaCha20-Poly1305 with per-chunk unique nonce and context-bound AAD.
- **Noise Protocol** — mutual authentication and forward secrecy for all device-to-device communication.
- **System shard isolation** — internal namespaces (`.passmanager`, `.wallet`) are blocked from generic file interfaces; access only through domain-specific RPC.
- **No accounts** — capability-token auth where applicable. No user database to breach.
- **Plausible deniability** — flat chunk storage reveals no meaningful structure without keys.

## Tech stack

| Layer     | Stack                                                    |
| --------- | -------------------------------------------------------- |
| Core      | Rust, ChaCha20-Poly1305, X25519, BLAKE2s, Noise Protocol |
| Desktop   | Tauri v2, WebView                                        |
| Frontend  | Lit, Reatom v1000, TypeScript                            |
| Backend   | Rust, Axum, Tower, PostgreSQL, Redis                     |
| Transport | WebRTC, WSS, USB, Noise XX/IK/XXpsk0                    |

## Monorepo structure

```
chromvoid/
├── apps/                 # Desktop, extension, relay
├── backend/              # Rust backend services + landings
├── crates/               # Rust core, protocol, FUSE, CLI
├── packages/             # Shared TS packages (headless, uikit, passmanager, ...)
└── tests/                # Integration and E2E tests
```

## License

ChromVoid uses a mixed-license model.

- `crates/core`, `crates/protocol`, the desktop/web/extension apps, and product UI packages are `AGPL-3.0-only`
- `packages/headless-ui` remains `MIT`
- `backend/`, `apps/relay/`, paid features, and internal business/ops assets are commercial / proprietary

See `LICENSE` and `LICENSING.md` for the path-level matrix.
