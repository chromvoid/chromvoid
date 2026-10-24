## Release direction — user decision, 2026-09-10

Native Air is the replacement implementation of the existing ChromVoid iOS app,
not a second App Store product. Follow the current release-direction amendment
at the start of `docs/implementation-plan.md`. Production configuration may use
the existing `com.chromvoid.app` identity, team, App Group and Keychain group as
required for that update. This supersedes the earlier blanket experimental-only
restriction for the deliberate replacement configuration. Fixture/development
builds stay isolated. It does not authorize publication, live-vault inspection,
key copying or storage erasure. Keep one future iOS shipping implementation;
retain the old artifact/source only for controlled replacement verification and
rollback, preserving shared Tauri owners needed by other platforms.

# IOS-air development rules

Read root `AGENTS.md`, this file, `docs/architecture.md`, `docs/runtime-contract.md`, and the active implementation plan before substantial work.

For handwritten Swift, follow [Swift code style](docs/swift-code-style.md). Run `scripts/swift-style.sh check` for native changes; the canonical native test script also runs this check. Generated bindings are excluded and remain generator-owned. Technology decisions and upgrade follow-ups are recorded in [Swift technology review](docs/swift-technology-review.md).

## Scope and independence

- User-authorized experimental native iOS direction. Swift/SwiftUI app, no WebView runtime, no Compose, no copy of Rust Core. Root Reatom/Lit/CSS component rules apply to existing web code; their native equivalent here is rendering-only SwiftUI views + smart presentation models + Rust domain owners.
- Keep native UI, design, tests, and iOS packaging under `apps/IOS-air`. Share domain/runtime code through `crates/`; no long-lived fork of the Tauri adapter. Do not edit `src-tauri/gen/apple` as the source for IOS-air.
- Existing production ADRs remain normative for shipping clients. The native shell is a scoped architectural experiment; only the shell technology differs. Security, vault format, license and protocol invariants still apply. Do not silently supersede ADR-001/026.
- No nested repository. Worktree separation is needed when multiple tasks edit concurrently; a directory is not a concurrency boundary for shared Rust files.
- Do not assign production bundle IDs, entitlements, shared Keychain access, App Groups, provisioning, or store records to experimental builds. Do not read live vaults. Never copy key material as a migration mechanism.

## Native architecture

- Baseline iOS/iPadOS 16.0, matching the existing mobile contract. SwiftUI `NavigationStack`, `NavigationSplitView`, `TabView`, `List`, `Form`, system sheets. Newer APIs require availability guards; do not raise deployment target as an implementation shortcut.
- Swift 6 concurrency checks; iOS 16-compatible `ObservableObject` / `@Published` presentation models on `@MainActor`. One application-scoped session coordinator. Inject dependencies at the composition root; views must not create duplicate runtimes.
- Rust owns vault/session authority, validation, crypto, provider authorization, storage and shared transport protocol. Swift owns presentation and Apple framework integration. Swift Task cancellation does not itself revoke a Rust operation.
- No persisted secret-bearing Swift models, search indexes, `@AppStorage` values, SwiftData/Core Data vault mirrors, or WebView bridge emulation.
- Lock must revoke authority in Rust, purge derived UI/preview state and invalidate provider access. Never rely solely on hiding a view. Leaving the app only covers the screen by default (the vault stays open until auto-lock or an explicit lock); the "Lock when leaving the app" setting restores lock-on-background, and the device locking (protected data unavailable) always revokes.
- Face ID is the optional app-presence gate from ADR-032, default off. It does not unlock a vault. Do not add an incorrect-password oracle to the plausible-deniability vault path.
- Follow SPEC-243 storage/pepper rules. Development isolation uses a distinct app access group/sandbox, not path-derived pepper coordinates.
- Vault Env Runtime product-agent access remains CLI-only under root rules; IOS-air introduces no Env Runtime agent surface.

## Design and verification

- `design/ux-spec.md` owns navigation, copy semantics and states; `docs/apple-guidelines.md` maps Apple requirements to acceptance.
- Prefer system controls, SF typography, SF Symbols, Dynamic Type, semantic colors and safe areas. Preserve ChromVoid's restrained cyan accent. Liquid Glass is the preferred system appearance where available and allowed by effective OS/user settings; follow `docs/apple-guidelines.md` material policy and LG01–LG06. Do not override reduced transparency/motion, infer a universal enabled flag, add an app toggle, or imitate glass on older iOS. Keep content readable and privacy covers opaque.
- Submit validates and focuses the first invalid input; do not hide ordinary validation behind disabled actions. Disable duplicate in-flight submission and unauthorized actions with an explanation.
- All visible copy enters native String Catalogs with English canonical semantics; Russian is the preparation/prototype language. Preserve supported locale work via parity matrix.
- Every screen needs the ordinary empty/loading/error/locked/read-only states relevant to its main user flows, including normal keyboard and cancellation behavior.
- JS/TS prototype tooling uses Bun. Native verification uses Swift/Xcode/Rust. Unit tests verify behavior/contracts; visual claims need rendered native checks. HTML mockups are never native test evidence.
- No network-loaded fonts, telemetry or real credentials in design fixtures. The prototype simulates copy and destructive actions; it must never access the real clipboard or filesystem data.
- During preparation, do not start production implementation. During authorized execution, follow the validated plan, preserve unrelated changes, and finish task-owned local commit closure; never push without authorization.

## Current design and UI verification scope

User decision, 2026-09-06: focus on the ordinary native design and main user journeys on iPhone/iPad with standard font size and default system appearance settings. Use standard SwiftUI controls and their built-in platform behavior.

Do not spend implementation or verification time on maximum Dynamic Type, enlarged accessibility fonts, forced contrast, Reduce Motion/Transparency combinations, VoiceOver test matrices, extreme window sizes, or exhaustive user-environment edge cases. Do not alter simulator preferences to run those checks, add workaround code for those combinations, or make them a completion/commit gate. Expanded environment/accessibility testing requires a separate explicit user request; do not automatically move it to W10 or reintroduce it through linked design/verification documents.

Check the actual screen at ordinary settings, main navigation and CRUD flows, normal keyboard use, and functional correctness. Existing data integrity, secret handling and lock/revoke requirements remain the product contracts. This scope overrides broader UI-environment checklists in previously prepared IOS-air documents.
