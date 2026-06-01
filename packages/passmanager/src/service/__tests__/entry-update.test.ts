import {describe, it, expect, vi, beforeEach, type Mock} from 'vitest'

vi.mock('@project/utils', () => ({sha256: vi.fn(async (s: string) => `hash:${s}`)}))

import {sha256} from '@project/utils'
import {Entry} from '../entry'
import {ManagerRoot} from '../root'
import {OTP} from '../otp'
import type {ManagerSaver, IEntry} from '../types'

type LoginEntryData = Extract<IEntry, {entryType?: 'login'}>
type PaymentCardEntryData = Extract<IEntry, {entryType: 'payment_card'}>

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

function makePaymentCardEntryData(overrides: Partial<PaymentCardEntryData> = {}): PaymentCardEntryData {
  return {
    id: 'payment-card-1',
    entryType: 'payment_card',
    createdTs: Date.now(),
    updatedTs: Date.now(),
    title: 'Team Card',
    urls: [],
    username: '',
    otps: [],
    sshKeys: [],
    paymentCard: {
      cardholderName: 'Alice Doe',
      expMonth: 12,
      expYear: 2032,
      brand: 'visa',
      last4: '1111',
    },
    ...overrides,
  }
}

describe('Entry.update()', () => {
  let root: ManagerRoot
  let saver: ManagerSaver

  beforeEach(() => {
    vi.clearAllMocks()
    saver = createMockSaver()
    root = new ManagerRoot(saver)
  })

  it('saves meta then password then note sequentially', async () => {
    const callOrder: string[] = []

    const saveMeta = saver.saveEntryMeta as Mock
    const savePwd = saver.saveEntryPassword as Mock
    const saveNote = saver.saveEntryNote as Mock

    saveMeta.mockImplementation(async () => {
      callOrder.push('meta')
      return true
    })
    savePwd.mockImplementation(async () => {
      callOrder.push('password')
      return true
    })
    saveNote.mockImplementation(async () => {
      callOrder.push('note')
      return true
    })

    const entry = new Entry(root, makeEntryData())
    const nextData = makeEntryData({title: 'Updated'})

    await entry.update(nextData, 'secret123', 'my note')

    expect(callOrder).toEqual(['meta', 'password', 'note'])
    expect(saveMeta).toHaveBeenCalledOnce()
    expect(savePwd).toHaveBeenCalledWith('entry-1', 'secret123')
    expect(saveNote).toHaveBeenCalledWith('entry-1', 'my note')
  })

  it('skips savePassword when password is undefined', async () => {
    const entry = new Entry(root, makeEntryData())
    const nextData = makeEntryData({title: 'Updated'})

    await entry.update(nextData, undefined, 'note text')

    expect(saver.saveEntryMeta).toHaveBeenCalledOnce()
    expect(saver.saveEntryPassword).not.toHaveBeenCalled()
    expect(saver.saveEntryNote).toHaveBeenCalledWith('entry-1', 'note text')
  })

  it('skips saveNote when note is undefined', async () => {
    const entry = new Entry(root, makeEntryData())
    const nextData = makeEntryData({title: 'Updated'})

    await entry.update(nextData, 'pass', undefined)

    expect(saver.saveEntryMeta).toHaveBeenCalledOnce()
    expect(saver.saveEntryPassword).toHaveBeenCalledWith('entry-1', 'pass')
    expect(saver.saveEntryNote).not.toHaveBeenCalled()
  })

  it('skips both password and note when both undefined', async () => {
    const entry = new Entry(root, makeEntryData())
    const nextData = makeEntryData({title: 'Updated'})

    await entry.update(nextData, undefined, undefined)

    expect(saver.saveEntryMeta).toHaveBeenCalledOnce()
    expect(saver.saveEntryPassword).not.toHaveBeenCalled()
    expect(saver.saveEntryNote).not.toHaveBeenCalled()
  })

  it('persists note for payment_card without attempting password saves', async () => {
    const entry = new Entry(root, makePaymentCardEntryData())
    const nextData = makePaymentCardEntryData({title: 'Updated Card'})

    await entry.update(nextData, undefined, 'Billing address')

    expect(saver.saveEntryMeta).toHaveBeenCalledOnce()
    expect(saver.saveEntryPassword).not.toHaveBeenCalled()
    expect(saver.saveEntryNote).toHaveBeenCalledWith('payment-card-1', 'Billing address')
  })

  it('updates _data synchronously before awaiting saves', async () => {
    let titleDuringSave = ''
    ;(saver.saveEntryMeta as Mock).mockImplementation(async () => {
      // Title should already be updated by the time saveEntryMeta is called
      titleDuringSave = entry.title
      return true
    })

    const entry = new Entry(root, makeEntryData({title: 'Original'}))
    const nextData = makeEntryData({title: 'Updated'})
    const promise = entry.update(nextData, undefined, undefined)

    // Title is updated synchronously before awaits
    expect(entry.title).toBe('Updated')
    await promise
    expect(titleDuringSave).toBe('Updated')
  })

  it('persists original created timestamp while advancing updated timestamp', async () => {
    const createdTs = 1_700_000_000_000
    const originalUpdatedTs = 1_700_000_010_000
    const nextUpdatedTs = 1_700_000_020_000
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(nextUpdatedTs)

    const entry = new Entry(root, makeEntryData({createdTs, updatedTs: originalUpdatedTs}))

    await entry.update(makeEntryData({title: 'Updated'}), undefined, undefined)

    expect(saver.saveEntryMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        createdTs,
        updatedTs: nextUpdatedTs,
      }),
    )
    expect(entry.createdTs).toBe(createdTs)
    expect(entry.updatedTs).toBe(nextUpdatedTs)

    nowSpy.mockRestore()
  })

  it('blocks load() via _pendingEntryUpdates counter', async () => {
    let resolveMetaSave!: () => void
    ;(saver.saveEntryMeta as Mock).mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveMetaSave = () => resolve(true)
        }),
    )
    // Provide data for load() to parse
    ;(saver.read as Mock).mockResolvedValue(
      JSON.stringify({
        version: 2,
        folders: [],
        entries: [{id: 'new-1', title: 'New', username: '', urls: [], otps: [], folderPath: null}],
        createdTs: Date.now(),
        updatedTs: Date.now(),
      }),
    )

    const entry = new Entry(root, makeEntryData())
    root.entries.set([entry])

    // Start update (will block on saveEntryMeta)
    const updatePromise = entry.update(makeEntryData({title: 'Updating'}), undefined, undefined)

    // load() should be blocked while update is in progress
    await root.load()
    // entries should still contain the original entry (load was no-op)
    expect(root.entries()?.length).toBe(1)
    expect(root.entries()?.[0]).toBe(entry)

    // Complete the update
    resolveMetaSave()
    await updatePromise

    // Now load() should work
    await root.load()
    const allEntries = root.allEntries
    expect(allEntries.some((e) => e.id === 'new-1')).toBe(true)
  })

  it('rolls back optimistic update state and releases guard when note save fails', async () => {
    const entry = Entry.create(root, makeEntryData({title: 'Original'}), 'old-pwd', 'old-note', undefined)
    await entry.flushPendingPersistence()

    ;(saver.saveEntryMeta as Mock).mockResolvedValueOnce(true)
    ;(saver.saveEntryPassword as Mock).mockResolvedValueOnce(true)
    ;(saver.saveEntryNote as Mock).mockRejectedValueOnce(new Error('network fail'))

    await expect(entry.update(makeEntryData({title: 'Updated'}), 'new-pwd', 'new-note')).rejects.toThrow(
      'network fail',
    )

    expect(entry.title).toBe('Original')
    await expect(entry.password()).resolves.toBe('old-pwd')
    await expect(entry.note()).resolves.toBe('old-note')

    // Guard should be released — _pendingEntryUpdates should be 0
    // Verify by checking load() works after error
    ;(saver.read as Mock).mockResolvedValue(
      JSON.stringify({
        version: 2,
        folders: [],
        entries: [{id: 'after-err', title: 'OK', username: '', urls: [], otps: [], folderPath: null}],
        createdTs: Date.now(),
        updatedTs: Date.now(),
      }),
    )
    root.entries.set([entry])

    await root.load()
    expect(root.allEntries.some((e) => e.id === 'after-err')).toBe(true)
  })
})

