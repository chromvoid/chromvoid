# Headless Release Checklist (Git-Shard)

## Purpose

This checklist is mandatory for shard releases and implements `HLS-002`.

It enforces ADR-002 (release ownership) and ADR-003 (versioning/deprecation policy).

## Inputs

- target release version
- release branch/PR
- changelog draft
- list of included issues/PRs

## 1) Scope and Source Verification

- [ ] release branch is in git-shard (not monorepo mirror)
- [ ] release scope is limited to package-owned files
- [ ] all sync references are documented (if changes originated in mirror)

## 2) Quality Gates

- [ ] `npm run lint` passes in shard
- [ ] `npm run test` passes in shard
- [ ] boundary checks pass (no forbidden imports)
- [ ] no unresolved TODO/FIXME in contract-critical files

## 3) SemVer Classification (ADR-003)

- [ ] classify release as `patch`, `minor`, or `major`
- [ ] release PR body includes `SemVer: patch|minor|major`
- [ ] classification includes runtime API impact
- [ ] classification includes type-level API impact
- [ ] classification includes behavior-contract impact (keyboard/focus/a11y)

Decision log:

- Selected version type:
- Rationale:

## 4) Deprecation Review (ADR-003)

- [ ] all newly deprecated APIs are marked with `@deprecated`
- [ ] replacement paths are documented
- [ ] deprecation timeline is explicit
- [ ] no removal happens before required deprecation cycle
- [ ] for `major` releases, PR body includes `Migration Notes: <path or link>`
- [ ] for `major` releases, `specs/release/migration-notes-pre-v1.md` is updated in the same PR

## 5) Documentation and Changelog

- [ ] changelog updated
- [ ] release notes include user-visible changes
- [ ] breaking changes section present if applicable
- [ ] migration notes included for incompatible changes

## 6) Tag and Publish Preparation

- [ ] target version in package manifest is correct
- [ ] release tag format is `vX.Y.Z`
- [ ] release commit is finalized and reviewed
- [ ] package contents are validated before publish

## 7) Publish and Post-Release

- [ ] publish completed from git-shard only
- [ ] tag pushed and release notes published
- [ ] post-release sync back to monorepo mirror created/tracked

## Sign-off

- Release owner:
- Reviewer:
- Date:
- Result: Approved / Blocked
