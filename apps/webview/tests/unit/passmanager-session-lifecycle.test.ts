import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {setupPassmanagerSession} from '../../src/app/bootstrap/passmanager-session'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import {PasswordManagerModel, pmModel} from '../../src/features/passmanager/password-manager.model'
import {pmIconStore} from '../../src/features/passmanager/models/pm-icon-store'

function rootPayload() {
  const now = Date.now()
  return {
    version: 4 as const,
    createdTs: now,
    updatedTs: now,
    folders: [],
    entries: [],
    sshKeys: [],
  }
}

function createWs() {
  return {
    kind: 'mock',
    connected: atom(true),
  }
}

function createStore() {
  return {
    vaultLockPending: atom(false),
    remoteSessionState: atom<'inactive' | 'ready'>('inactive'),
    remoteSessionPeerId: atom<string | null>(null),
    remoteSessionGeneration: atom<number | null>(null),
  }
}

describe('PassManager session lifecycle', () => {
  afterEach(() => {
    pmModel.disposeSession()
    runtimeModeModel.handleTransportDisconnect()
    vi.restoreAllMocks()
  })

  it('deduplicates preparation within one unlocked session', async () => {
    const read = vi.fn(async () => rootPayload())
    const model = new PasswordManagerModel()
    model.configure({read} as never)

    await expect(model.prepareSession('local:vault-a')).resolves.toBe('ready')
    const firstRoot = model.root()
    await expect(model.prepareSession('local:vault-a')).resolves.toBe('ready')

    expect(model.root()).toBe(firstRoot)
    expect(read).toHaveBeenCalledTimes(1)
    model.disposeSession()
  })

  it('settles deferred data from the existing root without starting a second session', async () => {
    const model = new PasswordManagerModel()
    model.configure({read: vi.fn(async () => undefined)} as never)

    const prepared = model.prepareSession('local:vault-a')
    await Promise.resolve()
    expect(model.sessionStatus()).toBe('loading')

    model.root()!.entries.set([])
    await expect(prepared).resolves.toBe('ready')
    model.disposeSession()
  })

  it('reports a terminal load error and retries on the same root', async () => {
    const read = vi
      .fn<() => Promise<ReturnType<typeof rootPayload>>>()
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValueOnce(rootPayload())
    const model = new PasswordManagerModel()
    model.configure({read} as never)

    await expect(model.prepareSession('local:vault-a')).resolves.toBe('error')
    const root = model.root()
    await expect(model.retrySessionLoad()).resolves.toBe('ready')

    expect(model.root()).toBe(root)
    expect(read).toHaveBeenCalledTimes(2)
    model.disposeSession()
  })

  it('does not restore a stale root after disposal', async () => {
    let resolveRead!: (value: ReturnType<typeof rootPayload>) => void
    const model = new PasswordManagerModel()
    model.configure({
      read: vi.fn(
        () =>
          new Promise<ReturnType<typeof rootPayload>>((resolve) => {
            resolveRead = resolve
          }),
      ),
    } as never)

    void model.prepareSession('local:vault-a')
    const staleRoot = model.root()
    model.disposeSession()
    resolveRead(rootPayload())
    await Promise.resolve()
    await Promise.resolve()

    expect(model.root()).toBeUndefined()
    expect(model.sessionStatus()).toBe('inactive')
    expect(staleRoot?.entries()).toEqual([])
  })

  it('prewarms after local unlock and disposes as soon as lock becomes pending', async () => {
    const ws = createWs()
    const state = {data: atom({StorageOpened: false, StorePath: '/vault-a'})}
    const store = createStore()
    const read = vi.fn(async () => rootPayload())
    const disposeIcons = vi.spyOn(pmIconStore, 'dispose')
    const cleanup = setupPassmanagerSession(ws as never, state as never, store as never, {read} as never)

    expect(pmModel.sessionStatus()).toBe('inactive')
    state.data.set({StorageOpened: true, StorePath: '/vault-a'})
    await expect(pmModel.whenSessionSettled()).resolves.toBe('ready')
    expect(read).toHaveBeenCalledTimes(1)

    store.vaultLockPending.set(true)
    await Promise.resolve()
    expect(pmModel.root()).toBeUndefined()
    expect(pmModel.sessionStatus()).toBe('inactive')
    expect(disposeIcons).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('disposes the icon session cache when the transport disconnects', async () => {
    const ws = createWs()
    const state = {data: atom({StorageOpened: true, StorePath: '/vault-a'})}
    const store = createStore()
    const cleanup = setupPassmanagerSession(
      ws as never,
      state as never,
      store as never,
      {
        read: vi.fn(async () => rootPayload()),
      } as never,
    )
    const disposeIcons = vi.spyOn(pmIconStore, 'dispose')

    await expect(pmModel.whenSessionSettled()).resolves.toBe('ready')
    ws.connected.set(false)
    await Promise.resolve()

    expect(pmModel.root()).toBeUndefined()
    expect(disposeIcons).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('replaces remote metadata when the transport generation changes', async () => {
    const ws = createWs()
    const state = {data: atom({StorageOpened: true})}
    const store = createStore()
    store.remoteSessionPeerId.set('peer-a')
    store.remoteSessionGeneration.set(1)
    runtimeModeModel.setCoreMode({remote: {host: {type: 'mobile_usb', host_id: 'peer-a'}}})
    const read = vi.fn(async () => rootPayload())
    const disposeIcons = vi.spyOn(pmIconStore, 'dispose')
    const cleanup = setupPassmanagerSession(ws as never, state as never, store as never, {read} as never)

    store.remoteSessionState.set('ready')
    await expect(pmModel.whenSessionSettled()).resolves.toBe('ready')
    const firstRoot = pmModel.root()

    store.remoteSessionGeneration.set(2)
    await expect(pmModel.whenSessionSettled()).resolves.toBe('ready')
    expect(pmModel.root()).not.toBe(firstRoot)
    expect(read).toHaveBeenCalledTimes(2)
    expect(disposeIcons).toHaveBeenCalledTimes(1)
    cleanup()
  })
})
