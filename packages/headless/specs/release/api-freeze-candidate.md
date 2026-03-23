# API Freeze Candidate (Pre-v1)

## Purpose

This document is the `HLS-070` API freeze candidate result.

It captures the current freeze scope, contract confidence level,
and pre-stable cleanup requirements before first stable release.

## Candidate Scope

Included components:

- Listbox
- Combobox
- Menu
- Tabs
- Treeview

Included shared primitives:

- keyboard intents
- typeahead
- selection reducers

## Freeze Criteria Checklist

- [x] each component has dedicated source directory and spec document
- [x] each component contract has unit tests
- [x] boundary checks prevent monorepo-only imports
- [x] package-level lint/test gates are green
- [x] SemVer/deprecation process documented (ADR-003)
- [x] release ownership documented (ADR-002)

## Contract Stability Assessment

Current status: **freeze-candidate (not final freeze)**

Rationale:

- behavior contracts are implemented and tested for current APG subset
- public API is coherent across components (`createX`, state/actions, `get*Props`)
- release governance documents now exist

Outstanding pre-stable items:

1. run shard-only release drill and close follow-ups
2. finalize release notes format and changelog protocol in shard workflow
3. validate migration docs against first external consumer integration

## Recommended Freeze Decision

- Freeze candidate accepted for release rehearsal.
- Final freeze approval deferred until `HLS-072` follow-ups are resolved.
