# ADR-002: Repository and Release Model for the Headless Package

> **Status**: Draft
> **Version**: 2026-02-08-r2
> **Date**: 2026-02-08
> **Authors**: Team ChromVoid
> **Related Documents**:
>
> - [ADR-001-headless-architecture](./ADR-001-headless-architecture.md) - architectural independence baseline

## Context

`packages/headless` is developed in the monorepo for local integration convenience.
The package must still be published as an independent public package from a separate git-shard repository.

Without a clear model, mirror and shard will drift, and releases will become hard to reproduce.

## Problem

We need a formal source-of-truth and release flow that answers:

- where canonical history lives;
- where npm publishing happens;
- how changes sync between mirror and shard;
- how to prevent accidental releases from monorepo.

## Goals

1. Set git-shard as the only canonical source.
2. Define release flow from git-shard only.
3. Define sync rules between monorepo mirror and shard.
4. Reduce drift and accidental release risk.

## Non-Goals

- Hosting-specific CI/CD details.
- Full sync automation in this ADR.
- Governance for unrelated monorepo packages.

## Decision

### 1. Source of Truth

1. Public git-shard repository is the single canonical source for `headless`.
2. `packages/headless` in monorepo is mirror-only development workspace.

### 2. Release Ownership

1. `npm publish` runs only from git-shard.
2. Release tags (`vX.Y.Z`) are created only in git-shard.
3. Monorepo release of this package is forbidden.

### 3. Sync Model

- `monorepo -> shard`: allowed for feature work and integration-driven changes.
- `shard -> monorepo`: required after every release and architecture-level change.

MUST:

- keep public API equivalent between mirror and shard;
- sync ADR/spec updates in both directions;
- run boundary, lint, and test checks before sync.

### 4. Minimal Release Gate (in git-shard)

Before release:

1. run `lint` (types + oxlint + prettier + boundaries);
2. run package tests;
3. update changelog;
4. bump version according to SemVer;
5. create release tag and release notes.

## Alternatives

### A. Release directly from monorepo

**Rejected**:

- breaks independent package model;
- increases risk of leaking internal dependencies.

### B. Keep only git-shard and remove monorepo mirror

**Rejected**:

- hurts local integration workflow;
- increases collaboration friction with product development.

## Consequences

### Positive

- clear release ownership;
- reproducible publication flow;
- lower risk of accidental monorepo coupling.

### Negative

- ongoing sync overhead;
- additional operational governance for changelog, tagging, and release discipline.

## Change History

| Date       | Change                                                 |
| ---------- | ------------------------------------------------------ |
| 2026-02-08 | Initial draft created (r1)                             |
| 2026-02-08 | Rewritten to full English and terminology cleanup (r2) |
