import {afterEach, describe, expect, it, vi} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import {
  CREDENTIAL_SECURITY_AUDIT_ALGORITHM_VERSION,
  CREDENTIAL_SECURITY_AUDIT_ARTIFACT_VERSION,
  type CredentialSecurityAuditArtifactV1,
} from '@project/passmanager/security-audit'
import type {ManagerSaver} from '@project/passmanager/types'

import {PMCredentialSecurityAuditModel} from '../../src/features/passmanager/models/pm-credential-security-audit.model'

type PasswordValue = string | undefined | Promise<string | undefined>

function createMockSaver(
  passwords: Map<string, PasswordValue> = new Map(),
  overrides: Partial<ManagerSaver> = {},
): ManagerSaver {
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
    readEntryPassword: vi.fn(async (entryId: string) => {
      const value = passwords.get(entryId)
      return await value
    }),
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
    saveCredentialSecurityAudit: vi.fn(async () => true),
    ...overrides,
  }
}

function createGroup(id: string, name: string): Group {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  })
}

function createLoginEntry(
  parent: Group | ManagerRoot,
  id: string,
  input: {title?: string; otps?: unknown[]} = {},
): Entry {
  return new Entry(parent, {
    id,
    title: input.title ?? id,
    username: '',
    urls: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: input.otps ?? [],
    sshKeys: [],
  })
}

function createCardEntry(parent: Group | ManagerRoot, id: string): Entry {
  return new Entry(parent, {
    id,
    entryType: 'payment_card',
    title: id,
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
    },
  })
}

