import {afterEach, describe, expect, it} from 'vitest'

import type {ChromVoidState} from '../../src/core/state/app-state'
import type {Store} from '../../src/app/state/store'
import {Router} from '../../src/app/router/router'
import {atom} from '@reatom/core'

describe('Router pre-auth remote flow', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/dashboard')
  })

  it('stays on welcome until a remote pre-auth session is explicitly activated', () => {
    const ws = {
      kind: 'tauri',
      connected: atom(true),
      connecting: atom(false),
    } as const

    const appState = {
      data: atom({
        NeedUserInitialization: true,
        StorageOpened: false,
      }),
    } as unknown as ChromVoidState

    const store = {
      remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
    } as unknown as Store

    const router = new Router(ws, appState, store)
    expect(router.route()).toBe('welcome')

    store.remoteSessionState.set('ready')
    expect(router.route()).toBe('dashboard')
  })

  it('still returns to welcome when transport is not unlocked', () => {
    const ws = {
      kind: 'tauri',
      connected: atom(true),
      connecting: atom(false),
    } as const

    const appState = {
      data: atom({
        NeedUserInitialization: true,
        StorageOpened: false,
      }),
    } as unknown as ChromVoidState

    const store = {
      remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('waiting_host_unlock'),
    } as unknown as Store

    const router = new Router(ws, appState, store)
    expect(router.route()).toBe('welcome')
  })

  it('routes to welcome immediately while a vault lock request is pending', () => {
    const ws = {
      kind: 'tauri',
      connected: atom(true),
      connecting: atom(false),
    } as const

    const appState = {
      data: atom({
        NeedUserInitialization: false,
        StorageOpened: true,
      }),
    } as unknown as ChromVoidState

    const store = {
      remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
      vaultLockPending: atom(false),
    } as unknown as Store

    const router = new Router(ws, appState, store)
    expect(router.route()).toBe('dashboard')

    store.vaultLockPending.set(true)
    expect(router.route()).toBe('welcome')
  })

  it('keeps an unlocked Tauri vault on dashboard even if initialization state is stale', () => {
    const ws = {
      kind: 'tauri',
      connected: atom(true),
      connecting: atom(false),
    } as const

    const appState = {
      data: atom({
        NeedUserInitialization: true,
        StorageOpened: true,
      }),
    } as unknown as ChromVoidState

    const store = {
      remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
      vaultLockPending: atom(false),
    } as unknown as Store

    const router = new Router(ws, appState, store)

    expect(router.route()).toBe('dashboard')
  })

  it('does not allow preview welcome to override an unlocked Tauri vault', () => {
    window.history.replaceState({}, '', '/dashboard?preview=welcome')

    const ws = {
      kind: 'tauri',
      connected: atom(true),
      connecting: atom(false),
    } as const

    const appState = {
      data: atom({
        NeedUserInitialization: false,
        StorageOpened: true,
      }),
    } as unknown as ChromVoidState

    const store = {
      remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
      vaultLockPending: atom(false),
    } as unknown as Store

    const router = new Router(ws, appState, store)

    expect(router.route()).toBe('dashboard')
  })
})
