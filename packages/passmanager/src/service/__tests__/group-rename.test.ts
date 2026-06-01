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
    saveEntryMeta: vi.fn(async () => true),
    moveEntryToGroup: vi.fn(async () => true),
    removeEntry: vi.fn(async () => true),
    ...overrides,
  }
}

describe('group rename', () => {
  it('renames the whole subgroup tree when the parent path changes', () => {
    const root = new ManagerRoot(createMockSaver())
    const now = Date.now()
    const parent = new Group({
      id: 'group-parent',
      name: 'Services',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    const child = new Group({
      id: 'group-child',
      name: 'Services/CI',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    root.entries.set([parent, child])

    expect(parent.rename('Infra')).toBe(true)
    expect(parent.name).toBe('Infra')
    expect(child.name).toBe('Infra/CI')
  })

  it('rejects rename when the target path already exists', () => {
    const root = new ManagerRoot(createMockSaver())
    const now = Date.now()
    const source = new Group({
      id: 'group-source',
      name: 'Services',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    const taken = new Group({
      id: 'group-taken',
      name: 'Infra',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    root.entries.set([source, taken])

    expect(source.rename('Infra')).toBe(false)
    expect(source.name).toBe('Services')
    expect(taken.name).toBe('Infra')
  })
})
