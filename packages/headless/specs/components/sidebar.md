# Sidebar Component Contract

## Purpose

`Sidebar` is a headless contract for a persistent layout panel that lives at the inline-start edge of the viewport. Unlike `Drawer`, which is an overlay dialog, `Sidebar` is always in the DOM/layout flow. It supports two modes:

1. **Desktop (persistent)** — a fixed panel that can be **expanded** (full width with labels) or **collapsed** (narrow icon rail). Not an overlay; no backdrop, no focus trap, no scroll lock.
2. **Mobile (overlay)** — below a configurable breakpoint the sidebar switches to a modal overlay (backdrop, focus trap, Escape dismissal), delegating to `createDialog` internally for that behavior.

### How it differs from Drawer

| Concern | Drawer | Sidebar |
|---------|--------|---------|
| Presence in layout | Overlay only; removed from flow when closed | Always in DOM/layout flow (desktop) |
| Placement | Any edge (`start`, `end`, `top`, `bottom`) | Inline-start only |
| Collapsed state | N/A | Collapses to icon rail |
| Responsive mode | N/A (always overlay) | Auto-switches between persistent panel and modal overlay |
| Dialog delegation | Always | Mobile overlay mode only |

## Component Files

- `src/sidebar/index.ts` - model and public `createSidebar` API
- `src/sidebar/sidebar.test.ts` - unit behavior tests

## Public API

- `createSidebar(options)`
- `state` (signal-backed):
  - `expanded()` — whether the sidebar is in full-width mode (`true`) or icon-rail mode (`false`)
  - `overlayOpen()` — whether the mobile overlay is open (only meaningful when `mobile` is `true`)
  - `mobile()` — whether the sidebar is in mobile/overlay mode
  - `isFocusTrapped()` — computed: `true` when `mobile && overlayOpen` (delegated from dialog)
  - `shouldLockScroll()` — computed: `true` when `mobile && overlayOpen` (delegated from dialog)
  - `restoreTargetId()` — element id to return focus to on overlay close (delegated from dialog)
  - `initialFocusTargetId()` — id of element to focus when overlay opens (delegated from dialog)
- `actions`:
  - `toggle()` — in desktop mode, toggles `expanded`; in mobile mode, toggles `overlayOpen`
  - `expand()` — sets `expanded` to `true` (desktop mode only, no-op in mobile)
  - `collapse()` — sets `expanded` to `false` (desktop mode only, no-op in mobile)
  - `openOverlay()` — opens the mobile overlay (no-op if not in mobile mode)
  - `closeOverlay(intent?)` — closes the mobile overlay (no-op if not in mobile mode)
  - `setMobile(value)` — switches between desktop and mobile mode; when switching to desktop, closes overlay; when switching to mobile, collapses sidebar
  - `handleKeyDown(event)` — Escape handling for mobile overlay (delegated from dialog)
  - `handleOutsidePointer()` — outside click handling for mobile overlay (delegated from dialog)
  - `handleOutsideFocus()` — outside focus handling for mobile overlay (delegated from dialog)
- `contracts`:
  - `getSidebarProps()` — props for the sidebar container element
  - `getToggleProps()` — props for the expand/collapse toggle button
  - `getOverlayProps()` — props for the mobile overlay backdrop
  - `getRailProps()` — props for the collapsed rail container

## CreateSidebarOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | `string` | `'sidebar'` | Base id prefix for all generated ids |
| `defaultExpanded` | `boolean` | `true` | Whether the sidebar starts expanded (desktop mode) |
| `onExpandedChange` | `(expanded: boolean) => void` | --- | Callback fired when `expanded` state changes |
| `closeOnEscape` | `boolean` | `true` | Whether Escape key closes mobile overlay |
| `closeOnOutsidePointer` | `boolean` | `true` | Whether clicking outside closes mobile overlay |
| `initialFocusId` | `string` | --- | Id of element to focus when mobile overlay opens |
| `ariaLabel` | `string` | `'Sidebar navigation'` | Accessible label for the sidebar landmark |

## State Signal Surface

