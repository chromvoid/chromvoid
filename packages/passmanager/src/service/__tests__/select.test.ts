import {beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('@project/utils', () => ({sha256: vi.fn(async (s: string) => `hash:${s}`)}))

import {Entry} from '../entry'
import {ManagerRoot} from '../root'
import {
  createEntryFilterMatcher,
  createGroupFilterMatcher,
  getEffectiveSelectedCredentialTagFilters,
  quickFilters,
  selectedCredentialTagFilters,
} from '../select'
import type {IEntry, ManagerSaver} from '../types'

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
    id: 'card-1',
    entryType: 'payment_card',
    createdTs: Date.now(),
    updatedTs: Date.now(),
    title: 'Corporate Visa',
    urls: [],
    username: '',
    otps: [],
    sshKeys: [],
    paymentCard: {
      cardholderName: 'Test User',
      expMonth: 12,
      expYear: 2030,
      brand: 'visa',
      last4: '4242',
    },
    ...overrides,
  }
}

describe('createEntryFilterMatcher()', () => {
  beforeEach(() => {
    quickFilters.set([])
    selectedCredentialTagFilters.set([])
  })

  it('matches entries by title', () => {
    const root = new ManagerRoot(createMockSaver())
    const entry = new Entry(root, makeEntryData({title: 'GitHub Admin'}))
    const matches = createEntryFilterMatcher('github')

    expect(matches(entry)).toBe(true)
  })

  it('matches entries by username', () => {
    const root = new ManagerRoot(createMockSaver())
    const entry = new Entry(root, makeEntryData({username: 'security@example.com'}))
    const matches = createEntryFilterMatcher('security@example')

    expect(matches(entry)).toBe(true)
  })

  it('matches entries by URL value', () => {
    const root = new ManagerRoot(createMockSaver())
    const entry = new Entry(
      root,
      makeEntryData({urls: [{match: 'host', value: 'admin.service.example.com'}]}),
    )
    const matches = createEntryFilterMatcher('service.example')

    expect(matches(entry)).toBe(true)
  })

  it('matches entries by tag label', () => {
    const root = new ManagerRoot(createMockSaver())
    const entry = new Entry(root, makeEntryData({tags: ['Client A']}))
    const matches = createEntryFilterMatcher('client')

    expect(matches(entry)).toBe(true)
  })

  it('keeps entries with empty title and username visible without a search query', () => {
    const root = new ManagerRoot(createMockSaver())
    const entry = new Entry(root, makeEntryData({title: '', username: ''}))
    const matches = createEntryFilterMatcher('')

    expect(matches(entry)).toBe(true)
  })

  it('invalidates cached URL search text after an entry URL update', async () => {
    const root = new ManagerRoot(createMockSaver())
    const entry = new Entry(
      root,
      makeEntryData({
        urls: [{match: 'host', value: 'old.example.com'}],
      }),
    )
    const matchesOldUrl = createEntryFilterMatcher('old.example')
    const matchesNewUrl = createEntryFilterMatcher('new.example')

    expect(matchesOldUrl(entry)).toBe(true)
    expect(matchesNewUrl(entry)).toBe(false)

    await entry.update(
      makeEntryData({
        urls: [{match: 'host', value: 'new.example.com'}],
      }),
      undefined,
      undefined,
    )

    expect(matchesOldUrl(entry)).toBe(false)
    expect(matchesNewUrl(entry)).toBe(true)
  })

  it('matches otp filter only for non-card entries with otp metadata', () => {
    const root = new ManagerRoot(createMockSaver())
    const otpEntry = new Entry(
      root,
      makeEntryData({
        id: 'otp-entry',
        otps: [
          {
            id: 'otp-1',
            label: 'Main',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            encoding: 'base32',
          },
        ],
      }),
    )
    const plainEntry = new Entry(root, makeEntryData({id: 'plain-entry'}))
    const cardEntry = new Entry(
      root,
      makePaymentCardEntryData({
        id: 'card-with-otp-metadata',
        otps: [
          {
            id: 'otp-2',
            label: 'Ignored',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            encoding: 'base32',
          },
        ],
      }),
    )
    const matches = createEntryFilterMatcher('', ['otp'])

    expect(matches(otpEntry)).toBe(true)
    expect(matches(plainEntry)).toBe(false)
    expect(matches(cardEntry)).toBe(false)
  })

  it('matches ssh filter only for entries with ssh keys', () => {
    const root = new ManagerRoot(createMockSaver())
    const sshEntry = new Entry(root, makeEntryData({id: 'ssh-entry', sshKeys: [{id: 'key-1', type: 'ed25519', fingerprint: 'fp'}]}))
    const plainEntry = new Entry(root, makeEntryData({id: 'plain-entry'}))
    const cardEntry = new Entry(
      root,
      makePaymentCardEntryData({
        id: 'card-with-ssh-metadata',
        sshKeys: [{id: 'key-2', type: 'ed25519', fingerprint: 'fp'}],
      }),
    )
    const matches = createEntryFilterMatcher('', ['ssh'])

    expect(matches(sshEntry)).toBe(true)
    expect(matches(plainEntry)).toBe(false)
    expect(matches(cardEntry)).toBe(false)
  })

  it('matches card filter only for payment card entries', () => {
    const root = new ManagerRoot(createMockSaver())
    const cardEntry = new Entry(root, makePaymentCardEntryData())
    const loginEntry = new Entry(root, makeEntryData())
    const matches = createEntryFilterMatcher('', ['card'])

    expect(matches(cardEntry)).toBe(true)
    expect(matches(loginEntry)).toBe(false)
  })

  it('matches selected tag filters by normalized key', () => {
    const root = new ManagerRoot(createMockSaver())
    const taggedEntry = new Entry(root, makeEntryData({id: 'work-entry', tags: ['Work']}))
    const plainEntry = new Entry(root, makeEntryData({id: 'plain-entry'}))
    const matches = createEntryFilterMatcher('', [], Date.now(), ['work'])

    expect(matches(taggedEntry)).toBe(true)
    expect(matches(plainEntry)).toBe(false)
  })

  it('requires every selected tag filter to match', () => {
    const root = new ManagerRoot(createMockSaver())
    const oneTag = new Entry(root, makeEntryData({id: 'one-tag', tags: ['Work']}))
    const twoTags = new Entry(root, makeEntryData({id: 'two-tags', tags: ['Work', 'Rotate']}))
    const matches = createEntryFilterMatcher('', [], Date.now(), ['work', 'rotate'])

    expect(matches(oneTag)).toBe(false)
    expect(matches(twoTags)).toBe(true)
  })

  it('composes tag filters with quick filters', () => {
    const now = Date.now()
    const root = new ManagerRoot(createMockSaver())
    const taggedCard = new Entry(
      root,
      makePaymentCardEntryData({id: 'tagged-card', updatedTs: now, tags: ['Finance']}),
    )
    const untaggedCard = new Entry(root, makePaymentCardEntryData({id: 'untagged-card', updatedTs: now}))
    const taggedLogin = new Entry(root, makeEntryData({id: 'tagged-login', updatedTs: now, tags: ['Finance']}))
    const matches = createEntryFilterMatcher('', ['recent', 'card'], now, ['finance'])

    expect(matches(taggedCard)).toBe(true)
    expect(matches(untaggedCard)).toBe(false)
    expect(matches(taggedLogin)).toBe(false)
  })

  it('invalidates cached tag search text after an entry tag update', async () => {
    const root = new ManagerRoot(createMockSaver())
    const entry = new Entry(root, makeEntryData({tags: ['Old']}))
    const matchesOldTag = createEntryFilterMatcher('old')
    const matchesNewTag = createEntryFilterMatcher('new')

    expect(matchesOldTag(entry)).toBe(true)
    expect(matchesNewTag(entry)).toBe(false)

    await entry.updateTags(['New'])

    expect(matchesOldTag(entry)).toBe(false)
    expect(matchesNewTag(entry)).toBe(true)
  })

  it('ignores stale selected tag keys in root search', () => {
    const root = new ManagerRoot(createMockSaver())
    root.entries.set([new Entry(root, makeEntryData({id: 'entry-1'}))])
    selectedCredentialTagFilters.set(['missing'])

    expect(root.searched().map((entry) => entry.id)).toEqual(['entry-1'])
  })

  it('prunes selected tag filters when a compatibility root has no tag inventory', () => {
    selectedCredentialTagFilters.set(['work'])

    expect(getEffectiveSelectedCredentialTagFilters(undefined)).toEqual([])
  })

  it('ignores stale selected tag keys after the last matching tag is removed', async () => {
    const root = new ManagerRoot(createMockSaver())
    const entry = new Entry(root, makeEntryData({id: 'entry-1', tags: ['Work']}))
    root.entries.set([entry])
    selectedCredentialTagFilters.set(['work'])

    expect(root.searched().map((item) => item.id)).toEqual(['entry-1'])

    await entry.updateTags([])

    expect(root.searched().map((item) => item.id)).toEqual(['entry-1'])
  })

  it('keeps unsupported compatibility filters inert', () => {
    const root = new ManagerRoot(createMockSaver())
    const entry = new Entry(root, makeEntryData())

    expect(createEntryFilterMatcher('', ['files'])(entry)).toBe(true)
    expect(createEntryFilterMatcher('', ['favorites'])(entry)).toBe(true)
    expect(createEntryFilterMatcher('', ['nopass'])(entry)).toBe(true)
  })
})

describe('createGroupFilterMatcher()', () => {
  it('matches groups by name', () => {
    const matches = createGroupFilterMatcher('work')

    expect(matches({name: 'Work Accounts'})).toBe(true)
    expect(matches({name: 'Personal'})).toBe(false)
  })

  it('matches groups by description', () => {
    const matches = createGroupFilterMatcher('billing')

    expect(matches({name: 'Finance', description: 'Cards and billing portals'})).toBe(true)
    expect(matches({name: 'Finance', description: 'Payroll'})).toBe(false)
  })
})
