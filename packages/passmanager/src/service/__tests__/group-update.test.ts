import {describe, expect, it, vi} from 'vitest'

vi.mock('@project/utils', () => ({sha256: vi.fn(async (s: string) => `hash:${s}`)}))

import {Group} from '../group'
import {ManagerRoot} from '../root'
import type {ManagerSaver} from '../types'

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

function createGroup(id: string, name: string, updatedTs = 100): Group {
  return new Group({id, name, entries: [], createdTs: 50, updatedTs})
}

describe('Group.saveChanges', () => {
  it('persists metadata changes without renaming the group', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    const group = createGroup('group-work', 'Work')
    root.entries.set([group])

    await expect(
      group.saveChanges({name: 'Work', description: 'Team vault', iconRef: 'sha256:icon'}),
    ).resolves.toEqual({status: 'saved'})

    expect(group.name).toBe('Work')
    expect(group.description).toBe('Team vault')
    expect(group.iconRef).toBe('sha256:icon')
    expect(saver.save).toHaveBeenCalledOnce()
  })

  it('renames the whole subgroup tree in one persisted update', async () => {
    const root = new ManagerRoot(createMockSaver())
    const parent = createGroup('group-parent', 'Services')
    const child = createGroup('group-child', 'Services/CI')
    root.entries.set([parent, child])

    await expect(
      parent.saveChanges({name: 'Infra', description: '', iconRef: undefined}),
    ).resolves.toEqual({status: 'saved'})

    expect(parent.name).toBe('Infra')
    expect(child.name).toBe('Infra/CI')
  })

  it('rejects case-insensitive path conflicts before mutation', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    const source = createGroup('group-source', 'Services')
    const taken = createGroup('group-taken', 'infra')
    root.entries.set([source, taken])

    await expect(
      source.saveChanges({name: 'Infra', description: '', iconRef: undefined}),
    ).resolves.toEqual({status: 'name-conflict'})

    expect(source.name).toBe('Services')
    expect(saver.save).not.toHaveBeenCalled()
  })

  it.each(['', '/Services', 'Services/', 'Services//CI', 'Services\\CI'])(
    'rejects an invalid full path %j before mutation',
    async (name) => {
      const saver = createMockSaver()
      const root = new ManagerRoot(saver)
      const group = createGroup('group-source', 'Services')
      root.entries.set([group])
      const before = group.toJSON()

      await expect(
        group.saveChanges({name, description: 'Changed', iconRef: 'sha256:new'}),
      ).resolves.toEqual({status: 'invalid-name'})

      expect(group.toJSON()).toEqual(before)
      expect(saver.save).not.toHaveBeenCalled()
    },
  )

  it('does not persist unchanged normalized values', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    const group = new Group({
      id: 'group-work',
      name: 'Work',
      description: 'Team vault',
      iconRef: 'sha256:icon',
      entries: [],
      createdTs: 50,
      updatedTs: 100,
    })
    root.entries.set([group])

    await expect(
      group.saveChanges({name: 'Work', description: '  Team vault  ', iconRef: 'sha256:icon'}),
    ).resolves.toEqual({status: 'unchanged'})

    expect(saver.save).not.toHaveBeenCalled()
  })

  it.each([
    ['false result', vi.fn(async () => false)],
    ['rejection', vi.fn(async () => Promise.reject(new Error('save failed')))],
  ])('rolls back the subtree and timestamps after a %s', async (_label, save) => {
    vi.useFakeTimers()
    vi.setSystemTime(5_000)
    try {
      const root = new ManagerRoot(createMockSaver({save}))
      const parent = new Group({
        id: 'group-parent',
        name: 'Services',
        description: 'Original',
        iconRef: 'sha256:old',
        entries: [],
        createdTs: 50,
        updatedTs: 100,
      })
      const child = createGroup('group-child', 'Services/CI', 200)
      root.entries.set([parent, child])
      root.updatedTs.set(300)
      const parentBefore = parent.toJSON()
      const childBefore = child.toJSON()

      await expect(
        parent.saveChanges({name: 'Infra', description: 'Changed', iconRef: 'sha256:new'}),
      ).resolves.toEqual({status: 'save-failed'})

      expect(parent.toJSON()).toEqual(parentBefore)
      expect(child.toJSON()).toEqual(childBefore)
      expect(root.updatedTs()).toBe(300)
    } finally {
      vi.useRealTimers()
    }
  })
})
