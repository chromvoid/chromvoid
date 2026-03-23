import {state} from '@statx/core'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {BiometricAppGateModel} from '../../src/routes/biometric-app-gate/biometric-app-gate.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  }
})

type ConnectedAtom = ReturnType<typeof state<boolean>>

function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function initTauriContext(): {connected: ConnectedAtom} {
  const connected = state(false)
  initAppContext(
    createMockAppContext({
      ws: {
        kind: 'tauri',
        connected,
        connecting: state(false),
        lastError: state<string | undefined>(undefined),
        connect: () => {},
        disconnect: () => {},
        on: () => {},
        off: () => {},
      } as any,
    }),
  )

  return {connected}
}

describe('BiometricAppGateModel', () => {
  let model: BiometricAppGateModel | null = null

  beforeEach(() => {
    tauriInvoke.mockReset()
    resetRuntimeCapabilities()
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
  })

  afterEach(() => {
    model?.disconnect()
    model = null
    clearAppContext()
    resetRuntimeCapabilities()
    vi.unstubAllGlobals()
  })

  it('skips cold-open biometric app gate when the setting is disabled', async () => {
    const {connected} = initTauriContext()
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_biometric: true,
    })
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_session_settings') {
        return {
          ok: true,
          result: {
            auto_lock_timeout_secs: 300,
            lock_on_sleep: true,
            lock_on_mobile_background: false,
            require_biometric_app_gate: false,
            auto_mount_after_unlock: false,
            keep_screen_awake_when_unlocked: false,
          },
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    })

    model = new BiometricAppGateModel()
    model.connect()
    connected.set(true)
    await flushAsyncWork()

    expect(model.phase()).toBe('disabled')
    expect(model.shouldBlockSurface()).toBe(false)
    expect(tauriInvoke).toHaveBeenCalledTimes(1)
    expect(tauriInvoke).toHaveBeenCalledWith('get_session_settings')
  })

  it('enters blocked state on cancelled biometric prompt and can retry', async () => {
    const {connected} = initTauriContext()
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_biometric: true,
    })

    let authAttempts = 0
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_session_settings') {
        return {
          ok: true,
          result: {
            auto_lock_timeout_secs: 300,
            lock_on_sleep: true,
            lock_on_mobile_background: false,
            require_biometric_app_gate: true,
            auto_mount_after_unlock: false,
            keep_screen_awake_when_unlocked: false,
          },
        }
      }

      if (command === 'mobile_biometric_auth') {
        authAttempts += 1
        if (authAttempts === 1) {
          return {
            ok: false,
            error: 'User cancelled prompt',
            code: 'BIOMETRIC_CANCELLED',
          }
        }

        return {
          ok: true,
          result: {authenticated: true},
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    })

    model = new BiometricAppGateModel()
    model.connect()
    connected.set(true)
    await flushAsyncWork()

    expect(model.phase()).toBe('blocked')
    expect(model.lastErrorCode()).toBe('BIOMETRIC_CANCELLED')
    expect(model.shouldBlockSurface()).toBe(true)

    model.retry()
    await flushAsyncWork()

    expect(model.phase()).toBe('passed')
    expect(authAttempts).toBe(2)
    expect(model.entrypoint()).toBe('cold_open')
  })

  it('deduplicates biometric prompt during one foreground resume cycle', async () => {
    const {connected} = initTauriContext()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_biometric: true,
    })

    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_session_settings') {
        return {
          ok: true,
          result: {
            auto_lock_timeout_secs: 300,
            lock_on_sleep: true,
            lock_on_mobile_background: false,
            require_biometric_app_gate: true,
            auto_mount_after_unlock: false,
            keep_screen_awake_when_unlocked: false,
          },
        }
      }

      if (command === 'mobile_biometric_auth') {
        return {
          ok: true,
          result: {authenticated: true},
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    })

    model = new BiometricAppGateModel()
    model.connect()
    connected.set(true)
    await flushAsyncWork()

    expect(tauriInvoke).toHaveBeenCalledTimes(2)

    model.handleBackground()
    model.handleForegroundResume()
    model.handleForegroundResume()
    await flushAsyncWork()

    const authCalls = tauriInvoke.mock.calls.filter(([command]) => command === 'mobile_biometric_auth')
    expect(authCalls).toHaveLength(2)
    expect(model.entrypoint()).toBe('foreground_resume')
    expect(model.phase()).toBe('passed')
  })

  it('falls back to normal flow on internal biometric bridge error', async () => {
    const {connected} = initTauriContext()
    const pushNotification = vi.fn()
    clearAppContext()
    initAppContext(
      createMockAppContext({
        store: {
          pushNotification,
        } as any,
        ws: {
          kind: 'tauri',
          connected,
          connecting: state(false),
          lastError: state<string | undefined>(undefined),
          connect: () => {},
          disconnect: () => {},
          on: () => {},
          off: () => {},
        } as any,
      }),
    )
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_biometric: true,
    })

    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_session_settings') {
        return {
          ok: true,
          result: {
            auto_lock_timeout_secs: 300,
            lock_on_sleep: true,
            lock_on_mobile_background: false,
            require_biometric_app_gate: true,
            auto_mount_after_unlock: false,
            keep_screen_awake_when_unlocked: false,
          },
        }
      }

      if (command === 'mobile_biometric_auth') {
        return {
          ok: false,
          error: 'Biometric bridge state is unavailable',
          code: 'BIOMETRIC_INTERNAL',
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    })

    model = new BiometricAppGateModel()
    model.connect()
    connected.set(true)
    await flushAsyncWork()

    expect(model.phase()).toBe('disabled')
    expect(model.shouldBlockSurface()).toBe(false)
    expect(pushNotification).toHaveBeenCalledWith(
      'warning',
      'Biometric app gate is unavailable for this attempt. Continuing without it.',
    )
  })
})
