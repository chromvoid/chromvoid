import {Entry, Group} from '@project/passmanager/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PMEntryModel} from '../../src/features/passmanager/components/card/entry/entry.model'
import {PMGroupModel} from '../../src/features/passmanager/components/group/group/group.model'
import {pmComponentLoaderModel} from '../../src/features/passmanager/models/pm-component-loader.model'
import {pmEntryMoveModel} from '../../src/features/passmanager/models/pm-entry-move-model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {dialogService} from '../../src/shared/services/dialog-service'

type PassmanagerMoveMock = {
  id: string
  isReadOnly: () => boolean
}

let previousPassmanager: typeof window.passmanager
let previousPassmanagerDescriptor: PropertyDescriptor | undefined
let currentPassmanager: typeof window.passmanager

function createGroup(id: string, name = 'Group A') {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(group: Group, id: string, title = 'Entry A') {
  return new Entry(
    group as any,
    {
      id,
      title,
      username: '',
      urls: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: [],
    } as any,
  )
}

function createPassmanagerMock(): PassmanagerMoveMock {
  return {
    id: 'pm-root',
    isReadOnly: () => false,
  }
}

describe('Passmanager shared move launchers', () => {
  beforeEach(() => {
    previousPassmanager = window.passmanager
    previousPassmanagerDescriptor = Object.getOwnPropertyDescriptor(window, 'passmanager')
    currentPassmanager = previousPassmanager
    Object.defineProperty(window, 'passmanager', {
      configurable: true,
      get() {
        return currentPassmanager
      },
      set(value) {
        currentPassmanager = value
        setPassmanagerRoot(value as any)
      },
    })
    setPassmanagerRoot(previousPassmanager as any)
  })

  afterEach(() => {
    currentPassmanager = previousPassmanager
    setPassmanagerRoot(previousPassmanager as any)
    if (previousPassmanagerDescriptor) {
      Object.defineProperty(window, 'passmanager', previousPassmanagerDescriptor)
    } else {
      delete (window as {passmanager?: typeof window.passmanager}).passmanager
    }
    vi.restoreAllMocks()
  })

  it('entry move waits for extended components before opening the move dialog', async () => {
    const group = createGroup('entry-source-group')
    const entry = createEntry(group, 'entry-move-launcher')
    ;(window as any).passmanager = createPassmanagerMock()

    const callOrder: string[] = []
    let resolveEnsure: (() => void) | undefined
    const ensureSpy = vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          callOrder.push('ensure')
          resolveEnsure = () => {
            callOrder.push('ensure-resolved')
            resolve()
          }
        }),
    )
    vi.spyOn(pmEntryMoveModel, 'getEntryParentTargetId').mockReturnValue(group.id)
    vi.spyOn(pmEntryMoveModel, 'listTargets').mockReturnValue([
      {id: group.id, path: group.name, label: group.name, isRoot: false},
      {id: 'entry-target-group', path: 'Target', label: 'Target', isRoot: false},
    ])
    const dialogSpy = vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(async (options) => {
      callOrder.push('dialog')
      expect(options.dialogClass).toBe('pm-move-sheet')
      return false
    })

    const promise = new PMEntryModel().moveEntryCard(entry)
    await Promise.resolve()

    expect(ensureSpy).toHaveBeenCalledTimes(1)
    expect(dialogSpy).not.toHaveBeenCalled()

    resolveEnsure?.()
    await promise

    expect(dialogSpy).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['ensure', 'ensure-resolved', 'dialog'])
  })

  it('group move opens the shared move dialog from the current group', async () => {
    const group = createGroup('group-move-launcher', 'Source')
    ;(window as any).passmanager = createPassmanagerMock()

    const callOrder: string[] = []
    let resolveEnsure: (() => void) | undefined
    const ensureSpy = vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          callOrder.push('ensure')
          resolveEnsure = () => {
            callOrder.push('ensure-resolved')
            resolve()
          }
        }),
    )
    vi.spyOn(pmEntryMoveModel, 'listTargets').mockReturnValue([
      {id: group.id, path: group.name, label: group.name, isRoot: false},
      {id: 'group-target', path: 'Target', label: 'Target', isRoot: false},
    ])
    vi.spyOn(pmEntryMoveModel, 'canDropToTarget').mockImplementation((targetId) => targetId === 'group-target')
    const dialogSpy = vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(async (options) => {
      callOrder.push('dialog')
      expect(options.dialogClass).toBe('pm-move-sheet')
      return false
    })

    const promise = new PMGroupModel().moveGroup(group)
    await Promise.resolve()

    expect(ensureSpy).toHaveBeenCalledTimes(1)
    expect(dialogSpy).not.toHaveBeenCalled()

    resolveEnsure?.()
    await promise

    expect(dialogSpy).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['ensure', 'ensure-resolved', 'dialog'])
  })
})
