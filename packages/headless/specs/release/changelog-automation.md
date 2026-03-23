# Changelog Automation Workflow (HLS-162)

## Purpose

Define repeatable changelog generation for release preparation using backlog/status evidence.

## Inputs

- `specs/ISSUE-BACKLOG.md`
- `RELEASE_DATE` (`YYYY-MM-DD`)
- optional `CHANGELOG_ISSUES` for patch mode (`HLS-161,HLS-162`)

## Commands

Run from `packages/headless`.

### Full Release Mode

```bash
RELEASE_DATE=2026-02-10 npm run release:changelog
```

Output:

- `specs/release/changelog.generated.md`

Behavior:

- includes done issues from release-focused range (`HLS-150+`)
- includes MVP-next tranche table (`HLS-150`..`HLS-155`)
- records gate-evidence references

### Patch Release Mode

```bash
RELEASE_DATE=2026-02-10 CHANGELOG_ISSUES=HLS-161 npm run release:changelog:patch
```

Output:

- `specs/release/changelog.patch.generated.md`

Behavior:

- includes only explicitly requested issue ids
- still keeps MVP-next tranche visibility for release context consistency

## Determinism Rules

- `RELEASE_DATE` is required to avoid time-dependent output drift.
- patch mode requires explicit issue list (`CHANGELOG_ISSUES` or `--issues`).
- output ordering is deterministic by numeric issue id.

## Release Notes Assembly

1. Generate changelog (full or patch mode).
2. Copy/fill `specs/release/release-notes-template.md`.
3. Transfer relevant lines from generated changelog into release notes.
4. Attach gate evidence from `specs/release/release-rehearsal.md`.
5. For breaking changes, link `specs/release/migration-notes-pre-v1.md`.

## Manual Override and Edit Workflow

Use this when generated output needs human adjustments for final publication.

1. Edit only `## Manual Overrides` block in generated changelog first.
2. Record what changed and why (for example: issue title normalization, grouping changes).
3. Keep `## Source Evidence` and `## Included Issues` sections intact unless source docs were updated.
4. If source docs changed, regenerate changelog and re-apply minimal overrides.
5. Reflect final override decisions in `specs/release/release-notes-template.md` output.

## Failure Handling

- If generator fails due to missing issue ids, fix issue list and re-run.
- If backlog is inconsistent, update `specs/ISSUE-BACKLOG.md` first, then regenerate.
- If generated file is manually edited, run prettier check before publishing.
