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

describe('Store vault lock toast notifications', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    navigationModel.disconnect()
    clearAppContext()
  })

  it('shows manual vault lock as a transient success toast', () => {
    const store = createStore()
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => 'toast-manual')
    const warningSpy = vi.spyOn(toast, 'warning').mockImplementation(() => 'toast-warning')

    store.handleVaultLocked({source: 'manual'})

    expect(successSpy).toHaveBeenCalledWith('Vault locked')
    expect(warningSpy).not.toHaveBeenCalled()
    expect(store.statusMessage()).toBeNull()
  })

  it('shows system vault lock as a transient warning toast with reason', () => {
    const store = createStore()
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => 'toast-manual')
    const warningSpy = vi.spyOn(toast, 'warning').mockImplementation(() => 'toast-system')

    store.handleVaultLocked({reason: 'mobile background', source: 'system'})

    expect(warningSpy).toHaveBeenCalledWith('Vault locked (mobile background)')
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
