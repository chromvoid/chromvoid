## Direction — user decision, 2026-09-20

Native Android Air is the future replacement implementation of the existing
ChromVoid Android client, not a second product. Follow
[docs/implementation-plan.md](docs/implementation-plan.md) for implementation
work. The rules below continue to govern the browser design study under
`design/`, which stays a synthetic, memory-only artifact. Implementation work
uses development identities only; publication, production identity adoption and
live-vault access remain unauthorized.

# Android Air design workspace

Read root AGENTS.md, docs/product-scope.md, design/ux-spec.md, docs/design-plan.md (closed design phase) and docs/implementation-plan.md (native direction).

- This is the user-authorized design experiment, not a shipped Android client. All UI data is synthetic and memory-only. No real clipboard, file pickers, vaults, permissions, accounts, telemetry or product network calls.
- Browser prototypes are design evidence only. They do not prove native Android behavior, security, accessibility services or Autofill availability.
- Common identity is owned by business/brand. Platform UX is owned here. Do not change IOS-air or production UI while preparing this direction.
- Use existing Lit/Reatom and Bun. Reatom model owns fixture state and transitions; rendering helpers only display it and forward actions. One light-DOM studio component deliberately uses a document stylesheet. No domain/crypto implementations.
- New experimental palette lives in packages/theme/src/air-design.css, opt-in under .air-design; do not import it into production theme entrypoints. Existing UIKit spacing/radius/font tokens remain the foundation. SVG icons and ChromVoid mark reuse existing assets.
- Copy is Russian for review; preserve English canonical meanings in the UX copy table. Air is a development name, not a new product or subscription.
- Keep native system boundary screens explicitly described as illustrative in the studio annotations. Do not add invented capabilities to fill a mockup.
- Verify normal phone, compact phone, dark/light and representative wide adaptations. Use rendered evidence for visual claims, behavioral checks for navigation, mutation/cancel, lock and read-only fixture contracts. No exhaustive native accessibility matrix in this design phase.
- Commit only task-owned work after verification; never push without authorization.
