# ADR-003: Public API Versioning and Evolution Policy

> **Status**: Draft
> **Version**: 2026-02-08-r3
> **Date**: 2026-02-08
> **Authors**: Team ChromVoid
> **Related Documents**:
>
> - [ADR-001-headless-architecture](./ADR-001-headless-architecture.md) - API baseline
> - [ADR-002-repo-release-model](./ADR-002-repo-release-model.md) - release ownership

## Context

The package is distributed as an independent public library.
Its API must evolve predictably for external consumers and remain stable across internal refactors.

## Problem

Without a formal policy:

- safe vs breaking changes are inconsistently classified;
- deprecation becomes ad-hoc;
- consumers cannot plan upgrades confidently.

## Goals

1. Define SemVer policy.
2. Define what counts as public API.
3. Define a required deprecation flow.
4. Make breaking changes explicit and planned.

## Non-Goals

- Changelog template details.
- Release cadence policy.

## Decision

### 1. Public API Definition

Public API includes only items exported from package root exports (`.`):

- `createX` factories;
- documented `actions`, `selectors`, and `state` contracts;
- `get*Props` accessibility contracts;
- documented public types.

Anything not exported from root entrypoint is private implementation detail.

### 2. SemVer Rules

Pre-v1 policy (`0.x`):

- `PATCH`: bug fix with no intentional contract reshape.
- `MINOR`: additions and allowed contract redesign when it improves consumer DX.
- all intentional breaking changes in `0.x` MUST include explicit migration notes.

Post-v1 policy (`>=1.0.0`):

- `PATCH`: bug fix with no public API contract change.
- `MINOR`: backward-compatible additions.
- `MAJOR`: any breaking runtime, type-level, or behavior-contract change.

### 3. Deprecation Rules

For each public API scheduled for removal:

1. add `@deprecated` annotation in types and docs;
2. publish release notes with migration path;
3. keep at least one `MINOR` release cycle before removal;
4. remove only in the next `MAJOR` release.

Pre-v1 exception (`0.x`):

- if rapid API redesign is needed for better consumer ergonomics, hard deprecation cycles may be shortened,
  but migration notes are still mandatory.

### 4. Behavior Compatibility

Breaking change includes behavior contracts, not only signatures:

- keyboard semantics;
- focus and selection invariants;
- ARIA contract shape.

Any incompatible APG contract change requires `MAJOR`.

### 5. Release Classification Checklist

Before release, classify each change across:

1. API shape (`createX`, options, return contracts)
2. Type compatibility
3. Behavior compatibility (APG, focus, keyboard)
4. Migration requirements

For post-v1 releases, if at least one item is incompatible, release must be `MAJOR`.

For pre-v1 releases, incompatible changes are allowed in `MINOR`, but require migration notes and explicit release annotation.

## Alternatives

### A. Informal versioning only

**Rejected**:

- unpredictable for consumers;
- high risk of accidental breaking releases.

### B. Freeze API until 1.0

**Rejected**:

- blocks practical evolution;
- does not fit early contract formation stage.

## Consequences

### Positive

- clearer upgrade expectations;
- fewer consumer regressions;
- better external ecosystem trust.

### Negative

- stricter release review discipline required;
- more documentation overhead for deprecations.

## Change History

| Date       | Change                                                                       |
| ---------- | ---------------------------------------------------------------------------- |
| 2026-02-08 | Initial draft created (r1)                                                   |
| 2026-02-08 | Rewritten to full English and clarified release checklist (r2)               |
| 2026-02-08 | Added pre-v1 DX-first versioning policy and migration-note requirements (r3) |
