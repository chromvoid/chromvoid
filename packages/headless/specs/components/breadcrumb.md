# Breadcrumb Component Contract

## Purpose

`Breadcrumb` is a headless APG-aligned contract for a navigation landmark that helps users understand their current location within a hierarchical structure. It ensures the correct navigation role and identifies the current page within the sequence.

## Component Files

- `src/breadcrumb/index.ts` - model and public `createBreadcrumb` API
- `src/breadcrumb/breadcrumb.test.ts` - unit behavior tests

## Public API

- `createBreadcrumb(options)`
  - `options`:
    - `items`: array of breadcrumb items `{ id, label, href, isCurrent? }`
- `state` (signal-backed):
  - `items()` - list of breadcrumb items with `id`, `label`, `href`, and `isCurrent`
- `actions`: none (primarily a structural/navigational component)
- `contracts`:
  - `getRootProps()` - returns props for the `<nav>` element
  - `getListProps()` - returns props for the list element (`<ol>` or `<ul>`)
  - `getItemProps(id)` - returns props for the list item element (`<li>`)
  - `getLinkProps(id)` - returns props for the link element (`<a>`)
  - `getSeparatorProps(id)` - returns props for the separator element (usually `aria-hidden="true"`)

## APG and A11y Contract

- root role: `nav`
- list role: none (usually `ol` or `ul`)
- item role: none (usually `li`)
- link role: `link`
- required attributes:
  - root: `aria-label="Breadcrumb"` (or localized equivalent)
  - current link: `aria-current="page"`
- focus management:
  - links are in the page tab sequence
  - the current page link may or may not be focusable depending on implementation, but must have `aria-current="page"`

## Behavior Contract

- **Structural Integrity**:
  - the component provides the necessary ARIA attributes to identify the navigation landmark and the current page
- **Current Page**:
  - exactly one item (usually the last one) should have `isCurrent: true`
  - the `getLinkProps` for the current item must include `aria-current="page"`

## Invariants

- the root element must be a `<nav>` or have `role="navigation"`
- `aria-label` (or `aria-labelledby`) is required on the root to distinguish it from other navigation landmarks
- only the current page link should have `aria-current="page"`

## Minimum Test Matrix

- render a list of breadcrumb items
- verify `aria-label="Breadcrumb"` on the root
- verify `aria-current="page"` on the current item link
- verify other items do not have `aria-current`
- verify correct `href` mapping for links
- verify separators are `aria-hidden="true"`

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- collapsible breadcrumbs (overflow management)
- dropdown menus within breadcrumbs
- dynamic path updates (handled by routing integration)
