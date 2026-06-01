import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {setupCatalogSync} from '../../src/app/bootstrap/catalog-sync'
import {setupPassmanagerReload} from '../../src/app/bootstrap/passmanager-reload'
import {clearPassmanagerRoot, setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

function createWs() {
  const handlers = new Map<string, Array<() => void>>()

  return {
    kind: 'mock',
    connected: atom(true),
    on(event: string, handler: () => void) {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
    },
    emit(event: string) {
      for (const handler of handlers.get(event) ?? []) {
        handler()
      }
    },
  }
}

describe('passmanager bootstrap setup dedupe', () => {
  afterEach(() => {
    navigationModel.disconnect()
    navigationModel.snapshot.set({surface: 'files', overlay: {kind: 'none'}} as never)
    vi.restoreAllMocks()
    vi.useRealTimers()
    clearPassmanagerRoot()
  })

  it('setupPassmanagerReload subscribes only once for the same backend instance', async () => {
    const ws = createWs()
    const store = {
      remoteSessionState: atom<'ready' | 'idle'>('ready'),
      isShowPasswordManager: () => true,
    }
    const backend = {
      getRevision: vi.fn(async () => 'rev-0'),
    }

    setPassmanagerRoot({
      showElement: atom({id: 'root'}),
      load: vi.fn().mockResolvedValue(undefined),
    } as never)

    setupPassmanagerReload(ws as never, store as never, backend as never)
    setupPassmanagerReload(ws as never, store as never, backend as never)

    ws.emit('passmanager:changed')
    await Promise.resolve()

    expect(backend.getRevision).toHaveBeenCalledTimes(1)
  })

  it('runs deferred passmanager reload only on a real passwords surface transition', async () => {
    vi.useFakeTimers()
    navigationModel.snapshot.set({surface: 'files', overlay: {kind: 'none'}} as never)

    const ws = createWs()
    const store = {
      remoteSessionState: atom<'ready' | 'idle'>('ready'),
      isShowPasswordManager: () => navigationModel.currentSurface() === 'passwords',
    }
    const backend = {
      getRevision: vi.fn(async () => 'rev-0'),
    }
    const root = {
      showElement: atom({id: 'root'}),
      load: vi.fn().mockResolvedValue(undefined),
    }

    setPassmanagerRoot(root as never)
    setupPassmanagerReload(ws as never, store as never, backend as never)

    ws.emit('passmanager:changed')
    vi.advanceTimersByTime(151)
    await Promise.resolve()
    await Promise.resolve()

    expect(root.load).not.toHaveBeenCalled()

    navigationModel.snapshot.set({surface: 'passwords', passwords: {kind: 'root'}, overlay: {kind: 'none'}} as never)
    await Promise.resolve()
    vi.advanceTimersByTime(151)
    await Promise.resolve()
    await Promise.resolve()

    expect(root.load).toHaveBeenCalledTimes(1)
  })

  it('setupCatalogSync subscribes only once for the same catalog instance', async () => {
    const ws = createWs()
    const state = {
      data: atom({StorageOpened: true}),
    }
    const store = {
      remoteSessionState: atom<'ready' | 'idle'>('ready'),
    }
    const catalog = {
      startSync: vi.fn().mockResolvedValue(undefined),
      stopSync: vi.fn().mockResolvedValue(undefined),
    }

    setupCatalogSync(ws as never, state as never, store as never, catalog as never)
    setupCatalogSync(ws as never, state as never, store as never, catalog as never)

    ws.connected.set(false)
    ws.connected.set(true)
    await Promise.resolve()
    await Promise.resolve()

    expect(catalog.startSync).toHaveBeenCalledTimes(1)
  })

  it('cancels catalog sync locally while a vault lock is pending', async () => {
    const ws = createWs()
    const state = {
      data: atom({StorageOpened: true}),
    }
    const store = {
      remoteSessionState: atom<'ready' | 'idle'>('idle'),
      vaultLockPending: atom(false),
    }
    const catalog = {
      startSync: vi.fn().mockResolvedValue(undefined),
      stopSync: vi.fn().mockResolvedValue(undefined),
      cancelSync: vi.fn(),
    }

    setupCatalogSync(ws as never, state as never, store as never, catalog as never)
    await Promise.resolve()

    expect(catalog.startSync).toHaveBeenCalledTimes(1)

    store.vaultLockPending.set(true)
    await Promise.resolve()

    expect(catalog.cancelSync).toHaveBeenCalledWith('vault-lock')
    expect(catalog.stopSync).not.toHaveBeenCalled()

    store.vaultLockPending.set(false)
    await Promise.resolve()

    expect(catalog.startSync).toHaveBeenCalledTimes(2)
  })
})
