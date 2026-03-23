# Release Rehearsal Runbook (HLS-161)

## Purpose

This document is the `HLS-161` deliverable.

It defines a deterministic dry-run sequence for shard release preparation and records verification evidence for package gates and tarball contents.

## Run Context

- Package: `@chromvoid/headless-ui`
- Working directory: `packages/headless`
- Rehearsal type: local dry-run (no publish)
- Date: 2026-02-10

## Deterministic Command Sequence

Run in `packages/headless`:

1. `npm run lint`
2. `npm run test`
3. `npm run lint:boundaries`
4. `npm run lint:release-governance`
5. `npm pack --dry-run`

Notes:

- Step 4 validates release-governance policy only in GitHub PR context; local runs may skip if `GITHUB_EVENT_PATH` is unavailable.
- Step 5 validates package artifact composition without publishing.

## Rehearsal Evidence Snapshot

### 1) Lint

- Command: `npm run lint`
- Result: Failed
- Evidence:
  - `lint:types` passed
  - `lint:oxlint` passed
  - `lint:prettier` failed with pre-existing formatting issues in 47 files

### 2) Test

- Command: `npm run test`
- Result: Failed
- Evidence:
  - 44 test files passed
  - 1 failing test: `src/meter/meter.test.ts` (`enforces low <= high when low > high by clamping high to low`)

### 3) Boundaries

- Command: `npm run lint:boundaries`
- Result: Passed
- Evidence: `headless-boundaries: OK`

### 4) Release Governance

- Command: `npm run lint:release-governance`
- Result: Skipped in local context
- Evidence: `release-governance: no GITHUB_EVENT_PATH, skipping (local/non-GitHub run)`

### 5) Tarball Packaging

- Command: `npm pack --dry-run`
- Result: Passed
- Evidence:
  - Tarball: `chromvoid-headless-ui-0.0.1.tgz`
  - Total files: 149
  - Package size: 140.9 kB
  - Unpacked size: 762.0 kB

## Tarball Surface Validation

Validated from `npm pack --dry-run` output:

- public entry: `src/index.ts`
- component modules and tests under `src/**`
- release and component specs under `specs/**`
- release artifacts include:
  - `specs/release/consumer-integration.md`
  - `specs/release/mvp-changelog.md`
  - `specs/release/semver-deprecation-dry-run.md`
  - `specs/release/migration-notes-pre-v1.md`

Conclusion:

- package artifact contains the expected public surface documentation and source tree
- no missing docs/exports were detected from artifact listing

## Failure and Rollback Checklist

If any rehearsal step fails:

1. Record failing command and exact error in this runbook.
2. Classify failure as pre-existing or introduced-by-change.
3. If introduced-by-change, revert only the offending changes and re-run the sequence.
4. If pre-existing, do not broaden scope in release PR; open follow-up issue and link evidence.
5. Re-run `npm pack --dry-run` after fixes to confirm artifact integrity.

## Release Readiness Outcome

Current dry-run outcome: **Blocked**

Blocking items before release sign-off:

- pre-existing `prettier --check` failures in repository files
- pre-existing failing test in `src/meter/meter.test.ts`

Non-blocking rehearsal confirmations:

- boundary checks pass
- tarball packaging path is valid and deterministic
- governance check command is wired and executable (CI-context evaluation pending)
