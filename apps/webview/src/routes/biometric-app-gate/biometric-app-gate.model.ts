import {atom, computed, wrap} from '@reatom/core'

import {
  DEFAULT_SESSION_SETTINGS,
  loadSessionSettings,
  type SessionSettings,
} from 'root/core/session/session-settings'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {subscribeAfterInitial} from 'root/shared/services/subscribed-signal'

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
  readonly phase = atom<BiometricAppGatePhase>('idle')
  readonly entrypoint = atom<BiometricAppGateEntrypoint>(null)
  readonly platform = atom(getRuntimeCapabilities().platform)
  readonly mobileRuntime = atom(Boolean(getRuntimeCapabilities().mobile))
  readonly available = atom(Boolean(getRuntimeCapabilities().mobile && getRuntimeCapabilities().supports_biometric))
  readonly requireBiometricAppGate = atom(DEFAULT_SESSION_SETTINGS.require_biometric_app_gate)
  readonly loading = atom(false)
  readonly lastErrorCode = atom<BiometricAuthCode | null>(null)
  readonly lastErrorMessage = atom('')

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
    if (this.phase() === 'blocked') return i18n('biometric-app-gate:title-required')
    if (this.phase() === 'prompting') return i18n('biometric-app-gate:title-prompting')
    return i18n('biometric-app-gate:title-checking')
  })
  readonly message = computed(() => {
    if (this.phase() === 'blocked') {
      switch (this.lastErrorCode()) {
        case 'BIOMETRIC_DENIED':
          return i18n('biometric-app-gate:message-denied')
        case 'BIOMETRIC_CANCELLED':
          return i18n('biometric-app-gate:message-cancelled')
        case 'BIOMETRIC_UNAVAILABLE':
          return i18n('biometric-app-gate:message-unavailable')
        case 'BIOMETRIC_INTERNAL':
        default:
          return i18n('biometric-app-gate:message-internal')
      }
    }

    if (this.entrypoint() === 'foreground_resume') {
      return i18n('biometric-app-gate:message-resume')
    }

    return i18n('biometric-app-gate:message-open')
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
    const syncWsConnected = (connected: boolean) => {
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
    }

    syncWsConnected(ws.connected())
    this.unsubscribeWsConnected = subscribeAfterInitial(ws.connected, () => syncWsConnected(ws.connected()))
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
      await wrap(this.promptPromise)
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
      await wrap(this.ensureSessionSettingsLoaded())
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
      await wrap(pending)
    } finally {
      this.loading.set(false)
    }
  }

  private async ensureSessionSettingsLoaded(): Promise<void> {
    if (this.sessionSettingsLoaded) return

    try {
      const settings = await wrap(loadSessionSettings())
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
      const res = await wrap(
        tauriInvoke<RpcResult<BiometricAuthResult>>('mobile_biometric_auth', {
          reason: i18n('biometric-app-gate:reason'),
        }),
      )

      if (isOk(res) && res.result.authenticated) {
        this.phase.set('passed')
        return
      }

      const code = normalizeBiometricErrorCode(!isOk(res) ? res.code : null)
      const message = !isOk(res) ? res.error : 'Biometric check failed'
      this.block(code, message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Biometric check failed'
      this.block('BIOMETRIC_INTERNAL', message)
    }
  }

  private block(code: BiometricAuthCode, message: string): void {
    this.lastErrorCode.set(code)
    this.lastErrorMessage.set(message)
    this.phase.set('blocked')
    console.warn('[biometric-app-gate] prompt blocked', {
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
