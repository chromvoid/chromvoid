import {describe, expect, it, vi, beforeEach, type Mock} from 'vitest'

vi.mock('@project/utils', () => ({sha256: vi.fn(async (s: string) => `hash:${s}`)}))

import {Entry} from '../entry'
import {Group} from '../group'
import {ManagerRoot} from '../root'
import type {ManagerSaver, IEntry, OTPOptions, SshKeyEntry} from '../types'

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
    id: 'entry-rollback',
    createdTs: Date.now(),
    updatedTs: Date.now(),
    title: 'Rollback Entry',
    urls: [],
    username: 'user1',
    otps: [],
    sshKeys: [],
    ...overrides,
  }
}

function makeSshKey(id: string): SshKeyEntry {
  return {
    id,
    type: 'ed25519',
    fingerprint: `SHA256:${id}`,
  }
}

function makeGroup(id: string, name: string): Group {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function makeOtp(overrides: Partial<OTPOptions> = {}): OTPOptions {
  return {
    id: 'otp-1',
    label: 'OTP',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: 'otp-secret',
    encoding: 'base32',
    type: 'TOTP',
    ...overrides,
  }
}

describe('Entry rollback paths', () => {
  let root: ManagerRoot
  let saver: ManagerSaver

  beforeEach(() => {
    vi.clearAllMocks()
    saver = createMockSaver()
    root = new ManagerRoot(saver)
  })

  it('rolls back addOTP when OTP secret persistence fails after optimistic insert', async () => {
    ;(saver.saveEntryMeta as Mock).mockResolvedValueOnce(true)
    ;(saver.saveOTP as Mock).mockRejectedValueOnce(new Error('otp save failed'))

    const entry = new Entry(root, makeEntryData())

    await expect(entry.addOTP(makeOtp())).rejects.toThrow('otp save failed')
    await Promise.resolve()
    await Promise.resolve()
    expect(entry.otps()).toHaveLength(0)
  })

  it('rolls back SSH metadata updates when meta persistence fails', async () => {
    const originalKeys = [makeSshKey('k1')]
    const entry = new Entry(root, makeEntryData({sshKeys: originalKeys}))

    ;(saver.saveEntryMeta as Mock).mockRejectedValueOnce(new Error('meta failed'))

    await expect(entry.updateSshKeys([makeSshKey('k2')])).rejects.toThrow('meta failed')
    expect(entry.sshKeys).toEqual(originalKeys)
  })

  it('rolls back SSH key removal when a storage step fails', async () => {
    const originalKeys = [makeSshKey('k1'), makeSshKey('k2')]
    const entry = new Entry(root, makeEntryData({sshKeys: originalKeys}))

    ;(saver.removeEntrySshPrivateKey as Mock).mockRejectedValueOnce(new Error('ssh remove failed'))

    await expect(entry.removeSshKey('k1')).rejects.toThrow('ssh remove failed')
    expect(entry.sshKeys).toEqual(originalKeys)
  })

  it('rolls back OTP removal when meta persistence fails after clean', async () => {
    const entry = Entry.import(root, {
      id: 'entry-otp-remove',
      createdTs: Date.now(),
      updatedTs: Date.now(),
      exportedTs: Date.now(),
      title: 'Rollback OTP',
      urls: [],
      username: 'user1',
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
    if (!otp) throw new Error('expected otp to exist')
    ;(saver.removeOTP as Mock).mockResolvedValueOnce(true)
    ;(saver.saveEntryMeta as Mock).mockRejectedValueOnce(new Error('meta failed'))

    await expect(otp.remove(true)).rejects.toThrow('meta failed')
    expect(entry.otps()).toHaveLength(1)
    expect(otp.isRemoved).toBe(false)
  })

  it('persists entry moves via point move API without calling root.save', async () => {
    const source = makeGroup('group-source', 'Source')
    const target = makeGroup('group-target', 'Target')
    const entry = new Entry(source, makeEntryData({id: 'entry-move-point'}))

    source.addEntry(entry)
    root.entries.set([source, target])

    const saveSpy = vi.spyOn(root, 'save')

    await expect(entry.move(target, {silent: true})).resolves.toBe(true)

    expect(saver.moveEntryToGroup).toHaveBeenCalledWith('entry-move-point', 'Target')
    expect(saveSpy).not.toHaveBeenCalled()
    expect(entry.parent).toBe(target)
    expect(source.entries()).toEqual([])
    expect(target.entries().map((item) => item.id)).toEqual(['entry-move-point'])
  })

  it('rolls back optimistic entry move when point move persistence fails', async () => {
    const source = makeGroup('group-source-rollback', 'Source')
    const target = makeGroup('group-target-rollback', 'Target')
    const entry = new Entry(source, makeEntryData({id: 'entry-move-rollback'}))

    source.addEntry(entry)
    root.entries.set([source, target])

    ;(saver.moveEntryToGroup as Mock).mockRejectedValueOnce(new Error('move failed'))

    await expect(entry.move(target, {silent: true})).rejects.toThrow('move failed')

    expect(entry.parent).toBe(source)
    expect(source.entries().map((item) => item.id)).toEqual(['entry-move-rollback'])
    expect(target.entries()).toEqual([])
  })
})
