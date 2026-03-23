# Accordion Component Contract

## Purpose

`Accordion` is a headless APG-aligned contract for a set of vertically stacked sections that can be expanded or collapsed to reveal or hide content. It manages expansion state, keyboard navigation between headers, and accessibility attributes.

## Component Files

- `src/accordion/index.ts` - model and public `createAccordion` API
- `src/accordion/accordion.test.ts` - unit behavior tests

## Public API

- `createAccordion(options)`
  - `options`:
    - `sections`: `AccordionSection[]` — `{id: string, disabled?: boolean}`
    - `idBase?`: string
    - `allowMultiple?`: boolean (default: `false`)
    - `allowZeroExpanded?`: boolean (default: `true`)
    - `initialExpandedIds?`: string[]
    - `ariaLabel?`: string
    - `headingLevel?`: number (default: `3`, clamped 1–6)
- `state` (signal-backed):
  - `expandedIds()` — set of currently expanded section IDs
  - `focusedId()` — ID of the section header currently holding focus
  - `value()` — first expanded section ID, or `null` (computed)
  - `expandedValues()` — array of expanded section IDs (computed)
  - `sections()` — current sections list (reactive)
  - `allowMultiple()` — current allow-multiple setting (reactive)
  - `allowZeroExpanded()` — current allow-zero-expanded setting (reactive)
  - `headingLevel()` — current heading level 1–6 (reactive)
  - `ariaLabel()` — current aria-label (reactive)
- `actions`:
  - `toggle(id)` — expands or collapses a section
  - `expand(id)` — expands a section
  - `collapse(id)` — collapses a section
  - `setFocused(id)` — sets roving focus to a section
  - `moveNext()` — moves focus to the next header
  - `movePrev()` — moves focus to the previous header
  - `moveFirst()` — moves focus to the first header
  - `moveLast()` — moves focus to the last header
  - `handleKeyDown(event)` — processes keyboard navigation and activation
  - `setSections(sections)` — replaces sections list; enforces expanded invariants
  - `setAllowMultiple(value)` — updates allow-multiple; clamps expanded to first if switching to single
  - `setAllowZeroExpanded(value)` — updates allow-zero-expanded; expands first if none expanded
  - `setHeadingLevel(level)` — updates heading level (clamped 1–6)
  - `setAriaLabel(label)` — updates aria-label
  - `setExpandedIds(ids)` — programmatically sets expanded sections; respects constraints
- `contracts`:
  - `getRootProps()`
  - `getHeaderProps(id)`
  - `getTriggerProps(id)`
  - `getPanelProps(id)`

## APG and A11y Contract

- root role: none (usually a `div` or `dl`)
- header role: none (usually a heading level `h1-h6`)
- trigger role: `button`
- panel role: `region`
- required attributes:
  - trigger: `aria-expanded`, `aria-controls`, `id`, `aria-disabled`
  - panel: `aria-labelledby`, `id`, `role="region"`
- focus management:
  - triggers are in the page tab sequence
  - focus moves between triggers using arrow keys (optional but recommended for large accordions)

## Behavior Contract

- **Single/Multiple Expansion**:
  - if `allowMultiple` is `false`, expanding one section collapses others
  - if `allowMultiple` is `true`, multiple sections can be expanded simultaneously
- **Collapsible**:
  - if `allowZeroExpanded` is `false`, at least one section must remain expanded; clicking an expanded trigger does nothing if it's the only one expanded
- **Keyboard Navigation**:
  - `Enter` or `Space`: toggles the expanded state of the panel associated with the focused trigger
  - `ArrowDown`: moves focus to the next trigger; wraps if configured
  - `ArrowUp`: moves focus to the previous trigger; wraps if configured
  - `Home`: moves focus to the first trigger
  - `End`: moves focus to the last trigger

## Reactive Config Invariants

When config atoms change at runtime, the model enforces invariants:

- `setAllowMultiple(false)` — if multiple sections are expanded, clamps to the first expanded section
- `setAllowZeroExpanded(false)` — if no sections are expanded, expands the first enabled section
- `setSections(...)` — removes expanded IDs that no longer exist in the new sections list; enforces `allowMultiple` and `allowZeroExpanded` constraints after pruning
- `setExpandedIds(...)` — filters out unknown section IDs; clamps to first if `allowMultiple` is false; expands first enabled if `allowZeroExpanded` is false and result is empty

## Invariants

- a disabled section cannot be expanded or collapsed via user interaction
- `expandedIds` must always respect the `allowMultiple` and `allowZeroExpanded` constraints
- `aria-controls` on the trigger must match the `id` of the panel
- `aria-labelledby` on the panel must match the `id` of the trigger

## Minimum Test Matrix

- initialize with specific sections expanded
- toggle expansion on `Enter`/`Space`
- respect `allowMultiple: false` (auto-collapse others)
- respect `allowZeroExpanded: false` (prevent collapsing last expanded)
- navigate between triggers using `ArrowDown`/`ArrowUp`/`Home`/`End`
- skip disabled sections during keyboard navigation
- verify `aria-expanded` and `aria-controls` linkage
- verify `aria-labelledby` linkage
- computed `value()` reflects first expanded ID
- computed `expandedValues()` reflects all expanded IDs
- `setSections` removes stale expanded IDs
- `setSections` respects `allowZeroExpanded` after pruning
- `setAllowMultiple(false)` clamps to first expanded
- `setAllowZeroExpanded(false)` expands first when none expanded
- `setHeadingLevel` clamps to 1–6
- `setAriaLabel` updates `getRootProps()` aria-label
- `setExpandedIds` respects `allowMultiple` and `allowZeroExpanded`
- `setExpandedIds` ignores unknown section IDs

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- nested accordions (recursive state management)
- animation/transition state (handled by visual layer)
- drag-and-drop reordering
