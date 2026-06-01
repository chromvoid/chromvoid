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
    saveEntryMeta: vi.fn(async () => true),
    moveEntryToGroup: vi.fn(async () => true),
    removeEntry: vi.fn(async () => true),
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

    expect(saver.save).not.toHaveBeenCalled()
    expect(root.entriesList()).toEqual([group])
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
