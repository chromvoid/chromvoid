import {afterEach, describe, expect, it, vi} from 'vitest'
import {atom} from '@reatom/core'

const openExternalBrowserUrl = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('../../src/shared/services/external-browser', () => ({
  openExternalBrowserUrl: (url: string) => openExternalBrowserUrl(url),
}))

import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import type {ManagerSaver} from '@project/passmanager/types'

import {PMEntryModel} from '../../src/features/passmanager/components/card/entry/entry.model'
import {PMEntrySessionModel} from '../../src/features/passmanager/components/card/entry/entry-session.model'
import {pmDeleteMotionModel} from '../../src/features/passmanager/models/pm-delete-motion.model'
import {pmEntryEditorModel} from '../../src/features/passmanager/models/pm-entry-editor.model'
import {clearPassmanagerRoot, setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

function installClipboardInvokeSpy() {
  const invoke = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {invoke},
  })
  return invoke
}

function createManagerSaver(overrides: Partial<ManagerSaver> = {}): ManagerSaver {
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

function createSessionEntryFixture(
  sshKeys: Array<{id: string; type?: string; fingerprint?: string; comment?: string}>,
  reads: Record<string, Promise<string | undefined>>,
): Entry {
  return {
    id: 'entry-session-test',
    flushPendingPersistence: vi.fn(async () => {}),
    password: vi.fn(async () => undefined),
    note: vi.fn(async () => undefined),
    sshKeys: sshKeys.map((key) => ({
      type: 'ed25519',
      fingerprint: 'SHA256:test',
      ...key,
    })),
    sshPublicKey: vi.fn((keyId: string) => reads[keyId] ?? Promise.resolve(undefined)),
  } as unknown as Entry
}

describe('PMEntrySessionModel', () => {
  it('waits for pending entry persistence before reading secrets', async () => {
    const model = new PMEntrySessionModel()
    const persistence = deferred<void>()
    let persisted = false

    const entry = {
      id: 'entry-session-persistence',
      flushPendingPersistence: vi.fn(async () => {
        await persistence.promise
        persisted = true
      }),
      password: vi.fn(async () => (persisted ? 'secret-123' : undefined)),
      note: vi.fn(async () => (persisted ? 'saved note' : undefined)),
      sshKeys: [],
      sshPublicKey: vi.fn(),
    } as unknown as Entry

    const loadPromise = model.actions.ensureSecretsLoaded(entry)

    expect(model.state.passwordResource().status).toBe('loading')
    expect(model.state.noteResource().status).toBe('loading')
    expect(entry.password).not.toHaveBeenCalled()
    expect(entry.note).not.toHaveBeenCalled()

    persistence.resolve()
    await loadPromise

    expect(entry.flushPendingPersistence).toHaveBeenCalled()
    expect(entry.password).toHaveBeenCalled()
    expect(entry.note).toHaveBeenCalled()
    expect(model.state.password()).toBe('secret-123')
    expect(model.state.note()).toBe('saved note')
  })

  it('distinguishes loading from missing secrets', async () => {
    const model = new PMEntrySessionModel()
    const persistence = deferred<void>()
    const entry = {
      id: 'entry-session-missing',
      flushPendingPersistence: vi.fn(async () => {
        await persistence.promise
      }),
      password: vi.fn(async () => undefined),
      note: vi.fn(async () => ''),
      sshKeys: [],
      sshPublicKey: vi.fn(),
    } as unknown as Entry

    const loadPromise = model.actions.ensureSecretsLoaded(entry)
    expect(model.state.passwordResource().status).toBe('loading')
    expect(model.state.noteResource().status).toBe('loading')

    persistence.resolve()
    await loadPromise

    expect(model.state.passwordResource().status).toBe('missing')
    expect(model.state.noteResource().status).toBe('missing')
    expect(model.state.password()).toBeUndefined()
    expect(model.state.note()).toBe('')
  })

  it('loads ssh public keys incrementally', async () => {
    const model = new PMEntrySessionModel()
    const first = deferred<string | undefined>()
    const second = deferred<string | undefined>()
    const entry = createSessionEntryFixture(
      [{id: 'k1'}, {id: 'k2'}],
      {
        k1: first.promise,
        k2: second.promise,
      },
    )

    model.actions.loadSshPublicKeysFor(entry)
    expect(model.state.sshPublicKeys()).toEqual({})

    first.resolve('ssh-ed25519 AAAA first@test')
    await flushMicrotasks()

    expect(model.state.sshPublicKeys()).toEqual({})

    second.resolve('ssh-ed25519 AAAA second@test')
    await flushMicrotasks()
    await flushMicrotasks()

    expect(model.state.sshPublicKeys()).toEqual({
      k1: 'ssh-ed25519 AAAA first@test',
      k2: 'ssh-ed25519 AAAA second@test',
    })
  })

  it('ignores stale ssh and secret responses from a previous entry load', async () => {
    const model = new PMEntrySessionModel()
    const staleSecret = deferred<string | undefined>()
    const staleNote = deferred<string | undefined>()
    const staleSsh = deferred<string | undefined>()
    const freshSecret = deferred<string | undefined>()
    const freshNote = deferred<string | undefined>()
    const freshSsh = deferred<string | undefined>()

    const oldEntry = {
      id: 'old-entry',
      flushPendingPersistence: vi.fn(async () => {}),
      password: vi.fn(async () => staleSecret.promise),
      note: vi.fn(async () => staleNote.promise),
      sshKeys: [{id: 'old'}],
      sshPublicKey: vi.fn(() => staleSsh.promise),
    } as unknown as Entry
    const newEntry = {
      id: 'new-entry',
      flushPendingPersistence: vi.fn(async () => {}),
      password: vi.fn(async () => freshSecret.promise),
      note: vi.fn(async () => freshNote.promise),
      sshKeys: [{id: 'new'}],
      sshPublicKey: vi.fn(() => freshSsh.promise),
    } as unknown as Entry

    const staleSecretsLoad = model.actions.ensureSecretsLoaded(oldEntry)
    model.actions.loadSshPublicKeysFor(oldEntry)

    const freshSecretsLoad = model.actions.ensureSecretsLoaded(newEntry)
    model.actions.loadSshPublicKeysFor(newEntry)

    freshSecret.resolve('fresh-secret')
    freshNote.resolve('fresh-note')
    freshSsh.resolve('ssh-ed25519 AAAA new@test')
    await freshSecretsLoad
    await flushMicrotasks()

    expect(model.state.password()).toBe('fresh-secret')
    expect(model.state.note()).toBe('fresh-note')
    expect(model.state.sshPublicKeys()).toEqual({
      new: 'ssh-ed25519 AAAA new@test',
    })

    staleSecret.resolve('stale-secret')
    staleNote.resolve('stale-note')
    staleSsh.resolve('ssh-ed25519 AAAA old@test')
    await expect(staleSecretsLoad).rejects.toMatchObject({name: 'AbortError'})
    await flushMicrotasks()

    expect(model.state.password()).toBe('fresh-secret')
    expect(model.state.note()).toBe('fresh-note')
    expect(model.state.sshPublicKeys()).toEqual({
      new: 'ssh-ed25519 AAAA new@test',
    })
  })

  it('resets error state after a failed load and retries cleanly', async () => {
    const model = new PMEntrySessionModel()

    const failingEntry = {
      id: 'failing-entry',
      flushPendingPersistence: vi.fn(async () => {}),
      password: vi.fn(async () => {
        throw new Error('password failed')
      }),
      note: vi.fn(async () => 'note-fallback'),
      sshKeys: [],
      sshPublicKey: vi.fn(),
    } as unknown as Entry

    await model.actions.ensureSecretsLoaded(failingEntry)
    expect(model.state.passwordResource().status).toBe('error')
    expect(model.state.passwordResource().error).toBe('password failed')

    const healthyEntry = {
      id: 'healthy-entry',
      flushPendingPersistence: vi.fn(async () => {}),
      password: vi.fn(async () => 'healthy-secret'),
      note: vi.fn(async () => 'healthy-note'),
      sshKeys: [],
      sshPublicKey: vi.fn(),
    } as unknown as Entry

    model.actions.detach()
    await model.actions.ensureSecretsLoaded(healthyEntry)

    expect(model.state.passwordResource().status).toBe('ready')
    expect(model.state.password()).toBe('healthy-secret')
    expect(model.state.note()).toBe('healthy-note')
  })

  it('clears exposed values and aborts in-flight loads on disconnect', async () => {
    const model = new PMEntrySessionModel()
    const password = deferred<string | undefined>()
    const note = deferred<string | undefined>()
    const sshKey = deferred<string | undefined>()

    const entry = {
      id: 'entry-disconnect',
      flushPendingPersistence: vi.fn(async () => {}),
      password: vi.fn(async () => password.promise),
      note: vi.fn(async () => note.promise),
      sshKeys: [{id: 'ssh-1'}],
      sshPublicKey: vi.fn(() => sshKey.promise),
    } as unknown as Entry

    const secretsLoad = model.actions.ensureSecretsLoaded(entry)
    model.actions.loadSshPublicKeysFor(entry)

    expect(model.state.passwordResource().status).toBe('loading')
    expect(model.state.noteResource().status).toBe('loading')

    model.actions.disconnect()

    password.resolve('stale-secret')
    note.resolve('stale-note')
    sshKey.resolve('ssh-ed25519 AAAA stale@test')

    await expect(secretsLoad).rejects.toMatchObject({name: 'AbortError'})
    await flushMicrotasks()

    expect(model.state.passwordResource().status).toBe('idle')
    expect(model.state.noteResource().status).toBe('idle')
    expect(model.state.sshPublicKeys()).toEqual({})
  })

  it('applies saved secrets without losing the current entry session', () => {
    const model = new PMEntrySessionModel()

    model.actions.applySavedSecrets({
      password: 'after-save',
      note: 'after-note',
    })

    expect(model.state.passwordResource().status).toBe('ready')
    expect(model.state.noteResource().status).toBe('ready')
    expect(model.state.password()).toBe('after-save')
    expect(model.state.note()).toBe('after-note')
  })

  it('waits for pending move persistence before reading OTP and SSH data', async () => {
    const moveGate = deferred<void>()
    let moved = false
    const saver = createManagerSaver({
      moveEntryToGroup: vi.fn(async () => {
        await moveGate.promise
        moved = true
        return true
      }),
      getOTP: vi.fn(async () => (moved ? '123456' : undefined)),
      readEntrySshPublicKey: vi.fn(async () => (moved ? 'ssh-ed25519 AAAA moved@test' : undefined)),
    })
    const root = new ManagerRoot(saver)
    const target = new Group({
      id: 'group-target',
      name: 'Target',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    } as any)
    const entry = new Entry(
      root,
      {
        id: 'entry-move-session',
        title: 'Move Session Entry',
        username: 'alice',
        urls: [],
        createdTs: Date.now(),
        updatedTs: Date.now(),
        otps: [
          {
            id: 'otp-1',
            label: 'Main',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            encoding: 'base32',
            type: 'TOTP',
          },
        ],
        sshKeys: [{id: 'k1', type: 'ed25519', fingerprint: 'SHA256:test'}],
      } as any,
    )

    root.entries.set([target, entry])

    const model = new PMEntrySessionModel()
    const movePromise = entry.move(target, {silent: true})
    const otpPromise = entry.otps()[0]?.loadCode(0)
    model.actions.loadSshPublicKeysFor(entry)

    await flushMicrotasks()

    expect(saver.getOTP).not.toHaveBeenCalled()
    expect(saver.readEntrySshPublicKey).not.toHaveBeenCalled()

    moveGate.resolve()
    await expect(movePromise).resolves.toBe(true)
    await expect(otpPromise).resolves.toBe('123456')
    await flushMicrotasks()
    await flushMicrotasks()

    expect(model.state.sshPublicKeys()).toEqual({
      k1: 'ssh-ed25519 AAAA moved@test',
    })
  })

  it('retries all-empty SSH loads instead of caching them as a stable result', async () => {
    const model = new PMEntrySessionModel()
    const entry = {
      id: 'entry-ssh-retry',
      flushPendingPersistence: vi.fn(async () => {}),
      password: vi.fn(async () => undefined),
      note: vi.fn(async () => undefined),
      sshKeys: [{id: 'k1', type: 'ed25519', fingerprint: 'SHA256:test'}],
      sshPublicKey: vi
        .fn<(_: string) => Promise<string | undefined>>()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce('ssh-ed25519 AAAA retry@test'),
    } as unknown as Entry

    await model.actions.loadSshPublicKeysFor(entry)

    expect(entry.sshPublicKey).toHaveBeenCalledTimes(2)
    expect(model.state.sshPublicKeys()).toEqual({
      k1: 'ssh-ed25519 AAAA retry@test',
    })
  })

  it('reloads same-entry secrets when the SSH signature changes', async () => {
    const model = new PMEntrySessionModel()
    const firstEntry = {
      id: 'entry-same-id-ssh-refresh',
      flushPendingPersistence: vi.fn(async () => {}),
      password: vi.fn(async () => 'old-secret'),
      note: vi.fn(async () => 'old-note'),
      sshKeys: [],
      sshPublicKey: vi.fn(),
    } as unknown as Entry
    const updatedEntry = {
      id: 'entry-same-id-ssh-refresh',
      flushPendingPersistence: vi.fn(async () => {}),
      password: vi.fn(async () => 'new-secret'),
      note: vi.fn(async () => 'new-note'),
      sshKeys: [{id: 'k1', type: 'ed25519', fingerprint: 'SHA256:test'}],
      sshPublicKey: vi.fn(async () => 'ssh-ed25519 AAAA refreshed@test'),
    } as unknown as Entry

    await model.actions.ensureSecretsLoaded(firstEntry)
    expect(model.state.password()).toBe('old-secret')
    expect(model.state.note()).toBe('old-note')

    model.actions.attach(updatedEntry)

    await vi.waitFor(() => {
      expect(model.state.password()).toBe('new-secret')
      expect(model.state.note()).toBe('new-note')
      expect(model.state.sshPublicKeys()).toEqual({
        k1: 'ssh-ed25519 AAAA refreshed@test',
      })
    })
  })
})

describe('PMEntryModel actions', () => {
  afterEach(() => {
    clearPassmanagerRoot()
    pmEntryEditorModel.reset()
    pmDeleteMotionModel.reset()
    vi.restoreAllMocks()
  })

  it('opens full-entry edit for login entries from the desktop edit command', () => {
    const entry = new Entry(Object.create(ManagerRoot.prototype) as ManagerRoot, {
      id: 'entry-desktop-edit-login',
      title: 'Entry',
      username: 'alice',
      urls: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: [],
      sshKeys: [],
    } as any)
    setPassmanagerRoot({
      showElement: atom(entry),
      isReadOnly: () => false,
    } as unknown as ManagerRoot)

    new PMEntryModel().startEntryEdit()

    expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(true)
  })

  it('opens payment-card edit for payment cards from the desktop edit command', () => {
    const entry = new Entry(Object.create(ManagerRoot.prototype) as ManagerRoot, {
      id: 'entry-desktop-edit-payment-card',
      entryType: 'payment_card',
      title: 'Team Visa',
      username: '',
      urls: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: [],
      sshKeys: [],
      paymentCard: {
        cardholderName: 'Alice Doe',
        expMonth: 12,
        expYear: 2032,
        brand: 'visa',
        last4: '1111',
      },
    } as any)
    setPassmanagerRoot({
      showElement: atom(entry),
      isReadOnly: () => false,
    } as unknown as ManagerRoot)

    new PMEntryModel().startEntryEdit()

    expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'payment-card')).toBe(true)
  })

  it('copies an already loaded password without re-reading the entry secret', async () => {
    const invoke = installClipboardInvokeSpy()
    try {
      const model = new PMEntryModel()
      model.actions.applySavedSecrets({password: 'cached-secret'})
      const entry = {
        entryType: 'login',
        flushPendingPersistence: vi.fn(async () => {}),
        password: vi.fn(async () => {
          throw new Error('password should not be re-read')
        }),
      } as unknown as Entry

      await model.actions.copyPassword(entry)

      expect(invoke).toHaveBeenCalledWith(
        'plugin:clipboard-manager|write_text',
        expect.objectContaining({text: 'cached-secret'}),
      )
      expect(entry.password).not.toHaveBeenCalled()
    } finally {
      delete (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
    }
  })

  it('opens the first non-regex website through the external browser service', () => {
    openExternalBrowserUrl.mockReset()
    openExternalBrowserUrl.mockResolvedValue(undefined)
    const model = new PMEntryModel()
    const entry = {
      urls: [
        {match: 'never', value: 'https://ignored.example'},
        {match: 'regex', value: '^internal$'},
        {match: 'domain', value: 'https://example.com/login'},
      ],
    } as unknown as Entry

    model.actions.openFirstUrl(entry)

    expect(openExternalBrowserUrl).toHaveBeenCalledOnce()
    expect(openExternalBrowserUrl).toHaveBeenCalledWith('https://example.com/login')
  })

  it('clears delete motion after entry delete settles when the same entry is still resolvable', async () => {
    const model = new PMEntryModel()
    const entry = {
      id: 'entry-delete-motion',
      remove: vi.fn(async () => undefined),
    } as unknown as Entry
    setPassmanagerRoot({
      getCardByID: vi.fn(() => entry),
    } as unknown as ManagerRoot)
    const clearSpy = vi.spyOn(pmDeleteMotionModel, 'clearPending')

    model.deleteEntryCard(entry)

    await vi.waitFor(() => {
      expect(entry.remove).toHaveBeenCalledTimes(1)
      expect(clearSpy).toHaveBeenCalledWith([entry.id])
    })
  })

  it('does not clear delete motion when delete completion belongs to a stale entry', async () => {
    const model = new PMEntryModel()
    const entry = {
      id: 'entry-delete-stale',
      remove: vi.fn(async () => undefined),
    } as unknown as Entry
    setPassmanagerRoot({
      getCardByID: vi.fn(() => undefined),
    } as unknown as ManagerRoot)
    const clearSpy = vi.spyOn(pmDeleteMotionModel, 'clearPending')

    model.deleteEntryCard(entry)
    await vi.waitFor(() => {
      expect(entry.remove).toHaveBeenCalledTimes(1)
    })
    await flushMicrotasks()

    expect(clearSpy).not.toHaveBeenCalled()
  })
})
