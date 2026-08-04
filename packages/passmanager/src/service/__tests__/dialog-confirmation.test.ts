import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('@project/utils', () => ({sha256: vi.fn(async (s: string) => `hash:${s}`)}))

import {setPassManagerDialogAdapter} from '../dialog'
import {Entry} from '../entry'
import {Group} from '../group'
import {ManagerRoot} from '../root'
import type {IEntry, ManagerSaver} from '../types'

type LoginEntryData = Extract<IEntry, {entryType?: 'login'}>

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

function makeEntryData(overrides: Partial<LoginEntryData> = {}): LoginEntryData {
  return {
    id: 'entry-1',
    createdTs: Date.now(),
    updatedTs: Date.now(),
    title: 'Test Entry',
    urls: [],
    username: 'user1',
    otps: [],
    sshKeys: [],
    ...overrides,
  }
}

describe('passmanager destructive confirmations', () => {
  afterEach(() => {
    setPassManagerDialogAdapter(null)
  })

  it('cancels entry removal when confirmation is rejected', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    const entry = new Entry(root, makeEntryData())
    root.entries.set([entry])
    setPassManagerDialogAdapter({confirm: vi.fn(async () => false)})

    await entry.remove()

    expect(saver.removeEntry).not.toHaveBeenCalled()
    expect(root.entriesList()).toEqual([entry])
  })

  it('cancels group removal when confirmation is rejected', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    const group = new Group({
      id: 'group-1',
      name: 'Work',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    root.entries.set([group])
    setPassManagerDialogAdapter({confirm: vi.fn(async () => false)})

    await group.remove()

    expect(saver.removeGroup).not.toHaveBeenCalled()
    expect(root.entriesList()).toEqual([group])
  })

  it('keeps a group and navigation unchanged when point deletion fails', async () => {
    const saver = createMockSaver({
      removeGroup: vi.fn(async () => {
        throw new Error('transport failed')
      }),
    })
    const root = new ManagerRoot(saver)
    const group = new Group({
      id: 'group-1',
      name: 'Work',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    root.entries.set([group])
    root.showElement.set(group)

    await expect(group.remove({silent: true})).rejects.toThrow('transport failed')

    expect(saver.removeGroup).toHaveBeenCalledWith('Work')
    expect(saver.save).not.toHaveBeenCalled()
    expect(root.entriesList()).toEqual([group])
    expect(root.showElement()).toBe(group)
  })

  it('removes a confirmed group subtree without saving the whole root', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    const group = new Group({
      id: 'group-1',
      name: 'Work',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    const nested = new Group({
      id: 'group-2',
      name: 'Work/Archive',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    root.entries.set([group, nested])

    await expect(group.remove({silent: true})).resolves.toBe(true)

    expect(saver.removeGroup).toHaveBeenCalledWith('Work')
    expect(saver.save).not.toHaveBeenCalled()
    expect(root.entriesList()).toEqual([])
  })

  it('does not overwrite navigation changed while group deletion is pending', async () => {
    let resolveDelete: (() => void) | undefined
    const saver = createMockSaver({
      removeGroup: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveDelete = resolve
          }),
      ),
    })
    const root = new ManagerRoot(saver)
    const group = new Group({
      id: 'group-1',
      name: 'Work',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    const other = new Group({
      id: 'group-2',
      name: 'Notes',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    root.entries.set([group, other])
    root.showElement.set(group)

    const removal = group.remove({silent: true})
    root.showElement.set(other)
    resolveDelete?.()
    await removal

    expect(root.showElement()).toBe(other)
  })

  it('returns to the entry parent after removing an open entry', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    const parent = new Group({
      id: 'group-parent',
      name: 'Work',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    const entry = new Entry(parent, makeEntryData())
    parent.entries.set([entry])
    root.entries.set([parent])
    root.showElement.set(entry)
    setPassManagerDialogAdapter({confirm: vi.fn(async () => true)})

    await entry.remove()

    expect(root.showElement()).toBe(parent)
  })

  it('defers entry presentation while preserving automatic navigation by default', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    const first = new Entry(root, makeEntryData({id: 'entry-auto'}))
    root.entries.set([first])
    root.showElement.set(first)

    await first.remove({silent: true})
    expect(root.showElement()).toBe(root)

    const deferred = new Entry(root, makeEntryData({id: 'entry-deferred'}))
    root.entries.set([deferred])
    root.showElement.set(deferred)

    await deferred.remove({silent: true, presentation: 'defer'})
    expect(root.showElement()).toBe(deferred)
  })

  it('returns to the parent group after removing an open nested group', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    const parent = new Group({
      id: 'group-parent',
      name: 'Work',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    const child = new Group({
      id: 'group-child',
      name: 'Work/Archive',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    root.entries.set([parent, child])
    root.showElement.set(child)
    setPassManagerDialogAdapter({confirm: vi.fn(async () => true)})

    await child.remove()

    expect(root.showElement()).toBe(parent)
  })

  it('defers group presentation while preserving automatic navigation by default', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    const automatic = new Group({
      id: 'group-auto',
      name: 'Automatic',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    root.entries.set([automatic])
    root.showElement.set(automatic)

    await automatic.remove({silent: true})
    expect(root.showElement()).toBe(root)

    const deferred = new Group({
      id: 'group-deferred',
      name: 'Deferred',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    root.entries.set([deferred])
    root.showElement.set(deferred)

    await deferred.remove({silent: true, presentation: 'defer'})
    expect(root.showElement()).toBe(deferred)
  })

  it('cancels OTP removal when confirmation is rejected', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    const entry = Entry.import(root, {
      ...makeEntryData(),
      exportedTs: Date.now(),
      otps: [
        {
          id: 'otp-1',
          label: 'OTP',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          encoding: 'base32',
          secret: '',
          type: 'TOTP',
        },
      ],
    })
    root.entries.set([entry])
    const otp = entry.otps()[0]
    if (!otp) throw new Error('expected otp')
    setPassManagerDialogAdapter({confirm: vi.fn(async () => false)})

    await expect(otp.remove()).resolves.toBe(false)

    expect(saver.removeOTP).not.toHaveBeenCalled()
    expect(entry.otps()).toEqual([otp])
  })
})
