import {Group} from '@project/passmanager'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMGroup} from '../../src/features/passmanager/components/group/group'
import {atom} from '@reatom/core'

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
  showElement: ReturnType<typeof atom<any>>
  isReadOnly: () => boolean
  setShowElement: ReturnType<typeof vi.fn>
  entriesList: () => Array<Group>
}

let pmGroupDefined = false
let originalPassmanager: unknown

function ensureDefined() {
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
  readOnlyState: ReturnType<typeof atom<boolean>>
  showElementSetSpy: ReturnType<typeof vi.spyOn>
} {
  const showElement = atom<any>(current)
  const readOnlyState = atom(readOnly)
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

function getTitleEditAction(element: PMGroup) {
  return element.shadowRoot?.querySelector('.group-title-edit-action') as HTMLElement | null
}

describe('PMGroup toolbar actions', () => {
  afterEach(() => {
    document.querySelectorAll('pm-group').forEach((el) => el.remove())
    ;(window as any).passmanager = originalPassmanager
    vi.restoreAllMocks()
  })

  it('does not render the legacy inline toolbar for root content', async () => {
    const {passmanager} = createPassmanagerMock(createRootMock())
    const element = await renderGroup(passmanager)

    const toolbar = getToolbar(element)
    const items = element.shadowRoot?.querySelectorAll('cv-toolbar-item')
    const separator = element.shadowRoot?.querySelector('cv-toolbar-separator')

    expect(toolbar).toBeNull()
    expect(items?.length).toBe(0)
    expect(separator).toBeNull()
  })

  it('renders root summary metadata in the header without the legacy collection shell heading', async () => {
    const {passmanager} = createPassmanagerMock(createRootMock())
    const element = await renderGroup(passmanager)

    const summary = element.shadowRoot?.querySelector('.workspace-summary-value')
    const header = element.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    const meta = header?.shadowRoot?.querySelector('.workspace-meta')
    const legacyMetadata = element.shadowRoot?.querySelector('.metadata-section')
    const legacyHeading = element.shadowRoot?.querySelector('.content-shell-head')

    expect(summary?.textContent).toContain('0 groups')
    expect(summary?.textContent).toContain('0 entries')
    expect(meta?.textContent).toContain('2026-03-01')
    expect(meta?.textContent).toContain('2026-03-02')
    expect(legacyMetadata).toBeNull()
    expect(legacyHeading).toBeNull()
  })

  it('renders no inline toolbar for non-root groups and keeps title edit in the header', async () => {
    const group = createMockGroup('group-click')
    const {passmanager} = createPassmanagerMock(group)
    const element = await renderGroup(passmanager)

    expect(getToolbar(element)).toBeNull()
    expect(element.shadowRoot?.querySelectorAll('cv-toolbar-item')).toHaveLength(0)

    const editAction = getTitleEditAction(element)
    expect(editAction).not.toBeNull()

    editAction?.click()
    await flush(element)

    const header = element.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement & {
      editableTitle?: boolean
    }
    expect(header?.editableTitle).toBe(true)
  })

  it('hides the title edit affordance in readonly mode', async () => {
    const group = createMockGroup('group-readonly')
    const {passmanager} = createPassmanagerMock(group, true)
    const element = await renderGroup(passmanager)

    expect(getToolbar(element)).toBeNull()
    expect(getTitleEditAction(element)).toBeNull()
    expect(passmanager.setShowElement).not.toHaveBeenCalled()
    expect(group.remove).not.toHaveBeenCalled()
  })

  it('updates the title edit affordance when readonly state changes', async () => {
    const group = createMockGroup('group-recreate')
    const {passmanager, readOnlyState} = createPassmanagerMock(group, false)
    const element = await renderGroup(passmanager)

    expect(getToolbar(element)).toBeNull()
    expect(getTitleEditAction(element)).not.toBeNull()

    readOnlyState.set(true)
    await flush(element)
    expect(getToolbar(element)).toBeNull()
    expect(getTitleEditAction(element)).toBeNull()

    readOnlyState.set(false)
    await flush(element)
    expect(getToolbar(element)).toBeNull()
    expect(getTitleEditAction(element)).not.toBeNull()
  })
})
