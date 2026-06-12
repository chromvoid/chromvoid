import {
  MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT,
  MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT,
  type MobileFilePickerLifecycleStartDetail,
} from '@chromvoid/password-import/ui/mobile-file-picker-lifecycle'
import {tauriInvoke} from '../../core/transport/tauri/ipc'
import {biometricAppGateModel} from '../../routes/biometric-app-gate/biometric-app-gate.model'
import type {Store} from '../state/store'
import type {TransportLike} from '../../core/transport/transport'
import {writeAndroidUnlockDebug} from '../../shared/services/android-unlock-debug'
import {purgePreparedFileSources} from '../../features/media/components/file-loader'
import {releaseMediaSourcesForAppBackground} from '../../features/media/models/media-lifecycle'
import {mediaPlaybackModel} from '../../features/media/models/media-playback.model'
import {redactAndroidNativeSessionId} from '../../features/media/models/android-media3-playback-driver'
import {
  ANDROID_NATIVE_VIDEO_LIFECYCLE_END_EVENT,
  ANDROID_NATIVE_VIDEO_LIFECYCLE_START_EVENT,
  type AndroidNativeVideoLifecycleStartDetail,
} from '../../features/media/models/android-native-video-lifecycle'

type MobileNotifyBackgroundResult = {
  locked?: boolean
}

type RpcResult<T> =
  | {ok: true; result: T}
  | {ok: false; error?: string; code?: string}

/**
 * Mobile background/foreground lifecycle: privacy mask, biometric gate,
 * and native notify calls.
 */