| Signal | Type | Derived? | Source | Description |
|--------|------|----------|--------|-------------|
| `expanded` | `Atom<boolean>` | No | sidebar | Whether sidebar shows full width (`true`) or icon rail (`false`) |
| `overlayOpen` | `Atom<boolean>` | No | dialog | Whether mobile overlay is visible |
| `mobile` | `Atom<boolean>` | No | sidebar | Whether in mobile/overlay mode |
| `isFocusTrapped` | `Computed<boolean>` | Yes | dialog | `mobile() && overlayOpen()` |
| `shouldLockScroll` | `Computed<boolean>` | Yes | dialog | `mobile() && overlayOpen()` |
| `restoreTargetId` | `Atom<string \| null>` | No | dialog | Element id to return focus to after overlay close |
| `initialFocusTargetId` | `Atom<string \| null>` | No | dialog | Id of element to receive focus when overlay opens |

## APG and A11y Contract

### Desktop (persistent) mode
- Sidebar container: `role="navigation"`, `aria-label`
- No dialog semantics; the sidebar is a landmark, not an overlay
- Toggle button: `aria-expanded`, `aria-controls` pointing to sidebar id
- Rail state communicated via `data-collapsed="true|false"` on sidebar container

### Mobile (overlay) mode
- Overlay container: `role="dialog"`, `aria-modal="true"`, `aria-label`
- Focus trap within the overlay panel
- Escape key dismisses the overlay
- Backdrop click dismisses the overlay
- Return focus to toggle button on close
- Initial focus on first focusable element or `initialFocusId` target

## Behavior Contract

### Desktop mode (`mobile: false`)
- Sidebar is always visible in the layout, either expanded or collapsed to rail
- `toggle()` switches between expanded and collapsed (icon rail)
- `expand()` sets `expanded = true`; `collapse()` sets `expanded = false`
- No focus trap, no scroll lock, no backdrop
- `overlayOpen` is always `false` in desktop mode
- `onExpandedChange` fires when `expanded` transitions

### Mobile mode (`mobile: true`)
- Sidebar is hidden by default; `overlayOpen` controls visibility
- `toggle()` toggles `overlayOpen`
- `expand()` and `collapse()` are no-ops
- When `overlayOpen = true`: focus trap, scroll lock, backdrop visible
- Escape key closes overlay (configurable via `closeOnEscape`)
- Outside pointer closes overlay (configurable via `closeOnOutsidePointer`)
- Focus returns to toggle button on close

### Mode switching (`setMobile`)
- `setMobile(true)`: closes any expanded state, sidebar enters overlay mode (closed by default)
- `setMobile(false)`: closes overlay if open, sidebar enters persistent mode with `expanded = defaultExpanded`

## Contract Prop Shapes

### `getSidebarProps()`
Props for the sidebar container element.
```ts
// Desktop mode:
{
  id: string                           // `${id}-panel`
  role: 'navigation'
  'aria-label': string
  'data-collapsed': 'true' | 'false'  // reflects !expanded
  'data-mobile': 'true' | 'false'
}

// Mobile mode (when overlayOpen):
{
  id: string                           // `${id}-panel`
  role: 'dialog'
  'aria-modal': 'true'
  'aria-label': string
  'data-collapsed': 'false'
  'data-mobile': 'true'
  'data-initial-focus'?: string
  onKeyDown: (event) => void
}
```

### `getToggleProps()`
Props for the expand/collapse toggle button.
```ts
{
  id: string                           // `${id}-toggle`
  role: 'button'
  tabindex: '0'
  'aria-expanded': 'true' | 'false'   // desktop: reflects expanded; mobile: reflects overlayOpen
  'aria-controls': string             // `${id}-panel`
  'aria-label': string                // 'Expand sidebar' | 'Collapse sidebar' | 'Open sidebar' | 'Close sidebar'
  onClick: () => void
}
```

### `getOverlayProps()`
Props for the mobile overlay backdrop. Only meaningful in mobile mode.
```ts
{
  id: string                           // `${id}-overlay`
  hidden: boolean                      // !overlayOpen || !mobile
  'data-open': 'true' | 'false'
  onPointerDownOutside: () => void
  onFocusOutside: () => void
}
```

