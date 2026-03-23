# ADR-004: Shared Focus/Selection Policy and APG Strategy

> **Status**: Draft
> **Version**: 2026-02-08-r2
> **Date**: 2026-02-08
> **Authors**: Team ChromVoid
> **Related Documents**:
>
> - [ADR-001-headless-architecture](./ADR-001-headless-architecture.md) - layers and API shape
> - [WAI-ARIA APG Listbox](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/) - listbox baseline behavior
> - [WAI-ARIA APG Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) - keyboard and focus rules

## Context

The headless package must provide predictable APG-conformant behavior contracts.
Main risk: inconsistent interpretation of focus, selection, and keyboard behavior across components.

## Problem

Without a shared policy:

- one component may treat focus as selection while another does not;
- keymaps drift between components;
- `roving-tabindex` and `aria-activedescendant` are chosen ad-hoc;
- accessibility regressions become more likely.

## Goals

1. Define shared focus and selection invariants.
2. Define focus-strategy decision criteria.
3. Standardize baseline keyboard behavior.
4. Keep `get*Props()` contracts APG-conformant.

## Non-Goals

- Full keymap catalog for every future component.
- Visual focus ring styling and presentation design.

## Decision

### 1. State Invariants

1. `focus` and `selection` are independent states.
2. Single-select may enable selection-follows-focus only as explicit option.
3. Multi-select must not clear selection during standard arrow navigation.
4. Active item (`activeId`) must always be valid option id or `null`.

### 2. Focus Strategy Choice

Supported strategies:

- `roving-tabindex`
- `aria-activedescendant`

Selection rules:

- use `roving-tabindex` by default for non-virtualized collections;
- use `aria-activedescendant` when DOM focus must stay on root/control, or when virtualized behavior requires stable focus anchor;
- strategy selection must be explicit in `createX(options)`.

### 3. Baseline Keyboard Contract

Required baseline, when applicable for a given pattern:

- `ArrowUp/ArrowDown` (or horizontal equivalent): focus navigation;
- `Home/End`: move to first/last item;
- `Space`: toggle/select action according to APG;
- `Enter`: activate action for activation-capable patterns;
- `Escape`: dismiss/reset action for open/overlay-capable patterns.

### 4. APG Props Contract

`getRootProps()` and `getItemProps()` MUST:

- provide correct `role` values;
- provide `aria-selected` for selectable options;
- provide `tabindex` or `aria-activedescendant` based on chosen strategy;
- avoid any presentation logic.

### 5. Compatibility Rule

Focus/selection/keyboard semantic changes are behavior-breaking
if they change observable contract behavior for consumers.

## Alternatives

### A. Support only one focus strategy

**Rejected**:

- does not cover all widget classes and virtualization cases.

### B. Define policy per component without shared ADR

**Rejected**:

- leads to contract drift and inconsistent accessibility behavior.

## Consequences

### Positive

- unified behavior model across components;
- fewer APG regressions;
- more predictable consumer integrations.

### Negative

- higher entry bar for new component implementations;
- stricter keyboard/focus test matrix required.

## Change History

| Date       | Change                                                      |
| ---------- | ----------------------------------------------------------- |
| 2026-02-08 | Initial draft created (r1)                                  |
| 2026-02-08 | Rewritten to full English and clarified strategy rules (r2) |
