# Command Palette Component Contract

## Purpose

`Command Palette` provides a headless dialog + searchable command list model for quick command execution.

## Component Files

- `src/command-palette/index.ts` - model and public `createCommandPalette` API
- `src/command-palette/command-palette.test.ts` - unit behavior tests

## Public API

- `createCommandPalette(options)`
- `state` (signal-backed):
  - `isOpen()` - dialog visibility
  - `inputValue()` - current search input
  - `activeId()` - active command id
  - `selectedId()` - last selected command id from combobox
  - `lastExecutedId()` - last executed command id
  - `restoreTargetId()` - trigger restore target after close
- `actions`:
  - `open`, `close`, `toggle`
  - `execute(id)`
  - `setInputValue(value)`
  - `handleGlobalKeyDown`
  - `handlePaletteKeyDown`
  - `handleOutsidePointer`
- `contracts`:
  - `getTriggerProps()`
  - `getDialogProps()`
  - `getInputProps()`
  - `getListboxProps()`
  - `getOptionProps(id)`
  - `getVisibleCommands()`

## APG and A11y Contract

- trigger role: `button`
- trigger attributes:
  - `aria-haspopup="dialog"`
  - `aria-expanded`
  - `aria-controls`
- dialog role: `dialog`
- dialog attributes:
  - `aria-modal="true"`
  - `aria-label`
  - `hidden`
- command list and options inherit combobox/listbox/option contracts.

## Keyboard Contract

- global shortcut: `Ctrl/Cmd + <openShortcutKey>` toggles palette
- palette `Escape`: closes palette
- palette `Enter` / `Space`: executes active command (fallback to first enabled visible command)
- arrow/home/end/typeahead behaviors are delegated to combobox keyboard contract

## Behavior Contract

- `Command Palette` composes `createCombobox` as the searchable command list engine.
- `execute` validates command id, updates `lastExecutedId`, and calls `onExecute`.
- `closeOnExecute` controls close vs keep-open behavior after execution.
- outside pointer close behavior is configurable.

## Invariants

- `lastExecutedId` updates only for known command ids.
- `restoreTargetId` is set on close paths.
- dialog `aria-expanded` and hidden state remain synchronized with `isOpen`.
- contract option click and keyboard execute paths must call the same execute flow.

## Minimum Test Matrix

- global shortcut toggle behavior
- dialog role and escape close contract
- execute-on-enter behavior with callback and `lastExecutedId` state
- keep-open execution mode (`closeOnExecute=false`)
- outside pointer close policy behavior

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- async command providers
- fuzzy scoring/ranking customization
- command groups/sections and breadcrumbs
- history and recent-command persistence
