# Headless Issue-Ready Backlog (Next Cycle)

## How to Use

Each item below is designed to be copied into a tracker as a standalone issue.

Common labels:

- `headless`
- `a11y`
- `apg`
- `state`
- `tests`
- `docs`
- `release`

## Common Definition of Done

Applies to all issues unless overridden:

1. Code/docs changed in `packages/headless` only.
2. No forbidden imports (boundary check remains green).
3. `npm run lint -w packages/headless` passes.
4. `npm run test -w packages/headless` passes.
5. Public exports are wired in `packages/headless/src/index.ts`.
6. Component behavior stays aligned with corresponding `specs/components/<component>.md`.

## Backlog Baseline

- Previous backlog cycle (`HLS-001` to `HLS-072`) is complete.
- Implemented components: `listbox`, `combobox`, `menu`, `tabs`, `treeview`.
- This cycle targets APG full-coverage implementation for remaining patterns with reusable primitives and final hardening gates.

## Execution Status Snapshot

- Done: `HLS-080`..`HLS-162`
- In Progress: none
- Next Recommended: none

## Milestone M8 - Shared Foundations

### HLS-080 - Build shared value-range primitive package

- **Status**: Done
- **Milestone**: M8
- **Labels**: `headless`, `architecture`, `state`, `tests`
- **Depends on**: none
- **Scope**: create reusable value-range primitives for slider-like and meter/spinbutton/splitter components
- **Deliverables**:
  - `src/core/value-range.ts` (or equivalent)
  - tests for clamp, step, min/max, large-step behavior
- **Acceptance Criteria**:
  - reusable by slider, slider-multi-thumb, spinbutton, meter, window-splitter
  - no APG behavior regressions in existing components

### HLS-081 - Build shared composite focus-navigation primitive package

- **Status**: Not Started
- **Milestone**: M8
- **Labels**: `headless`, `architecture`, `a11y`, `tests`
- **Depends on**: none
- **Scope**: create reusable roving/active-descendant navigation primitives for composite widgets
- **Deliverables**:
  - `src/interactions/composite-navigation.ts` (or equivalent)
  - tests for next/prev/first/last, orientation, disabled-skip, wrap policy
- **Acceptance Criteria**:
  - reusable by radio-group, toolbar, grid, treegrid
  - keyboard intent handling is deterministic and documented

### HLS-082 - Build shared overlay focus/dismiss primitive package

- **Status**: Not Started
- **Milestone**: M8
- **Labels**: `headless`, `architecture`, `a11y`, `tests`
- **Depends on**: none
- **Scope**: create shared primitives for focus trap, restore, outside dismiss, and escape handling
- **Deliverables**:
  - `src/interactions/overlay-focus.ts` (or equivalent)
  - tests for trap, restore, escape, and outside-intent handling
- **Acceptance Criteria**:
  - reusable by dialog, alert-dialog, tooltip, menu-button
  - no visual-layer coupling

## Milestone M9 - Semantic and Structural Patterns

### HLS-100 - Implement Alert

- **Status**: Not Started
- **Milestone**: M9
- **Labels**: `headless`, `alert`, `apg`, `state`, `tests`, `docs`
- **Depends on**: none
- **Scope**: implement APG alert live-region behavior without focus stealing
- **Deliverables**:
  - `src/alert/index.ts`
  - `src/alert/alert.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/alert.md`
  - updates announce via role contract while preserving current focus

### HLS-101 - Implement Breadcrumb

- **Status**: Not Started
- **Milestone**: M9
- **Labels**: `headless`, `breadcrumb`, `apg`, `tests`, `docs`
- **Depends on**: none
- **Scope**: implement breadcrumb semantic contracts and current-page semantics
- **Deliverables**:
  - `src/breadcrumb/index.ts`
  - `src/breadcrumb/breadcrumb.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/breadcrumb.md`
  - landmark labelling and `aria-current` behavior verified

### HLS-102 - Implement Landmarks helpers

- **Status**: Not Started
- **Milestone**: M9
- **Labels**: `headless`, `landmarks`, `apg`, `tests`, `docs`
- **Depends on**: none
- **Scope**: implement helpers for landmark role/label assignment and uniqueness contracts
- **Deliverables**:
  - `src/landmarks/index.ts`
  - `src/landmarks/landmarks.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/landmarks.md`
  - duplicate landmark label/role edge cases covered

