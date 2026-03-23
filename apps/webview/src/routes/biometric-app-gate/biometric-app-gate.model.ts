import {computed, state} from '@statx/core'

import {
  DEFAULT_SESSION_SETTINGS,
  loadSessionSettings,
  type SessionSettings,
} from 'root/core/session/session-settings'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {getAppContext} from 'root/shared/services/app-context'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

type BiometricAuthResult = {
  authenticated: boolean
}

export type BiometricAppGatePhase = 'disabled' | 'idle' | 'required' | 'prompting' | 'passed' | 'blocked'
export type BiometricAppGateEntrypoint = 'cold_open' | 'foreground_resume' | null
export type BiometricAuthCode =
  | 'BIOMETRIC_UNAVAILABLE'
  | 'BIOMETRIC_DENIED'
  | 'BIOMETRIC_CANCELLED'
  | 'BIOMETRIC_INTERNAL'

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

function normalizeBiometricErrorCode(code: string | null | undefined): BiometricAuthCode {
  switch (code) {
    case 'BIOMETRIC_UNAVAILABLE':
    case 'BIOMETRIC_DENIED':
    case 'BIOMETRIC_CANCELLED':
    case 'BIOMETRIC_INTERNAL':
      return code
    default:
      return 'BIOMETRIC_INTERNAL'
  }
}

export class BiometricAppGateModel {
  readonly phase = state<BiometricAppGatePhase>('idle')
  readonly entrypoint = state<BiometricAppGateEntrypoint>(null)
  readonly platform = state(getRuntimeCapabilities().platform)
  readonly mobileRuntime = state(Boolean(getRuntimeCapabilities().mobile))
  readonly available = state(Boolean(getRuntimeCapabilities().mobile && getRuntimeCapabilities().supports_biometric))
  readonly requireBiometricAppGate = state(DEFAULT_SESSION_SETTINGS.require_biometric_app_gate)
  readonly loading = state(false)
  readonly lastErrorCode = state<BiometricAuthCode | null>(null)
  readonly lastErrorMessage = state('')

  readonly enabled = computed(() => this.mobileRuntime() && this.available() && this.requireBiometricAppGate())
  readonly shouldBlockSurface = computed(() => {
    if (!this.mobileRuntime()) return false
    return (
      this.loading() ||
      this.phase() === 'required' ||
      this.phase() === 'prompting' ||
      this.phase() === 'blocked'
    )
  })
  readonly showRetry = computed(() => this.phase() === 'blocked')
  readonly title = computed(() => {
    if (this.phase() === 'blocked') return 'Biometric check required'
    if (this.phase() === 'prompting') return 'Confirm it is you'
    return 'Checking app access'
  })
  readonly message = computed(() => {
    if (this.phase() === 'blocked') {
      switch (this.lastErrorCode()) {
        case 'BIOMETRIC_DENIED':
          return 'Biometric verification did not succeed. Try again to continue to ChromVoid.'
        case 'BIOMETRIC_CANCELLED':
          return 'Verification was cancelled. Try again to continue to ChromVoid.'
        case 'BIOMETRIC_UNAVAILABLE':
          return 'Biometric app gate is unavailable right now. Try again or check device security settings.'
        case 'BIOMETRIC_INTERNAL':
        default:
          return 'ChromVoid could not complete the biometric app gate. Try again.'
      }
    }

    if (this.entrypoint() === 'foreground_resume') {
      return 'Verifying local access before showing the app again.'
    }

    return 'Verifying local access before showing the app.'
  })

  private connected = false
  private sessionSettingsLoaded = false
  private coldOpenHandled = false
  private backgroundedSinceLastActive = false
  private unsubscribeWsConnected: (() => void) | null = null
  private promptPromise: Promise<void> | null = null

  connect(): void {
    if (this.connected) return
    this.connected = true
    this.refreshRuntimeFlags()

    if (!isTauriRuntime()) {
      this.phase.set('disabled')
      return
    }

    const {ws} = getAppContext()
    this.unsubscribeWsConnected = ws.connected.subscribe((connected) => {
      this.refreshRuntimeFlags()
      if (!connected) {
        this.loading.set(false)
        this.backgroundedSinceLastActive = false
        this.phase.set('idle')
        return
      }
      if (this.coldOpenHandled) return
      this.coldOpenHandled = true
      void this.runGate('cold_open')
    })

    if (ws.connected() && !this.coldOpenHandled) {
      this.coldOpenHandled = true
      void this.runGate('cold_open')
    }
  }

  disconnect(): void {
    this.unsubscribeWsConnected?.()
    this.unsubscribeWsConnected = null
    this.promptPromise = null
    this.connected = false
    this.sessionSettingsLoaded = false
    this.coldOpenHandled = false
    this.backgroundedSinceLastActive = false
    this.resetState()
  }

