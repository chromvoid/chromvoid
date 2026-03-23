# Treeview Component Contract

## Purpose

`Treeview` provides a headless APG-aligned model for hierarchical navigation,
expansion state, focus management, and selection behavior.

## Component Files

- `src/treeview/index.ts` - model and public `createTreeview` API
- `src/treeview/treeview.test.ts` - unit behavior tests

## Public API

- `createTreeview(options)`
- `state` (signal-backed): `activeId()`, `selectedIds()`, `expandedIds()`
- `actions`:
  - focus: `setActive(id)` — programmatically set focus to a specific enabled visible node (or null to clear)
  - navigation: `moveNext`, `movePrev`, `moveFirst`, `moveLast` — advance focus through the visible enabled node list; in single-select mode each call also moves selection to the newly focused node
  - expansion: `expand`, `collapse`, `toggleExpanded`, `expandActive`, `collapseActive`
  - selection: `select`, `toggleSelected`, `clearSelected`
  - keyboard: `handleKeyDown` — dispatches navigation, expansion, and selection intents from keyboard events; ArrowUp/Down/Home/End trigger navigation (and selection-follows-focus in single-select mode); ArrowRight/Left trigger expansion/collapse or parent navigation; Space triggers `toggleSelected`; Enter triggers `select`; Ctrl/Cmd+A triggers select-all in multiple mode
- `contracts`:
  - `getTreeProps()`
  - `getItemProps(id)`
  - `getVisibleNodeIds()`

## APG and A11y Contract

- tree role: `tree`
- node role: `treeitem`
- node metadata:
  - `aria-level`
  - `aria-posinset`
  - `aria-setsize`
- branch metadata:
  - `aria-expanded`
- selection metadata:
  - `aria-selected`
- disabled metadata:
  - `aria-disabled`

## Keyboard Contract

- `ArrowUp` / `ArrowDown`: visible-node traversal; in single-select mode also moves selection to the newly focused enabled node
- `Home` / `End`: first/last visible node; in single-select mode also moves selection to the newly focused enabled node
- `ArrowRight`:
  - expands collapsed branch
  - moves to first child when already expanded
- `ArrowLeft`:
  - collapses expanded branch
  - moves to parent when already collapsed
- `Enter`: select active node (both modes)
- `Space`: toggle selection on active node (both modes; in multiple mode, focus and selection are independent)
- `Ctrl/Cmd + A` in multiple mode: select all enabled nodes

## Selection-Follows-Focus (Single-Select Mode)

In single-select mode (`selectionMode: 'single'`), selection follows focus for navigation actions. When `moveNext`, `movePrev`, `moveFirst`, or `moveLast` moves focus to a new enabled visible node, `selectedIds` is simultaneously updated to contain only that node's id. This is the APG-recommended roving-tabindex pattern for single-select trees.

In multiple-select mode (`selectionMode: 'multiple'`), focus and selection remain independent. Navigation actions only update `activeId`; selection changes require explicit `Space`, `Enter`, or `Ctrl/Cmd+A` interactions.

## Selection and Collapse Invariants

- `activeId` is always `null` or an enabled visible node id
- in single-select mode, after any navigation action (`moveNext`, `movePrev`, `moveFirst`, `moveLast`) that moves focus to a new node, `selectedIds` equals `[newActiveId]`
- collapsing a branch while focus is inside descendants moves focus to the collapsed parent
- selected descendants remain selected after collapse unless explicitly changed
- disabled nodes cannot become selected through actions

## Minimum Test Matrix

- deterministic visible traversal from expansion state
- Arrow traversal with expand/collapse transitions
- structural ARIA metadata coverage
- multi-select behavior including select-all shortcut
- focus and selection invariants under collapse

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- async/lazy node loading
- drag-and-drop reordering
- checkbox/radio treeitem variants
- typeahead across visible nodes
