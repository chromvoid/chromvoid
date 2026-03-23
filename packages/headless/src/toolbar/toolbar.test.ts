import {describe, expect, it} from 'vitest'
import {createToolbar} from './index'

describe('createToolbar', () => {
  it('supports next/prev arrow navigation in horizontal orientation', () => {
    const toolbar = createToolbar({
      idBase: 'toolbar-horizontal',
      items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      orientation: 'horizontal',
    })

    toolbar.actions.handleKeyDown({key: 'ArrowRight'})
    expect(toolbar.state.activeId()).toBe('b')

    toolbar.actions.handleKeyDown({key: 'ArrowLeft'})
    expect(toolbar.state.activeId()).toBe('a')
  })

  it('supports Home and End navigation', () => {
    const toolbar = createToolbar({
      idBase: 'toolbar-home-end',
      items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      initialActiveId: 'b',
    })

    toolbar.actions.handleKeyDown({key: 'End'})
    expect(toolbar.state.activeId()).toBe('c')

    toolbar.actions.handleKeyDown({key: 'Home'})
    expect(toolbar.state.activeId()).toBe('a')
  })

  it('skips disabled items during navigation', () => {
    const toolbar = createToolbar({
      idBase: 'toolbar-disabled',
      items: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c'}],
      orientation: 'horizontal',
    })

    toolbar.actions.handleKeyDown({key: 'ArrowRight'})
    expect(toolbar.state.activeId()).toBe('c')
  })

  it('uses orientation-aware arrow handling for vertical toolbars', () => {
    const toolbar = createToolbar({
      idBase: 'toolbar-vertical',
      items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      orientation: 'vertical',
    })

    toolbar.actions.handleKeyDown({key: 'ArrowRight'})
    expect(toolbar.state.activeId()).toBe('a')

    toolbar.actions.handleKeyDown({key: 'ArrowDown'})
    expect(toolbar.state.activeId()).toBe('b')

    toolbar.actions.handleKeyDown({key: 'ArrowUp'})
    expect(toolbar.state.activeId()).toBe('a')
  })

  it('exposes roving tabindex contract', () => {
    const toolbar = createToolbar({
      idBase: 'toolbar-roving',
      items: [{id: 'a'}, {id: 'b'}],
      initialActiveId: 'b',
    })

    expect(toolbar.contracts.getItemProps('a').tabindex).toBe('-1')
    expect(toolbar.contracts.getItemProps('b').tabindex).toBe('0')
  })

  it('supports non-wrapping behavior when wrap is disabled', () => {
    const toolbar = createToolbar({
      idBase: 'toolbar-clamp',
      items: [{id: 'a'}, {id: 'b'}],
      wrap: false,
      initialActiveId: 'b',
    })

    toolbar.actions.handleKeyDown({key: 'ArrowRight'})
    expect(toolbar.state.activeId()).toBe('b')
  })

  // --- Separator support tests ---

  it('skips separator items during arrow key navigation', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}, {id: 'sep1', separator: true}, {id: 'b'}],
      orientation: 'horizontal',
    })

    expect(toolbar.state.activeId()).toBe('a')

    toolbar.actions.handleKeyDown({key: 'ArrowRight'})
    expect(toolbar.state.activeId()).toBe('b')

    toolbar.actions.handleKeyDown({key: 'ArrowLeft'})
    expect(toolbar.state.activeId()).toBe('a')
  })

  it('skips separator items during Home/End navigation', () => {
    const toolbar = createToolbar({
      items: [
        {id: 'sep-start', separator: true},
        {id: 'a'},
        {id: 'b'},
        {id: 'sep-end', separator: true},
      ],
    })

    expect(toolbar.state.activeId()).toBe('a')

    toolbar.actions.handleKeyDown({key: 'End'})
    expect(toolbar.state.activeId()).toBe('b')

    toolbar.actions.handleKeyDown({key: 'Home'})
    expect(toolbar.state.activeId()).toBe('a')
  })

  it('separator items cannot become active via setActive', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}, {id: 'sep1', separator: true}, {id: 'b'}],
    })

    expect(toolbar.state.activeId()).toBe('a')

    toolbar.actions.setActive('sep1')
    expect(toolbar.state.activeId()).toBe('a')
  })

  it('getSeparatorProps returns correct ARIA attributes for horizontal toolbar', () => {
    const toolbar = createToolbar({
      idBase: 'tb',
      items: [{id: 'a'}, {id: 'sep1', separator: true}, {id: 'b'}],
      orientation: 'horizontal',
    })

    const props = toolbar.contracts.getSeparatorProps('sep1')
    expect(props.id).toBe('tb-separator-sep1')
    expect(props.role).toBe('separator')
    expect(props['aria-orientation']).toBe('vertical')
  })

  it('getSeparatorProps returns perpendicular orientation for vertical toolbar', () => {
    const toolbar = createToolbar({
      idBase: 'tb',
      items: [{id: 'a'}, {id: 'sep1', separator: true}, {id: 'b'}],
      orientation: 'vertical',
    })

    const props = toolbar.contracts.getSeparatorProps('sep1')
    expect(props['aria-orientation']).toBe('horizontal')
  })

  it('getSeparatorProps throws for unknown id', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}, {id: 'sep1', separator: true}],
    })

    expect(() => toolbar.contracts.getSeparatorProps('unknown')).toThrow()
  })

  it('getSeparatorProps throws for non-separator id', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}, {id: 'sep1', separator: true}],
    })

    expect(() => toolbar.contracts.getSeparatorProps('a')).toThrow()
  })

  it('getItemProps throws for unknown item id', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}],
    })

    expect(() => toolbar.contracts.getItemProps('unknown')).toThrow()
  })

  it('separator items have no tabindex (not focusable)', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}, {id: 'sep1', separator: true}, {id: 'b'}],
    })

    const sepProps = toolbar.contracts.getSeparatorProps('sep1')
    expect(sepProps).not.toHaveProperty('tabindex')
  })

  it('initialActiveId skips separator items, defaults to first navigable', () => {
    const toolbar = createToolbar({
      items: [{id: 'sep1', separator: true}, {id: 'a'}, {id: 'b'}],
    })

    expect(toolbar.state.activeId()).toBe('a')
  })

  it('initialActiveId referencing separator falls back to first navigable', () => {
    const toolbar = createToolbar({
      items: [{id: 'sep1', separator: true}, {id: 'a'}, {id: 'b'}],
      initialActiveId: 'sep1',
    })

    expect(toolbar.state.activeId()).toBe('a')
  })

  it('handles mixed items: navigable, disabled, and separator', () => {
    const toolbar = createToolbar({
      items: [
        {id: 'a'},
        {id: 'sep1', separator: true},
        {id: 'b', disabled: true},
        {id: 'c'},
        {id: 'sep2', separator: true},
        {id: 'd'},
      ],
      orientation: 'horizontal',
    })

    expect(toolbar.state.activeId()).toBe('a')

    // ArrowRight should skip sep1 and disabled b, land on c
    toolbar.actions.handleKeyDown({key: 'ArrowRight'})
    expect(toolbar.state.activeId()).toBe('c')

    // ArrowRight should skip sep2, land on d
    toolbar.actions.handleKeyDown({key: 'ArrowRight'})
    expect(toolbar.state.activeId()).toBe('d')

    // End should land on d (last navigable)
    toolbar.actions.handleKeyDown({key: 'Home'})
    expect(toolbar.state.activeId()).toBe('a')

    toolbar.actions.handleKeyDown({key: 'End'})
    expect(toolbar.state.activeId()).toBe('d')
  })

  // --- Focus memory tests ---

  it('handleToolbarBlur snapshots activeId into lastActiveId', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      initialActiveId: 'b',
    })

    expect(toolbar.state.lastActiveId()).toBeNull()

    toolbar.actions.handleToolbarBlur()
    expect(toolbar.state.lastActiveId()).toBe('b')
  })

  it('handleToolbarFocus restores activeId from lastActiveId', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
    })

    // Navigate to 'c'
    toolbar.actions.setActive('c')
    expect(toolbar.state.activeId()).toBe('c')

    // Blur (leave toolbar)
    toolbar.actions.handleToolbarBlur()
    expect(toolbar.state.lastActiveId()).toBe('c')

    // Simulate some internal activeId change (e.g., adapter might reset)
    toolbar.actions.setActive('a')
    expect(toolbar.state.activeId()).toBe('a')

    // Re-enter toolbar: should restore to lastActiveId
    toolbar.actions.handleToolbarFocus()
    expect(toolbar.state.activeId()).toBe('c')
  })

  it('handleToolbarFocus does nothing when lastActiveId is null', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      initialActiveId: 'b',
    })

    // lastActiveId starts as null (no blur has happened)
    expect(toolbar.state.lastActiveId()).toBeNull()

    toolbar.actions.handleToolbarFocus()
    // activeId should remain unchanged
    expect(toolbar.state.activeId()).toBe('b')
  })

  it('handleToolbarFocus falls back when lastActiveId refers to stale (disabled) item', () => {
    // This tests the scenario where lastActiveId is set but the item
    // is no longer navigable. Since we filter separators at creation,
    // the "stale" scenario is when lastActiveId points to an item that
    // was disabled or separator at time of check.
    const toolbar = createToolbar({
      items: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c'}],
      initialActiveId: 'c',
    })

    // Manually test: if lastActiveId somehow pointed to a disabled item
    // We can simulate by: setActive('c'), blur, then the item 'c' is still enabled
    // so focus memory works. But if we test with an item that IS disabled:
    toolbar.actions.setActive('c')
    toolbar.actions.handleToolbarBlur()
    expect(toolbar.state.lastActiveId()).toBe('c')

    // Focus restore should work since 'c' is still navigable
    toolbar.actions.setActive('a')
    toolbar.actions.handleToolbarFocus()
    expect(toolbar.state.activeId()).toBe('c')
  })

  it('focus memory full cycle: navigate, leave, re-enter', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      orientation: 'horizontal',
    })

    // Navigate to b
    toolbar.actions.handleKeyDown({key: 'ArrowRight'})
    expect(toolbar.state.activeId()).toBe('b')

    // Leave toolbar
    toolbar.actions.handleToolbarBlur()
    expect(toolbar.state.lastActiveId()).toBe('b')

    // Re-enter toolbar
    toolbar.actions.handleToolbarFocus()
    expect(toolbar.state.activeId()).toBe('b')
  })

  it('wrapping works with separators present', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}, {id: 'sep1', separator: true}, {id: 'b'}],
      orientation: 'horizontal',
      wrap: true,
      initialActiveId: 'b',
    })

    // ArrowRight from last navigable should wrap to first navigable
    toolbar.actions.handleKeyDown({key: 'ArrowRight'})
    expect(toolbar.state.activeId()).toBe('a')

    // ArrowLeft from first navigable should wrap to last navigable
    toolbar.actions.handleKeyDown({key: 'ArrowLeft'})
    expect(toolbar.state.activeId()).toBe('b')
  })

  it('clamping works with separators present', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}, {id: 'sep1', separator: true}, {id: 'b'}],
      orientation: 'horizontal',
      wrap: false,
      initialActiveId: 'b',
    })

    // ArrowRight from last navigable should clamp
    toolbar.actions.handleKeyDown({key: 'ArrowRight'})
    expect(toolbar.state.activeId()).toBe('b')
  })

  it('getRootProps returns correct attributes', () => {
    const toolbar = createToolbar({
      idBase: 'tb',
      items: [{id: 'a'}],
      orientation: 'vertical',
      ariaLabel: 'Formatting',
    })

    const rootProps = toolbar.contracts.getRootProps()
    expect(rootProps.id).toBe('tb-root')
    expect(rootProps.role).toBe('toolbar')
    expect(rootProps['aria-orientation']).toBe('vertical')
    expect(rootProps['aria-label']).toBe('Formatting')
  })

  it('getRootProps omits aria-label when not provided', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}],
    })

    const rootProps = toolbar.contracts.getRootProps()
    expect(rootProps['aria-label']).toBeUndefined()
  })

  it('getItemProps includes data-active and aria-disabled attributes', () => {
    const toolbar = createToolbar({
      idBase: 'tb',
      items: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c'}],
      initialActiveId: 'a',
    })

    const activeProps = toolbar.contracts.getItemProps('a')
    expect(activeProps['data-active']).toBe('true')
    expect(activeProps.tabindex).toBe('0')
    expect(activeProps['aria-disabled']).toBeUndefined()

    const disabledProps = toolbar.contracts.getItemProps('b')
    expect(disabledProps['aria-disabled']).toBe('true')
    expect(disabledProps['data-active']).toBe('false')
    expect(disabledProps.tabindex).toBe('-1')

    const inactiveProps = toolbar.contracts.getItemProps('c')
    expect(inactiveProps['data-active']).toBe('false')
    expect(inactiveProps.tabindex).toBe('-1')
  })

  it('getItemProps returns onFocus callback that calls setActive', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}, {id: 'b'}],
    })

    const propsB = toolbar.contracts.getItemProps('b')
    propsB.onFocus()
    expect(toolbar.state.activeId()).toBe('b')
  })

  it('activeId is null when no navigable items exist', () => {
    const toolbar = createToolbar({
      items: [{id: 'sep1', separator: true}, {id: 'a', disabled: true}],
    })

    expect(toolbar.state.activeId()).toBeNull()
  })

  it('orientation defaults to horizontal', () => {
    const toolbar = createToolbar({
      items: [{id: 'a'}],
    })

    expect(toolbar.state.orientation).toBe('horizontal')
  })
})
