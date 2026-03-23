import {describe, expect, it, vi} from 'vitest'
import {createSidebar} from './index'

describe('createSidebar', () => {
  // ── default state ──────────────────────────────────────────
  it('defaults to expanded=true, overlayOpen=false, mobile=false', () => {
    const sb = createSidebar()
    expect(sb.state.expanded()).toBe(true)
    expect(sb.state.overlayOpen()).toBe(false)
    expect(sb.state.mobile()).toBe(false)
  })

  it('defaultExpanded: false starts sidebar collapsed', () => {
    const sb = createSidebar({defaultExpanded: false})
    expect(sb.state.expanded()).toBe(false)
  })

  // ── toggle in desktop mode ─────────────────────────────────
  it('toggle() in desktop mode toggles expanded', () => {
    const sb = createSidebar()
    expect(sb.state.expanded()).toBe(true)
    sb.actions.toggle()
    expect(sb.state.expanded()).toBe(false)
    sb.actions.toggle()
    expect(sb.state.expanded()).toBe(true)
  })

  // ── toggle in mobile mode ──────────────────────────────────
  it('toggle() in mobile mode toggles overlayOpen', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    expect(sb.state.overlayOpen()).toBe(false)
    sb.actions.toggle()
    expect(sb.state.overlayOpen()).toBe(true)
    sb.actions.toggle()
    expect(sb.state.overlayOpen()).toBe(false)
  })

  // ── expand / collapse desktop ──────────────────────────────
  it('expand() sets expanded=true, collapse() sets expanded=false', () => {
    const sb = createSidebar({defaultExpanded: false})
    sb.actions.expand()
    expect(sb.state.expanded()).toBe(true)
    sb.actions.collapse()
    expect(sb.state.expanded()).toBe(false)
  })

  it('expand() is no-op when already expanded', () => {
    const cb = vi.fn()
    const sb = createSidebar({onExpandedChange: cb})
    sb.actions.expand() // already expanded
    expect(cb).not.toHaveBeenCalled()
  })

  it('collapse() is no-op when already collapsed', () => {
    const cb = vi.fn()
    const sb = createSidebar({defaultExpanded: false, onExpandedChange: cb})
    sb.actions.collapse()
    expect(cb).not.toHaveBeenCalled()
  })

  it('expand() and collapse() are no-ops in mobile mode', () => {
    const cb = vi.fn()
    const sb = createSidebar({onExpandedChange: cb})
    sb.actions.setMobile(true)
    cb.mockClear()
    sb.actions.expand()
    sb.actions.collapse()
    expect(cb).not.toHaveBeenCalled()
  })

  // ── openOverlay / closeOverlay ─────────────────────────────
  it('openOverlay() opens overlay in mobile mode', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    sb.actions.openOverlay()
    expect(sb.state.overlayOpen()).toBe(true)
  })

  it('openOverlay() is no-op when already open', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    sb.actions.openOverlay()
    sb.actions.openOverlay() // no-op
    expect(sb.state.overlayOpen()).toBe(true)
  })

  it('openOverlay() is no-op in desktop mode', () => {
    const sb = createSidebar()
    sb.actions.openOverlay()
    expect(sb.state.overlayOpen()).toBe(false)
  })

  it('closeOverlay() closes overlay in mobile mode', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    sb.actions.openOverlay()
    sb.actions.closeOverlay()
    expect(sb.state.overlayOpen()).toBe(false)
  })

  it('closeOverlay() is no-op in desktop mode', () => {
    const sb = createSidebar()
    sb.actions.closeOverlay()
    expect(sb.state.overlayOpen()).toBe(false)
  })

  // ── setMobile ──────────────────────────────────────────────
  it('setMobile(true) switches to mobile, closes overlay', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    expect(sb.state.mobile()).toBe(true)
    expect(sb.state.overlayOpen()).toBe(false)
  })

  it('setMobile(false) closes overlay, restores expanded to defaultExpanded', () => {
    const sb = createSidebar({defaultExpanded: false})
    sb.actions.setMobile(true)
    sb.actions.openOverlay()
    sb.actions.setMobile(false)
    expect(sb.state.mobile()).toBe(false)
    expect(sb.state.overlayOpen()).toBe(false)
    expect(sb.state.expanded()).toBe(false)
  })

  it('setMobile(false) restores expanded to defaultExpanded=true', () => {
    const sb = createSidebar({defaultExpanded: true})
    sb.actions.setMobile(true)
    sb.actions.setMobile(false)
    expect(sb.state.expanded()).toBe(true)
  })

  it('setMobile with same value is no-op', () => {
    const sb = createSidebar()
    sb.actions.setMobile(false) // already false
    expect(sb.state.mobile()).toBe(false)
  })

  // ── getSidebarProps ────────────────────────────────────────
  it('getSidebarProps() returns role=navigation in desktop mode', () => {
    const sb = createSidebar()
    const props = sb.contracts.getSidebarProps()
    expect(props.role).toBe('navigation')
    expect(props['aria-label']).toBe('Sidebar navigation')
    expect(props['data-collapsed']).toBe('false')
    expect(props['data-mobile']).toBe('false')
  })

  it('getSidebarProps() returns data-collapsed=true when collapsed in desktop', () => {
    const sb = createSidebar({defaultExpanded: false})
    expect(sb.contracts.getSidebarProps()['data-collapsed']).toBe('true')
  })

  it('getSidebarProps() returns role=dialog in mobile overlay mode when open', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    sb.actions.openOverlay()
    const props = sb.contracts.getSidebarProps()
    expect(props.role).toBe('dialog')
    expect(props['aria-modal']).toBe('true')
    expect(props['data-mobile']).toBe('true')
    expect(props['data-collapsed']).toBe('false')
    expect(typeof props.onKeyDown).toBe('function')
  })

  it('getSidebarProps() returns role=navigation in mobile when overlay closed', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    const props = sb.contracts.getSidebarProps()
    expect(props.role).toBe('navigation')
  })

  // ── getToggleProps ─────────────────────────────────────────
  it('getToggleProps() returns correct aria-expanded in desktop', () => {
    const sb = createSidebar()
    expect(sb.contracts.getToggleProps()['aria-expanded']).toBe('true')
    sb.actions.collapse()
    expect(sb.contracts.getToggleProps()['aria-expanded']).toBe('false')
  })

  it('getToggleProps() returns correct aria-expanded in mobile', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    expect(sb.contracts.getToggleProps()['aria-expanded']).toBe('false')
    sb.actions.openOverlay()
    expect(sb.contracts.getToggleProps()['aria-expanded']).toBe('true')
  })

  it('getToggleProps() onClick triggers toggle', () => {
    const sb = createSidebar()
    sb.contracts.getToggleProps().onClick()
    expect(sb.state.expanded()).toBe(false)
  })

  it('getToggleProps() has correct aria-label in desktop', () => {
    const sb = createSidebar()
    expect(sb.contracts.getToggleProps()['aria-label']).toBe('Collapse sidebar')
    sb.actions.collapse()
    expect(sb.contracts.getToggleProps()['aria-label']).toBe('Expand sidebar')
  })

  it('getToggleProps() has correct aria-label in mobile', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    expect(sb.contracts.getToggleProps()['aria-label']).toBe('Open sidebar')
    sb.actions.openOverlay()
    expect(sb.contracts.getToggleProps()['aria-label']).toBe('Close sidebar')
  })

  // ── getOverlayProps ────────────────────────────────────────
  it('getOverlayProps().hidden is true in desktop mode', () => {
    const sb = createSidebar()
    expect(sb.contracts.getOverlayProps().hidden).toBe(true)
  })

  it('getOverlayProps().hidden is true in mobile when overlay closed', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    expect(sb.contracts.getOverlayProps().hidden).toBe(true)
  })

  it('getOverlayProps().hidden is false in mobile when overlay open', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    sb.actions.openOverlay()
    expect(sb.contracts.getOverlayProps().hidden).toBe(false)
    expect(sb.contracts.getOverlayProps()['data-open']).toBe('true')
  })

  // ── getRailProps ───────────────────────────────────────────
  it('getRailProps() data-visible is true only when collapsed in desktop', () => {
    const sb = createSidebar({defaultExpanded: false})
    expect(sb.contracts.getRailProps()['data-visible']).toBe('true')
  })

  it('getRailProps() data-visible is false when expanded', () => {
    const sb = createSidebar()
    expect(sb.contracts.getRailProps()['data-visible']).toBe('false')
  })

  it('getRailProps() data-visible is false in mobile mode', () => {
    const sb = createSidebar({defaultExpanded: false})
    sb.actions.setMobile(true)
    expect(sb.contracts.getRailProps()['data-visible']).toBe('false')
  })

  // ── Escape key ─────────────────────────────────────────────
  it('Escape closes mobile overlay when enabled', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    sb.actions.openOverlay()
    sb.actions.handleKeyDown({key: 'Escape'})
    expect(sb.state.overlayOpen()).toBe(false)
  })

  it('Escape does not close when closeOnEscape=false', () => {
    const sb = createSidebar({closeOnEscape: false})
    sb.actions.setMobile(true)
    sb.actions.openOverlay()
    sb.actions.handleKeyDown({key: 'Escape'})
    expect(sb.state.overlayOpen()).toBe(true)
  })

  it('Escape is no-op in desktop mode', () => {
    const sb = createSidebar()
    sb.actions.handleKeyDown({key: 'Escape'})
    expect(sb.state.expanded()).toBe(true) // unchanged
  })

  // ── outside pointer ────────────────────────────────────────
  it('outside pointer closes mobile overlay when enabled', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    sb.actions.openOverlay()
    sb.actions.handleOutsidePointer()
    expect(sb.state.overlayOpen()).toBe(false)
  })

  it('outside pointer does not close when closeOnOutsidePointer=false', () => {
    const sb = createSidebar({closeOnOutsidePointer: false})
    sb.actions.setMobile(true)
    sb.actions.openOverlay()
    sb.actions.handleOutsidePointer()
    expect(sb.state.overlayOpen()).toBe(true)
  })

  it('outside pointer is no-op in desktop mode', () => {
    const sb = createSidebar()
    sb.actions.handleOutsidePointer()
    expect(sb.state.expanded()).toBe(true)
  })

  // ── outside focus ──────────────────────────────────────────
  it('outside focus closes mobile overlay', () => {
    const sb = createSidebar()
    sb.actions.setMobile(true)
    sb.actions.openOverlay()
    sb.actions.handleOutsideFocus()
    expect(sb.state.overlayOpen()).toBe(false)
  })

  it('outside focus is no-op in desktop mode', () => {
    const sb = createSidebar()
    sb.actions.handleOutsideFocus()
    expect(sb.state.expanded()).toBe(true)
  })

  // ── onExpandedChange ───────────────────────────────────────
  it('onExpandedChange fires on expand/collapse transitions', () => {
    const cb = vi.fn()
    const sb = createSidebar({onExpandedChange: cb})
    sb.actions.collapse()
    expect(cb).toHaveBeenCalledWith(false)
    sb.actions.expand()
    expect(cb).toHaveBeenCalledWith(true)
  })

  it('onExpandedChange does not fire on no-ops', () => {
    const cb = vi.fn()
    const sb = createSidebar({onExpandedChange: cb})
    sb.actions.expand() // already expanded
    expect(cb).not.toHaveBeenCalled()
  })

  // ── isFocusTrapped / shouldLockScroll ──────────────────────
  it('isFocusTrapped and shouldLockScroll are true only when mobile overlay open', () => {
    const sb = createSidebar()
    expect(sb.state.isFocusTrapped()).toBe(false)
    expect(sb.state.shouldLockScroll()).toBe(false)

    sb.actions.setMobile(true)
    expect(sb.state.isFocusTrapped()).toBe(false)
    expect(sb.state.shouldLockScroll()).toBe(false)

    sb.actions.openOverlay()
    expect(sb.state.isFocusTrapped()).toBe(true)
    expect(sb.state.shouldLockScroll()).toBe(true)

    sb.actions.closeOverlay()
    expect(sb.state.isFocusTrapped()).toBe(false)
    expect(sb.state.shouldLockScroll()).toBe(false)
  })

  it('isFocusTrapped is false in desktop even when expanded', () => {
    const sb = createSidebar()
    expect(sb.state.isFocusTrapped()).toBe(false)
  })

  // ── custom id propagation ──────────────────────────────────
  it('custom id propagates to all generated ids', () => {
    const sb = createSidebar({id: 'nav'})
    expect(sb.contracts.getSidebarProps().id).toBe('nav-panel')
    expect(sb.contracts.getToggleProps().id).toBe('nav-toggle')
    expect(sb.contracts.getOverlayProps().id).toBe('nav-overlay')
    expect(sb.contracts.getRailProps().id).toBe('nav-rail')
    expect(sb.contracts.getToggleProps()['aria-controls']).toBe('nav-panel')
  })

  // ── restoreTargetId / initialFocusTargetId ─────────────────
  it('restoreTargetId returns toggle id after overlay close', () => {
    const sb = createSidebar({id: 'sb'})
    sb.actions.setMobile(true)
    sb.actions.openOverlay()
    sb.actions.closeOverlay()
    expect(sb.state.restoreTargetId()).toBe('sb-toggle')
  })

  it('initialFocusTargetId reflects initialFocusId option', () => {
    const sb = createSidebar({initialFocusId: 'search-input'})
    expect(sb.state.initialFocusTargetId()).toBe('search-input')
  })

  it('getSidebarProps includes data-initial-focus when initialFocusId set and mobile overlay open', () => {
    const sb = createSidebar({initialFocusId: 'search-input'})
    sb.actions.setMobile(true)
    sb.actions.openOverlay()
    const props = sb.contracts.getSidebarProps()
    expect(props['data-initial-focus']).toBe('search-input')
  })
})