### HLS-103 - Implement Link

- **Status**: Not Started
- **Milestone**: M9
- **Labels**: `headless`, `link`, `apg`, `tests`, `docs`
- **Depends on**: none
- **Scope**: implement APG link contract for semantic and non-semantic host usage
- **Deliverables**:
  - `src/link/index.ts`
  - `src/link/link.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/link.md`
  - enter-activation semantics and disabled-edge behavior verified

### HLS-104 - Implement Meter

- **Status**: Not Started
- **Milestone**: M9
- **Labels**: `headless`, `meter`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-080
- **Scope**: implement read-only meter value contract using shared range primitive
- **Deliverables**:
  - `src/meter/index.ts`
  - `src/meter/meter.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/meter.md`
  - `aria-valuenow/min/max` and optional value-text behavior verified

### HLS-105 - Implement Table semantic contract

- **Status**: Not Started
- **Milestone**: M9
- **Labels**: `headless`, `table`, `apg`, `tests`, `docs`
- **Depends on**: none
- **Scope**: implement static ARIA table contract helpers (non-grid behavior)
- **Deliverables**:
  - `src/table/index.ts`
  - `src/table/table.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/table.md`
  - table remains non-composite and non-roving by contract

## Milestone M10 - Form and Value Controls

### HLS-110 - Implement Button

- **Status**: Not Started
- **Milestone**: M10
- **Labels**: `headless`, `button`, `apg`, `state`, `tests`, `docs`
- **Depends on**: none
- **Scope**: implement button and toggle-button state/aria contracts
- **Deliverables**:
  - `src/button/index.ts`
  - `src/button/button.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/button.md`
  - enter/space activation and `aria-pressed` behavior verified

### HLS-111 - Implement Checkbox

- **Status**: Not Started
- **Milestone**: M10
- **Labels**: `headless`, `checkbox`, `apg`, `state`, `tests`, `docs`
- **Depends on**: none
- **Scope**: implement dual-state and tri-state checkbox contracts
- **Deliverables**:
  - `src/checkbox/index.ts`
  - `src/checkbox/checkbox.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/checkbox.md`
  - `aria-checked` true/false/mixed transitions covered

### HLS-112 - Implement Radio Group

- **Status**: Not Started
- **Milestone**: M10
- **Labels**: `headless`, `radio-group`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-081
- **Scope**: implement radiogroup single-selection and arrow-key contract
- **Deliverables**:
  - `src/radio-group/index.ts`
  - `src/radio-group/radio-group.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/radio-group.md`
  - roving focus + single-check invariants covered

### HLS-113 - Implement Switch

- **Status**: Not Started
- **Milestone**: M10
- **Labels**: `headless`, `switch`, `apg`, `state`, `tests`, `docs`
- **Depends on**: none
- **Scope**: implement binary on/off switch contracts
- **Deliverables**:
  - `src/switch/index.ts`
  - `src/switch/switch.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/switch.md`
  - stable label semantics + checked-state behavior verified

### HLS-114 - Implement Slider

- **Status**: Not Started
- **Milestone**: M10
- **Labels**: `headless`, `slider`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-080
- **Scope**: implement single-thumb slider value/range/keyboard contract
- **Deliverables**:
  - `src/slider/index.ts`
  - `src/slider/slider.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/slider.md`
  - arrows/home/end/page-step and aria value contracts covered

### HLS-115 - Implement Slider Multi-Thumb

- **Status**: Not Started
- **Milestone**: M10
- **Labels**: `headless`, `slider-multi-thumb`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-080, HLS-114
- **Scope**: implement multi-thumb constraints, ordering, and per-thumb aria contract
- **Deliverables**:
  - `src/slider-multi-thumb/index.ts`
  - `src/slider-multi-thumb/slider-multi-thumb.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/slider-multi-thumb.md`
  - non-crossing and per-thumb focus/value invariants covered

### HLS-116 - Implement Spinbutton

