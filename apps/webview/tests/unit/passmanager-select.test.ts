import {
  Entry,
  Group,
  ManagerRoot,
  createEntryFilterMatcher,
  filterValue,
  quickFilters,
  selectedCredentialTagFilters,
} from '@project/passmanager'

import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMGroupModel} from '../../src/features/passmanager/components/group/group'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {pmRootSearchProjectionModel} from '../../src/features/passmanager/models/pm-root-search-projection'

function createEntry(input: {
  id: string
  title?: string
  username?: string
  updatedTs?: number
  otpCount?: number
  website?: string
  tags?: string[]
}) {
  return new Entry({} as any, {
    id: input.id,
    title: input.title,
    username: input.username,
    createdTs: Date.now(),
    updatedTs: input.updatedTs ?? Date.now(),
    otps: Array.from({length: input.otpCount ?? 0}, (_, index) => ({
      id: `${input.id}-otp-${index}`,
      label: `otp-${index}`,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      encoding: 'base32',
      type: 'TOTP',
    })),
    sshKeys: [],
    urls: input.website ? [{value: input.website, match: 'host'}] : [],
    tags: input.tags,
  } as any)
}

function createCardEntry(input: {id: string; title?: string}) {
  return new Entry({} as any, {
    id: input.id,
    entryType: 'payment_card',
    title: input.title ?? 'Corporate Visa',
    username: '',
    urls: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: [],
    sshKeys: [],
    paymentCard: {
      cardholderName: 'Test User',
      expMonth: 12,
      expYear: 2030,
      brand: 'visa',
      last4: '4242',
    },
  } as any)
}

