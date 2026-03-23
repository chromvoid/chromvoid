# ADR-001: Architecture of an Independent Headless Package

> **Status**: Accepted
> **Version**: 2026-02-08-r6
> **Date**: 2026-02-08
> **Authors**: Team ChromVoid
> **Related Documents**:
>
> - [packages/headless/README.md](../README.md) - package goal
> - [WAI-ARIA APG patterns](https://www.w3.org/WAI/ARIA/apg/patterns/) - accessibility behavior patterns
> - [WAI-ARIA APG keyboard interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) - keyboard and focus rules
> - [Reatom docs](https://www.reatom.dev/) - state management model
> - [ADR-002-repo-release-model](./ADR-002-repo-release-model.md) - git-shard and release ownership
> - [ADR-003-public-api-versioning](./ADR-003-public-api-versioning.md) - SemVer and deprecation policy
> - [ADR-004-focus-selection-policy](./ADR-004-focus-selection-policy.md) - shared focus/selection policy
>
> **Note**: `packages/headless` in this monorepo is a development mirror.
> The canonical source, versioning, and publishing flow live in a separate public git-shard repository.

## Context

We need a highly independent headless package for a future UI kit:

- no visual layer;
- Reatom v1000 as the state runtime;
- behavior contracts aligned with WAI-ARIA APG.

The package is developed in this monorepo for local integration speed,
but it must stay independent from internal architecture and internal modules.

## Problem

If this package is treated as a regular internal monorepo module, we get:

- hidden dependencies on `@project/*`, `apps/*`, and internal scripts;
- low portability outside this repository;
- release and publishing ambiguity;
- API evolution coupled to one product architecture.

## Goals

1. Lock architectural independence as a hard requirement.
2. Define module boundaries: `core -> interactions -> a11y-contracts -> adapters`.
3. Define a stable public API shape (`createX`, `get*Props`, `actions/selectors`).
4. Lock repository model: public git-shard is the canonical source.
5. Define standalone build/test/release expectations.

## Non-Goals

- Adapting architecture to current internal monorepo modules.
- Using internal dependencies such as `@project/*`.
- Migrating existing apps in this ADR.
- Implementing all UI widgets in this ADR.

## Decision

### 1. Repository Model and Ownership

1. `packages/headless` in this monorepo is a development mirror.
2. Canonical code history, tags, and releases are managed in a separate public git-shard repository.
3. Publishing to package registries is done only from git-shard.

**MUST NOT**: use the monorepo as a release source of truth for this package.

### 2. Independence Constraints (Hard)

The package **MUST**:

- build and test in an isolated checkout without this monorepo;
- use only public dependencies;
- have package-local scripts, specs, tests, and release flow.

The package **MUST NOT**:

- import `@project/*`, `apps/*`, or files outside package boundaries;
- rely on monorepo lifecycle scripts as required runtime/release steps;
- encode product-specific assumptions.

### 3. Layered Architecture

The package follows one-way dependencies:

1. `core/`

- state and invariants on Reatom;
- no DOM or framework imports.

2. `interactions/`

- reusable keyboard/pointer intent logic;
- no rendering concerns.

3. `a11y-contracts/`

- APG-oriented role and aria contracts;
- focus and selection semantics.

4. `adapters/`

- thin mapping to presentation layers;
- no business logic.

`core` does not depend on `adapters`, concrete app code, or design system code.

### 4. Public API

Stable API shape:

- `createX(options)`;
- `state` and `selectors`;
- `actions` and `api` (or `contracts` for grouped prop getters);
- `get*Props()`.

#### API Terminology Mapping

To ensure consistency across components, we use the following canonical mapping:

- **State**: Raw reactive signals (Reatom atoms).
- **Selectors**: Computed derivations of state (Reatom computed).
- **Actions**: Methods that mutate state or trigger side effects.
- **Contracts / API**: Grouped prop getters (`get*Props`) that return ARIA-compliant attribute sets.

#### Selectors Guidance

Selectors MUST be used for any derived state logic to ensure:
1. Components only re-render when the specific derived value changes.
2. Business logic is decoupled from the raw state structure.
3. Complex calculations are memoized via Reatom's `computed`.

Example:
- `createListbox(options) -> { state, selectors, actions, getRootProps, getOptionProps }`.

### 5. State Runtime Policy

- **MUST**: Reatom v1000.
- **MUST NOT**: `@statx/*` in headless core.

### 6. Testing and Verification

Implementation strategy:

- TDD (red-green-refactor);
- unit tests for transitions, invariants, and contracts;
- integration tests for adapter behavior;
- agent-executed QA scenarios for keyboard and focus flows.

Additional rule:

- standalone test execution (outside monorepo coupling) is mandatory.

### 7. Component Packaging Convention

For every headless component:

- use a dedicated directory: `src/<component>/`;
- expose a component entrypoint: `src/<component>/index.ts`;
- keep unit tests near component code: `src/<component>/<component>.test.ts`;
- add a component spec file: `specs/components/<component>.md`.

## Alternatives

### A. Keep the package fully internal in this monorepo

**Rejected**:

- conflicts with independent/public package goals;
- increases risk of hidden internal coupling.

### B. Build as monorepo-only first, split later

**Rejected**:

- split migration is expensive and often breaks API;
- increases architecture debt.

### C. Mix headless logic into current UI modules

**Rejected**:

- breaks package independence;
- reduces reuse outside current product boundaries.

## Consequences

### Positive

- portable package reusable outside this repository;
- release lifecycle independent from monorepo cadence;
- architecture decisions are not constrained by one internal system;
- better fit for public distribution.

### Negative

- additional sync overhead between mirror and git-shard;
- separate CI/CD and release governance required;
- local development requires strict import-boundary discipline.

## Comprehensive Implementation Roadmap

This section is the execution blueprint for component delivery, test hardening,
and release readiness. It is intentionally explicit to reduce architectural drift.

Issue-ready decomposition is maintained in:

- [ISSUE-BACKLOG.md](./ISSUE-BACKLOG.md)

### Program-Level Principles

1. Build in vertical slices (`state -> interactions -> a11y contracts -> tests -> docs`).
2. Do not introduce shared abstractions before at least two components need them.
3. Keep APG behavior contracts as first-class public API.
4. Every behavior change requires test updates in the same change set.
5. Release only from git-shard after all package gates pass.

### Workstreams

- **Component Workstream**: component directories, component APIs, specs.
- **Testing Workstream**: unit/contract/integration tests and regression suites.
- **Tooling Workstream**: lint, boundary checks, CI jobs, release automation.
- **Documentation Workstream**: ADR updates, component specs, migration notes.

### Delivery Waves

| Wave | Scope               | Primary Output                                                     | Exit Criteria                                            |
| ---- | ------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| 0    | Foundation Baseline | standalone package skeleton + guardrails                           | lint/test/boundary gates are green                       |
| 1    | Listbox Hardening   | production-ready listbox contract                                  | APG key behavior and advanced tests complete             |
| 2    | Shared Primitives   | reusable interaction helpers extracted from listbox/combobox needs | at least 2 consumers use each extracted primitive        |
| 3    | Combobox            | APG combobox headless contract                                     | keyboard + filtering + active-descendant contract stable |
| 4    | Menu                | menu button + menu contract                                        | open/close/nav/dismiss behavior stable                   |
| 5    | Tabs                | tabs + tabpanel contract                                           | manual and automatic activation modes verified           |
| 6    | Treeview            | hierarchical navigation contract                                   | expansion and structural ARIA invariants verified        |
| 7    | Release Readiness   | first public stable release line                                   | SemVer/deprecation/release process validated end-to-end  |

### Wave 0: Foundation Baseline

**Status**: complete

Deliverables:

- package skeleton with layered directories
- package-local lint, prettier, boundary checks
- dedicated CI workflow for headless paths
- ADR-001..ADR-004 baseline architecture docs

Completion notes:

- git-shard mirror automation policy documented in `specs/ops/git-shard-sync.md`
- shard release checklist documented in `specs/ops/release-checklist.md`

### Wave 1: Listbox Hardening

Deliverables:

- finalize `createListbox` behavior contract
- add missing APG-compliant interactions:
  - typeahead (single char + buffered sequence)
  - optional range selection (`Shift+Arrow`, `Shift+Space`) in multi-select mode
  - orientation parity and edge-case handling
- finalize `specs/components/listbox.md`

Required test matrix additions:

- typeahead buffer lifecycle and matching order
- range selection semantics and invariant checks
- horizontal keyboard map parity
- disabled-option behavior for all interaction paths
- focus strategy parity (`roving-tabindex` vs `aria-activedescendant`)

Exit criteria:

- listbox test suite covers all APG-required core behavior for supported modes
- no TODO/FIXME placeholders in listbox contract docs

### Wave 2: Shared Primitives Extraction

Scope:

- extract only proven shared logic from completed components
- no speculative utility modules

Candidate primitives:

- keyboard intent mapping
- typeahead engine
- roving index and active-descendant bookkeeping
- selection reducers (single/multi/range)

Exit criteria:

- each primitive has at least two component consumers
- each primitive has direct unit tests and contract-level tests via components

### Wave 3: Combobox

Target files:

- `src/combobox/index.ts`
- `src/combobox/combobox.test.ts`
- `specs/components/combobox.md`

Core behaviors:

- controlled/uncontrolled input value contract
- popup open/close semantics
- active option tracking via `aria-activedescendant`
- option commit behavior (`Enter`, click, selection actions)

Tests:

- keyboard navigation across input and listbox states
- input filtering hooks contract
- aria linkage integrity (`aria-controls`, `aria-activedescendant`)
- disabled and empty-result states

Exit criteria:

- combobox behavior is APG-aligned for supported mode
- filtering and commit behavior are deterministic and documented

### Wave 4: Menu

Target files:

- `src/menu/index.ts`
- `src/menu/menu.test.ts`
- `specs/components/menu.md`

Core behaviors:

- trigger-open-close model
- arrow navigation and wrapping policy
- dismissal semantics (`Escape`, outside interactions)

Tests:

- open source (keyboard vs pointer) behavior
- focus return policy on close
- disabled item and activation rules

Exit criteria:

- deterministic menu lifecycle and key contract across supported modes

### Wave 5: Tabs

Target files:

- `src/tabs/index.ts`
- `src/tabs/tabs.test.ts`
- `specs/components/tabs.md`

Core behaviors:

- manual vs automatic activation modes
- orientation-aware key navigation
- tab/panel relationship contracts

Tests:

- activation mode deltas
- disabled tab traversal
- role/aria linkage contract assertions

Exit criteria:

- tabs behavior contract documented and stable for both activation modes

### Wave 6: Treeview

Target files:

- `src/treeview/index.ts`
- `src/treeview/treeview.test.ts`
- `specs/components/treeview.md`

Core behaviors:

- hierarchical expansion/collapse semantics
- visible-node focus traversal
- optional multi-select behavior model

Tests:

- structural ARIA metadata (`aria-level`, `aria-posinset`, `aria-setsize`)
- expansion keyboard behavior (`ArrowLeft`, `ArrowRight`)
- selected/focused node invariants under collapse

Exit criteria:

- tree behavior is deterministic and APG-compliant for supported subset

### Wave 7: Release Readiness and Stabilization

Scope:

- API freeze candidate and release candidate process
- SemVer and deprecation process dry-run
- shard-only release pipeline validation

Deliverables:

- release checklist in shard
- migration notes for any pre-1.0 breaking cleanup
- first stable tag candidate strategy

Exit criteria:

- full release drill succeeds from git-shard with no monorepo coupling

### Testing Roadmap by Layer

1. **State Tests**: transitions, invariants, reducer-like behavior.
2. **Interaction Tests**: keyboard intent mapping and edge key sequences.
3. **A11y Contract Tests**: exact role/aria/tabindex prop contracts.
4. **Integration Tests**: component-level behavior with realistic option sets.
5. **Regression Tests**: one test per fixed bug before closure.

### Definition of Done (Per Component)

1. Component code in `src/<component>/`.
2. Component spec in `specs/components/<component>.md`.
3. Export wired in `src/index.ts`.
4. Full test matrix for supported behavior.
5. `npm run lint -w packages/headless` is green.
6. `npm run test -w packages/headless` is green.
7. Boundary check remains green.

### Prioritized Execution Order

1. Listbox hardening
2. Combobox
3. Menu
4. Tabs
5. Treeview

This order maximizes reuse of interaction primitives while minimizing rework.

### Risk Register and Mitigations

- **Risk**: over-abstraction too early.
  - **Mitigation**: extract shared primitives only after two concrete consumers.
- **Risk**: APG drift between components.
  - **Mitigation**: enforce ADR-004 invariants + contract tests.
- **Risk**: hidden monorepo coupling.
  - **Mitigation**: keep boundary script mandatory in CI and release gates.
- **Risk**: behavior-breaking changes slip into minor releases.
  - **Mitigation**: enforce ADR-003 release classification checklist.

## Change History

| Date       | Change                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| 2026-02-08 | Initial draft created (r1)                                                                           |
| 2026-02-08 | Reframed as standalone package with git-shard ownership (r2)                                         |
| 2026-02-08 | Rewritten to full English and aligned with current conventions (r3)                                  |
| 2026-02-08 | Expanded with a comprehensive multi-wave roadmap, test matrix, exit criteria, and risk register (r4) |
| 2026-02-08 | Added issue-ready backlog linkage and execution decomposition (r5)                                   |
| 2026-02-08 | Marked ADR as accepted and synced Wave 0 completion details to current implementation state (r6)     |