- **Status**: Not Started
- **Milestone**: M10
- **Labels**: `headless`, `spinbutton`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-080
- **Scope**: implement numeric spinbutton contract with keyboard steppers
- **Deliverables**:
  - `src/spinbutton/index.ts`
  - `src/spinbutton/spinbutton.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/spinbutton.md`
  - min/max/clamp, text-editing, and aria-value invariants covered

## Milestone M11 - Disclosure, Overlay, and Command Surfaces

### HLS-120 - Implement Disclosure

- **Status**: Not Started
- **Milestone**: M11
- **Labels**: `headless`, `disclosure`, `apg`, `state`, `tests`, `docs`
- **Depends on**: none
- **Scope**: implement show/hide disclosure button contract
- **Deliverables**:
  - `src/disclosure/index.ts`
  - `src/disclosure/disclosure.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/disclosure.md`
  - expanded state and controls linkage are deterministic

### HLS-121 - Implement Accordion

- **Status**: Not Started
- **Milestone**: M11
- **Labels**: `headless`, `accordion`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-120
- **Scope**: implement multi-section disclosure variant with APG keyboard rules
- **Deliverables**:
  - `src/accordion/index.ts`
  - `src/accordion/accordion.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/accordion.md`
  - single/multi expand modes and header navigation covered

### HLS-122 - Implement Dialog (Modal)

- **Status**: Not Started
- **Milestone**: M11
- **Labels**: `headless`, `dialog`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-082
- **Scope**: implement modal dialog contract with trap and restore semantics
- **Deliverables**:
  - `src/dialog/index.ts`
  - `src/dialog/dialog.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/dialog.md`
  - tab trap, escape close, and focus restore verified

### HLS-123 - Implement Alert Dialog

- **Status**: Not Started
- **Milestone**: M11
- **Labels**: `headless`, `alert-dialog`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-082, HLS-122
- **Scope**: implement alertdialog semantics with least-destructive initial focus policy
- **Deliverables**:
  - `src/alert-dialog/index.ts`
  - `src/alert-dialog/alert-dialog.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/alert-dialog.md`
  - label + description wiring and focus policy verified

### HLS-124 - Implement Tooltip

- **Status**: Not Started
- **Milestone**: M11
- **Labels**: `headless`, `tooltip`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-082
- **Scope**: implement tooltip open/close semantics tied to focus/hover triggers
- **Deliverables**:
  - `src/tooltip/index.ts`
  - `src/tooltip/tooltip.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/tooltip.md`
  - trigger `aria-describedby` and escape-dismiss behavior verified

### HLS-125 - Implement Menu Button

- **Status**: Not Started
- **Milestone**: M11
- **Labels**: `headless`, `menu-button`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-082
- **Scope**: implement APG menu-button trigger contract integrated with menu semantics
- **Deliverables**:
  - `src/menu-button/index.ts`
  - `src/menu-button/menu-button.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/menu-button.md`
  - open-key variants and focus handoff to first/last item verified

### HLS-126 - Implement Toolbar

- **Status**: Not Started
- **Milestone**: M11
- **Labels**: `headless`, `toolbar`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-081
- **Scope**: implement toolbar roving focus and orientation-aware keyboard behavior
- **Deliverables**:
  - `src/toolbar/index.ts`
  - `src/toolbar/toolbar.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/toolbar.md`
  - single-tab-stop and arrow navigation behavior verified

## Milestone M12 - Data Navigation and Layout Patterns

### HLS-130 - Implement Grid

- **Status**: Not Started
- **Milestone**: M12
- **Labels**: `headless`, `grid`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-081
- **Scope**: implement interactive grid navigation contract
- **Deliverables**:
  - `src/grid/index.ts`
  - `src/grid/grid.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/grid.md`
  - cell navigation matrix and aria metadata contracts verified

### HLS-131 - Implement Treegrid

- **Status**: Not Started
- **Milestone**: M12
- **Labels**: `headless`, `treegrid`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-081, HLS-130
- **Scope**: implement hierarchical grid with expand/collapse and row/cell navigation
- **Deliverables**:
  - `src/treegrid/index.ts`
  - `src/treegrid/treegrid.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/treegrid.md`
  - hierarchical metadata and keyboard transitions verified

