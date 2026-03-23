import {describe, expect, it, vi} from 'vitest'

import type {Entry} from '@project/passmanager'

import {PMEntrySessionModel} from '../../src/features/passmanager/components/card/entry/entry-session.model'

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

    const loadPromise = model.ensureSecretsLoaded(entry)

    expect(model.passwordResource().status).toBe('loading')
    expect(model.noteResource().status).toBe('loading')
    expect(entry.password).not.toHaveBeenCalled()
    expect(entry.note).not.toHaveBeenCalled()

    persistence.resolve()
    await loadPromise

    expect(entry.flushPendingPersistence).toHaveBeenCalledOnce()
    expect(entry.password).toHaveBeenCalledOnce()
    expect(entry.note).toHaveBeenCalledOnce()
    expect(model.password()).toBe('secret-123')
    expect(model.note()).toBe('saved note')
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

    const loadPromise = model.ensureSecretsLoaded(entry)
    expect(model.passwordResource().status).toBe('loading')
    expect(model.noteResource().status).toBe('loading')

    persistence.resolve()
    await loadPromise

    expect(model.passwordResource().status).toBe('missing')
    expect(model.noteResource().status).toBe('missing')
    expect(model.password()).toBeUndefined()
    expect(model.note()).toBe('')
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

    model.loadSshPublicKeysFor(entry)
    expect(model.sshPublicKeys()).toEqual({})

    first.resolve('ssh-ed25519 AAAA first@test')
    await flushMicrotasks()

    expect(model.sshPublicKeys()).toEqual({
      k1: 'ssh-ed25519 AAAA first@test',
    })

    second.resolve('ssh-ed25519 AAAA second@test')
    await flushMicrotasks()

    expect(model.sshPublicKeys()).toEqual({
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

    const staleSecretsLoad = model.ensureSecretsLoaded(oldEntry)
    model.loadSshPublicKeysFor(oldEntry)

    const freshSecretsLoad = model.ensureSecretsLoaded(newEntry)
    model.loadSshPublicKeysFor(newEntry)

    freshSecret.resolve('fresh-secret')
    freshNote.resolve('fresh-note')
    freshSsh.resolve('ssh-ed25519 AAAA new@test')
    await freshSecretsLoad
    await flushMicrotasks()

    expect(model.password()).toBe('fresh-secret')
    expect(model.note()).toBe('fresh-note')
    expect(model.sshPublicKeys()).toEqual({
      new: 'ssh-ed25519 AAAA new@test',
    })

    staleSecret.resolve('stale-secret')
    staleNote.resolve('stale-note')
    staleSsh.resolve('ssh-ed25519 AAAA old@test')
    await staleSecretsLoad
    await flushMicrotasks()

    expect(model.password()).toBe('fresh-secret')
    expect(model.note()).toBe('fresh-note')
    expect(model.sshPublicKeys()).toEqual({
      new: 'ssh-ed25519 AAAA new@test',
    })
  })

  it('applies saved secrets without losing the current entry session', () => {
    const model = new PMEntrySessionModel()

    model.applySavedSecrets({
      password: 'after-save',
      note: 'after-note',
    })

    expect(model.passwordResource().status).toBe('ready')
    expect(model.noteResource().status).toBe('ready')
    expect(model.password()).toBe('after-save')
    expect(model.note()).toBe('after-note')
  })
})
