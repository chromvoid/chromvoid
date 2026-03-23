# Consumer Integration Notes (MVP-next)

## Purpose

This document is the `HLS-160` deliverable.

It validates external-consumer ergonomics for MVP-next components using only package-root APIs.

## Scope

Validated composition path:

- `select`
- `popover`
- `command-palette`

Validation target:

- consumer-style adapter bindings (`model -> contracts -> events -> state`)
- keyboard and pointer interaction parity
- package-root import usage only (no private/internal API access)

## Integration Scenario

Reference test:

- `src/adapters/adapters.integration.test.ts`

Covered flow:

1. open and select `select` options through trigger/listbox bindings
2. open and dismiss `popover` through trigger/content bindings
3. execute `command-palette` actions via keyboard shortcut and pointer option click
4. verify cross-component composition where command execution updates `select` and closes `popover`

## External Consumer Trial Checklist

- [x] package-root APIs are sufficient for composition (`createSelect`, `createPopover`, `createCommandPalette`)
- [x] adapter bindings consume only public contracts (`get*Props`) and public actions (`handle*`, `open/close/toggle`, `execute`)
- [x] keyboard paths are covered (`ArrowDown`, `Enter`, global `Cmd/Ctrl+K`, `Escape`)
- [x] pointer paths are covered (trigger click, option click, outside-pointer dismiss)
- [x] composition updates are deterministic across models (`command-palette -> select/popover`)

## Verification

Recommended package-level gates:

- `npm run lint -w packages/headless`
- `npm run test -w packages/headless`

Targeted integration evidence:

- `npm run test -w packages/headless -- src/adapters/adapters.integration.test.ts`
