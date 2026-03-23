# Landmarks Component Contract

## Purpose

`Landmarks` is a headless contract for defining structural regions of a page to improve navigation for assistive technology users. It ensures that page regions are correctly identified with ARIA roles and accessible labels.

## Component Files

- `src/landmarks/index.ts` - model and public `createLandmark` API
- `src/landmarks/landmarks.test.ts` - unit behavior tests

## Public API

- `createLandmark(options)`
  - `options`:
    - `type`: landmark type (`banner`, `main`, `navigation`, `complementary`, `contentinfo`, `search`, `form`, `region`)
    - `label?`: string or signal — accessible label text
    - `labelId?`: string or signal — ID of the labelling element
    - `idBase?`: string — base id prefix for generated ids (default: `'landmark-{type}'`)
- `state` (signal-backed):
  - `type()` — the ARIA landmark role
  - `label()` — accessible label string, or `null` if not provided
  - `labelId()` — ID of the labelling element, or `null` if not provided
- `actions`: none (landmark is a pure semantic wrapper with no state transitions)
- `contracts`:
  - `getLandmarkProps()` — returns complete ARIA prop object for the landmark element

## State Signal Surface

| Signal    | Type                       | Derived? | Description                                        |
|-----------|----------------------------|----------|----------------------------------------------------|
| `type`    | `Atom<LandmarkType>`       | No       | The ARIA landmark role                             |
| `label`   | `Atom<string \| null>`     | No       | Accessible label text, or `null`                   |
| `labelId` | `Atom<string \| null>`     | No       | ID of the labelling element, or `null`             |

## APG and A11y Contract

- roles:
  - `banner` (header)
  - `main`
  - `navigation` (nav)
  - `complementary` (aside)
  - `contentinfo` (footer)
  - `search`
  - `form`
  - `region`
- required attributes:
  - `aria-label` or `aria-labelledby` if multiple landmarks of the same type exist on a page (e.g., multiple `navigation` regions)
  - `role` attribute if using non-semantic HTML elements

## Behavior Contract

- **Semantic Mapping**:
  - the component ensures that the correct ARIA role is applied to the element
  - if a semantic HTML element is used (e.g., `<main>`, `<nav>`), the role is redundant but harmless; if a `<div>` is used, the role is mandatory
- **Labeling**:
  - if a `label` is provided, it is applied via `aria-label`
  - if a `labelId` is provided, it is applied via `aria-labelledby`
  - if both `label` and `labelId` are provided, `aria-labelledby` takes precedence and `aria-label` is omitted
- **Static Behavior**:
  - landmark has no user-driven state transitions; it is a pure semantic wrapper
  - state is set at creation time and may be updated reactively if atom-backed options are provided

## Contract Prop Shapes

### `getLandmarkProps()`
```ts
{
  role: LandmarkType                   // the landmark ARIA role
  'aria-label'?: string                // present when label is set AND labelId is NOT set
  'aria-labelledby'?: string           // present when labelId is set (takes precedence over label)
}
```

## Transitions Table

| Event / Action          | Current State          | Next State / Effect                                      |
|-------------------------|------------------------|----------------------------------------------------------|
| `createLandmark(opts)`  | —                      | `type = opts.type`, `label = opts.label ?? null`, `labelId = opts.labelId ?? null` |
| atom update on `label`  | `label = oldValue`     | `label = newValue`; `getLandmarkProps()` recomputes       |
| atom update on `labelId`| `labelId = oldValue`   | `labelId = newValue`; `getLandmarkProps()` recomputes     |

> No user-driven actions exist. State changes only via reactive atom updates from the consumer.

## Invariants

1. `role` is always one of the eight valid `LandmarkType` values.
2. When `labelId` is set, `aria-labelledby` is present and `aria-label` is omitted (labelledby takes precedence).
3. When only `label` is set (no `labelId`), `aria-label` is present.
4. When neither `label` nor `labelId` is set, neither `aria-label` nor `aria-labelledby` is present.
5. A page should generally have only one `banner`, `main`, and `contentinfo` landmark.
6. If multiple landmarks of the same type are used, they **must** have unique labels to be distinguishable by assistive technology (enforced via `findLandmarkUniquenessIssues` and `hasLandmarkUniquenessIssues` utilities).

## Adapter Expectations

UIKit adapters MUST bind to the headless model as follows:

**Signals read (reactive, drive re-renders):**
- `state.type()` — the ARIA landmark role (used to select semantic HTML element or apply role attribute)
- `state.label()` — accessible label text (synced from the `label` attribute on the host)
- `state.labelId()` — ID of the labelling element (synced from the `label-id` attribute on the host)

**Actions called:**
- None. Landmark is a pure semantic wrapper with no user-driven state transitions.

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getLandmarkProps()` — spread onto the root landmark element

**UIKit-only concerns (NOT in headless):**
- `display: block` styling on the host element
- Attribute-to-signal synchronization (`label` attr to `state.label`, `label-id` attr to `state.labelId`)
- Choice of semantic HTML element vs `<div>` with explicit `role`

## Minimum Test Matrix

- verify correct role application for each landmark type
- verify `aria-label` application when provided
- verify `aria-labelledby` application when provided
- ensure no role is applied if a semantic element is already sufficient (optional optimization)

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no `@statx/*` in headless core.
- **Layering**: `core -> interactions -> a11y-contracts -> adapters`; adapters remain thin mappings.
- **Independence**: No imports from `@project/*`, `apps/*`, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- automatic landmark detection/audit
- skip-link generation (handled by a separate utility)
