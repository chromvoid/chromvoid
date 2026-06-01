import {afterEach, describe, expect, it, vi} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import type {ManagerSaver} from '@project/passmanager/types'

import {pmEntryMoveModel} from '../../src/features/passmanager/models/pm-entry-move-model'
import {pmMobileSelectionModel} from '../../src/features/passmanager/models/pm-mobile-selection.model'
import {toast} from '../../src/shared/services/toast-manager'

function createMockSaver(overrides: Partial<ManagerSaver> = {}): ManagerSaver {
  return {
    save: vi.fn(async () => true),
    read: vi.fn(async () => undefined),
    remove: vi.fn(async () => true),
    getOTP: vi.fn(async () => undefined),
    getOTPSeckey: vi.fn(async () => undefined),
    removeOTP: vi.fn(async () => true),
    saveOTP: vi.fn(async () => true),
    readEntrySecret: vi.fn(async () => undefined),
    saveEntrySecret: vi.fn(async () => true),
    removeEntrySecret: vi.fn(async () => true),
    readEntryPassword: vi.fn(async () => undefined),
    readEntryNote: vi.fn(async () => undefined),
    saveEntryPassword: vi.fn(async () => true),
    saveEntryNote: vi.fn(async () => true),
    removeEntryPassword: vi.fn(async () => true),
    removeEntryNote: vi.fn(async () => true),
    readEntrySshPrivateKey: vi.fn(async () => undefined),
    readEntrySshPublicKey: vi.fn(async () => undefined),
    saveEntrySshPrivateKey: vi.fn(async () => true),
    saveEntrySshPublicKey: vi.fn(async () => true),
    removeEntrySshPrivateKey: vi.fn(async () => true),
    removeEntrySshPublicKey: vi.fn(async () => true),
    saveEntryMeta: vi.fn(async () => true),
    moveEntryToGroup: vi.fn(async () => true),
    removeEntry: vi.fn(async () => true),
    ...overrides,
  }
}