describe('Entry.persistNew()', () => {
  let root: ManagerRoot
  let saver: ManagerSaver

  beforeEach(() => {
    vi.clearAllMocks()
    saver = createMockSaver()
    root = new ManagerRoot(saver)
  })

  it('does not call savePassword for empty password', async () => {
    const entry = Entry.create(root, {title: 'New', urls: [], username: ''}, '', '', undefined)
    await entry.flushPendingPersistence()

    expect(saver.saveEntryMeta).toHaveBeenCalledOnce()
    expect(saver.saveEntryPassword).not.toHaveBeenCalled()
    expect(saver.saveEntryNote).not.toHaveBeenCalled()
  })

  it('calls savePassword/saveNote for non-empty values', async () => {
    const entry = Entry.create(root, {title: 'New', urls: [], username: ''}, 'mypass', 'mynote', undefined)
    await entry.flushPendingPersistence()

    expect(saver.saveEntryMeta).toHaveBeenCalledOnce()
    expect(saver.saveEntryPassword).toHaveBeenCalledWith(entry.id, 'mypass')
    expect(saver.saveEntryNote).toHaveBeenCalledWith(entry.id, 'mynote')
  })

  it('uses transient secret cache for a fresh entry without remote reads', async () => {
    const entry = Entry.create(root, {title: 'New', urls: [], username: ''}, 'mypass', 'mynote', undefined)

    await expect(entry.password()).resolves.toBe('mypass')
    await expect(entry.note()).resolves.toBe('mynote')

    expect(saver.readEntryPassword).not.toHaveBeenCalled()
    expect(saver.readEntryNote).not.toHaveBeenCalled()
  })

  it('returns undefined for empty fresh secrets without remote reads', async () => {
    const entry = Entry.create(root, {title: 'New', urls: [], username: ''}, '', '', undefined)

    await expect(entry.password()).resolves.toBeUndefined()
    await expect(entry.note()).resolves.toBeUndefined()

    expect(saver.readEntryPassword).not.toHaveBeenCalled()
    expect(saver.readEntryNote).not.toHaveBeenCalled()
  })

  it('removes a failed create from the parent collection while keeping seeded secrets', async () => {
    ;(saver.saveEntryMeta as Mock).mockRejectedValueOnce(new Error('create fail'))

    const entry = Entry.create(root, {title: 'New', urls: [], username: ''}, 'mypass', 'mynote', undefined)
    await entry.flushPendingPersistence()

    expect(root.entriesList()).toHaveLength(0)
    await expect(entry.password()).resolves.toBe('mypass')
    await expect(entry.note()).resolves.toBe('mynote')
    expect(saver.saveEntryPassword).not.toHaveBeenCalled()
    expect(saver.saveEntryNote).not.toHaveBeenCalled()
  })

  it('blocks load() while persistNew is in-flight', async () => {
    let resolveMetaSave!: () => void
    ;(saver.saveEntryMeta as Mock).mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveMetaSave = () => resolve(true)
        }),
    )
    ;(saver.read as Mock).mockResolvedValue(
      JSON.stringify({
        version: 2,
        folders: [],
        entries: [{id: 'remote-1', title: 'Remote', username: '', urls: [], otps: [], folderPath: null}],
        createdTs: Date.now(),
        updatedTs: Date.now(),
      }),
    )

    const entry = Entry.create(root, {title: 'Creating', urls: [], username: ''}, 'pw', '', undefined)
    root.entries.set([entry])

    // load() should be blocked
    await root.load()
    expect(root.allEntries.some((e) => e.id === 'remote-1')).toBe(false)

    // Complete persistNew
    resolveMetaSave()
    await entry.flushPendingPersistence()

    // Now load() should work
    await root.load()
    expect(root.allEntries.some((e) => e.id === 'remote-1')).toBe(true)
  })

  it('falls back to a non-crypto OTP id when sha256 crypto is unavailable', async () => {
    vi.mocked(sha256).mockRejectedValueOnce(new Error('No crypto implementation available'))

    const entry = Entry.create(
      root,
      {title: 'OTP Entry', urls: [], username: ''},
      '',
      '',
      {
        id: '',
        label: 'Primary',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: 'JBSWY3DPEHPK3PXP',
        encoding: 'base32',
        type: 'TOTP',
      },
    )
    await entry.flushPendingPersistence()

    const createdOtp = entry.otps()[0]
    expect(createdOtp).toBeDefined()
    expect(createdOtp?.id).toMatch(/^otp:/)
    expect(saver.saveEntryMeta).toHaveBeenCalledOnce()
    expect(saver.saveOTP).toHaveBeenCalledWith(createdOtp?.id, 'JBSWY3DPEHPK3PXP')
  })
})

