# Android Air — ChromVoid design study 01

**Личное. На своём месте.** Research, shared product identity and editable Android mockups. This is a browser design artifact, not a native Android application.

## Open the designs

From the repository root:

```sh
bun run apps/Android-air/design/prototype/serve.ts
```

Open [design studio](http://127.0.0.1:4320/). Existing Bun dependencies must already be installed, as in the main workspace. No external fonts, service calls, vault or real clipboard access. Fixtures exist only in memory and reset on reload.

The studio includes 26 review scenes (including the Codes catalog filter), three design directions, dark/light, compact/phone/tablet sizes and iOS/desktop adaptations. The right panel explains what is interactive and what represents a system boundary. State selectors show only the states represented by the chosen screen. Data entry is synthetic; enter any nonempty value at demo unlock.

## Read the decisions

- [Product and Android research](../../business/brand/research.md): primary sources, audience hypotheses, value/proof map, competitive patterns and interview protocol.
- [Approved color palette](../../business/brand/color-system.md) and [cross-platform identity proposal](../../business/brand/brand-system.md).
- [Positioning](../../business/brand/positioning.md), [identity](../../business/brand/identity.md), [platform principles](../../business/brand/platform-principles.md).
- [Android product scope](docs/product-scope.md) and [platform guidance](docs/android-guidelines.md).
- [UX specification](design/ux-spec.md) and [scenario/parity coverage](design/scenario-matrix.md).
- [Three concepts](design/concepts/README.md), [screen exports](design/screenshots/README.md), [verification](design/QA.md).
- [Closed design execution plan](docs/design-plan.md) and the [native implementation plan](docs/implementation-plan.md).

## Edit and reuse

`design/prototype/model.js` owns fixture state and transitions; `fixtures.js` owns demonstration content. `app.js` is the studio; domain rendering lives in vault/files/connections/settings modules. Styles consume the opt-in experimental palette from `packages/theme/src/air-design.css` and existing UIKit tokens. SVG icons and mark reuse repository assets. Browser dependency resolution is local to the studio and reuses the installed UIKit package.

Reuse common semantics, visual grammar and scene compositions in future native clients. Do not copy the fixture model as domain logic. Native implementation must map designs onto current platform capabilities and existing Rust/domain owners. Production styles and IOS-air were not modified by this work.

## Verification limits

Research used repository and official documentation, not competitor app installations or real participant interviews. The delivered concept receives expert/browser evaluation. Native Autofill, predictive Back, USB, storage, biometrics and media need separate Android/device evidence. Supplementary subflows marked S in the parity matrix are specified, not counted as implemented interactive routes.
