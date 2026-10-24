# @chromvoid/password-import

Credential import UI and transport for ChromVoid. Rust Core owns KeePass KDBX, Bitwarden JSON, 1Password 1PUX and CSV parsing, validation, source identity matching and atomic storage. The web client uploads the selected file and renders a secret-free review; it does not decrypt or map imported entries.

## Application integration

Use the lean subpaths `/service`, `/ui/import-dialog-state`, `/ui/import-dialog`, `/ui/mobile-file-picker-lifecycle` and `/ui/file-accept`. The root exports the same public API. Retired `/parsers`, `/mapper`, `/conflicts` and `/validation` exports have no product replacements in TypeScript.

```ts
import {CredentialImportService} from '@chromvoid/password-import/service'
import {setCredentialImportService} from '@chromvoid/password-import/ui/import-dialog-state'

setCredentialImportService(new CredentialImportService((command, data) => transport.rpc(command, data)))
// On vault/session/host disposal, revoke the old service before opening another surface:
setCredentialImportService(null)
```

`pm-import-dialog` emits `import-complete` with `{success, progress}` and `import-close`. A successful transaction reports the Core-reviewed created/updated counts. Failure does not claim per-entry partial success. Closing or leaving the surface cancels upload/review. Once an explicit commit has been dispatched, it cannot be undone by closing the dialog, and an uncertain response is never automatically retried.

## Shared RPC contract

`passmanager:import:limits` discovers host support and byte limits. `start` allocates a Core session; `append` transfers exact ordered chunks; `review` returns counts, source and counted warnings; `commit` consumes the reviewed token with explicit confirmation; `cancel` releases it. The host retains the parsed document and checks the reviewed catalog revision at commit. No credential document is returned to JavaScript.

The same commands run through the existing local and authenticated remote transports. Import into a remote vault sends the chosen source file and optional KeePass database password to that vault's host through the existing encrypted connection. Old hosts report that an update is required; there is no browser parser fallback.

Raw file admission is 50 MiB, with at most 512 KiB decoded bytes per RPC chunk. Base64 is bounded to one chunk, not the whole file. Native iOS retains its smaller 16 MiB transfer limit. Parser-specific expanded-content, icon, entry-count and KDF limits still apply: for example KeePass XML expansion is capped at 32 MiB. An admitted compressed file can still exceed a parser limit.

Repeated imports match qualified source IDs. For records imported by the former web implementation, Core can adopt exact unique legacy KeePass UUID/base64 or 1Password item IDs, preserving their existing entry ID and folder. The review counts these matches. Ambiguous legacy IDs stop the review before writes. CSV without source IDs creates new entries on repeat import.

The dev-only `kdbxweb` and `fflate` dependencies support independent synthetic Core fixture generation. They are excluded from the product import bundle. Format regression fixtures live in `crates/core/tests/passmanager_domain_rpc/fixtures`; web tests cover transport, cancellation, review/confirmation and UI lifecycle.

Run `bun run --cwd packages/password-import test` for package behavior, exports and bundle contracts.
