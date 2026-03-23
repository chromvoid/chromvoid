# Gap-to-Green Issue Pack

## Purpose

This file provides issue-ready tickets for the remaining work before stable release sign-off.

## How to Use

- copy each issue into tracker as a standalone task
- keep scope limited to `packages/headless/**` unless issue says otherwise
- require evidence links for CI runs and docs updates

Common labels:

- `headless`
- `release`
- `governance`
- `tests`
- `docs`
- `ci`

## HLS-GTG-001 - Enforce ADR-003 classification in release PRs

- **Status**: Open
- **Priority**: High
- **Labels**: `headless`, `release`, `governance`, `ci`
- **Scope**: add an automated gate that validates SemVer classification in release PR metadata
- **Deliverables**:
  - release-governance check script in `packages/headless/scripts/`
  - CI workflow job that runs the check for release PR context
- **Acceptance Criteria**:
  - release PR without explicit SemVer classification fails CI
  - supported values are `patch`, `minor`, `major`
  - non-release PRs are not blocked by this check

## HLS-GTG-002 - Enforce migration notes policy on behavior-breaking changes

- **Status**: Open
- **Priority**: High
- **Labels**: `headless`, `release`, `governance`, `docs`
- **Scope**: require migration-note evidence when release PR declares breaking behavior/API change
- **Deliverables**:
  - governance check updated with migration-note requirement
  - release checklist wording aligned to automation
- **Acceptance Criteria**:
  - release PR classified as `major` fails if migration note reference is absent
  - release PR classified as `major` fails if migration notes file is not changed
  - check output includes actionable failure reason

## HLS-GTG-003 - Add adapter integration test coverage

- **Status**: Open
- **Priority**: High
- **Labels**: `headless`, `tests`, `a11y`
- **Scope**: add component-level integration tests validating adapter-style bindings for keyboard/pointer flows
- **Deliverables**:
  - adapter integration tests under `packages/headless/src/adapters/`
- **Acceptance Criteria**:
  - tests validate `model -> bindings -> events -> state` flow
  - tests cover keyboard and pointer paths
  - tests run in existing `npm run test -w packages/headless`

## HLS-GTG-004 - Finalize docs for multi-component reality and ADR status

- **Status**: Open
- **Priority**: Medium
- **Labels**: `headless`, `docs`
- **Scope**: align README and ADR-001 metadata with implemented state of package
- **Deliverables**:
  - `packages/headless/README.md` updated with all implemented components and structure
  - `packages/headless/specs/ADR-001-headless-architecture.md` status/version update
- **Acceptance Criteria**:
  - README no longer describes listbox as the only current example
  - ADR-001 status reflects accepted architecture baseline
  - docs remain consistent with current source tree

## HLS-GTG-005 - Add monorepo CI guard for headless package gates

- **Status**: Open
- **Priority**: High
- **Labels**: `headless`, `ci`, `release`
- **Scope**: add root CI job that runs package-specific lint and tests for `packages/headless`
- **Deliverables**:
  - root workflow update with headless package job
- **Acceptance Criteria**:
  - root CI executes `npm run lint -w packages/headless`
  - root CI executes `npm run test -w packages/headless`
  - failures block merge