function createGroup(input: {id: string; name: string; description?: string; entries?: Entry[]}) {
  return new Group({
    id: input.id,
    name: input.name,
    description: input.description,
    entries: input.entries ?? [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createManagerSaver() {
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
  } as any
}

describe('createEntryFilterMatcher', () => {
  afterEach(() => {
    filterValue.set('')
    quickFilters.set([])
    selectedCredentialTagFilters.set([])
    setPassmanagerRoot(undefined)
  })

  it('matches title and username without rebuilding quick filters per entry', () => {
    const entry = createEntry({id: 'entry-1', title: 'Bank', username: 'alice@example.com'})
    const matches = createEntryFilterMatcher('alice', [])

    expect(matches(entry)).toBe(true)
    expect(createEntryFilterMatcher('bank', [])(entry)).toBe(true)
    expect(createEntryFilterMatcher('missing', [])(entry)).toBe(false)
  })

  it('matches URL values and card quick filters from app-level consumers', () => {
    const urlEntry = createEntry({
      id: 'entry-url',
      title: 'Admin',
      username: 'root',
      website: 'console.service.example.com',
    })
    const loginEntry = createEntry({id: 'entry-login', title: 'Login'})
    const cardEntry = createCardEntry({id: 'entry-card'})

    expect(createEntryFilterMatcher('service.example', [])(urlEntry)).toBe(true)
    expect(createEntryFilterMatcher('', ['card'])(cardEntry)).toBe(true)
    expect(createEntryFilterMatcher('', ['card'])(loginEntry)).toBe(false)
  })

  it('applies quick filters before empty-search matches', () => {
    const now = Date.now()
    const stale = createEntry({id: 'entry-stale', title: 'Old login', updatedTs: now - 20 * 24 * 60 * 60 * 1000})
    const otp = createEntry({id: 'entry-otp', title: 'OTP login', otpCount: 1, updatedTs: now})
    const plain = createEntry({id: 'entry-plain', title: 'Plain login', updatedTs: now})

    const recentMatches = createEntryFilterMatcher('', ['recent'], now)
    const otpMatches = createEntryFilterMatcher('', ['otp'], now)

    expect(recentMatches(stale)).toBe(false)
    expect(recentMatches(plain)).toBe(true)
    expect(otpMatches(plain)).toBe(false)
    expect(otpMatches(otp)).toBe(true)
  })

  it('updates root projection counts from selected tag filters', () => {
    const root = new ManagerRoot({} as any)
    const tagged = createEntry({id: 'entry-work', title: 'Work account', tags: ['Work']})
    const plain = createEntry({id: 'entry-plain', title: 'Plain account'})
    const group = createGroup({id: 'group-work', name: 'Work', entries: [tagged, plain]})
    root.entries.set([group])
    setPassmanagerRoot(root)
    selectedCredentialTagFilters.set(['work'])

    const snapshot = pmRootSearchProjectionModel.getSnapshot()

    expect(snapshot.groupMatchCounts.get(group.id)).toBe(1)
    expect(snapshot.resultCount).toBe(1)
  })

  it('covers the credential tag lifecycle across creation, AND filters, clearing, and stale filter pruning', async () => {
    const root = new ManagerRoot(createManagerSaver())
    root.entries.set([])
    setPassmanagerRoot(root)

    const login = root.createEntry(
      {
        title: 'Work Login',
        username: 'alice',
        urls: [],
        tags: ['Work'],
      },
      '',
      '',
      undefined,
    )
    const card = root.createEntry(
      {
        entryType: 'payment_card',
        title: 'Work Card',
        username: '',
        urls: [],
        tags: ['Work'],
        paymentCard: {
          cardholderName: 'Alice Doe',
          expMonth: 12,
          expYear: 2030,
          brand: 'visa',
          last4: '1111',
        },
      },
      '',
      '',
      undefined,
    )
    await Promise.all([login.flushPendingPersistence(), card.flushPendingPersistence()])

    const searchedEntryIds = () =>
      root
        .searched()
        .filter((item): item is Entry => item instanceof Entry)
        .map((entry) => entry.id)
        .sort()

    selectedCredentialTagFilters.set(['work'])
    expect(searchedEntryIds()).toEqual([card.id, login.id].sort())

    await login.updateTags(['Work', 'Rotate'])
    selectedCredentialTagFilters.set(['work', 'rotate'])
    expect(searchedEntryIds()).toEqual([login.id])

    selectedCredentialTagFilters.set([])
    expect(searchedEntryIds()).toEqual([card.id, login.id].sort())

    await login.updateTags(['Temporary'])
    selectedCredentialTagFilters.set(['temporary'])
    expect(searchedEntryIds()).toEqual([login.id])

    await login.updateTags([])
    expect(searchedEntryIds()).toEqual([card.id, login.id].sort())
  })

  it('updates root projection rows when selected tag filters are cleared', () => {
    const root = new ManagerRoot({} as any)
    const tagged = createEntry({id: 'entry-work', title: 'Work account', tags: ['Work']})
    const plain = createEntry({id: 'entry-plain', title: 'Plain account'})
    const group = createGroup({id: 'group-work', name: 'Work', entries: [tagged]})
    root.entries.set([group, plain])
    setPassmanagerRoot(root)

    selectedCredentialTagFilters.set(['work'])
    expect(pmRootSearchProjectionModel.getSnapshot().rows.map((row) => row.id)).toEqual(['group-work'])

    selectedCredentialTagFilters.set([])
    expect(pmRootSearchProjectionModel.getSnapshot().rows.map((row) => row.id)).toEqual([
      'group-work',
      'entry-plain',
    ])
  })

  it('filters child groups by selected tags and restores them after tag filters are cleared', () => {
    const model = new PMGroupModel()
    const root = new ManagerRoot({} as any)
    const parent = createGroup({id: 'group-ops', name: 'Ops'})
    const workChild = createGroup({
      id: 'group-ops-work',
      name: 'Ops/Work',
      entries: [createEntry({id: 'entry-work', title: 'Work account', tags: ['Work']})],
    })
    const personalChild = createGroup({
      id: 'group-ops-personal',
      name: 'Ops/Personal',
      entries: [createEntry({id: 'entry-personal', title: 'Personal account', tags: ['Personal']})],
    })
    root.entries.set([parent, workChild, personalChild])
    setPassmanagerRoot(root)

    selectedCredentialTagFilters.set(['work'])
    expect(
      model
        .getVisibleRows(parent)
        .filter((row) => row.kind === 'group')
        .map((row) => row.item.name),
    ).toEqual(['Ops/Work'])

    selectedCredentialTagFilters.set([])
    expect(
      model
        .getVisibleRows(parent)
        .filter((row) => row.kind === 'group')
        .map((row) => row.item.name),
    ).toEqual(['Ops/Personal', 'Ops/Work'])
  })

  it('includes top-level groups when name or description matches the root search query', () => {
    const root = new ManagerRoot({} as any)
    const billing = createGroup({
      id: 'group-billing',
      name: 'Finance',
      description: 'Billing portals and card processors',
    })
    root.entries.set([billing])
    setPassmanagerRoot(root)
    filterValue.set('billing')

    const snapshot = pmRootSearchProjectionModel.getSnapshot()

    expect(
      snapshot.rows.map((row) => (row.kind === 'group' ? `group:${row.item.name}` : row.kind)),
    ).toEqual(['group:Finance'])
    expect(snapshot.groupMatchCounts.get(billing.id)).toBe(0)
    expect(snapshot.resultCount).toBe(1)
  })

  it('keeps child groups visible when their display name or description matches the query', () => {
    const model = new PMGroupModel()
    const root = new ManagerRoot({} as any)
    const parent = createGroup({id: 'group-parent', name: 'Operations'})
    const child = createGroup({
      id: 'group-child',
      name: 'Operations/On-call',
      description: 'Escalation credentials',
    })
    root.entries.set([parent, child])
    setPassmanagerRoot(root)
    filterValue.set('escalation')

    const rows = model.getVisibleRows(parent)

    expect(rows.map((row) => (row.kind === 'group' ? `group:${row.item.name}` : row.kind))).toEqual([
      'group:Operations/On-call',
    ])
  })
})
