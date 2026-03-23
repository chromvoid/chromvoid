import {state} from '@statx/core'
import {CVToolbar, CVToolbarItem} from '@chromvoid/uikit'
import {Group} from '@project/passmanager'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMGroup} from '../../src/features/passmanager/components/group/group'

type RootLike = {
  id: string
  name: string
  isRoot: true
  createdFormatted: string
  updatedFormatted: string
  searched: () => Array<Group>
}

type PassmanagerMock = {
  id: string
  showElement: ReturnType<typeof state<any>>
  isReadOnly: () => boolean
  setShowElement: ReturnType<typeof vi.fn>
  entriesList: () => Array<Group>
}

let pmGroupDefined = false
let toolbarDefined = false
let originalPassmanager: unknown

function ensureDefined() {
  if (!toolbarDefined) {
    CVToolbarItem.define()
    CVToolbar.define()
    toolbarDefined = true
  }

  if (!pmGroupDefined) {
    PMGroup.define()
    pmGroupDefined = true
  }
}

function createMockGroup(id = 'group-1') {
  const now = Date.now()
  const group = new Group({
    id,
    name: `Folder ${id}`,
    icon: undefined,
    iconRef: undefined,
    entries: [],
    createdTs: now,
    updatedTs: now,
  }) as Group & {remove: ReturnType<typeof vi.fn>}
  group.remove = vi.fn()
  return group
}

function createRootMock(): RootLike {
  return {
    id: 'root-id',
    name: 'Root',
    isRoot: true,
    createdFormatted: '2026-03-01',
    updatedFormatted: '2026-03-02',
    searched: () => [],
  }
}

function createPassmanagerMock(current: Group | RootLike, readOnly = false): {
  passmanager: PassmanagerMock
  readOnlyState: ReturnType<typeof state<boolean>>
  showElementSetSpy: ReturnType<typeof vi.spyOn>
} {
  const showElement = state<any>(current)
  const readOnlyState = state(readOnly)
  const passmanager = {
    id: 'pm-id',
    showElement,
    isReadOnly: () => readOnlyState(),
    setShowElement: vi.fn(),
    entriesList: () => [],
  }

  return {
    passmanager,
    readOnlyState,
    showElementSetSpy: vi.spyOn(showElement, 'set'),
  }
}

async function renderGroup(passmanager: PassmanagerMock) {
  ensureDefined()
  originalPassmanager = (window as any).passmanager
  ;(window as any).passmanager = passmanager

  const element = document.createElement('pm-group') as PMGroup
  document.body.appendChild(element)
  await element.updateComplete
  return element
}

async function flush(element: PMGroup) {
  await Promise.resolve()
  await element.updateComplete
}

function getToolbar(element: PMGroup) {
  return element.shadowRoot?.querySelector('cv-toolbar') as HTMLElement | null
}

function getAction(element: PMGroup, action: string) {
  return element.shadowRoot?.querySelector(`cv-toolbar-item[data-action="${action}"]`) as HTMLElement | null
}

describe('PMGroup toolbar actions', () => {
  afterEach(() => {
    document.querySelectorAll('pm-group').forEach((el) => el.remove())
    ;(window as any).passmanager = originalPassmanager
    vi.restoreAllMocks()
  })

  it('renders root actions as 2 toolbar items without separator', async () => {
    const {passmanager} = createPassmanagerMock(createRootMock())
    const element = await renderGroup(passmanager)

    const toolbar = getToolbar(element)
    const items = element.shadowRoot?.querySelectorAll('cv-toolbar-item')
    const separator = element.shadowRoot?.querySelector('cv-toolbar-separator')

    expect(toolbar).not.toBeNull()
    expect(items?.length).toBe(2)
    expect(separator).toBeNull()
    expect(getAction(element, 'create-entry')).not.toBeNull()
    expect(getAction(element, 'create-group')).not.toBeNull()
  })

  it('renders non-root actions with separator and executes click handlers', async () => {
    const group = createMockGroup('group-click')
    const {passmanager, showElementSetSpy} = createPassmanagerMock(group)
    const element = await renderGroup(passmanager)

    const items = element.shadowRoot?.querySelectorAll('cv-toolbar-item')
    const separators = element.shadowRoot?.querySelectorAll('cv-toolbar-separator')
    expect(items?.length).toBe(4)
    expect(separators?.length).toBe(1)

    getAction(element, 'create-entry')?.click()
    expect(passmanager.setShowElement).toHaveBeenCalledWith('createEntry', group)

    getAction(element, 'create-group')?.click()
    expect(showElementSetSpy).toHaveBeenCalledWith('createGroup')

    passmanager.showElement.set(group)
    await flush(element)

    getAction(element, 'remove-group')?.click()
    expect(group.remove).toHaveBeenCalledTimes(1)
  })

  it('supports Enter and Space activation for toolbar items', async () => {
    const group = createMockGroup('group-keyboard')
    const {passmanager} = createPassmanagerMock(group)
    const element = await renderGroup(passmanager)

    const removeAction = getAction(element, 'remove-group')
    const removeEvent = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, composed: true, cancelable: true})
    removeAction?.dispatchEvent(removeEvent)
    expect(group.remove).toHaveBeenCalledTimes(1)

    const createAction = getAction(element, 'create-entry')
    const spaceEvent = new KeyboardEvent('keydown', {key: ' ', bubbles: true, composed: true, cancelable: true})
    createAction?.dispatchEvent(spaceEvent)
    expect(spaceEvent.defaultPrevented).toBe(true)
    expect(passmanager.setShowElement).toHaveBeenCalledWith('createEntry', group)
  })

  it('blocks toolbar actions in readonly mode for click and keyboard', async () => {
    const group = createMockGroup('group-readonly')
    const {passmanager} = createPassmanagerMock(group, true)
    const element = await renderGroup(passmanager)

    const items = Array.from(element.shadowRoot?.querySelectorAll('cv-toolbar-item') ?? [])
    expect(items.length).toBe(4)
    expect(items.every((item) => item.hasAttribute('disabled'))).toBe(true)

    getAction(element, 'create-entry')?.click()
    const enterEvent = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, composed: true, cancelable: true})
    getAction(element, 'remove-group')?.dispatchEvent(enterEvent)

    expect(passmanager.setShowElement).not.toHaveBeenCalled()
    expect(group.remove).not.toHaveBeenCalled()
  })

  it('recreates toolbar when readonly state changes', async () => {
    const group = createMockGroup('group-recreate')
    const {passmanager, readOnlyState} = createPassmanagerMock(group, false)
    const element = await renderGroup(passmanager)

    const firstToolbar = getToolbar(element)
    expect(firstToolbar).not.toBeNull()
    expect(getAction(element, 'create-entry')?.hasAttribute('disabled')).toBe(false)

    readOnlyState.set(true)
    await flush(element)
    const secondToolbar = getToolbar(element)
    expect(secondToolbar).not.toBeNull()
    expect(secondToolbar).not.toBe(firstToolbar)
    expect(getAction(element, 'create-entry')?.hasAttribute('disabled')).toBe(true)

    readOnlyState.set(false)
    await flush(element)
    const thirdToolbar = getToolbar(element)
    expect(thirdToolbar).not.toBeNull()
    expect(thirdToolbar).not.toBe(secondToolbar)
    expect(getAction(element, 'create-entry')?.hasAttribute('disabled')).toBe(false)
  })
})