function createGroup(id: string, name: string): Group {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(parent: Group, id: string, title = 'Entry A'): Entry {
  return new Entry(
    parent,
    {
      id,
      title,
      username: '',
      urls: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: [],
      sshKeys: [],
    } as any,
  )
}

function createMobileDropTarget(targetId: string, rect: Partial<DOMRect> = {}): HTMLElement {
  const target = document.createElement('div')
  target.setAttribute('data-mobile-dnd-target-id', targetId)
  target.getBoundingClientRect = vi.fn(
    () =>
      ({
        left: 0,
        top: 0,
        right: 120,
        bottom: 120,
        width: 120,
        height: 120,
        x: 0,
        y: 0,
        toJSON: () => ({}),
        ...rect,
      }) as DOMRect,
  )
  document.body.append(target)
  return target
}

describe('pmEntryMoveModel', () => {
  let originalPassmanager: unknown

  const ensureWindow = () => {
    const scope = globalThis as typeof globalThis & {
      window?: {
        passmanager?: unknown
        localStorage?: {getItem(key: string): string | null; setItem(key: string, value: string): void}
        matchMedia?: (query: string) => {matches: boolean}
      }
    }
    scope.window ??= {
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
      },
      matchMedia: () => ({matches: true}),
    }
    return scope.window
  }

  afterEach(() => {
    const windowRef = ensureWindow()
    windowRef.passmanager = originalPassmanager
    pmEntryMoveModel.cancelMobileDrag()
    pmEntryMoveModel.unregisterMobileDropZone(document)
    pmMobileSelectionModel.exit()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('keeps parent state in sync when moving an entry to root and undoing the move', async () => {
    const windowRef = ensureWindow()
    originalPassmanager = windowRef.passmanager

    const root = new ManagerRoot(createMockSaver())
    const sourceGroup = createGroup('source-group', 'Source')
    const entry = createEntry(sourceGroup, 'entry-1')

    sourceGroup.addEntry(entry)
    root.entries.set([sourceGroup])
    root.showElement.set(sourceGroup)
    windowRef.passmanager = root

    vi.spyOn(toast, 'show').mockReturnValue('toast-1')

    await expect(pmEntryMoveModel.moveEntry(entry, root.id)).resolves.toBe(true)
    expect(entry.parent).toBe(root)
    expect(entry.groupPath).toBeUndefined()
    expect(sourceGroup.entries()).toEqual([])
    expect(root.topLevelEntries.map((item) => item.id)).toEqual(['entry-1'])

    await expect(pmEntryMoveModel.undoLastMove()).resolves.toBe(true)
    expect(entry.parent).toBe(sourceGroup)
    expect(entry.groupPath).toBe('Source')
    expect(sourceGroup.entries().map((item) => item.id)).toEqual(['entry-1'])
    expect(root.topLevelEntries).toEqual([])
  })

  it('moves an entry from a nested subgroup to root without losing parent bookkeeping', async () => {
    const windowRef = ensureWindow()
    originalPassmanager = windowRef.passmanager

    const root = new ManagerRoot(createMockSaver())
    const parentGroup = createGroup('parent-group', 'Parent')
    const childGroup = createGroup('child-group', 'Parent/Subgroup')
    const entry = createEntry(childGroup, 'entry-nested-root', 'Nested Entry')

    childGroup.addEntry(entry)
    root.entries.set([parentGroup, childGroup])
    root.showElement.set(entry)
    windowRef.passmanager = root

    vi.spyOn(toast, 'show').mockReturnValue('toast-nested-root')

    await expect(pmEntryMoveModel.moveEntry(entry, root.id)).resolves.toBe(true)

    expect(entry.parent).toBe(root)
    expect(entry.groupPath).toBeUndefined()
    expect(childGroup.entries()).toEqual([])
    expect(root.topLevelEntries.map((item) => item.id)).toEqual(['entry-nested-root'])
  })

  it('shows the backend move error message when point move persistence fails', async () => {
    const windowRef = ensureWindow()
    originalPassmanager = windowRef.passmanager

    const saver = createMockSaver({
      moveEntryToGroup: vi.fn(async () => {
        throw new Error('Name already exists: dev')
      }),
    })
    const root = new ManagerRoot(saver)
    const sourceGroup = createGroup('source-group-error', 'Source')
    const entry = createEntry(sourceGroup, 'entry-move-error', 'dev')

    sourceGroup.addEntry(entry)
    root.entries.set([sourceGroup])
    windowRef.passmanager = root

    const toastSpy = vi.spyOn(toast, 'show').mockReturnValue('toast-error')

    await expect(pmEntryMoveModel.moveEntry(entry, root.id)).resolves.toBe(false)

    expect(entry.parent).toBe(sourceGroup)
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Name already exists: dev',
        variant: 'error',
      }),
    )
  })

  it('keeps last move state and shows an error when undo persistence fails', async () => {
    const windowRef = ensureWindow()
    originalPassmanager = windowRef.passmanager

    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    const sourceGroup = createGroup('source-undo-failure', 'Source')
    const targetGroup = createGroup('target-undo-failure', 'Target')
    const entry = createEntry(sourceGroup, 'entry-undo-failure', 'Undo Entry')

    sourceGroup.addEntry(entry)
    root.entries.set([sourceGroup, targetGroup])
    windowRef.passmanager = root

    const toastSpy = vi.spyOn(toast, 'show').mockReturnValue('toast-undo-failure')

    await expect(pmEntryMoveModel.moveEntry(entry, targetGroup.id)).resolves.toBe(true)
    vi.mocked(saver.moveEntryToGroup).mockRejectedValueOnce(new Error('undo failed'))

    await expect(pmEntryMoveModel.undoLastMove()).resolves.toBe(false)

    expect(entry.parent).toBe(targetGroup)
    expect(pmEntryMoveModel.lastMove()).toMatchObject({
      entryId: entry.id,
      sourceTargetId: sourceGroup.id,
      targetId: targetGroup.id,
    })
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'undo failed',
        variant: 'error',
      }),
    )
  })

  it('keeps mobile selection active when a selected batch entry move fails', async () => {
    const windowRef = ensureWindow()
    originalPassmanager = windowRef.passmanager

    const sourceGroup = createGroup('source-batch-failure', 'Source')
    const targetGroup = createGroup('target-batch-failure', 'Target')
    const firstEntry = createEntry(sourceGroup, 'entry-batch-ok', 'First')
    const secondEntry = createEntry(sourceGroup, 'entry-batch-fail', 'Second')
    const saver = createMockSaver({
      moveEntryToGroup: vi.fn(async (entryId) => {
        if (entryId === secondEntry.id) {
          throw new Error('batch move failed')
        }
        return true
      }),
    })
    const root = new ManagerRoot(saver)

    sourceGroup.addEntry(firstEntry)
    sourceGroup.addEntry(secondEntry)
    root.entries.set([sourceGroup, targetGroup])
    windowRef.passmanager = root

    const toastSpy = vi.spyOn(toast, 'show').mockReturnValue('toast-batch-failure')
    pmMobileSelectionModel.enterWithEntry(firstEntry.id)
    pmMobileSelectionModel.toggleEntry(secondEntry.id)

    await expect(pmEntryMoveModel.moveSelection([firstEntry, secondEntry], [], targetGroup.id)).resolves.toBe(
      false,
    )

    expect(pmMobileSelectionModel.active()).toBe(true)
    expect(pmMobileSelectionModel.selectedEntryIds()).toEqual([firstEntry.id, secondEntry.id])
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'batch move failed',
        variant: 'error',
      }),
    )
  })

  it('exits mobile selection after moving a selected single entry', async () => {
    const windowRef = ensureWindow()
    originalPassmanager = windowRef.passmanager

    const root = new ManagerRoot(createMockSaver())
    const sourceGroup = createGroup('source-selected-entry-move', 'Source')
    const targetGroup = createGroup('target-selected-entry-move', 'Target')
    const entry = createEntry(sourceGroup, 'entry-selected-entry-move', 'Selected Entry')

    sourceGroup.addEntry(entry)
    root.entries.set([sourceGroup, targetGroup])
    windowRef.passmanager = root
    vi.spyOn(toast, 'show').mockReturnValue('toast-selected-entry-move')

    pmMobileSelectionModel.enterWithEntry(entry.id)

    await expect(pmEntryMoveModel.moveEntry(entry, targetGroup.id)).resolves.toBe(true)

    expect(entry.parent).toBe(targetGroup)
    expect(pmMobileSelectionModel.active()).toBe(false)
    expect(pmMobileSelectionModel.selectedEntryIds()).toEqual([])
    expect(pmMobileSelectionModel.selectedGroupIds()).toEqual([])
  })

  it('exits mobile selection after moving a selected single group', () => {
    const windowRef = ensureWindow()
    originalPassmanager = windowRef.passmanager

    const root = new ManagerRoot(createMockSaver())
    const sourceGroup = createGroup('source-selected-group-move', 'Source')
    const childGroup = createGroup('child-selected-group-move', 'Source/Child')
    const targetGroup = createGroup('target-selected-group-move', 'Target')

    root.entries.set([sourceGroup, childGroup, targetGroup])
    windowRef.passmanager = root
    vi.spyOn(toast, 'show').mockReturnValue('toast-selected-group-move')

    pmMobileSelectionModel.enterWithGroup(childGroup.id)

    expect(pmEntryMoveModel.moveGroupById(childGroup.id, targetGroup.id)).toBe(true)

    expect(childGroup.name).toBe('Target/Child')
    expect(pmMobileSelectionModel.active()).toBe(false)
    expect(pmMobileSelectionModel.selectedEntryIds()).toEqual([])
    expect(pmMobileSelectionModel.selectedGroupIds()).toEqual([])
  })

  it('builds a selected-set mobile payload and moves entries and groups through existing rules', async () => {
    const windowRef = ensureWindow()
    originalPassmanager = windowRef.passmanager

    const root = new ManagerRoot(createMockSaver())
    const sourceGroup = createGroup('source-selection', 'Source')
    const targetGroup = createGroup('target-selection', 'Target')
    const childGroup = createGroup('child-selection', 'Source/Child')
    const entry = createEntry(sourceGroup, 'entry-selection', 'Selected Entry')

    sourceGroup.addEntry(entry)
    root.entries.set([sourceGroup, targetGroup, childGroup])
    windowRef.passmanager = root
    vi.spyOn(toast, 'show').mockReturnValue('toast-selection')

    pmMobileSelectionModel.enterWithEntry(entry.id)
    pmMobileSelectionModel.toggleGroup(childGroup.id)

    const payload = pmEntryMoveModel.createMobileDragPayload('entry', entry.id)
    expect(payload).toMatchObject({
      domain: 'passmanager',
      kind: 'selection',
      entryIds: [entry.id],
      groupIds: [childGroup.id],
    })
    expect(pmEntryMoveModel.canDropToTarget(targetGroup.id, payload)).toBe(true)

    await expect(pmEntryMoveModel.dropToTarget(targetGroup.id, payload)).resolves.toBe(true)
    expect(entry.parent).toBe(targetGroup)
    expect(entry.groupPath).toBe('Target')
    expect(childGroup.name).toBe('Target/Child')
    expect(pmMobileSelectionModel.active()).toBe(false)
    expect(pmMobileSelectionModel.selectedEntryIds()).toEqual([])
    expect(pmMobileSelectionModel.selectedGroupIds()).toEqual([])
  })

  it('allows mobile DnD only from selected rows while mobile selection is active', () => {
    const windowRef = ensureWindow()
    originalPassmanager = windowRef.passmanager

    const root = new ManagerRoot(createMockSaver())
    const sourceGroup = createGroup('source-selection-start', 'Source')
    const selectedEntry = createEntry(sourceGroup, 'entry-selected-start', 'Selected Entry')
    const unselectedEntry = createEntry(sourceGroup, 'entry-unselected-start', 'Unselected Entry')
    const selectedGroup = createGroup('group-selected-start', 'Selected Group')
    const unselectedGroup = createGroup('group-unselected-start', 'Unselected Group')

    sourceGroup.addEntry(selectedEntry)
    sourceGroup.addEntry(unselectedEntry)
    root.entries.set([sourceGroup, selectedGroup, unselectedGroup])
    windowRef.passmanager = root

    pmMobileSelectionModel.enterWithEntry(selectedEntry.id)
    pmMobileSelectionModel.toggleGroup(selectedGroup.id)

    expect(pmEntryMoveModel.canStartMobileDrag('entry', selectedEntry.id)).toBe(true)
    expect(pmEntryMoveModel.canStartMobileDrag('group', selectedGroup.id)).toBe(true)
    expect(pmEntryMoveModel.canStartMobileDrag('entry', unselectedEntry.id)).toBe(false)
    expect(pmEntryMoveModel.canStartMobileDrag('group', unselectedGroup.id)).toBe(false)
    expect(pmEntryMoveModel.createMobileDragPayload('entry', unselectedEntry.id)).toBeNull()
  })

  it('moves a single group through the mobile pointer DnD adapter', async () => {
    const windowRef = ensureWindow()
    originalPassmanager = windowRef.passmanager

    const root = new ManagerRoot(createMockSaver())
    const sourceGroup = createGroup('source-group-mobile-dnd', 'Source')
    const childGroup = createGroup('child-group-mobile-dnd', 'Source/Child')
    const targetGroup = createGroup('target-group-mobile-dnd', 'Target')

    root.entries.set([sourceGroup, childGroup, targetGroup])
    windowRef.passmanager = root
    vi.spyOn(toast, 'show').mockReturnValue('toast-group-mobile-dnd')

    createMobileDropTarget(targetGroup.id)
    pmEntryMoveModel.registerMobileDropZone(document)

    expect(pmEntryMoveModel.beginMobileDrag('group', childGroup.id, {x: 4, y: 4})).toBe(true)
    expect(pmEntryMoveModel.mobileDnd.ghostLabel()).toBe('Child')
    expect(pmEntryMoveModel.moveMobileDrag({x: 40, y: 40})).toBe(true)
    expect(pmEntryMoveModel.mobileDnd.dropTargetId()).toBe(targetGroup.id)

    await expect(pmEntryMoveModel.commitMobileDrag({x: 40, y: 40})).resolves.toBe(true)

    expect(childGroup.name).toBe('Target/Child')
    expect(pmEntryMoveModel.mobileDnd.active()).toBe(false)
    expect(pmEntryMoveModel.mobileDnd.payload()).toBeNull()
  })

  it('does not exit mobile selection after an invalid selected-set pointer drop', async () => {
    const windowRef = ensureWindow()
    originalPassmanager = windowRef.passmanager

    const root = new ManagerRoot(createMockSaver())
    const sourceGroup = createGroup('source-invalid-selection-drop', 'Source')
    const entry = createEntry(sourceGroup, 'entry-invalid-selection-drop', 'Selected Entry')

    sourceGroup.addEntry(entry)
    root.entries.set([sourceGroup])
    windowRef.passmanager = root
    vi.spyOn(toast, 'show').mockReturnValue('toast-invalid-selection-drop')

    createMobileDropTarget(sourceGroup.id)
    pmEntryMoveModel.registerMobileDropZone(document)
    pmMobileSelectionModel.enterWithEntry(entry.id)

    expect(pmEntryMoveModel.beginMobileDrag('entry', entry.id, {x: 4, y: 4})).toBe(true)
    expect(pmEntryMoveModel.moveMobileDrag({x: 40, y: 40})).toBe(true)
    await expect(pmEntryMoveModel.commitMobileDrag({x: 40, y: 40})).resolves.toBe(false)

    expect(entry.parent).toBe(sourceGroup)
    expect(pmMobileSelectionModel.active()).toBe(true)
    expect(pmMobileSelectionModel.isEntrySelected(entry.id)).toBe(true)
  })

  it('rejects selected-set mobile payloads for invalid descendant group targets', () => {
    const windowRef = ensureWindow()
    originalPassmanager = windowRef.passmanager

    const root = new ManagerRoot(createMockSaver())
    const parent = createGroup('parent-invalid-target', 'Parent')
    const child = createGroup('child-invalid-target', 'Parent/Child')

    root.entries.set([parent, child])
    windowRef.passmanager = root

    pmMobileSelectionModel.enterWithGroup(parent.id)
    const payload = pmEntryMoveModel.createMobileDragPayload('group', parent.id)

    expect(payload).toMatchObject({domain: 'passmanager', kind: 'selection'})
    expect(pmEntryMoveModel.canDropToTarget(child.id, payload)).toBe(false)
  })

  it('exits mobile selection after a successful pointer DnD drop', async () => {
    const windowRef = ensureWindow()
    originalPassmanager = windowRef.passmanager

    const root = new ManagerRoot(createMockSaver())
    const sourceGroup = createGroup('source-mobile-dnd', 'Mobile Source')
    const targetGroup = createGroup('target-mobile-dnd', 'Mobile Target')
    const entry = createEntry(sourceGroup, 'entry-mobile-dnd', 'Mobile Drag Entry')

    sourceGroup.addEntry(entry)
    root.entries.set([sourceGroup, targetGroup])
    windowRef.passmanager = root
    vi.spyOn(toast, 'show').mockReturnValue('toast-mobile-dnd')

    createMobileDropTarget(targetGroup.id)
    pmEntryMoveModel.registerMobileDropZone(document)
    pmMobileSelectionModel.enterWithEntry(entry.id)

    expect(pmEntryMoveModel.beginMobileDrag('entry', entry.id, {x: 4, y: 4})).toBe(true)
    expect(pmEntryMoveModel.moveMobileDrag({x: 40, y: 40})).toBe(true)
    await expect(pmEntryMoveModel.commitMobileDrag({x: 40, y: 40})).resolves.toBe(true)

    expect(entry.parent).toBe(targetGroup)
    expect(pmMobileSelectionModel.active()).toBe(false)
  })
})
