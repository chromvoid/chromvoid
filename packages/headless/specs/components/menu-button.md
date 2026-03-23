# Menu Button Component Contract

## Purpose

`MenuButton` is a headless APG-aligned contract for a button that toggles the visibility of a menu. It manages the trigger state, expanded state, and keyboard shortcuts to open the menu.

## Component Files

- `src/menu-button/index.ts` - model and public `createMenuButton` API
- `src/menu-button/menu-button.test.ts` - unit behavior tests

## Public API

- `createMenuButton(options)`
- `state` (signal-backed):
  - `isOpen()`
  - `activeId()` (of the menu item)
- `actions`:
  - `open`, `close`, `toggle`
  - `handleKeyDown`
- `contracts`:
  - `getTriggerProps()`
  - `getMenuProps()`
  - `getItemProps(id)`

## APG and A11y Contract

- trigger role: `button`
- trigger attributes:
  - `aria-haspopup="menu"`
  - `aria-expanded` (reflects `isOpen`)
  - `aria-controls` (links to menu ID)
- menu role: `menu`
- item role: `menuitem` (or `menuitemcheckbox`, `menuitemradio`)

## Behavior Contract

- trigger keyboard support:
  - `Enter`, `Space`, or `ArrowDown` opens the menu and moves focus to the first item
  - `ArrowUp` opens the menu and moves focus to the last item
- menu keyboard support:
  - `Escape` closes the menu and returns focus to the trigger
  - `Tab` closes the menu and moves focus to the next focusable element
  - `ArrowDown/ArrowUp` cycles focus through menu items
- dismissal:
  - clicking outside the menu or trigger closes the menu
  - selecting an item closes the menu (configurable)

## Invariants

- `isOpen` is the single source of truth for the menu's visibility
- focus must be returned to the trigger when the menu is closed via `Escape` or item selection
- disabled menu items are skipped during keyboard navigation

## Minimum Test Matrix

- toggle menu visibility via trigger click
- open menu via `ArrowDown` (focus first item)
- open menu via `ArrowUp` (focus last item)
- close menu via `Escape` (return focus to trigger)
- close menu via outside click
- close menu via item selection
- verify ARIA attributes on trigger and menu

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- submenus (nested menus)
- context menus (right-click)
- complex positioning (handled by consumer)
