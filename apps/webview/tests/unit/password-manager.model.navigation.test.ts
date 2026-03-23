import {afterEach, describe, expect, it} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {
  consumeAndroidPasswordSavePrefill,
  stageAndroidPasswordSavePrefill,
} from '../../src/features/passmanager/models/android-password-save-prefill'
import {passmanagerNavigationController} from '../../src/features/passmanager/passmanager-navigation.controller'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

function createGroup(id: string, name: string) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(parent: Group, id: string, title: string) {
  return new Entry(parent, {
    id,
    title,
    urls: [],
    username: '',
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: [],
  } as any)
}

describe('PasswordManagerModel navigation', () => {
  let originalPassmanager: typeof window.passmanager

  afterEach(() => {
    window.passmanager = originalPassmanager
    passmanagerNavigationController.reset()
    pmModel.cleanup()
    consumeAndroidPasswordSavePrefill()
  })

  it('returns to root after root -> group -> entry back chain', () => {
    originalPassmanager = window.passmanager

    const root = new ManagerRoot({} as any)
    const group = createGroup('group-a', 'Group A')
    const entry = createEntry(group, 'entry-a', 'Entry A')

    group.entries.set([entry])
    root.entries.set([group])
    window.passmanager = root

    pmModel.openItem(group)
    pmModel.openItem(entry)

    expect(root.showElement()).toBe(entry)

    expect(pmModel.goBackFromCurrent()).toBe(true)
    expect(root.showElement()).toBe(group)
    expect(pmModel.consumeRestoreSelection(group.id)).toBe(entry.id)

    expect(pmModel.goBackFromCurrent()).toBe(true)
    expect(root.showElement()).toBe(root)
    expect(pmModel.consumeRestoreSelection(root.id)).toBe(group.id)
  })

  it('exits edit mode before leaving the current entry', () => {
    originalPassmanager = window.passmanager

    const root = new ManagerRoot({} as any)
    const group = createGroup('group-b', 'Group B')
    const entry = createEntry(group, 'entry-b', 'Entry B')

    group.entries.set([entry])
    root.entries.set([group])
    root.showElement.set(entry)
    root.isEditMode.set(true)
    window.passmanager = root

    expect(pmModel.goBackFromCurrent()).toBe(true)
    expect(root.isEditMode()).toBe(false)
    expect(root.showElement()).toBe(entry)

    expect(pmModel.goBackFromCurrent()).toBe(true)
    expect(root.showElement()).toBe(group)
  })

  it('opens create entry when Android password save prefill is pending during init', () => {
    originalPassmanager = window.passmanager
    pmModel.managerSaver = {
      read: () => ({version: 2, folders: [], entries: [], createdTs: 0, updatedTs: 0}),
    } as any
    stageAndroidPasswordSavePrefill({
      token: 'token-1',
      title: 'github.com',
      username: 'alice@example.com',
      password: 'pw-123',
      urls: 'https://github.com/login',
    })

    window.passmanager = undefined as unknown as typeof window.passmanager

    pmModel.init()

    expect(passmanagerNavigationController.readRoute()).toEqual({
      kind: 'create-entry',
      targetGroupPath: undefined,
    })
  })
})