### `getRailProps()`
Props for the collapsed rail container. Only meaningful in desktop mode.
```ts
{
  id: string                           // `${id}-rail`
  role: 'navigation'
  'aria-label': string
  'data-visible': 'true' | 'false'    // reflects !expanded && !mobile
}
```

## Transitions Table

| Event / Action | Current State | Next State / Effect |
|---------------|---------------|---------------------|
| `toggle()` | `mobile = false`, `expanded = false` | `expanded = true`; fire `onExpandedChange(true)` |
| `toggle()` | `mobile = false`, `expanded = true` | `expanded = false`; fire `onExpandedChange(false)` |
| `toggle()` | `mobile = true`, `overlayOpen = false` | `overlayOpen = true`; focus management begins |
| `toggle()` | `mobile = true`, `overlayOpen = true` | `overlayOpen = false`; focus returns to toggle |
| `expand()` | `mobile = false`, `expanded = false` | `expanded = true`; fire `onExpandedChange(true)` |
| `expand()` | `mobile = false`, `expanded = true` | no-op |
| `expand()` | `mobile = true` | no-op |
| `collapse()` | `mobile = false`, `expanded = true` | `expanded = false`; fire `onExpandedChange(false)` |
| `collapse()` | `mobile = false`, `expanded = false` | no-op |
| `collapse()` | `mobile = true` | no-op |
| `openOverlay()` | `mobile = true`, `overlayOpen = false` | `overlayOpen = true`; focus management begins |
| `openOverlay()` | `mobile = true`, `overlayOpen = true` | no-op |
| `openOverlay()` | `mobile = false` | no-op |
| `closeOverlay(intent)` | `mobile = true`, `overlayOpen = true` | `overlayOpen = false`; focus returns to toggle |
| `closeOverlay(intent)` | `mobile = true`, `overlayOpen = false` | no-op |
| `closeOverlay(intent)` | `mobile = false` | no-op |
| `setMobile(true)` | `mobile = false` | `mobile = true`; `overlayOpen = false` |
| `setMobile(false)` | `mobile = true` | `mobile = false`; `overlayOpen = false`; `expanded = defaultExpanded` |
| `setMobile(value)` | `mobile = value` | no-op |
| `handleKeyDown(Escape)` | `mobile = true`, `overlayOpen = true`, `closeOnEscape = true` | `closeOverlay('escape')` |
| `handleKeyDown(Escape)` | `mobile = false` OR `closeOnEscape = false` | no-op |
| `handleOutsidePointer()` | `mobile = true`, `overlayOpen = true`, `closeOnOutsidePointer = true` | `closeOverlay('outside-pointer')` |
| `handleOutsidePointer()` | `mobile = false` OR `closeOnOutsidePointer = false` | no-op |
| `handleOutsideFocus()` | `mobile = true`, `overlayOpen = true` | `closeOverlay('outside-focus')` |

### Derived state reactions

| State Change | `isFocusTrapped` | `shouldLockScroll` |
|-------------|------------------|--------------------|
| desktop, any expanded | `false` | `false` |
| mobile, overlayOpen = true | `true` | `true` |
| mobile, overlayOpen = false | `false` | `false` |

## Invariants

1. `expanded` and `overlayOpen` are independent signals; `expanded` governs desktop rail/full, `overlayOpen` governs mobile visibility.
2. When `mobile = false`, `overlayOpen` must be `false`. Switching to desktop mode force-closes the overlay.
3. When `mobile = true`, `expand()` and `collapse()` are no-ops; `expanded` value is irrelevant to rendering.
4. When `mobile = false`, `openOverlay()` and `closeOverlay()` are no-ops.
5. `getSidebarProps()` must return `role="navigation"` in desktop mode and `role="dialog"` with `aria-modal="true"` in mobile overlay mode (when open).
6. `getToggleProps()` must always include `aria-expanded` reflecting the appropriate state (`expanded` in desktop, `overlayOpen` in mobile).
7. `getOverlayProps().hidden` must be `true` whenever `mobile = false` or `overlayOpen = false`.
8. `getRailProps()['data-visible']` must be `'true'` only when `!expanded && !mobile`.
9. `setMobile(false)` must restore `expanded` to `defaultExpanded`.
10. Focus trap and scroll lock must only be active when `mobile = true` AND `overlayOpen = true`.
11. The sidebar must compose `createDialog` for mobile overlay mode; no duplication of dialog internals.
12. `onExpandedChange` must fire only on actual transitions of `expanded`, not on no-ops or mobile mode changes.

