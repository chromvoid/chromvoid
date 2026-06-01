import type {TransportLike} from '../../core/transport/transport'
import {runtimeModeModel} from '../../core/runtime/runtime-mode.model'
import {mediaPlaybackModel} from '../../features/media/models/media-playback.model'
import {writeAndroidUnlockDebug} from '../../shared/services/android-unlock-debug'
import {subscribeToSignalChanges} from '../../shared/services/subscribed-signal'

const ANDROID_AUDIO_WARMUP_MIN_INTERVAL_MS = 60_000

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

export function setupAndroidAudioWarmup(ws: TransportLike): () => void {
  let inFlight = false
  let lastWarmupAt = Number.NEGATIVE_INFINITY

  const canWarmup = (): boolean =>
    ws.kind === 'tauri' &&
    typeof ws.warmupAndroidAudio === 'function' &&
    (typeof document === 'undefined' || document.visibilityState === 'visible') &&
    runtimeModeModel.canUseAndroidNativeAudio({transportKind: ws.kind}) &&
    mediaPlaybackModel.driverKind() !== 'android-media3'

  const warmup = (reason: string): void => {
    if (!canWarmup() || inFlight) return
    const now = nowMs()
    if (now - lastWarmupAt < ANDROID_AUDIO_WARMUP_MIN_INTERVAL_MS) return

    inFlight = true
    lastWarmupAt = now
    writeAndroidUnlockDebug('media-playback/android-audio', 'warmup:start', {reason})
    void ws.warmupAndroidAudio!()
      .then((accepted) => {
        writeAndroidUnlockDebug('media-playback/android-audio', 'warmup:done', {
          reason,
          accepted,
        })
      })
      .catch((error) => {
        writeAndroidUnlockDebug('media-playback/android-audio', 'warmup:failed', {
          reason,
          error: error instanceof Error ? error.name : typeof error,
        })
      })
      .finally(() => {
        inFlight = false
      })
  }

  const sync = (): void => {
    warmup('sync')
  }
  const handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') warmup('visible')
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
  sync()

  const unsubscribeConnected = subscribeToSignalChanges(ws.connected, (connected) => {
    if (connected) warmup('transport_connected')
  })
  const unsubscribeNativeAudio = subscribeToSignalChanges(runtimeModeModel.androidNativeAudioAvailable, (available) => {
    if (available) warmup('native_audio_available')
  })

  return () => {
    unsubscribeConnected()
    unsubscribeNativeAudio()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }
}