  handleBackground(): void {
    this.refreshRuntimeFlags()
    if (!this.mobileRuntime()) return
    this.backgroundedSinceLastActive = true

    if (!this.enabled()) {
      this.phase.set('disabled')
      return
    }

    if (this.phase() === 'passed' || this.phase() === 'idle') {
      this.phase.set('idle')
    }
  }

  handleForegroundResume(): void {
    if (!this.backgroundedSinceLastActive) return
    this.backgroundedSinceLastActive = false
    void this.runGate('foreground_resume')
  }

  applySessionSettings(settings: SessionSettings): void {
    this.sessionSettingsLoaded = true
    this.requireBiometricAppGate.set(settings.require_biometric_app_gate)

    this.refreshRuntimeFlags()
    if (!this.enabled()) {
      this.phase.set('disabled')
      this.lastErrorCode.set(null)
      this.lastErrorMessage.set('')
      return
    }

    if (this.phase() === 'disabled') {
      this.phase.set('idle')
    }
  }

  retry(): void {
    void this.runGate(this.entrypoint() ?? 'cold_open')
  }

  private async runGate(entrypoint: Exclude<BiometricAppGateEntrypoint, null>): Promise<void> {
    if (this.promptPromise) {
      await this.promptPromise
      return
    }

    this.refreshRuntimeFlags()
    if (!this.mobileRuntime()) {
      this.phase.set('disabled')
      return
    }

    this.entrypoint.set(entrypoint)

    const shouldBlockImmediately =
      entrypoint === 'cold_open' || (this.sessionSettingsLoaded && this.requireBiometricAppGate() && this.available())
    if (shouldBlockImmediately) {
      this.loading.set(true)
    }

    try {
      await this.ensureSessionSettingsLoaded()
      this.refreshRuntimeFlags()

      if (!this.enabled()) {
        this.phase.set('disabled')
        this.lastErrorCode.set(null)
        this.lastErrorMessage.set('')
        return
      }

      this.phase.set('required')
      const pending = this.promptForGate().finally(() => {
        if (this.promptPromise === pending) {
          this.promptPromise = null
        }
      })
      this.promptPromise = pending
      await pending
    } finally {
      this.loading.set(false)
    }
  }

  private async ensureSessionSettingsLoaded(): Promise<void> {
    if (this.sessionSettingsLoaded) return

    try {
      const settings = await loadSessionSettings()
      this.applySessionSettings(settings)
    } catch (error) {
      console.warn('[biometric-app-gate] failed to load session settings', error)
      this.applySessionSettings({...DEFAULT_SESSION_SETTINGS})
    }
  }

  private async promptForGate(): Promise<void> {
    this.phase.set('prompting')
    this.lastErrorCode.set(null)
    this.lastErrorMessage.set('')

    try {
      const res = await tauriInvoke<RpcResult<BiometricAuthResult>>('mobile_biometric_auth', {
        reason: 'Continue to ChromVoid',
      })

      if (isOk(res) && res.result.authenticated) {
        this.phase.set('passed')
        return
      }

      const code = normalizeBiometricErrorCode(!isOk(res) ? res.code : null)
      const message = !isOk(res) ? res.error : 'Biometric check failed'
      if (code === 'BIOMETRIC_DENIED' || code === 'BIOMETRIC_CANCELLED') {
        this.block(code, message)
        return
      }

      this.fallbackCurrentFlow(code, message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Biometric check failed'
      this.fallbackCurrentFlow('BIOMETRIC_INTERNAL', message)
    }
  }

  private block(code: BiometricAuthCode, message: string): void {
    this.lastErrorCode.set(code)
    this.lastErrorMessage.set(message)
    this.phase.set('blocked')
  }

  private fallbackCurrentFlow(code: BiometricAuthCode, message: string): void {
    this.lastErrorCode.set(code)
    this.lastErrorMessage.set(message)
    this.phase.set('disabled')
    getAppContext().store.pushNotification(
      'warning',
      'Biometric app gate is unavailable for this attempt. Continuing without it.',
    )
    console.warn('[biometric-app-gate] safe fallback', {
      code,
      message,
      entrypoint: this.entrypoint(),
      platform: this.platform(),
    })
  }

  private refreshRuntimeFlags(): void {
    const caps = getRuntimeCapabilities()
    this.platform.set(caps.platform)
    this.mobileRuntime.set(Boolean(caps.mobile))
    this.available.set(Boolean(caps.mobile && caps.supports_biometric))
  }

  private resetState(): void {
    this.refreshRuntimeFlags()
    this.phase.set('idle')
    this.entrypoint.set(null)
    this.loading.set(false)
    this.lastErrorCode.set(null)
    this.lastErrorMessage.set('')
    this.requireBiometricAppGate.set(DEFAULT_SESSION_SETTINGS.require_biometric_app_gate)
  }
}

export const biometricAppGateModel = new BiometricAppGateModel()
