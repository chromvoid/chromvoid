import {describe, expect, it} from 'vitest'
import {createTabs} from './index'

describe('createTabs', () => {
  it('uses automatic activation by default', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
    })

    tabs.actions.handleKeyDown({
      key: 'ArrowRight',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(tabs.state.activeTabId()).toBe('b')
    expect(tabs.state.selectedTabId()).toBe('b')
  })

  it('keeps manual activation until Enter/Space', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      activationMode: 'manual',
    })

    tabs.actions.handleKeyDown({
      key: 'ArrowRight',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(tabs.state.activeTabId()).toBe('b')
    expect(tabs.state.selectedTabId()).toBe('a')

    tabs.actions.handleKeyDown({
      key: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(tabs.state.selectedTabId()).toBe('b')
  })

  it('supports Home/End navigation', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
    })

    tabs.actions.handleKeyDown({
      key: 'End',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(tabs.state.activeTabId()).toBe('c')

    tabs.actions.handleKeyDown({
      key: 'Home',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(tabs.state.activeTabId()).toBe('a')
  })

  it('skips disabled tabs in navigation', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c'}],
    })

    tabs.actions.handleKeyDown({
      key: 'ArrowRight',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(tabs.state.activeTabId()).toBe('c')
  })

  it('uses vertical ArrowUp/ArrowDown mapping when orientation is vertical', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      orientation: 'vertical',
    })

    tabs.actions.handleKeyDown({
      key: 'ArrowDown',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(tabs.state.activeTabId()).toBe('b')

    tabs.actions.handleKeyDown({
      key: 'ArrowUp',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(tabs.state.activeTabId()).toBe('a')
  })

  it('keeps active/selected in sync for automatic first/last movement', () => {
    const tabs = createTabs({
      tabs: [{id: 'a', disabled: true}, {id: 'b'}, {id: 'c'}],
    })

    tabs.actions.moveLast()
    expect(tabs.state.activeTabId()).toBe('c')
    expect(tabs.state.selectedTabId()).toBe('c')

    tabs.actions.moveFirst()
    expect(tabs.state.activeTabId()).toBe('b')
    expect(tabs.state.selectedTabId()).toBe('b')
  })

  it('keeps state unchanged for unsupported transition keys', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}],
    })

    tabs.actions.handleKeyDown({
      key: 'a',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(tabs.state.activeTabId()).toBe('a')
    expect(tabs.state.selectedTabId()).toBe('a')
  })

  it('does not mutate state for invalid ids and keeps enabled-only invariants', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b', disabled: true}],
      initialSelectedTabId: 'a',
    })

    tabs.actions.select('missing')

    expect(tabs.state.activeTabId()).toBe('a')
    expect(tabs.state.selectedTabId()).toBe('a')

    tabs.actions.setActive('b')
    tabs.actions.setActive('missing')

    expect(tabs.state.activeTabId()).toBe('a')
    expect(tabs.state.selectedTabId()).toBe('a')
  })

  it('is independent across active/selected in manual mode', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      activationMode: 'manual',
    })

    tabs.actions.setActive('c')

    expect(tabs.state.activeTabId()).toBe('c')
    expect(tabs.state.selectedTabId()).toBe('a')

    const activeTabProps = tabs.contracts.getTabProps('c')
    const selectedTabProps = tabs.contracts.getTabProps('a')

    expect(activeTabProps.tabindex).toBe('0')
    expect(activeTabProps['aria-selected']).toBe('false')
    expect(selectedTabProps['aria-selected']).toBe('true')

    tabs.actions.select('c')

    expect(tabs.state.activeTabId()).toBe('c')
    expect(tabs.state.selectedTabId()).toBe('c')

    expect(tabs.contracts.getTabProps('c')['aria-selected']).toBe('true')
  })

  it('normalizes initial ids to the first enabled tab when invalid', () => {
    const tabs = createTabs({
      tabs: [{id: 'a', disabled: true}, {id: 'b'}, {id: 'c'}],
      initialActiveTabId: 'a',
      initialSelectedTabId: 'missing',
    })

    expect(tabs.state.activeTabId()).toBe('b')
    expect(tabs.state.selectedTabId()).toBe('b')
  })

  it('keeps both ids null-safe when no enabled tabs exist', () => {
    const tabs = createTabs({
      tabs: [{id: 'a', disabled: true}, {id: 'b', disabled: true}],
    })

    expect(tabs.state.activeTabId()).toBeNull()
    expect(tabs.state.selectedTabId()).toBeNull()

    tabs.actions.moveNext()
    tabs.actions.setActive('a')
    tabs.actions.select('b')
    tabs.actions.handleKeyDown({
      key: 'ArrowRight',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(tabs.state.activeTabId()).toBeNull()
    expect(tabs.state.selectedTabId()).toBeNull()
  })

  it('returns tab and panel aria linkage contract', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}],
      idBase: 'settings',
      ariaLabel: 'Settings tabs',
    })

    tabs.actions.select('b')

    const tabListProps = tabs.contracts.getTabListProps()
    const tabProps = tabs.contracts.getTabProps('b')
    const panelProps = tabs.contracts.getPanelProps('b')
    const hiddenPanelProps = tabs.contracts.getPanelProps('a')

    expect(tabListProps.id).toBe('settings-tablist')
    expect(tabListProps.role).toBe('tablist')
    expect(tabListProps['aria-orientation']).toBe('horizontal')

    expect(tabProps.id).toBe('settings-tab-b')
    expect(tabProps['aria-controls']).toBe('settings-panel-b')
    expect(tabProps['aria-selected']).toBe('true')

    expect(panelProps.id).toBe('settings-panel-b')
    expect(panelProps['aria-labelledby']).toBe('settings-tab-b')
    expect(panelProps.hidden).toBe(false)
    expect(hiddenPanelProps.hidden).toBe(true)
  })

  it('rejects selecting disabled tabs', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b', disabled: true}],
    })

    tabs.actions.select('b')

    expect(tabs.state.selectedTabId()).toBe('a')
    expect(tabs.state.activeTabId()).toBe('a')
  })

  it('wraps navigation from last to first and first to last', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
    })

    tabs.actions.setActive('c')
    tabs.actions.moveNext()
    expect(tabs.state.activeTabId()).toBe('a')

    tabs.actions.movePrev()
    expect(tabs.state.activeTabId()).toBe('c')
  })

  it('updates selectedTabId via setActive in automatic mode', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      activationMode: 'automatic',
    })

    tabs.actions.setActive('b')

    expect(tabs.state.activeTabId()).toBe('b')
    expect(tabs.state.selectedTabId()).toBe('b')
  })

  it('sets activeTabId to null via setActive(null)', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}],
    })

    tabs.actions.setActive(null)

    expect(tabs.state.activeTabId()).toBeNull()
    // selectedTabId should remain unchanged
    expect(tabs.state.selectedTabId()).toBe('a')
  })

  it('activates via Space key in manual mode', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}],
      activationMode: 'manual',
    })

    tabs.actions.setActive('b')
    expect(tabs.state.selectedTabId()).toBe('a')

    tabs.actions.handleKeyDown({
      key: ' ',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(tabs.state.selectedTabId()).toBe('b')
  })

  it('throws for unknown tab id in getTabProps', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}],
    })

    expect(() => tabs.contracts.getTabProps('unknown')).toThrow('Unknown tab id: unknown')
  })

  it('throws for unknown tab id in getPanelProps', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}],
    })

    expect(() => tabs.contracts.getPanelProps('unknown')).toThrow('Unknown tab id for panel: unknown')
  })

  it('returns correct tabindex on panel props', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}],
    })

    expect(tabs.contracts.getPanelProps('a').tabindex).toBe('0')
    expect(tabs.contracts.getPanelProps('b').tabindex).toBe('-1')

    tabs.actions.select('b')

    expect(tabs.contracts.getPanelProps('a').tabindex).toBe('-1')
    expect(tabs.contracts.getPanelProps('b').tabindex).toBe('0')
  })

  it('returns data-active and data-selected attributes on tab props', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}],
      activationMode: 'manual',
    })

    tabs.actions.setActive('b')

    const propsA = tabs.contracts.getTabProps('a')
    const propsB = tabs.contracts.getTabProps('b')

    expect(propsA['data-active']).toBe('false')
    expect(propsA['data-selected']).toBe('true')
    expect(propsB['data-active']).toBe('true')
    expect(propsB['data-selected']).toBe('false')
  })

  it('includes aria-label on tablist props when provided', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}],
      ariaLabel: 'My tabs',
    })

    expect(tabs.contracts.getTabListProps()['aria-label']).toBe('My tabs')
  })

  it('omits aria-label from tablist props when not provided', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}],
    })

    const props = tabs.contracts.getTabListProps()
    expect('aria-label' in props).toBe(false)
  })

  it('returns aria-disabled on disabled tab props and omits it on enabled tabs', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b', disabled: true}],
    })

    expect('aria-disabled' in tabs.contracts.getTabProps('a')).toBe(false)
    expect(tabs.contracts.getTabProps('b')['aria-disabled']).toBe('true')
  })

  it('returns vertical aria-orientation on tablist when orientation is vertical', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}],
      orientation: 'vertical',
    })

    expect(tabs.contracts.getTabListProps()['aria-orientation']).toBe('vertical')
  })

  it('defaults initialActiveTabId to initialSelectedTabId when not provided', () => {
    const tabs = createTabs({
      tabs: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      initialSelectedTabId: 'b',
    })

    expect(tabs.state.activeTabId()).toBe('b')
    expect(tabs.state.selectedTabId()).toBe('b')
  })

  it('sets selectedTabId to activeTabId when selected resolves null but active is non-null', () => {
    const tabs = createTabs({
      tabs: [{id: 'a', disabled: true}, {id: 'b'}],
      initialSelectedTabId: 'a',
      initialActiveTabId: 'b',
    })

    // initialSelectedTabId 'a' is disabled, resolves to first enabled = 'b'
    // initialActiveTabId 'b' is valid enabled
    expect(tabs.state.activeTabId()).toBe('b')
    expect(tabs.state.selectedTabId()).toBe('b')
  })
})
