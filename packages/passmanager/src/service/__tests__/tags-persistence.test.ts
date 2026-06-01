import {describe, expect, it, vi, type Mock} from 'vitest'

vi.mock('@project/utils', () => ({sha256: vi.fn(async (s: string) => `hash:${s}`)}))

import {Entry} from '../entry'
import {ManagerRoot} from '../root'
import type {IEntry, ManagerSaver, PassManagerRootV3} from '../types'

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

function makeLoginEntry(overrides: Partial<LoginEntryData> = {}): LoginEntryData {
  return {
    id: 'login-1',
    createdTs: 1_700_000_000_000,
    updatedTs: 1_700_000_010_000,
    title: 'Example Login',
    urls: [],
    username: 'alice',
    otps: [],
    sshKeys: [],
    ...overrides,
  }
}

function makePaymentCardEntry(overrides: Partial<PaymentCardEntryData> = {}): PaymentCardEntryData {
  return {
    id: 'card-1',
    entryType: 'payment_card',
    createdTs: 1_700_000_000_000,
    updatedTs: 1_700_000_010_000,
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
      last4: '4242',
    },
    ...overrides,
  }
}

async function readSavedRoot(saver: ManagerSaver): Promise<PassManagerRootV3> {
  const save = saver.save as Mock
  const file = save.mock.calls.at(-1)?.[1] as File
  return JSON.parse(await file.text()) as PassManagerRootV3
}

describe('credential tags persistence', () => {
  it('normalizes tags on entry construction', () => {
    const root = new ManagerRoot(createMockSaver())
    const entry = new Entry(root, makeLoginEntry({tags: ['  #Work  ', 'work']}))

    expect(entry.tags).toEqual(['Work'])
  })

  it('saves and reloads login tags through the v3 root payload', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    root.entries.set([new Entry(root, makeLoginEntry({tags: ['Work', 'Rotate']}))])

    await root.apiSave()
    const payload = await readSavedRoot(saver)
    expect(payload.entries[0]).toMatchObject({id: 'login-1', tags: ['Work', 'Rotate']})

    const reloadedSaver = createMockSaver({
      read: vi.fn(async () => JSON.stringify(payload)) as unknown as ManagerSaver['read'],
    })
    const reloadedRoot = new ManagerRoot(reloadedSaver)
    await reloadedRoot.load()

    expect(reloadedRoot.getEntry('login-1')?.tags).toEqual(['Work', 'Rotate'])
  })

  it('saves and reloads payment-card tags through the v3 root payload', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    root.entries.set([new Entry(root, makePaymentCardEntry({tags: ['Finance']}))])

    await root.apiSave()
    const payload = await readSavedRoot(saver)
    expect(payload.entries[0]).toMatchObject({id: 'card-1', tags: ['Finance']})

    const reloadedSaver = createMockSaver({
      read: vi.fn(async () => JSON.stringify(payload)) as unknown as ManagerSaver['read'],
    })
    const reloadedRoot = new ManagerRoot(reloadedSaver)
    await reloadedRoot.load()

    expect(reloadedRoot.getEntry('card-1')?.tags).toEqual(['Finance'])
  })

  it('loads missing or malformed tags as empty arrays', async () => {
    const payload = {
      version: 3,
      createdTs: 1,
      updatedTs: 1,
      folders: [],
      entries: [
        {
          id: 'login-1',
          entryType: 'login',
          title: 'Example Login',
          username: 'alice',
          urls: [],
          otps: [],
          folderPath: null,
          tags: 'Work',
        },
        {
          id: 'card-1',
          entryType: 'payment_card',
          title: 'Team Card',
          paymentCard: makePaymentCardEntry().paymentCard,
          folderPath: null,
        },
      ],
    } as unknown as PassManagerRootV3
    const root = new ManagerRoot(
      createMockSaver({
        read: vi.fn(async () => JSON.stringify(payload)) as unknown as ManagerSaver['read'],
      }),
    )

    await root.load()

    expect(root.getEntry('login-1')?.tags).toEqual([])
    expect(root.getEntry('card-1')?.tags).toEqual([])
  })

  it('clears tags explicitly through updateTags()', async () => {
    const saver = createMockSaver()
    const root = new ManagerRoot(saver)
    const entry = new Entry(root, makeLoginEntry({tags: ['Work']}))

    await entry.updateTags([])

    expect(entry.tags).toEqual([])
    expect(saver.saveEntryMeta).toHaveBeenCalledWith(expect.objectContaining({tags: []}))
  })

  it('exports tags in full backup entries', async () => {
    const root = new ManagerRoot(createMockSaver())
    const entry = new Entry(root, makeLoginEntry({tags: ['Work']}))

    await expect(entry.export()).resolves.toMatchObject({tags: ['Work']})
  })
})