async function flushAudit(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function deferredPassword(): {
  promise: Promise<string | undefined>
  resolve(value: string | undefined): void
} {
  let resolveValue: (value: string | undefined) => void = () => {}
  const promise = new Promise<string | undefined>((resolve) => {
    resolveValue = resolve
  })
  return {promise, resolve: resolveValue}
}

describe('PMCredentialSecurityAuditModel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('audits loaded entries without exposing password strings in model state', async () => {
    const passwords = new Map<string, PasswordValue>([
      ['weak', 'abc'],
      ['reused-a', 'same-password'],
      ['reused-b', 'same-password'],
      ['strong', 'CorrectHorseBatteryStaple!2026'],
    ])
    const root = new ManagerRoot(createMockSaver(passwords))
    const group = createGroup('group-crypto', 'Crypto')
    const weak = createLoginEntry(group, 'weak')
    const reusedA = createLoginEntry(group, 'reused-a', {otps: [{id: 'otp-1', label: 'Main'}]})
    const reusedB = createLoginEntry(group, 'reused-b')
    const strong = createLoginEntry(group, 'strong')
    const card = createCardEntry(group, 'card')
    group.entries.set([weak, reusedA, reusedB, strong, card])

    const model = new PMCredentialSecurityAuditModel()
    model.attachRoot(root)
    root.entries.set([group])
    await flushAudit()

    expect(model.status()).toBe('ready')
    expect(model.getEntryState(weak)).toMatchObject({weakPassword: true, reusedPassword: false})
    expect(model.getEntryState(reusedA)).toMatchObject({reusedPassword: true, hasTwoFactor: true})

    expect(model.summarizeGroup(group)).toMatchObject({
      entryCount: 5,
      reusedPasswordCount: 2,
      weakPasswordCount: 1,
      twoFactorCount: 1,
      riskSeverity: 'critical',
      dominantRisk: 'weak_passwords',
    })

    expect(JSON.stringify(Array.from(model.entries().entries()))).not.toContain('same-password')
  })

  it('uses a matching loaded artifact without reading entry passwords', async () => {
    const now = Date.now()
    const rootPayload = {
      version: 3 as const,
      createdTs: now,
      updatedTs: now,
      folders: ['Work'],
      entries: [
        {
          id: 'cached-entry-a',
          entryType: 'login' as const,
          createdTs: now,
          updatedTs: now,
          title: 'Cached entry A',
          username: 'cached',
          urls: [],
          otps: [],
          folderPath: 'Work',
        },
        {
          id: 'cached-entry-b',
          entryType: 'login' as const,
          createdTs: now,
          updatedTs: now,
          title: 'Cached entry B',
          username: 'cached',
          urls: [],
          otps: [],
          folderPath: 'Work',
        },
      ],
    }

    let savedArtifact: CredentialSecurityAuditArtifactV1 | undefined
    const initialSaver = createMockSaver(
      new Map([
        ['cached-entry-a', 'abc'],
        ['cached-entry-b', 'abc'],
      ]),
      {
      read: vi.fn(async () => rootPayload),
      saveCredentialSecurityAudit: vi.fn(async (artifact) => {
        savedArtifact = artifact
        return true
      }),
      },
    )
    const initialRoot = new ManagerRoot(initialSaver)
    const initialModel = new PMCredentialSecurityAuditModel()
    initialModel.attachRoot(initialRoot)
    await initialRoot.load()
    await flushAudit()

    expect(savedArtifact).toBeDefined()
    initialModel.dispose()

    const cachedSaver = createMockSaver(
      new Map([
        ['cached-entry-a', 'must-not-be-read'],
        ['cached-entry-b', 'must-not-be-read'],
      ]),
      {
        read: vi.fn(async () => ({
          ...rootPayload,
          updatedTs: now + 1_000,
          credentialSecurityAudit: savedArtifact,
        })),
      },
    )
    const cachedRoot = new ManagerRoot(cachedSaver)
    const cachedModel = new PMCredentialSecurityAuditModel()
    cachedModel.attachRoot(cachedRoot)
    await cachedRoot.load()

    expect(cachedModel.status()).toBe('ready')
    expect(cachedModel.getEntryState(cachedRoot.allEntries[0]!)).toMatchObject({
      weakPassword: true,
      reusedPassword: true,
    })
    const cachedGroup = cachedRoot.entriesList().find((item): item is Group => item instanceof Group)
    expect(cachedGroup).toBeDefined()
    expect(cachedModel.summarizeGroup(cachedGroup!)).toMatchObject({
      reusedPasswordCount: 2,
      weakPasswordCount: 2,
    })
    expect(cachedSaver.readEntryPassword).not.toHaveBeenCalled()
  })

  it('ignores a stale loaded artifact, scans secrets, and saves a replacement', async () => {
    const now = Date.now()
    const staleArtifact: CredentialSecurityAuditArtifactV1 = {
      version: CREDENTIAL_SECURITY_AUDIT_ARTIFACT_VERSION,
      algorithmVersion: CREDENTIAL_SECURITY_AUDIT_ALGORITHM_VERSION,
      revision: 'stale-revision',
      generatedAt: now,
      entries: {
        entry: {
          entryId: 'entry',
          weakPassword: false,
          reusedPassword: false,
          hasTwoFactor: false,
          strengthScore: 4,
        },
      },
      failedEntryIds: [],
    }
    const saver = createMockSaver(new Map([['entry', 'abc']]), {
      read: vi.fn(async () => ({
        version: 3,
        createdTs: now,
        updatedTs: now,
        folders: [],
        entries: [
          {
            id: 'entry',
            entryType: 'login',
            createdTs: now,
            updatedTs: now,
            title: 'Entry',
            username: '',
            urls: [],
            otps: [],
            folderPath: null,
          },
        ],
        credentialSecurityAudit: staleArtifact,
      })),
    })
    const root = new ManagerRoot(saver)
    const model = new PMCredentialSecurityAuditModel()
    model.attachRoot(root)
    await root.load()
    await flushAudit()

    expect(model.status()).toBe('ready')
    expect(model.getEntryState(root.allEntries[0]!)).toMatchObject({weakPassword: true})
    expect(saver.readEntryPassword).toHaveBeenCalledWith('entry')
    expect(saver.saveCredentialSecurityAudit).toHaveBeenCalledWith(
      expect.objectContaining({revision: model.revision()}),
    )
  })

  it('keeps audit state ready when artifact persistence fails', async () => {
    const saver = createMockSaver(new Map([['entry', 'abc']]), {
      saveCredentialSecurityAudit: vi.fn(async () => {
        throw new Error('write failed')
      }),
    })
    const root = new ManagerRoot(saver)
    const entry = createLoginEntry(root, 'entry')
    const model = new PMCredentialSecurityAuditModel()
    model.attachRoot(root)
    root.entries.set([entry])
    await flushAudit()

    expect(model.status()).toBe('ready')
    expect(model.getEntryState(entry)).toMatchObject({weakPassword: true})
  })

  it('summarizes root entries separately from grouped entries', async () => {
    const rootEntry = createLoginEntry({} as ManagerRoot, 'root-entry')
    const passwords = new Map<string, PasswordValue>([
      ['root-entry', 'abc'],
      ['group-entry', 'abc'],
    ])
    const root = new ManagerRoot(createMockSaver(passwords))
    rootEntry.parent = root
    const group = createGroup('group-work', 'Work')
    const groupEntry = createLoginEntry(group, 'group-entry')
    group.entries.set([groupEntry])

    const model = new PMCredentialSecurityAuditModel()
    model.attachRoot(root)
    root.entries.set([rootEntry, group])
    await flushAudit()

    expect(model.summarizeGroup(root)).toMatchObject({
      entryCount: 1,
      weakPasswordCount: 1,
    })
    expect(model.summarizeGroup(group)).toMatchObject({
      entryCount: 1,
      weakPasswordCount: 1,
    })
  })

  it('keeps available counts and marks degraded when a password read fails', async () => {
    const root = new ManagerRoot(createMockSaver(new Map([['available', 'abc']])))
    vi.mocked(root.managerSaver.readEntryPassword).mockImplementation(async (entryId: string) => {
      if (entryId === 'failed') throw new Error('read failed')
      return 'abc'
    })
    const group = createGroup('group-risk', 'Risk')
    const available = createLoginEntry(group, 'available')
    const failed = createLoginEntry(group, 'failed')
    group.entries.set([available, failed])

    const model = new PMCredentialSecurityAuditModel()
    model.attachRoot(root)
    root.entries.set([group])
    await flushAudit()

    expect(model.status()).toBe('degraded')
    expect(model.failedEntryIds().has('failed')).toBe(true)
    expect(model.summarizeGroup(group)).toMatchObject({
      entryCount: 2,
      failedEntryCount: 1,
      weakPasswordCount: 1,
    })
  })

  it('ignores stale scan results after root entries change', async () => {
    const slow = deferredPassword()
    const passwords = new Map<string, PasswordValue>([
      ['slow', slow.promise],
      ['fresh', 'abc'],
    ])
    const root = new ManagerRoot(createMockSaver(passwords))
    const slowEntry = createLoginEntry(root, 'slow')
    const freshEntry = createLoginEntry(root, 'fresh')

    const model = new PMCredentialSecurityAuditModel()
    model.attachRoot(root)
    root.entries.set([slowEntry])
    await Promise.resolve()

    root.entries.set([freshEntry])
    await flushAudit()
    slow.resolve('same-password')
    await flushAudit()

    expect(model.getEntryState(slowEntry)).toBeUndefined()
    expect(model.getEntryState(freshEntry)).toMatchObject({weakPassword: true})
  })

  it('ignores stale scan results after root replacement', async () => {
    const slow = deferredPassword()
    const oldRoot = new ManagerRoot(createMockSaver(new Map([['old', slow.promise]])))
    const oldEntry = createLoginEntry(oldRoot, 'old')
    const freshRoot = new ManagerRoot(createMockSaver(new Map([['fresh', 'abc']])))
    const freshEntry = createLoginEntry(freshRoot, 'fresh')

    const model = new PMCredentialSecurityAuditModel()
    model.attachRoot(oldRoot)
    oldRoot.entries.set([oldEntry])
    await Promise.resolve()

    model.attachRoot(freshRoot)
    freshRoot.entries.set([freshEntry])
    await flushAudit()
    slow.resolve('same-password')
    await flushAudit()

    expect(model.getEntryState(oldEntry)).toBeUndefined()
    expect(model.getEntryState(freshEntry)).toMatchObject({weakPassword: true})
  })

  it('clears state and detaches subscriptions on dispose', async () => {
    const root = new ManagerRoot(createMockSaver(new Map([['entry', 'abc']])))
    const entry = createLoginEntry(root, 'entry')
    const model = new PMCredentialSecurityAuditModel()
    model.attachRoot(root)
    model.dispose()

    root.entries.set([entry])
    await flushAudit()

    expect(model.status()).toBe('idle')
    expect(model.entries().size).toBe(0)
    expect(model.revision()).toBe('')
  })
})