### HLS-132 - Implement Feed

- **Status**: Not Started
- **Milestone**: M12
- **Labels**: `headless`, `feed`, `apg`, `state`, `tests`, `docs`
- **Depends on**: none
- **Scope**: implement feed/article navigation and loading-state aria semantics
- **Deliverables**:
  - `src/feed/index.ts`
  - `src/feed/feed.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/feed.md`
  - page-up/down contract and busy-state updates verified

### HLS-133 - Implement Carousel

- **Status**: Not Started
- **Milestone**: M12
- **Labels**: `headless`, `carousel`, `apg`, `state`, `tests`, `docs`
- **Depends on**: none
- **Scope**: implement carousel slide and rotation controls with APG pause rules
- **Deliverables**:
  - `src/carousel/index.ts`
  - `src/carousel/carousel.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/carousel.md`
  - auto-rotation stop-on-focus and control ordering behavior verified

### HLS-134 - Implement Window Splitter

- **Status**: Not Started
- **Milestone**: M12
- **Labels**: `headless`, `window-splitter`, `apg`, `state`, `tests`, `docs`
- **Depends on**: HLS-080
- **Scope**: implement focusable separator with keyboard resizing and aria value contract
- **Deliverables**:
  - `src/window-splitter/index.ts`
  - `src/window-splitter/window-splitter.test.ts`
- **Acceptance Criteria**:
  - aligns with `specs/components/window-splitter.md`
  - arrow/home/end movement and value clamping verified

## Milestone M13 - Program Hardening and Closure

### HLS-140 - Expand APG contract test harness across all new components

- **Status**: Done
- **Milestone**: M13
- **Labels**: `headless`, `tests`, `a11y`, `apg`
- **Depends on**: HLS-100..HLS-134
- **Scope**: add cross-component contract verification suites and regression coverage
- **Deliverables**:
  - shared test helpers for role/aria/linkage assertions
  - regression suites for keyboard contracts
- **Acceptance Criteria**:
  - every newly added component has role/aria and keyboard contract coverage

### HLS-141 - Final export, docs, and catalog sweep

- **Status**: Done
- **Milestone**: M13
- **Labels**: `headless`, `docs`, `release`
- **Depends on**: HLS-100..HLS-134
- **Scope**: finalize package exports, README coverage, and implementation status docs
- **Deliverables**:
  - `src/index.ts` exports for all new components
  - `README.md` implemented component list update
  - specs cross-links and roadmap/status alignment updates if needed
- **Acceptance Criteria**:
  - no missing public exports
  - docs match actual package surface

### HLS-142 - Full-gate validation and release-candidate preparation

- **Status**: Done
- **Milestone**: M13
- **Labels**: `headless`, `release`, `ops`, `governance`
- **Depends on**: HLS-140, HLS-141
- **Scope**: run full package quality gates and produce release-candidate evidence
- **Deliverables**:
  - lint/test/boundary gate results
  - APG coverage summary
  - release-ready checklist completion
- **Acceptance Criteria**:
  - all gates are green from package context
  - no unresolved blocker issues in this backlog

## Milestone M14 - MVP-next Extension Components (Post-APG Scope)

### HLS-150 - Productize Select from scaffold to release-ready contract

- **Status**: Done
- **Milestone**: M14
- **Labels**: `headless`, `select`, `a11y`, `state`, `tests`, `docs`
- **Depends on**: HLS-112
- **Scope**: finalize single-select trigger/listbox composition contract and keyboard behavior for production usage
- **Deliverables**:
  - `src/select/index.ts`
  - `src/select/select.test.ts`
  - `specs/components/select.md`
- **Acceptance Criteria**:
  - trigger/listbox/option contracts are deterministic and stable
  - value-text and selection-change callback semantics are verified
- **DoD Gates**:
  - open-from-trigger keyboard matrix (`ArrowDown`, `ArrowUp`, `Home`, `End`, `Enter`, `Space`) is covered
  - selected state (`selectedId`, `selectedLabel`, `getValueText`) stays synchronized
  - close and focus-restore behavior is deterministic

### HLS-151 - Productize Popover non-modal overlay contract

