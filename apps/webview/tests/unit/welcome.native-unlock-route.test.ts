import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {atom} from '@reatom/core'

import {Router} from '../../src/app/router/router'
import {ChromVoidState} from '../../src/core/state/app-state'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import {WelcomeSetupModel} from '../../src/routes/welcome/welcome-setup.model'
import type * as WelcomeRpcModule from '../../src/routes/welcome/welcome-rpc'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

const rpc = vi.hoisted(() => vi.fn())

vi.mock('../../src/routes/welcome/welcome-rpc', async () => ({
  ...(await vi.importActual<typeof WelcomeRpcModule>('../../src/routes/welcome/welcome-rpc')),
  tauriRpc: rpc,
}))

vi.mock('../../src/core/runtime/runtime', () => ({isTauriRuntime: () => true}))

describe('native welcome unlock routing', () => {
  let state: ChromVoidState
  let router: Router
  let model: WelcomeSetupModel

  beforeEach(() => {
    vi.useFakeTimers()
    rpc.mockReset()
    runtimeModeModel.handleTransportDisconnect()
    window.history.replaceState({}, '', '/')
    state = new ChromVoidState()
    state.update({NeedUserInitialization: false, StorageOpened: false})
    const context = createMockAppContext({
      state,
      ws: {kind: 'tauri', connected: atom(true), connecting: atom(false)} as never,
      store: {remoteSessionState: atom('inactive')} as never,
    })
    router = new Router(context.ws, state, context.store)
    initAppContext({...context, router})
    model = new WelcomeSetupModel()
  })

  afterEach(() => {
    model.disconnect()
    clearAppContext()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps the real route on welcome when native state opens before the RPC returns', async () => {
    let completeRpc: (() => void) | undefined
    rpc.mockImplementationOnce(() => {
      // Initialize applies emit_basic_state before rpc_dispatch resolves.
      state.update({StorageOpened: true})
      return new Promise<void>((resolve) => {
        completeRpc = resolve
      })
    })
    let arriveAtCore: (() => void) | undefined
    vi.spyOn(model.icon, 'finishDerivation').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          arriveAtCore = resolve
        }),
    )
    const opened = vi.spyOn(model.icon, 'opened')
    const unlock = model.submitUnlock()
    await vi.advanceTimersByTimeAsync(0)

    expect(state.data().StorageOpened).toBe(true)
    expect(router.route()).toBe('welcome')
    expect(opened).not.toHaveBeenCalled()
    completeRpc?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(arriveAtCore).toBeDefined()
    expect(router.route()).toBe('welcome')
    expect(opened).not.toHaveBeenCalled()

    arriveAtCore?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(opened).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(149)
    expect(router.route()).toBe('welcome')
    await vi.advanceTimersByTimeAsync(1)
    await unlock
    expect(router.route()).toBe('dashboard')
  })

  it('honors a native lock during feedback without publishing a stale open state', async () => {
    rpc.mockImplementationOnce(async () => {
      state.update({StorageOpened: true})
    })
    const unlock = model.submitUnlock()
    await vi.advanceTimersByTimeAsync(0)
    expect(model.icon.state()).toBe('opened')
    expect(router.route()).toBe('welcome')

    state.update({StorageOpened: false})
    await vi.advanceTimersByTimeAsync(0)
    expect(model.icon.state()).toBe('idle')
    expect(model.shared.busy()).toBe(false)
    await vi.advanceTimersByTimeAsync(150)
    await unlock
    expect(state.data().StorageOpened).toBe(false)
    expect(router.route()).toBe('welcome')
  })

  it('releases the route hold after an RPC failure', async () => {
    rpc.mockRejectedValueOnce(new Error('Disk unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await model.submitUnlock()
    expect(model.icon.state()).toBe('idle')
    expect(router.route()).toBe('welcome')
    state.update({StorageOpened: true})
    expect(router.route()).toBe('dashboard')
  })

  it('does not let an old request release a newer route hold', () => {
    const releaseOld = router.beginWelcomeUnlock()
    const releaseNew = router.beginWelcomeUnlock()
    state.update({StorageOpened: true})
    releaseOld()
    expect(router.route()).toBe('welcome')
    releaseNew()
    expect(router.route()).toBe('dashboard')
  })
})
