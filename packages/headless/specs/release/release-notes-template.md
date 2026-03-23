# Release Notes Template

## Metadata

- Package: `@chromvoid/headless-ui`
- Version: `vX.Y.Z`
- Date: `YYYY-MM-DD`
- SemVer: `patch|minor|major`
- ADR-003 classification rationale: `<short rationale>`

## Summary

- `<1-3 bullets explaining user-visible outcome>`

## Component Changes

### APG Surface

- `<component>: <change>`

### MVP-next Surface

- `select`: `<change>`
- `popover`: `<change>`
- `context-menu`: `<change>`
- `command-palette`: `<change>`
- `toast`: `<change>`
- `progress`: `<change>`

## Contract Hardening

- Keyboard behavior: `<what changed / validated>`
- Focus and dismiss behavior: `<what changed / validated>`
- ARIA and prop contracts: `<what changed / validated>`
- Adapter integration guarantees: `<what changed / validated>`

## Gate Evidence

- `npm run lint` -> `<pass|fail|blocked (with reason)>`
- `npm run test` -> `<pass|fail|blocked (with reason)>`
- `npm run lint:boundaries` -> `<pass|fail>`
- `npm run lint:release-governance` -> `<pass|skip-local|fail>`
- `npm pack --dry-run` -> `<pass|fail>`

References:

- `specs/release/changelog.generated.md`
- `specs/release/release-rehearsal.md`
- `specs/release/consumer-integration.md`

## Breaking Changes

- `<none|list of breaking changes>`

## Migration Notes

- `<none|path to migration notes and required consumer actions>`

## Manual Overrides

- `<document any manual edit done after changelog generation>`
