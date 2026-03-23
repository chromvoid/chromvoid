# Git-Shard Sync Operations Guide

## Purpose

This document defines the operational sync flow between:

- monorepo mirror: `packages/headless`
- canonical public repository: git-shard

It implements `HLS-001` and supports ADR-001/ADR-002.

## Source of Truth

- git-shard is the canonical source for tags, release history, and package publication.
- monorepo is a development mirror used for local integration and fast iteration.

## Sync Directions

## 1) Outbound Sync (mirror -> shard)

Use this when changes were developed inside monorepo and must be promoted to canonical shard.

### Preconditions

1. changes are limited to `packages/headless/**`
2. local checks pass:
   - `npm run lint -w packages/headless`
   - `npm run test -w packages/headless`
3. boundary check is green

### Procedure

1. create a dedicated sync branch in git-shard:
   - naming: `sync/mono-YYYYMMDD-<topic>`
2. copy/sync files from mirror into shard working tree
3. run shard-local checks:
   - lint
   - test
4. open PR in shard with title prefix: `sync(mirror): ...`
5. merge only after CI is green

### Required Evidence in PR

- list of synced files
- lint/test outputs
- statement confirming no monorepo-internal imports

## 2) Inbound Sync (shard -> mirror)

Use this after shard releases or direct shard-first development.

### Preconditions

1. identify source tag/commit in shard
2. confirm shard CI is green for that state

### Procedure

1. create monorepo branch:
   - naming: `sync/shard-YYYYMMDD-<tag-or-topic>`
2. copy/sync shard files into `packages/headless`
3. run mirror checks:
   - `npm run lint -w packages/headless`
   - `npm run test -w packages/headless`
4. open monorepo PR with title prefix: `sync(shard): ...`
5. merge after CI is green

### Required Evidence in PR

- shard commit/tag reference
- changed file list
- local validation outputs

## Conflict Resolution Rules

When mirror and shard diverge:

1. prefer shard behavior for released contracts
2. prefer newer docs if they are contract-compatible
3. if behavior differs and contract impact is unclear:
   - stop merge
   - create reconciliation issue
   - resolve before sync merge

## Branch and Tag Handling

- release tags (`vX.Y.Z`) are created only in shard
- mirror must not create package release tags for `headless`
- mirror sync PRs must reference source shard tag when applicable

## Emergency Rules

If a critical bugfix is required:

1. patch in shard first
2. release from shard
3. back-sync to mirror immediately

## Operational Checklist (Quick)

Before any sync merge:

- [ ] scope limited to `packages/headless/**`
- [ ] lint/test checks are green
- [ ] no forbidden imports
- [ ] source and destination references documented
- [ ] PR title uses `sync(mirror)` or `sync(shard)` prefix
