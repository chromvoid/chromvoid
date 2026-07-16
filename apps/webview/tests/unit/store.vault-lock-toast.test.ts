import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Store} from '../../src/app/state/store'
import {ChromVoidState} from '../../src/core/state/app-state'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {clearAppContext, initAppContext} from '../../src/shared/services/app-context'
import {toast} from '../../src/shared/services/toast-manager'

function createStore() {
  const ws = {
    kind: 'ws' as const,
    connected: atom(true),
    connecting: atom(false),
    lastError: atom<string | undefined>(undefined),
  }

  const catalog = {
    syncing: atom(false),
    lastError: atom<string | null>(null),
    api: {},
    refresh: async () => {},
  }

  const state = new ChromVoidState()
  const store = new Store(ws as any, state, catalog as any)
  initAppContext({store, ws: ws as any, catalog: catalog as any, state})
  return store
}

describe('Store vault lock cleanup notifications', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    navigationModel.disconnect()
    clearAppContext()
  })

  it('clears unlocked UI state without queuing a duplicate manual-lock toast', () => {
    const store = createStore()
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => 'toast-manual')
    const warningSpy = vi.spyOn(toast, 'warning').mockImplementation(() => 'toast-warning')
    store.currentPath.set('/Secrets/')
    store.selectedNodeIds.set([1, 2])
    store.showSettingsPage.set(true)

    store.handleVaultLocked()

    expect(store.currentPath()).toBe('/')
    expect(store.selectedNodeIds()).toEqual([])
    expect(store.showSettingsPage()).toBe(false)
    expect(successSpy).not.toHaveBeenCalled()
    expect(warningSpy).not.toHaveBeenCalled()
    expect(store.statusMessage()).toBeNull()
  })

  it('finishes a pending lock request without creating stale notification state', () => {
    const store = createStore()
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => 'toast-manual')
    const warningSpy = vi.spyOn(toast, 'warning').mockImplementation(() => 'toast-system')
    store.beginVaultLockRequest()

    store.handleVaultLocked()

    expect(store.vaultLockPending()).toBe(false)
    expect(warningSpy).not.toHaveBeenCalled()
    expect(successSpy).not.toHaveBeenCalled()
    expect(store.statusMessage()).toBeNull()
  })

  it('shows remote host lock as a transient warning toast', () => {
    const store = createStore()
    const warningSpy = vi.spyOn(toast, 'warning').mockImplementation(() => 'toast-remote')

    store.handleRemoteHostLocked()

    expect(warningSpy).toHaveBeenCalledWith('Remote vault locked on host device')
    expect(store.statusMessage()).toBeNull()
  })
})