## Adapter Expectations

UIKit adapters MUST bind to the headless model as follows:

**Signals read (reactive, drive re-renders):**
- `state.expanded()` — whether full-width or icon rail (desktop)
- `state.overlayOpen()` — whether mobile overlay is visible
- `state.mobile()` — whether in mobile/overlay mode
- `state.isFocusTrapped()` — whether focus trap should be active
- `state.shouldLockScroll()` — whether body scroll lock should be active
- `state.restoreTargetId()` — element id to focus after overlay close
- `state.initialFocusTargetId()` — element id to focus on overlay open

**Actions called (event handlers, never mutate state directly):**
- `actions.toggle()` — toggle expand/collapse (desktop) or open/close (mobile)
- `actions.expand()` — expand sidebar (desktop only)
- `actions.collapse()` — collapse to rail (desktop only)
- `actions.openOverlay()` — open mobile overlay
- `actions.closeOverlay(intent?)` — close mobile overlay
- `actions.setMobile(value)` — switch between desktop/mobile mode (typically driven by a media query observer)
- `actions.handleKeyDown(event)` — Escape handling for mobile overlay
- `actions.handleOutsidePointer()` — outside click for mobile overlay
- `actions.handleOutsideFocus()` — outside focus for mobile overlay

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getSidebarProps()` — spread onto the sidebar panel element (role switches between `navigation` and `dialog` based on mode)
- `contracts.getToggleProps()` — spread onto the toggle button element
- `contracts.getOverlayProps()` — spread onto the mobile backdrop element
- `contracts.getRailProps()` — spread onto the collapsed rail element

**UIKit-only concerns (NOT in headless):**
- Lifecycle events (`cv-expand`, `cv-collapse`, `cv-overlay-open`, `cv-overlay-close`)
- CSS transitions for expand/collapse and slide-in overlay animations
- Backdrop rendering and styling
- Scroll lock implementation (headless provides the signal, UIKit applies the side effect)
- Focus trap implementation (headless provides the signal, UIKit manages DOM focus)
- Media query observer for automatic `setMobile()` calls based on breakpoint
- Icon-only rendering logic for rail mode

## Minimum Test Matrix

- Default state: `expanded = true`, `overlayOpen = false`, `mobile = false`
- `toggle()` in desktop mode toggles `expanded`
- `toggle()` in mobile mode toggles `overlayOpen`
- `expand()` and `collapse()` work in desktop, no-op in mobile
- `openOverlay()` and `closeOverlay()` work in mobile, no-op in desktop
- `setMobile(true)` closes overlay, switches mode
- `setMobile(false)` closes overlay, restores `expanded` to `defaultExpanded`
- `getSidebarProps()` returns `role="navigation"` in desktop, `role="dialog"` in mobile overlay
- `getToggleProps()` returns correct `aria-expanded` for each mode
- `getOverlayProps().hidden` is `true` in desktop mode
- `getRailProps()['data-visible']` is `'true'` only when collapsed in desktop mode
- Escape key closes mobile overlay (when enabled)
- Outside pointer closes mobile overlay (when enabled)
- `onExpandedChange` fires on expand/collapse transitions only
- `isFocusTrapped` and `shouldLockScroll` are `true` only when mobile overlay is open
- Custom `id` propagates to all generated ids
- `defaultExpanded: false` starts sidebar collapsed

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no `@statx/*` in headless core.
- **Layering**: `core -> interactions -> a11y-contracts -> adapters`; adapters remain thin mappings.
- **Independence**: No imports from `@project/*`, `apps/*`, or other out-of-package modules.
- **Composition**: `createSidebar` composes `createDialog` for mobile overlay mode; no duplication of dialog internals.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- Inline-end placement (right sidebar in LTR)
- Nested sidebars or multiple sidebar instances
- Swipe-to-dismiss gesture handling for mobile overlay
- Complex animations/transitions (CSS/JS animations are UIKit concerns)
- Resizable sidebar (drag to resize width)
