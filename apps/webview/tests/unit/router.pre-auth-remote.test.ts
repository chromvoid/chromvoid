import {state} from '@statx/core'
import {describe, expect, it} from 'vitest'

import type {ChromVoidState} from '../../src/core/state/app-state'
import type {Store} from '../../src/app/state/store'
import {Router} from '../../src/app/router/router'

describe('Router pre-auth remote flow', () => {
  it('stays on welcome until a remote pre-auth session is explicitly activated', () => {
    const ws = {
      kind: 'tauri',
      connected: state(true),
      connecting: state(false),
    } as const

    const appState = {
      data: state({
        NeedUserInitialization: true,
        StorageOpened: false,
      }),
    } as unknown as ChromVoidState

    const store = {
      remoteSessionState: state<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
    } as unknown as Store

    const router = new Router(ws, appState, store)
    expect(router.route()).toBe('welcome')

    store.remoteSessionState.set('ready')
    expect(router.route()).toBe('dashboard')
  })

  it('still returns to welcome when transport is not unlocked', () => {
    const ws = {
      kind: 'tauri',
      connected: state(true),
      connecting: state(false),
    } as const

    const appState = {
      data: state({
        NeedUserInitialization: true,
        StorageOpened: false,
      }),
    } as unknown as ChromVoidState

    const store = {
      remoteSessionState: state<'inactive' | 'waiting_host_unlock' | 'ready'>('waiting_host_unlock'),
    } as unknown as Store

    const router = new Router(ws, appState, store)
    expect(router.route()).toBe('welcome')
  })
})
