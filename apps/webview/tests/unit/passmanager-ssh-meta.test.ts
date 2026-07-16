import {describe, expect, it, vi} from 'vitest'

import {ManagerRoot} from '@project/passmanager'
import type {ManagerSaver, PassManagerSshKey} from '@project/passmanager/types'

function createSaver() {
  const state = {
    lastMetaCall: undefined as Record<string, unknown> | undefined,
    sshKeys: [] as PassManagerSshKey[],
  }
  const saver = {
    save: vi.fn(async () => true),
    read: vi.fn(async () => undefined),
    remove: vi.fn(async () => true),
    getOTP: vi.fn(async () => undefined),
    getOTPSeckey: vi.fn(async () => undefined),
    removeOTP: vi.fn(async () => true),
    saveOTP: vi.fn(async () => true),
    readEntryPassword: vi.fn(async () => undefined),
    readEntryNote: vi.fn(async () => undefined),
    saveEntryPassword: vi.fn(async () => true),
    saveEntryNote: vi.fn(async () => true),
    removeEntryPassword: vi.fn(async () => true),
    removeEntryNote: vi.fn(async () => true),
    saveEntryMeta: vi.fn(async (data: Record<string, unknown>) => {
      state.lastMetaCall = data
      return true
    }),
    removeEntry: vi.fn(async () => true),
    listSshKeys: vi.fn(async () => [...state.sshKeys]),
    updateSshKey: vi.fn(async (key: PassManagerSshKey) => {
      state.sshKeys = [...state.sshKeys.filter((item) => item.id !== key.id), key]
      return true
    }),
    removeSshKey: vi.fn(async (keyId: string) => {
      state.sshKeys = state.sshKeys.filter((item) => item.id !== keyId)
      return true
    }),
    readSshPublicKey: vi.fn(async () => undefined),
  } satisfies Partial<ManagerSaver>
  return {saver: saver as ManagerSaver, state}
}

describe('root SSH metadata', () => {
  it('derives entry.sshKeys from root metadata without persisting it in entry meta', async () => {
    const {saver, state} = createSaver()
    const root = new ManagerRoot(saver)
    root.entries.set([])
    const entry = root.createEntry(
      {id: 'entry-1', title: 'SSH Test', username: 'user', urls: []},
      'password',
      '',
      undefined,
    )
    await entry.flushPendingPersistence()
    root.sshKeys.set([
      {
        id: 'key-1',
        type: 'ed25519',
        fingerprint: 'SHA256:abc',
        sourceEntryId: entry.id,
      },
    ])

    expect(entry.sshKeys).toEqual(root.sshKeys())
    expect(state.lastMetaCall).not.toHaveProperty('sshKeys')
  })

  it('updates SSH metadata through the root repository contract', async () => {
    const {saver} = createSaver()
    const root = new ManagerRoot(saver)
    const key: PassManagerSshKey = {
      id: 'key-2',
      type: 'rsa',
      fingerprint: 'SHA256:rsa',
      name: 'Deploy key',
    }

    await root.updateSshKey(key)

    expect(saver.updateSshKey).toHaveBeenCalledWith(key)
    expect(root.sshKeys()).toEqual([key])
  })

  it('removes SSH metadata and secrets only through the root key delete path', async () => {
    const {saver} = createSaver()
    const root = new ManagerRoot(saver)
    root.sshKeys.set([{id: 'key-3', type: 'ecdsa', fingerprint: 'SHA256:ec'}])

    await root.removeSshKey('key-3')

    expect(saver.removeSshKey).toHaveBeenCalledWith('key-3')
    expect(root.sshKeys()).toEqual([])
  })

  it('keeps a related SSH key when its source entry is deleted', async () => {
    const {saver} = createSaver()
    const root = new ManagerRoot(saver)
    root.entries.set([])
    const key: PassManagerSshKey = {
      id: 'key-4',
      type: 'ed25519',
      fingerprint: 'SHA256:keep',
    }
    const entry = root.createEntry(
      {id: 'entry-4', title: 'Temporary entry', username: 'user', urls: []},
      'password',
      '',
      undefined,
    )
    await entry.flushPendingPersistence()
    key.sourceEntryId = entry.id
    root.sshKeys.set([key])

    await entry.remove({silent: true})

    expect(saver.removeEntry).toHaveBeenCalledWith(entry.id)
    expect(saver.removeSshKey).not.toHaveBeenCalled()
    expect(root.sshKeys()).toEqual([key])
  })
})
