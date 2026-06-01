import {describe, expect, it, vi} from 'vitest'

vi.mock('@project/utils', () => ({sha256: vi.fn(async (s: string) => `hash:${s}`)}))

import {Group} from '../group'
import {ManagerRoot} from '../root'
import type {ManagerSaver, PassManagerRootV2} from '../types'

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

describe('group description', () => {
  it('save/load roundtrip preserves normalized group description', async () => {
    let savedText = ''
    const saver = createMockSaver({
      save: vi.fn(async (_key: string, file: File) => {
        savedText = await file.text()
        return true
      }),
      read: vi.fn(async () => savedText) as unknown as ManagerSaver['read'],
    })

    const root = new ManagerRoot(saver)
    root.createGroup({
      name: 'work',
      description: '  Team secrets  ',
      entries: [],
    })
    await root.save()

    const saved = JSON.parse(savedText) as PassManagerRootV2
    expect(saved.foldersMeta).toEqual([{path: 'work', description: 'Team secrets'}])

    const reloadedRoot = new ManagerRoot(saver)
    await reloadedRoot.load()

    expect(reloadedRoot.getGroup('group:work')?.description).toBe('Team secrets')
  })

  it('load keeps description undefined for legacy payloads without description', async () => {
    const now = Date.now()
    const saver = createMockSaver({
      read: (vi.fn(async () =>
        JSON.stringify({
          version: 2,
          createdTs: now,
          updatedTs: now,
          folders: ['work'],
          foldersMeta: [{path: 'work'}],
          entries: [],
        } satisfies PassManagerRootV2),
      ) as unknown) as ManagerSaver['read'],
    })

    const root = new ManagerRoot(saver)
    await root.load()

    expect(root.getGroup('group:work')?.description).toBeUndefined()
  })

  it('group export/import preserves normalized description', async () => {
    const group = Group.create({
      name: 'ops',
      description: '  Operations vault  ',
      entries: [],
    })

    const exported = await group.export()
    expect(exported.description).toBe('Operations vault')

    const imported = Group.import({...exported, entries: []})
    expect(imported.description).toBe('Operations vault')
  })
})
