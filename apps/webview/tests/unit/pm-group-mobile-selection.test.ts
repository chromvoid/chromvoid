import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {html, render} from 'lit'
import {Group, ManagerRoot} from '@project/passmanager'
import {PMGroupMobile} from '../../src/features/passmanager/components/group/group/group-mobile'
import type {PMGroupListItemMobile} from '../../src/features/passmanager/components/group/group/group-list-item-mobile'
import {pmSelectionModeModel} from '../../src/features/passmanager/models/pm-selection-mode.model'
import {PMGroupModel, type PMGroupRow} from '../../src/features/passmanager/components/group/group/group.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

function createGroup(id: string, name: string) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createPassmanagerRoot(currentGroup: Group, allGroups: Group[]) {
  const root = new ManagerRoot({} as any)
  root.entries.set(allGroups)
  root.showElement.set(currentGroup)
  ;(root as ManagerRoot & {isReadOnly: () => boolean}).isReadOnly = () => false
  return root
}

async function flushGroupRow(element: PMGroupListItemMobile) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

async function openLeftGroupSwipe(element: PMGroupListItemMobile, preventDefault: () => void = () => {}) {
  ;(element as PMGroupListItemMobile & {handleTouchStart: (event: TouchEvent) => void}).handleTouchStart({
    touches: [{clientX: 80, clientY: 0}],
  } as unknown as TouchEvent)
  ;(element as PMGroupListItemMobile & {handleTouchMove: (event: TouchEvent) => void}).handleTouchMove({
    touches: [{clientX: 0, clientY: 0}],
    preventDefault,
  } as unknown as TouchEvent)
  ;(element as PMGroupListItemMobile & {handleTouchEnd: () => void}).handleTouchEnd()
  await flushGroupRow(element)
}

async function flushGroupMobile(element: PMGroupMobile) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
  const summaryRail = element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
    'pm-summary-rail.group-metrics-strip',
  )
  await summaryRail?.updateComplete
  return summaryRail
}

function createGroupRowElement(group: Group): PMGroupListItemMobile {
  const element = document.createElement('pm-group-list-item-mobile') as PMGroupListItemMobile
  element.group = group
  element.presentation = {
    displayName: group.name,
    description: 'Group description',
    entryCount: 0,
    riskIndicator: null,
  }
  document.body.append(element)
  return element
}

class TestPMGroupMobileSummary extends PMGroupMobile {
  static override styles = []

  protected override renderGroupsList(_group: Group | ManagerRoot, _items: PMGroupRow[]) {
    return html`<div class="group-virtual-list"></div>`
  }
}