describe('OTP.loadCode()', () => {
  let root: ManagerRoot
  let saver: ManagerSaver

  beforeEach(() => {
    vi.clearAllMocks()
    saver = createMockSaver({
      getOTP: vi.fn(async ({ts}: {ts: number}) => `code:${ts}`),
    })
    root = new ManagerRoot(saver)
  })

  it('reuses cached TOTP code inside the same time slot', async () => {
    const entry = new Entry(root, makeEntryData())
    const otp = new OTP(entry, {
      id: 'otp-1',
      label: 'Primary',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      encoding: 'base32',
      type: 'TOTP',
    })

    await expect(otp.loadCode(1_771_000_001)).resolves.toBe('code:1770999990')
    await expect(otp.loadCode(1_771_000_019)).resolves.toBe('code:1770999990')

    expect(saver.getOTP).toHaveBeenCalledTimes(1)
    expect(saver.getOTP).toHaveBeenCalledWith(
      expect.objectContaining({
        ts: 1_770_999_990,
        period: 30,
        entryId: 'entry-1',
      }),
    )
  })

  it('requests a new TOTP code after the slot boundary', async () => {
    const entry = new Entry(root, makeEntryData())
    const otp = new OTP(entry, {
      id: 'otp-1',
      label: 'Primary',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      encoding: 'base32',
      type: 'TOTP',
    })

    await expect(otp.loadCode(1_771_000_019)).resolves.toBe('code:1770999990')
    await expect(otp.loadCode(1_771_000_031)).resolves.toBe('code:1771000020')

    expect(saver.getOTP).toHaveBeenCalledTimes(2)
    expect((saver.getOTP as Mock).mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        ts: 1_771_000_020,
      }),
    )
  })
})
