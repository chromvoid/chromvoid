# MVP Changelog (Pre-v1)

Date: 2026-02-09
Package: `@chromvoid/headless-ui`
Version baseline: `0.0.1`

## Highlights

- APG coverage target completed: all 30 roadmap patterns implemented.
- M12 data-navigation tranche completed: `treegrid`, `feed`, `carousel`, `window-splitter`.
- M13 hardening tranche completed: shared APG contract harness, cross-component regression suite, release-candidate evidence.

## Added Components

Foundational and interaction layers:

- `core`: value-range primitives (`createValueRange`) and selection reducers
- `interactions`: composite navigation and overlay focus primitives

Data and composite widgets (latest tranche):

- `treegrid`
- `feed`
- `carousel`
- `window-splitter`

Full implemented surface at this point (30 patterns) is reflected in:

- `packages/headless/src/index.ts`
- `packages/headless/README.md`

## Testing and APG Hardening

- Shared APG assertions helper added:
  - `src/testing/apg-contract-harness.ts`
- Cross-component APG regression suite added:
  - `src/testing/apg-contracts.regression.test.ts`
- Slider aria-contract coverage expanded:
  - `src/slider/slider.test.ts`

## Quality Gates

Latest package validation:

- `npm run lint -w packages/headless` - passed
- `npm run test -w packages/headless` - passed
- Test count snapshot: 39 files, 248 tests passed

## Release Readiness Evidence

- `specs/RELEASE-CANDIDATE.md`
- `specs/ISSUE-BACKLOG.md` (M13 statuses aligned to Done)

## Known Constraints

- Pre-v1 API remains flexible under ADR-003 rules.
- Visual behavior and DOM rendering strategies remain adapter responsibilities.