describe('PMGroupMobile selection mode', () => {
  let originalPassmanager: typeof window.passmanager

  beforeEach(() => {
    if (!customElements.get('pm-group-mobile')) {
      PMGroupMobile.define()
    }
    if (!customElements.get('test-pm-group-mobile-summary')) {
      customElements.define('test-pm-group-mobile-summary', TestPMGroupMobileSummary)
    }

    pmSelectionModeModel.exit()
    originalPassmanager = window.passmanager
  })

  afterEach(() => {
    document.body.innerHTML = ''
    pmSelectionModeModel.exit()
    setPassmanagerRoot(undefined)
    window.passmanager = originalPassmanager
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders group metrics with the shared summary rail on mobile', async () => {
    const parent = createGroup('metrics-parent', 'Metrics Parent')
    const child = createGroup('metrics-child', 'Metrics Parent/Child')
    const root = createPassmanagerRoot(parent, [parent, child])
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root)

    const element = document.createElement('test-pm-group-mobile-summary') as PMGroupMobile
    document.body.append(element)
    const summaryRail = await flushGroupMobile(element)

    expect(summaryRail).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.mobile-metrics-line')).toBeNull()
    expect(summaryRail?.shadowRoot?.querySelector('[data-summary-id="entries"]')).not.toBeNull()
    expect(summaryRail?.shadowRoot?.querySelector('[data-summary-id="two_factor"]')).not.toBeNull()
  })

  it('long tap on a group row enters selection mode and selects that group', async () => {
    vi.useFakeTimers()

    const parent = createGroup('selection-parent', 'Selection Parent')
    const child = createGroup('selection-child', 'Selection Parent/Child')
    window.passmanager = createPassmanagerRoot(parent, [parent, child]) as typeof window.passmanager

    const element = document.createElement('pm-group-mobile') as PMGroupMobile

    const handleGroupTouchStart = (element as PMGroupMobile & {
      handleGroupTouchStart: (event: TouchEvent, item: Group) => void
    }).handleGroupTouchStart

    handleGroupTouchStart.call(element, {touches: [{clientX: 18, clientY: 24}]} as unknown as TouchEvent, child)
    vi.advanceTimersByTime(500)
    await Promise.resolve()

    expect(pmSelectionModeModel.active()).toBe(true)
    expect(pmSelectionModeModel.isGroupSelected(child.id)).toBe(true)
  })

  it('keeps the same virtualizer instance when mobile selection changes', async () => {
    const parent = createGroup('selection-identity-parent', 'Selection Identity Parent')
    const child = createGroup('selection-identity-child', 'Selection Identity Parent/Child')
    const root = createPassmanagerRoot(parent, [parent, child])
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root)

    const element = document.createElement('pm-group-mobile') as PMGroupMobile
    document.body.append(element)
    await flushGroupMobile(element)

    const virtualizerBefore = element.shadowRoot?.querySelector('lit-virtualizer')
    expect(virtualizerBefore).not.toBeNull()

    pmSelectionModeModel.enterWithGroup(child.id)
    await flushGroupMobile(element)

    const virtualizerAfter = element.shadowRoot?.querySelector('lit-virtualizer') as
      | (HTMLElement & {
          items?: PMGroupRow[]
          renderItem?: (row: PMGroupRow) => unknown
        })
      | null
    expect(virtualizerAfter).toBe(virtualizerBefore)

    const renderedRow = document.createElement('div')
    const row = virtualizerAfter?.items?.[0]
    if (row && virtualizerAfter?.renderItem) render(virtualizerAfter.renderItem(row), renderedRow)
    await Promise.resolve()
    expect(
      renderedRow.querySelector<PMGroupListItemMobile>('pm-group-list-item-mobile')
        ?.selectedInSelectionMode,
    ).toBe(true)
  })

  it('toggles group selection on tap during selection mode without navigating into the group', async () => {
    const parent = createGroup('selection-parent-toggle', 'Selection Parent Toggle')
    const child = createGroup('selection-child-toggle', 'Selection Parent Toggle/Child')
    window.passmanager = createPassmanagerRoot(parent, [parent, child]) as typeof window.passmanager

    const selectByIdSpy = vi.spyOn(PMGroupModel.prototype, 'selectByID')
    const element = document.createElement('pm-group-mobile') as PMGroupMobile

    pmSelectionModeModel.enterWithGroup(child.id)
    pmSelectionModeModel.consumePostLongPressClick('group', child.id)

    const handleGroupRowClick = (element as PMGroupMobile & {
      handleGroupRowClick: (item: Group) => void
    }).handleGroupRowClick

    handleGroupRowClick.call(element, child)

    expect(pmSelectionModeModel.active()).toBe(true)
    expect(pmSelectionModeModel.isGroupSelected(child.id)).toBe(false)
    expect(selectByIdSpy).not.toHaveBeenCalled()
  })

  it('navigates on the first tap after leaving selection mode', async () => {
    vi.useFakeTimers()

    const parent = createGroup('selection-parent-exit', 'Selection Parent Exit')
    const child = createGroup('selection-child-exit', 'Selection Parent Exit/Child')
    window.passmanager = createPassmanagerRoot(parent, [parent, child]) as typeof window.passmanager

    const selectByIdSpy = vi.spyOn(PMGroupModel.prototype, 'selectByID')
    const element = document.createElement('pm-group-mobile') as PMGroupMobile

    const handleGroupTouchStart = (element as PMGroupMobile & {
      handleGroupTouchStart: (event: TouchEvent, item: Group) => void
    }).handleGroupTouchStart
    const handleGroupRowClick = (element as PMGroupMobile & {
      handleGroupRowClick: (item: Group) => void
    }).handleGroupRowClick

    handleGroupTouchStart.call(element, {touches: [{clientX: 18, clientY: 24}]} as unknown as TouchEvent, child)
    vi.advanceTimersByTime(500)
    await Promise.resolve()

    pmSelectionModeModel.exit()

    handleGroupRowClick.call(element, child)

    expect(selectByIdSpy).toHaveBeenCalledTimes(1)
    expect(selectByIdSpy).toHaveBeenCalledWith(child.id)
  })

  it('uses contextmenu as a fallback to enter group selection mode on mobile', async () => {
    const parent = createGroup('selection-parent-contextmenu', 'Selection Parent Contextmenu')
    const child = createGroup('selection-child-contextmenu', 'Selection Parent Contextmenu/Child')
    window.passmanager = createPassmanagerRoot(parent, [parent, child]) as typeof window.passmanager

    const element = document.createElement('pm-group-mobile') as PMGroupMobile
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()

    ;(element as PMGroupMobile & {handleGroupContextMenu: (event: Event, item: Group) => void}).handleGroupContextMenu(
      {
        preventDefault,
        stopPropagation,
      } as unknown as Event,
      child,
    )

    expect(pmSelectionModeModel.active()).toBe(true)
    expect(pmSelectionModeModel.isGroupSelected(child.id)).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('does not render a mobile drag handle on group rows', async () => {
    const group = createGroup('selection-group-no-dnd-handle', 'Selection Group No Dnd Handle')
    const element = createGroupRowElement(group)
    await flushGroupRow(element)

    expect(element.shadowRoot?.querySelector('.mobile-dnd-handle')).toBeNull()
  })

  it('prevents native text selection inside mobile group rows', async () => {
    const group = createGroup('selection-group-native-selection', 'Native Selection Group')
    const element = createGroupRowElement(group)
    await flushGroupRow(element)

    const selectStartEvent = new Event('selectstart', {
      bubbles: true,
      cancelable: true,
      composed: true,
    })
    element.shadowRoot?.querySelector('.group-description')?.dispatchEvent(selectStartEvent)

    expect(selectStartEvent.defaultPrevented).toBe(true)
  })

  it('reveals delete on left swipe and emits group-delete from the action', async () => {
    const group = createGroup('swipe-delete-group', 'Swipe Delete Group')
    const element = createGroupRowElement(group)
    const preventDefault = vi.fn()
    const deleteSpy = vi.fn()
    element.addEventListener('group-delete', deleteSpy as EventListener)
    await flushGroupRow(element)

    await openLeftGroupSwipe(element, preventDefault)

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(element.shadowRoot?.querySelector('.group-row')?.getAttribute('data-swipe-state')).toBe('open-left')
    expect(element.shadowRoot?.querySelector('.group-swipe-actions-right cv-icon[name="trash"]')).not.toBeNull()

    element.shadowRoot
      ?.querySelector('.group-swipe-actions-right .swipe-action')
      ?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await flushGroupRow(element)

    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect((deleteSpy.mock.calls[0]?.[0] as CustomEvent<Group>).detail).toBe(group)
    expect(element.shadowRoot?.querySelector('.group-row')?.getAttribute('data-swipe-state')).toBe('idle')
  })

  it('does not expose swipe actions for read-only groups', async () => {
    const group = createGroup('swipe-read-only-group', 'Swipe Read-only Group')
    const element = createGroupRowElement(group)
    element.readOnly = true
    await flushGroupRow(element)

    await openLeftGroupSwipe(element)

    expect(element.shadowRoot?.querySelector('.group-row')?.getAttribute('data-swipe-state')).toBe('idle')
    expect(element.shadowRoot?.querySelector('.group-swipe-actions-right')).toBeNull()
  })

  it('keeps the group row closed on a right swipe', async () => {
    const group = createGroup('swipe-right-group', 'Swipe Right Group')
    const element = createGroupRowElement(group)
    await flushGroupRow(element)

    ;(element as PMGroupListItemMobile & {handleTouchStart: (event: TouchEvent) => void}).handleTouchStart({
      touches: [{clientX: 0, clientY: 0}],
    } as unknown as TouchEvent)
    ;(element as PMGroupListItemMobile & {handleTouchMove: (event: TouchEvent) => void}).handleTouchMove({
      touches: [{clientX: 80, clientY: 0}],
      preventDefault() {},
    } as unknown as TouchEvent)
    ;(element as PMGroupListItemMobile & {handleTouchEnd: () => void}).handleTouchEnd()
    await flushGroupRow(element)

    expect(element.shadowRoot?.querySelector('.group-row')?.getAttribute('data-swipe-state')).toBe('idle')
  })

})