- **Status**: Done
- **Milestone**: M14
- **Labels**: `headless`, `popover`, `a11y`, `state`, `tests`, `docs`
- **Depends on**: HLS-082
- **Scope**: finalize popover trigger/content contract based on overlay focus intents without modal trap semantics
- **Deliverables**:
  - `src/popover/index.ts`
  - `src/popover/popover.test.ts`
  - `specs/components/popover.md`
- **Acceptance Criteria**:
  - open source and dismiss intent states are tracked and test-covered
  - outside-pointer and outside-focus close policies are independently configurable
- **DoD Gates**:
  - trigger/content aria linkage and expanded state always match model state
  - escape/outside dismiss paths set `lastDismissIntent` and `restoreTargetId` correctly
  - non-modal contract (`aria-modal=false`, no focus trap) is preserved

### HLS-152 - Productize Context Menu pointer and keyboard invocation flows

- **Status**: Done
- **Milestone**: M14
- **Labels**: `headless`, `context-menu`, `a11y`, `state`, `tests`, `docs`
- **Depends on**: HLS-125, HLS-151
- **Scope**: finalize context menu model for right-click and keyboard invocation with anchor semantics
- **Deliverables**:
  - `src/context-menu/index.ts`
  - `src/context-menu/context-menu.test.ts`
  - `specs/components/context-menu.md`
- **Acceptance Criteria**:
  - pointer and keyboard open paths both supported (`ContextMenu`, `Shift+F10`)
  - anchor coordinates and open source are preserved in state
- **DoD Gates**:
  - `onContextMenu` invocation path prevents default when available
  - menu close semantics (`Escape`, `Tab`, outside pointer policy) are deterministic
  - restore-target behavior is consistent after close and select-close paths

### HLS-153 - Productize Command Palette execute and shortcut contract

- **Status**: Done
- **Milestone**: M14
- **Labels**: `headless`, `command-palette`, `a11y`, `state`, `tests`, `docs`
- **Depends on**: HLS-150, HLS-151
- **Scope**: finalize command palette model with execute flow, shortcut handling, and keep-open policy controls
- **Deliverables**:
  - `src/command-palette/index.ts`
  - `src/command-palette/command-palette.test.ts`
  - `specs/components/command-palette.md`
- **Acceptance Criteria**:
  - global shortcut toggles palette deterministically
  - execute paths update `lastExecutedId` and call `onExecute`
- **DoD Gates**:
  - `Enter`/`Space` execution works for active command with visible-command fallback
  - `closeOnExecute` policy is validated in both close and keep-open modes
  - outside pointer close policy is implemented and covered

### HLS-154 - Productize Toast queue and timer lifecycle contract

- **Status**: Done
- **Milestone**: M14
- **Labels**: `headless`, `toast`, `a11y`, `state`, `tests`, `docs`
- **Depends on**: none
- **Scope**: finalize notification queue model with durable timer pause/resume semantics
- **Deliverables**:
  - `src/toast/index.ts`
  - `src/toast/toast.test.ts`
  - `specs/components/toast.md`
- **Acceptance Criteria**:
  - queue visibility and level-to-role mapping are stable
  - pause/resume preserves remaining auto-dismiss duration
- **DoD Gates**:
  - push/dismiss/clear operations keep queue and timer tracking consistent
  - `maxVisible` slicing and live-region contracts are verified
  - auto-dismiss timing is deterministic in unit tests

### HLS-155 - Productize Progress determinate/indeterminate value contract

- **Status**: Done
- **Milestone**: M14
- **Labels**: `headless`, `progress`, `a11y`, `state`, `tests`, `docs`
- **Depends on**: HLS-080
- **Scope**: finalize progressbar contract with value stepping, completion state, and aria mode switching
- **Deliverables**:
  - `src/progress/index.ts`
  - `src/progress/progress.test.ts`
  - `specs/components/progress.md`
- **Acceptance Criteria**:
  - determinate mode exposes full aria value triple and value text
  - indeterminate mode omits aria value triple consistently
- **DoD Gates**:
  - increment/decrement/set flows clamp through shared value-range behavior
  - `isComplete` transitions are deterministic across state changes
  - `onValueChange` callback fires only on effective value updates

## Milestone M15 - Consumer Adoption and Release Operations

