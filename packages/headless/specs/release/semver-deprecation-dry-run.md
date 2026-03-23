# SemVer and Deprecation Dry-Run Review

## Purpose

This document is the `HLS-071` release review record.

It validates ADR-003 classification rules with concrete examples
and confirms deprecation workflow correctness.

## Dry-Run Inputs

Reference contracts:

- `createListbox`
- `createCombobox`
- `createMenu`
- `createTabs`
- `createTreeview`

Reference policy:

- ADR-003 (public API versioning and deprecation)

## SemVer Classification Scenarios

## Scenario A - Patch

Change:

- fix disabled-item skip bug in menu navigation
- no API or behavior contract change beyond intended spec

Classification:

- `PATCH`

Reason:

- behavior aligns with existing documented contract

## Scenario B - Minor

Change:

- add optional `closeOnSelect` flag in menu options (default preserves behavior)

Classification:

- `MINOR`

Reason:

- backward-compatible API addition

## Scenario C - Major

Change:

- change tabs manual activation so Arrow navigation auto-selects tab

Classification:

- `MAJOR`

Reason:

- behavior-contract break for manual mode semantics

## Deprecation Flow Validation

Validation checklist:

- [x] deprecation requires `@deprecated` marker in public types/docs
- [x] replacement path must be explicit in release notes
- [x] removal cannot happen before deprecation cycle completes
- [x] removal belongs to next major release only

## Sample Deprecation Record (Template)

- Symbol: `createX(...legacyOption)`
- Deprecated in: `v0.Y.0`
- Replacement: `createX(...newOption)`
- Planned removal: `v1.0.0`
- Migration note link: `specs/release/migration-notes-pre-v1.md`

## Outcome

- SemVer classification process is validated for patch/minor/major branches.
- Deprecation process is validated and ready for shard release governance.
