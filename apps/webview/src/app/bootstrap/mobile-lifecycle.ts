import {
  MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT,
  MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT,
  type MobileFilePickerLifecycleStartDetail,
} from '@chromvoid/password-import'
import {tauriInvoke} from '../../core/transport/tauri/ipc'
import {biometricAppGateModel} from '../../routes/biometric-app-gate/biometric-app-gate.model'
import type {Store} from '../state/store'
import type {TransportLike} from '../../core/transport/transport'

/**
 * Mobile background/foreground lifecycle: privacy mask, biometric gate,
 * and native notify calls.
 */
export const setupMobileLifecycle = (ws: TransportLike, store: Store) => {
  let backgroundNotifyInFlight = false
  let foregroundNotifyInFlight = false
  let externalFilePickerDepth = 0
  let externalFilePickerDeadline = 0
  let externalFilePickerSuppressedHidden = false

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  const expireExternalFilePicker = () => {
    if (
      externalFilePickerDepth > 0 &&
      externalFilePickerDeadline > 0 &&
      now() >= externalFilePickerDeadline
    ) {
      externalFilePickerDepth = 0
      externalFilePickerDeadline = 0
    }
  }

  const externalFilePickerActive = () => {
    expireExternalFilePicker()
    return externalFilePickerDepth > 0
  }

  const notifyBackground = () => {
    if (backgroundNotifyInFlight || ws.kind !== 'tauri' || !store.isMobile()) return
    backgroundNotifyInFlight = true
    void tauriInvoke('mobile_notify_background')
      .catch(() => {})
      .finally(() => {
        backgroundNotifyInFlight = false
      })
  }

  const notifyForeground = () => {
    if (foregroundNotifyInFlight || ws.kind !== 'tauri' || !store.isMobile()) return
    foregroundNotifyInFlight = true
    void tauriInvoke('mobile_notify_foreground')
      .catch(() => {})
      .finally(() => {
        foregroundNotifyInFlight = false
      })
  }

  const setPrivacyMask = (enabled: boolean) => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('mobile-privacy-mask', enabled)
  }

  let surfaceHidden = typeof document !== 'undefined' ? document.visibilityState !== 'visible' : false

  const handleExternalFilePickerStart = (event: Event) => {
    const detail = (event as CustomEvent<MobileFilePickerLifecycleStartDetail | undefined>).detail
    const timeoutMs =
      typeof detail?.timeoutMs === 'number' && detail.timeoutMs > 0 ? detail.timeoutMs : 30_000

    externalFilePickerDepth += 1
    externalFilePickerDeadline = now() + timeoutMs
  }

  const handleExternalFilePickerEnd = () => {
    expireExternalFilePicker()
    if (externalFilePickerDepth > 0) {
      externalFilePickerDepth -= 1
    }
    if (externalFilePickerDepth === 0) {
      externalFilePickerDeadline = 0
    }
  }

  const sync = (hidden: boolean) => {
    if (!store.isMobile() || hidden === surfaceHidden) return
    surfaceHidden = hidden
    setPrivacyMask(hidden)

    if (hidden) {
      if (externalFilePickerActive()) {
        externalFilePickerSuppressedHidden = true
        return
      }
      biometricAppGateModel.handleBackground()
      notifyBackground()
    } else {
      if (externalFilePickerSuppressedHidden) {
        externalFilePickerSuppressedHidden = false
        return
      }
      notifyForeground()
      biometricAppGateModel.handleForegroundResume()
    }
  }

  window.addEventListener(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, handleExternalFilePickerStart)
  window.addEventListener(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT, handleExternalFilePickerEnd)
  document.addEventListener('visibilitychange', () => sync(document.visibilityState !== 'visible'))
  window.addEventListener('pagehide', () => sync(true))
  window.addEventListener('pageshow', () => sync(false))
}
