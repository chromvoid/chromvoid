# Migration Notes (Pre-v1)

## Purpose

This document is the `HLS-070` migration notes deliverable.

It defines expected migration guidance for pre-v1 consumers and
the replacement paths for any pre-stable contract changes.

## Current Migration Baseline

No mandatory migration is required for current internal consumers,
because there is no previously published stable public release yet.

## Planned Pre-stable Change Policy

If a contract change is required before v1:

1. mark change in release notes as pre-stable contract update
2. provide before/after API snippets
3. provide exact replacement path
4. update component spec and ADR references in the same change

## Replacement Path Template

Use the following format for each changed symbol:

- Old API:
- New API:
- Why changed:
- Consumer action:
- Version where old API is removed:

## Known Potential Pre-v1 Adjustments

- normalization of optional action naming across components
- optional expansion of keyboard contracts for edge APG shortcuts
- finalization of advanced behavior flags naming

All such changes must keep tests and component specs synchronized.