export const setupMobileLifecycle = (ws: TransportLike, store: Store) => {
  let backgroundNotifyInFlight = false
  let foregroundNotifyInFlight = false
  let externalActivityDepth = 0
  let externalActivityDeadline = 0
  let externalActivitySuppressedHidden = false

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  const expireExternalActivity = () => {
    if (
      externalActivityDepth > 0 &&
      externalActivityDeadline > 0 &&
      now() >= externalActivityDeadline
    ) {
      externalActivityDepth = 0
      externalActivityDeadline = 0
    }
  }

  const externalActivityActive = () => {
    expireExternalActivity()
    return externalActivityDepth > 0
  }

  const notifyBackground = async (): Promise<boolean> => {
    if (backgroundNotifyInFlight || ws.kind !== 'tauri' || !store.isMobile()) return false
    backgroundNotifyInFlight = true
    writeAndroidUnlockDebug('lifecycle', 'notifyBackground:start')
    try {
      const response =
        await tauriInvoke<RpcResult<MobileNotifyBackgroundResult>>('mobile_notify_background')
      return Boolean(response.ok && response.result?.locked)
    } catch {
      return false
    } finally {
      backgroundNotifyInFlight = false
      writeAndroidUnlockDebug('lifecycle', 'notifyBackground:done')
    }
  }

  const notifyForeground = () => {
    if (foregroundNotifyInFlight || ws.kind !== 'tauri' || !store.isMobile()) return
    foregroundNotifyInFlight = true
    writeAndroidUnlockDebug('lifecycle', 'notifyForeground:start')
    void tauriInvoke('mobile_notify_foreground')
      .catch(() => {})
      .finally(() => {
        foregroundNotifyInFlight = false
        writeAndroidUnlockDebug('lifecycle', 'notifyForeground:done')
      })
  }

  const setPrivacyMask = (enabled: boolean) => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('mobile-privacy-mask', enabled)
  }

  const shouldPreserveAudioOnBackground = () => {
    const loadingState = mediaPlaybackModel.loadingState()
    return (
      mediaPlaybackModel.sessionKind() === 'audio' &&
      mediaPlaybackModel.currentTrack() !== null &&
      mediaPlaybackModel.playbackIntent() === 'play' &&
      loadingState !== 'fallback-limited' &&
      loadingState !== 'error'
    )
  }

  let surfaceHidden = typeof document !== 'undefined' ? document.visibilityState !== 'visible' : false

  const handleExternalActivityStart = (event: Event) => {
    const detail = (event as CustomEvent<MobileFilePickerLifecycleStartDetail | undefined>).detail
    const timeoutMs =
      typeof detail?.timeoutMs === 'number' && detail.timeoutMs > 0 ? detail.timeoutMs : 30_000

    externalActivityDepth += 1
    externalActivityDeadline = now() + timeoutMs
  }

  const handleAndroidNativeVideoStart = (event: Event) => {
    const detail = (event as CustomEvent<AndroidNativeVideoLifecycleStartDetail | undefined>)
      .detail
    const timeoutMs =
      typeof detail?.timeoutMs === 'number' && detail.timeoutMs > 0 ? detail.timeoutMs : 30_000

    externalActivityDepth += 1
    externalActivityDeadline = now() + timeoutMs
  }

  const handleExternalActivityEnd = () => {
    expireExternalActivity()
    if (externalActivityDepth > 0) {
      externalActivityDepth -= 1
    }
    if (externalActivityDepth === 0) {
      externalActivityDeadline = 0
    }
  }

  const sync = (hidden: boolean) => {
    if (!store.isMobile() || hidden === surfaceHidden) return
    surfaceHidden = hidden
    setPrivacyMask(hidden)
    writeAndroidUnlockDebug('lifecycle', 'sync', {
      hidden,
      externalActivityActive: externalActivityActive(),
      suppressedHidden: externalActivitySuppressedHidden,
    })

    if (hidden) {
      if (externalActivityActive()) {
        externalActivitySuppressedHidden = true
        writeAndroidUnlockDebug('lifecycle', 'sync:hidden suppressed by external activity')
        return
      }
      biometricAppGateModel.handleBackground()
      void purgePreparedFileSources('background').catch((error) => {
        console.warn('[dashboard][preview-cache] background purge failed', error)
      })
      const preserveAudioSession = shouldPreserveAudioOnBackground()
      writeAndroidUnlockDebug('lifecycle', 'background:media-release', {
        preserveAudioSession,
        sessionKind: mediaPlaybackModel.sessionKind(),
        trackId: mediaPlaybackModel.currentTrackId(),
        playbackIntent: mediaPlaybackModel.playbackIntent(),
        playbackState: mediaPlaybackModel.playbackState(),
        driverKind: mediaPlaybackModel.driverKind(),
        nativeSessionId: redactAndroidNativeSessionId(mediaPlaybackModel.nativeSessionId()),
        loadingState: mediaPlaybackModel.loadingState(),
      })
      void releaseMediaSourcesForAppBackground({preserveAudioSession}).catch((error) => {
        console.warn('[dashboard][media] background release failed', error)
      })
      void notifyBackground().then((locked) => {
        writeAndroidUnlockDebug('lifecycle', 'notifyBackground:result', {
          locked,
          preserveAudioSession,
          sessionKind: mediaPlaybackModel.sessionKind(),
          trackId: mediaPlaybackModel.currentTrackId(),
          playbackIntent: mediaPlaybackModel.playbackIntent(),
          playbackState: mediaPlaybackModel.playbackState(),
          driverKind: mediaPlaybackModel.driverKind(),
          nativeSessionId: redactAndroidNativeSessionId(mediaPlaybackModel.nativeSessionId()),
          loadingState: mediaPlaybackModel.loadingState(),
        })
        if (locked && mediaPlaybackModel.sessionKind() === 'audio') {
          void mediaPlaybackModel.stopSession()
        }
      })
    } else {
      if (externalActivitySuppressedHidden) {
        externalActivitySuppressedHidden = false
        const stillSuppressed = externalActivityActive()
        writeAndroidUnlockDebug('lifecycle', 'sync:visible clears suppressed hidden', {
          stillSuppressed,
        })
        if (stillSuppressed) {
          return
        }
      }
      notifyForeground()
      biometricAppGateModel.handleForegroundResume()
    }
  }

  const syncFromVisibility = () => {
    sync(document.visibilityState !== 'visible')
  }

  const syncHidden = () => {
    sync(true)
  }

  const syncVisible = () => {
    sync(false)
  }

  const syncFromWindowBlur = () => {
    if (document.visibilityState === 'visible') {
      writeAndroidUnlockDebug('lifecycle', 'sync:blur ignored while visible')
      return
    }
    sync(true)
  }

  window.addEventListener(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, handleExternalActivityStart)
  window.addEventListener(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT, handleExternalActivityEnd)
  window.addEventListener(ANDROID_NATIVE_VIDEO_LIFECYCLE_START_EVENT, handleAndroidNativeVideoStart)
  window.addEventListener(ANDROID_NATIVE_VIDEO_LIFECYCLE_END_EVENT, handleExternalActivityEnd)
  document.addEventListener('visibilitychange', syncFromVisibility)
  document.addEventListener('freeze', syncHidden)
  document.addEventListener('pause', syncHidden)
  document.addEventListener('resume', syncVisible)
  window.addEventListener('pagehide', syncHidden)
  window.addEventListener('pageshow', syncVisible)
  window.addEventListener('blur', syncFromWindowBlur)
  window.addEventListener('focus', syncVisible)
}
