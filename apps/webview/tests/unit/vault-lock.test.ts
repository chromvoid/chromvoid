const tauriInvoke = vi.fn()
const cancelPreparedFileSourceWorkForLockIntent = vi.fn(() => Promise.resolve())

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
}))

vi.mock('root/features/media/components/file-loader', () => ({
  cancelPreparedFileSourceWorkForLockIntent: () => cancelPreparedFileSourceWorkForLockIntent(),
}))

import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {lockVaultFromUi} from '../../src/shared/services/vault-lock'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

function setupContext(layout: 'mobile' | 'desktop' = 'mobile') {
  const layoutMode = atom(layout)
  const sidebarOpen = atom(true)
  const vaultLockPending = atom(false)
  const selectedNodeIds = atom<number[]>([1, 2])
  const stateData = atom({StorageOpened: true})
  const pushNotification = vi.fn()
  const setSelectedItems = vi.fn((next: number[]) => selectedNodeIds.set(next))
  const cancelSync = vi.fn()

  const store = {
    layoutMode,
    sidebarOpen,
    vaultLockPending,
    beginVaultLockRequest() {
      vaultLockPending.set(true)
      if (layoutMode() === 'mobile') {
        sidebarOpen.set(false)
      }
    },
    finishVaultLockRequest() {
      vaultLockPending.set(false)
    },
    handleVaultLocked: vi.fn((_options: {source: 'manual'}) => {
      vaultLockPending.set(false)
      setSelectedItems([])
    }),
    pushNotification,
    setSelectedItems,
  }
  const state = {
    data: stateData,
    update(next: Record<string, unknown>) {
      stateData.set({...stateData(), ...next})
    },
  }
  const catalog = {cancelSync}

  initAppContext(
    createMockAppContext({
      store: store as never,
      state: state as never,
      catalog: catalog as never,
    }),
  )

  return {catalog, selectedNodeIds, stateData, store}
}

function rpcDispatchCalls() {
  return tauriInvoke.mock.calls.filter(([command]) => command === 'rpc_dispatch')
}

afterEach(() => {
  clearAppContext()
  tauriInvoke.mockReset()
  cancelPreparedFileSourceWorkForLockIntent.mockClear()
  vi.unstubAllGlobals()
})

describe('lockVaultFromUi', () => {
  it('sets pending state synchronously and closes mobile UI before backend lock resolves', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    const request = deferred<{ok: true; result: null}>()
    tauriInvoke.mockImplementation((command: string) =>
      command === 'rpc_dispatch' ? request.promise : Promise.resolve(null),
    )
    const {catalog, selectedNodeIds, stateData, store} = setupContext('mobile')

    const promise = lockVaultFromUi()

    expect(store.vaultLockPending()).toBe(true)
    expect(store.sidebarOpen()).toBe(false)
    expect(catalog.cancelSync).toHaveBeenCalledWith('vault-lock')
    await vi.waitFor(() => {
      expect(cancelPreparedFileSourceWorkForLockIntent).toHaveBeenCalledTimes(1)
    })
    expect(rpcDispatchCalls()).toHaveLength(1)
    expect(
      cancelPreparedFileSourceWorkForLockIntent.mock.invocationCallOrder[0],
    ).toBeLessThan(tauriInvoke.mock.invocationCallOrder[0])

    request.resolve({ok: true, result: null})
    await promise

    expect(store.vaultLockPending()).toBe(false)
    expect(stateData().StorageOpened).toBe(false)
    expect(selectedNodeIds()).toEqual([])
    expect(store.handleVaultLocked).toHaveBeenCalledWith({source: 'manual'})
    expect(store.pushNotification).not.toHaveBeenCalledWith('success', 'Vault locked')
  })

  it('cancels prepared source work before invoking backend lock', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    const calls: string[] = []
    cancelPreparedFileSourceWorkForLockIntent.mockImplementationOnce(async () => {
      calls.push('cancel-prepared')
    })
    tauriInvoke.mockImplementation((command: string) => {
      if (command === 'rpc_dispatch') {
        calls.push('rpc-dispatch')
        return Promise.resolve({ok: true, result: null} as const)
      }
      return Promise.resolve(null)
    })
    setupContext('mobile')

    await lockVaultFromUi()

    expect(calls).toEqual(['cancel-prepared', 'rpc-dispatch'])
  })

  it('ignores duplicate lock requests while one is pending', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    const request = deferred<{ok: true; result: null}>()
    tauriInvoke.mockImplementation((command: string) =>
      command === 'rpc_dispatch' ? request.promise : Promise.resolve(null),
    )
    setupContext('mobile')

    const first = lockVaultFromUi()
    const second = lockVaultFromUi()

    await vi.waitFor(() => {
      expect(rpcDispatchCalls()).toHaveLength(1)
    })

    request.resolve({ok: true, result: null})
    await Promise.all([first, second])
  })

  it('clears pending state and keeps the vault open when backend lock fails', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    tauriInvoke.mockImplementation((command: string) =>
      command === 'rpc_dispatch'
        ? Promise.resolve({ok: false, error: 'Lock failed'} as const)
        : Promise.resolve(null),
    )
    const {stateData, store} = setupContext('mobile')

    await lockVaultFromUi()

    expect(store.vaultLockPending()).toBe(false)
    expect(stateData().StorageOpened).toBe(true)
    expect(store.pushNotification).toHaveBeenCalledWith('error', 'Lock failed')
  })
})
