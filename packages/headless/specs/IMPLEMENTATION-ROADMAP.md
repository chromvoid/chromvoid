# Headless Components Implementation and Testing Roadmap

## Scope

This roadmap defines the next component implementations for `@chromvoid/headless-ui`
and the required testing strategy for each component.

The package remains independent and APG-driven, with one component per directory
and one component spec per file.

## Ground Rules

- one component per directory: `src/<component>/`
- one component spec: `specs/components/<component>.md`
- TDD-first workflow (red -> green -> refactor)
- APG behavior contracts are part of the public API
- no internal monorepo imports (`@project/*`, `apps/*`)

## Delivery Waves

## APG Full Coverage Target (30 patterns)

Source of truth: `https://www.w3.org/WAI/ARIA/apg/patterns/`

Current status in this package:

- implemented: Listbox, Combobox, Menu and Menubar (menu), Tabs, Tree View
- planned: all remaining APG patterns below

Patterns to cover in roadmap scope:

1. Accordion (Sections With Show/Hide Functionality)
2. Alert
3. Alert and Message Dialogs
4. Breadcrumb
5. Button
6. Carousel (Slide Show or Image Rotator)
7. Checkbox
8. Combobox
9. Dialog (Modal)
10. Disclosure (Show/Hide)
11. Feed
12. Grid (Interactive Tabular Data and Layout Containers)
13. Landmarks
14. Link
15. Listbox
16. Menu and Menubar
17. Menu Button
18. Meter
19. Radio Group
20. Slider
21. Slider (Multi-Thumb)
22. Spinbutton
23. Switch
24. Table
25. Tabs
26. Toolbar
27. Tooltip
28. Tree View
29. Treegrid
30. Window Splitter

## Wave 1: Stabilization of Implemented Complex Widgets

### Components

- Listbox
- Combobox
- Menu and Menubar
- Tabs
- Tree View

### Planned Work

1. complete APG edge-case coverage for keyboard matrices and disabled-item invariants
2. normalize public APIs and naming across implemented widgets
3. align each implemented widget spec with latest APG wording and links

### Required Tests

- full keyboard matrix parity against APG contracts
- id/reference integrity (`aria-controls`, `aria-labelledby`, `aria-activedescendant`)
- regression tests for previously fixed interaction bugs

## Wave 2: Core Form and Command Widgets

### Components

- Button
- Checkbox
- Radio Group
- Switch
- Slider
- Slider (Multi-Thumb)
- Spinbutton
- Meter
- Link

### Planned Work

1. implement per-pattern state models and headless prop contracts in `src/<component>/index.ts`
2. add one APG-focused spec per component in `specs/components/<component>.md`
3. extract reusable value-range and toggle primitives in shared core layers

### Required Tests

- value boundaries, stepping rules, and min/max clamping where applicable
- selection/toggle semantics and role/state attributes
- pointer + keyboard parity and disabled behavior

## Wave 3: Disclosure, Overlay, and Messaging Patterns

### Components

- Disclosure (Show/Hide)
- Accordion (Sections With Show/Hide Functionality)
- Dialog (Modal)
- Alert and Message Dialogs
- Alert
- Tooltip
- Toolbar
- Menu Button

### Planned Work

1. implement overlay and dismiss primitives reusable by dialog, alertdialog, tooltip, and menu button
2. model focus entry/exit rules and restore-focus contracts
3. define interaction boundaries for modal/non-modal behavior and announcement semantics

### Required Tests

- focus trapping/restore and escape/outside-intent close paths
- heading/description/id linkage guarantees
- non-interruptive vs interruptive announcement behavior (`alert` vs `alertdialog`)

## Wave 4: Data Navigation and Collection Patterns

### Components

- Grid (Interactive Tabular Data and Layout Containers)
- Treegrid
- Table
- Feed
- Carousel (Slide Show or Image Rotator)
- Window Splitter

### Planned Work

1. implement row/cell navigation engines and hierarchical grid contracts
2. define static vs interactive tabular APIs (`table` vs `grid`/`treegrid`)
3. implement region/slide control contracts for carousel and pane size contracts for window splitter

### Required Tests

- directional navigation and edit/interaction mode transitions
- row/column/level metadata correctness where required
- resize boundary behavior and persisted pane ratio contracts for splitter

## Wave 5: Structural Navigation and Page Semantics

### Components

- Breadcrumb
- Landmarks

### Planned Work

1. provide headless helpers for landmark role assignment and labeling contracts
2. provide breadcrumb generation helpers with current-page semantics

### Required Tests

- semantic role/label correctness and uniqueness constraints
- current-item semantics (`aria-current`) and link structure invariants

## Wave 6: MVP-next Extension Components

### Components

- Select
- Popover
- Context Menu
- Command Palette
- Toast
- Progress

### Planned Work

1. productize scaffold components into stable public contracts and expand behavior documentation parity
2. enforce deterministic state transitions for open/close, execute, queue timing, and value semantics
3. add explicit dependency sequencing to minimize churn in shared overlay/selection primitives

### Required Tests

- source/intent tracking for open, close, and dismiss behavior where applicable
- keyboard invocation and command execution parity (`Enter`, `Space`, shortcut toggles)
- queue/timer lifecycle correctness for toast pause/resume with remaining-duration preservation
- determinate/indeterminate aria contract integrity for progress
- regression tests for focus restore and target linkage contracts

## Shared Testing Blueprint (applies to every component)

For each component, the test suite must include:

1. state transition tests
2. keyboard contract tests
3. accessibility props contract tests
4. disabled and edge-case invariant tests
5. regression tests for previously fixed bugs

Suggested local layout:

- `src/<component>/index.ts`
- `src/<component>/<component>.test.ts`
- optional split: `src/<component>/<component>.keyboard.test.ts` (when keyboard matrix grows)

## Definition of Done per Component

A component is done when:

1. component spec exists and is up to date
2. public API exported via `src/index.ts`
3. APG contract covered by tests
4. `npm run lint -w packages/headless` passes
5. `npm run test -w packages/headless` passes
6. boundary check remains green

## Execution Order (recommended)

1. Stabilization of implemented complex widgets
2. Core form and command widgets
3. Disclosure, overlay, and messaging patterns
4. Data navigation and collection patterns
5. Structural navigation and page semantics
6. MVP-next extension components

This order prioritizes reusable interaction primitives, keeps risk low for already-shipped widgets, and expands APG coverage to all listed patterns.