### HLS-160 - Build external-consumer integration harness for MVP-next components

- **Status**: Done
- **Milestone**: M15
- **Labels**: `headless`, `integration`, `adapters`, `tests`, `docs`
- **Depends on**: HLS-150, HLS-151, HLS-152, HLS-153, HLS-154, HLS-155
- **Scope**: validate real consumer ergonomics by wiring MVP-next components in adapter-level integration scenarios
- **Deliverables**:
  - adapter integration test expansion for MVP-next usage paths
  - consumer integration notes in `specs/release/consumer-integration.md`
- **Acceptance Criteria**:
  - import and usage flows from package public surface are verified for consumer-style composition
  - no private/internal API usage is required for baseline integration flows
- **DoD Gates**:
  - integration tests cover at least select/popover/command-palette composition path
  - package-root import path remains sufficient for documented integration scenarios
  - lint/test/boundary checks stay green

### HLS-161 - Rehearse release workflow and packaging gates

- **Status**: Done
- **Milestone**: M15
- **Labels**: `headless`, `release`, `ops`, `governance`, `docs`
- **Depends on**: HLS-160
- **Scope**: run a full dry-run of package release operations with explicit evidence and rollback checklist
- **Deliverables**:
  - release rehearsal runbook in `specs/release/release-rehearsal.md`
  - verification artifacts for lint/test/boundary + tarball packaging checks
- **Acceptance Criteria**:
  - a deterministic command sequence exists for release preparation and verification
  - package tarball contents are validated against expected public surface
- **DoD Gates**:
  - dry-run command set documented (`lint`, `test`, `npm pack`, governance checks)
  - rehearsal output confirms no missing docs/exports in package artifact
  - failure/rollback checklist is documented and reviewable

### HLS-162 - Automate changelog and release-note assembly

- **Status**: Done
- **Milestone**: M15
- **Labels**: `headless`, `release`, `docs`, `automation`
- **Depends on**: HLS-161
- **Scope**: define and automate repeatable changelog generation for upcoming releases from backlog/status evidence
- **Deliverables**:
  - changelog automation script(s) under `scripts/`
  - release note template and usage doc in `specs/release/`
- **Acceptance Criteria**:
  - changelog generation can be run from package context and produces deterministic output
  - release-note template captures component changes, contract hardening, and gate evidence sections
- **DoD Gates**:
  - generated changelog output includes MVP-next component tranche entries
  - workflow supports both full release and patch-level update modes
  - docs clearly define manual override/edit workflow for final release notes

## Critical Path (recommended)

HLS-080 -> HLS-114 -> HLS-115 -> HLS-116 -> HLS-134 -> HLS-140 -> HLS-141 -> HLS-142 -> HLS-150 -> HLS-151 -> HLS-152 -> HLS-153 -> HLS-160 -> HLS-161 -> HLS-162

Parallel lanes:

- HLS-081 -> HLS-112 -> HLS-126 -> HLS-130 -> HLS-131
- HLS-082 -> HLS-122 -> HLS-123 and HLS-124 and HLS-125
- HLS-100/HLS-101/HLS-102/HLS-103/HLS-104/HLS-105 can run independently after foundations where required
- HLS-154 and HLS-155 can run in parallel with HLS-150..HLS-153
- HLS-160 can start once HLS-150..HLS-155 are done

## Suggested Sprint Packaging

- **Sprint A**: HLS-080, HLS-081, HLS-082, HLS-100, HLS-101
- **Sprint B**: HLS-102, HLS-103, HLS-104, HLS-105, HLS-110
- **Sprint C**: HLS-111, HLS-112, HLS-113, HLS-114
- **Sprint D**: HLS-115, HLS-116, HLS-120, HLS-121
- **Sprint E**: HLS-122, HLS-123, HLS-124, HLS-125, HLS-126
- **Sprint F**: HLS-130, HLS-131, HLS-132, HLS-133, HLS-134
- **Sprint G**: HLS-140, HLS-141, HLS-142
- **Sprint H**: HLS-150, HLS-151, HLS-152, HLS-153, HLS-154, HLS-155
- **Sprint I**: HLS-160, HLS-161, HLS-162
