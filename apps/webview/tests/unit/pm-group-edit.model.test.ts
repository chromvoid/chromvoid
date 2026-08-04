import {beforeEach, describe, expect, it, vi} from 'vitest'

import {Group, ManagerRoot} from '@project/passmanager/core'
import type {ManagerSaver} from '@project/passmanager/types'
import {PMGroupEditModel} from '../../src/features/passmanager/components/group/group/group-edit.model'

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
    createEntry: vi.fn(async () => true),
    saveEntryMeta: vi.fn(async () => true),
    moveEntryToGroup: vi.fn(async () => true),
    removeEntry: vi.fn(async () => true),
    removeGroup: vi.fn(async () => undefined),
    ...overrides,
  }
}

function createGroup(id: string, name: string, description = ''): Group {
  return new Group({id, name, description, entries: [], createdTs: Date.now(), updatedTs: Date.now()})
}

describe('PMGroupEditModel', () => {
  let saver: ManagerSaver
  let root: ManagerRoot
  let group: Group
  let readOnly: boolean
  let confirmDiscard: ReturnType<typeof vi.fn>
  let model: PMGroupEditModel

  beforeEach(() => {
    saver = createMockSaver()
    root = new ManagerRoot(saver)
    group = createGroup('group-games', 'Root/Games', 'Original')
    root.entries.set([group])
    readOnly = false
    confirmDiscard = vi.fn(async () => false)
    model = new PMGroupEditModel({
      getRoot: () => root,
      isReadOnly: () => readOnly,
      confirmDiscard,
    })
  })

  it('prefills the draft and derives dirty and location state', () => {
    model.enter(group)

    expect(model.name()).toBe('Games')
    expect(model.description()).toBe('Original')
    expect(model.locationSegments()).toEqual(['Root', 'Root', 'Games'])
    expect(model.dirty()).toBe(false)

    model.setName('Gaming')
    expect(model.dirty()).toBe(true)
    expect(model.locationSegments()).toEqual(['Root', 'Root', 'Gaming'])
  })

  it.each([
    ['', 'Name cannot be empty'],
    ['bad/name', 'Name must not contain slash characters'],
    ['bad\\name', 'Name must not contain slash characters'],
  ])('validates an invalid name %j on submit', async (name, error) => {
    model.enter(group)
    model.setName(name)

    await expect(model.submit()).resolves.toBe(false)

    expect(model.nameError()).toBe(error)
    expect(saver.save).not.toHaveBeenCalled()
  })

  it('validates duplicate paths case-insensitively', async () => {
    root.entries.set([...root.entriesList(), createGroup('group-duplicate', 'Root/WORK')])
    model.enter(group)
    model.setName('work')

    await expect(model.submit()).resolves.toBe(false)

    expect(model.nameError()).toContain('already exists')
    expect(saver.save).not.toHaveBeenCalled()
  })

  it('rejects changed over-limit values but accepts unchanged legacy values', async () => {
    const legacy = createGroup('group-legacy', `Root/${'N'.repeat(45)}`, 'D'.repeat(125))
    root.entries.set([legacy])
    model.enter(legacy)

    expect(model.nameLegacyLimitHint()).not.toBe('')
    expect(model.descriptionLegacyLimitHint()).not.toBe('')
    await expect(model.submit()).resolves.toBe(true)
    expect(saver.save).not.toHaveBeenCalled()

    model.enter(legacy)
    model.setName('M'.repeat(45))
    model.setDescription('E'.repeat(125))
    await expect(model.submit()).resolves.toBe(false)
    expect(model.nameError()).toContain('40')
    expect(model.descriptionError()).toContain('120')
  })

  it('persists edits and exits the form', async () => {
    model.enter(group)
    model.setName('Gaming')
    model.setDescription('Updated')

    await expect(model.submit()).resolves.toBe(true)

    expect(group.name).toBe('Root/Gaming')
    expect(group.description).toBe('Updated')
    expect(model.active()).toBe(false)
  })

  it('deduplicates submit while persistence is pending', async () => {
    let resolveSave!: (value: boolean) => void
    saver.save = vi.fn(() => new Promise<boolean>((resolve) => (resolveSave = resolve)))
    model.enter(group)
    model.setName('Gaming')

    const firstSubmit = model.submit()
    await Promise.resolve()
    await expect(model.submit()).resolves.toBe(false)
    resolveSave(true)
    await expect(firstSubmit).resolves.toBe(true)

    expect(saver.save).toHaveBeenCalledOnce()
  })

  it('keeps the draft and live group baseline after persistence failure', async () => {
    saver.save = vi.fn(async () => false)
    model.enter(group)
    model.setName('Gaming')
    model.setDescription('Updated')

    await expect(model.submit()).resolves.toBe(false)

    expect(model.active()).toBe(true)
    expect(model.name()).toBe('Gaming')
    expect(model.submitError()).not.toBe('')
    expect(group.name).toBe('Root/Games')
    expect(group.description).toBe('Original')
  })

  it('keeps Save unavailable in read-only state without discarding the draft', async () => {
    model.enter(group)
    model.setName('Gaming')
    readOnly = true

    await expect(model.submit()).resolves.toBe(false)

    expect(model.active()).toBe(true)
    expect(saver.save).not.toHaveBeenCalled()
  })

  it('closes clean drafts immediately and confirms dirty discard', async () => {
    model.enter(group)
    await expect(model.requestClose()).resolves.toBe(true)
    expect(confirmDiscard).not.toHaveBeenCalled()

    model.enter(group)
    model.setName('Gaming')
    await expect(model.requestClose()).resolves.toBe(false)
    expect(model.active()).toBe(true)

    confirmDiscard.mockResolvedValueOnce(true)
    await expect(model.requestClose()).resolves.toBe(true)
    expect(model.active()).toBe(false)
  })
})
