import {runtimeCapabilitiesAtom} from '../../core/runtime/runtime-capabilities'
import type {TransportEventHandler, TransportLike} from '../../core/transport/transport'
import {tauriInvoke} from '../../core/transport/tauri/ipc'
import {ANDROID_MEDIA_SESSION_CONTROL_EVENT} from '../../features/media/models/android-media-session-events'
import {mediaPlaybackModel, type MediaPlaybackState} from '../../features/media/models/media-playback.model'
import {writeAndroidUnlockDebug} from '../../shared/services/android-unlock-debug'
import {subscribeToSignalChanges} from '../../shared/services/subscribed-signal'

type AndroidMediaSessionSnapshot = {
  active: true
  trackId: number
  title: string
  playbackState: MediaPlaybackState
  positionMs: number
  durationMs: number
  canSeek: boolean
  hasPrevious: boolean
  hasNext: boolean
}

type AndroidMediaSessionActionPayload = {
  action?: unknown
  positionMs?: unknown
}

function finiteMilliseconds(seconds: number | null): number {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.round(seconds * 1_000)
}

function bridgeEnabled(ws: TransportLike): boolean {
  const caps = runtimeCapabilitiesAtom()
  return ws.kind === 'tauri' && caps.platform === 'android' && caps.mobile
}

function buildSnapshot(ws: TransportLike): AndroidMediaSessionSnapshot | null {
  if (!bridgeEnabled(ws)) return null
  if (mediaPlaybackModel.driverKind() === 'android-media3') return null
  if (mediaPlaybackModel.sessionKind() !== 'audio') return null

  const loadingState = mediaPlaybackModel.loadingState()
  if (loadingState === 'idle' || loadingState === 'fallback-limited' || loadingState === 'error') {
    return null
  }

  const track = mediaPlaybackModel.currentTrack()
  if (!track) return null

  return {
    active: true,
    trackId: track.id,
    title: track.name,
    playbackState: mediaPlaybackModel.playbackState(),
    positionMs: finiteMilliseconds(mediaPlaybackModel.currentTime()),
    durationMs: finiteMilliseconds(mediaPlaybackModel.duration()),
    canSeek: mediaPlaybackModel.canSeek(),
    hasPrevious: mediaPlaybackModel.hasPrevious(),
    hasNext: mediaPlaybackModel.hasNext(),
  }
}

function snapshotKey(snapshot: AndroidMediaSessionSnapshot | null): string {
  return snapshot ? JSON.stringify(snapshot) : 'stopped'
}

function snapshotTraceMeta(snapshot: AndroidMediaSessionSnapshot | null): Record<string, unknown> {
  if (!snapshot) return {active: false}

  return {
    active: true,
    trackId: snapshot.trackId,
    playbackState: snapshot.playbackState,
    canSeek: snapshot.canSeek,
    hasPrevious: snapshot.hasPrevious,
    hasNext: snapshot.hasNext,
  }
}

function modelTraceMeta(): Record<string, unknown> {
  const track = mediaPlaybackModel.currentTrack()
  return {
    sessionKind: mediaPlaybackModel.sessionKind(),
    trackId: track?.id ?? null,
    playbackState: mediaPlaybackModel.playbackState(),
    playbackIntent: mediaPlaybackModel.playbackIntent(),
    loadingState: mediaPlaybackModel.loadingState(),
    driverKind: mediaPlaybackModel.driverKind(),
  }
}

export function setupAndroidMediaSessionBridge(ws: TransportLike): () => void {
  let nativeActive = false
  let lastNativeKey = ''
  let syncScheduled = false
  let disposed = false
  let traceSeq = 0

  const trace = (event: string, meta: Record<string, unknown> = {}) => {
    if (!bridgeEnabled(ws)) return
    writeAndroidUnlockDebug('media-playback/android-media-session', event, meta)
    console.debug('[android-media-session]', {
      seq: ++traceSeq,
      event,
      ...meta,
    })
  }

  const sendStop = () => {
    if (!nativeActive) {
      trace('stopSkipped', {reason: 'native_inactive', ...modelTraceMeta()})
      return
    }
    trace('stopSent', modelTraceMeta())
    nativeActive = false
    lastNativeKey = 'stopped'
    void tauriInvoke('android_media_session_stop').catch((error) => {
      console.warn('[android-media-session] failed to stop native session', error)
    })
  }

  const syncNow = () => {
    syncScheduled = false
    if (disposed) return

    const snapshot = buildSnapshot(ws)
    const key = snapshotKey(snapshot)
    if (key === lastNativeKey) {
      trace('snapshotSkipped', {
        reason: 'same_key',
        ...snapshotTraceMeta(snapshot),
        ...modelTraceMeta(),
      })
      return
    }
    lastNativeKey = key

    if (!snapshot) {
      trace('snapshotStopRequested', modelTraceMeta())
      sendStop()
      return
    }

    nativeActive = true
    trace('snapshotSent', {
      ...snapshotTraceMeta(snapshot),
      playbackIntent: mediaPlaybackModel.playbackIntent(),
      loadingState: mediaPlaybackModel.loadingState(),
    })
    void tauriInvoke('android_media_session_update', {snapshot}).catch((error) => {
      console.warn('[android-media-session] failed to update native session', error)
    })
  }

  const scheduleSync = () => {
    if (syncScheduled) {
      trace('snapshotScheduleSkipped', {reason: 'already_scheduled', ...modelTraceMeta()})
      return
    }
    syncScheduled = true
    trace('snapshotScheduled', modelTraceMeta())
    queueMicrotask(syncNow)
  }

  const handleNativeAction: TransportEventHandler = (_message, payload) => {
    if (!payload || typeof payload !== 'object') return
    if (mediaPlaybackModel.driverKind() === 'android-media3') {
      trace('nativeActionIgnored', {
        reason: 'android_media3_active',
        ...modelTraceMeta(),
      })
      return
    }

    const event = payload as AndroidMediaSessionActionPayload
    trace('nativeActionReceived', {
      action: event.action,
      positionMs: typeof event.positionMs === 'number' ? event.positionMs : null,
      before: modelTraceMeta(),
    })
    switch (event.action) {
      case 'play':
        mediaPlaybackModel.requestPlay()
        break
      case 'pause':
        mediaPlaybackModel.requestPause()
        break
      case 'stop':
        void mediaPlaybackModel.stopSession()
        break
      case 'next':
        void mediaPlaybackModel.nextTrack()
        break
      case 'previous':
        void mediaPlaybackModel.previousTrack()
        break
      case 'seekTo':
        if (typeof event.positionMs === 'number' && Number.isFinite(event.positionMs)) {
          mediaPlaybackModel.seekTo(event.positionMs / 1_000)
        }
        break
    }
    if (event.action === 'play' || event.action === 'pause' || event.action === 'seekTo') {
      globalThis.dispatchEvent(new CustomEvent(ANDROID_MEDIA_SESSION_CONTROL_EVENT))
    }
    trace('nativeActionApplied', {
      action: event.action,
      after: modelTraceMeta(),
    })
  }

  ws.on('android-media-session:action', handleNativeAction)

  scheduleSync()

  const subscriptions = [
    subscribeToSignalChanges(runtimeCapabilitiesAtom, scheduleSync),
    subscribeToSignalChanges(mediaPlaybackModel.sessionKind, scheduleSync),
    subscribeToSignalChanges(mediaPlaybackModel.driverKind, scheduleSync),
    subscribeToSignalChanges(mediaPlaybackModel.tracks, scheduleSync),
    subscribeToSignalChanges(mediaPlaybackModel.currentIndex, scheduleSync),
    subscribeToSignalChanges(mediaPlaybackModel.loadingState, scheduleSync),
    subscribeToSignalChanges(mediaPlaybackModel.playbackState, scheduleSync),
    subscribeToSignalChanges(mediaPlaybackModel.seekRequest, scheduleSync),
    subscribeToSignalChanges(mediaPlaybackModel.duration, scheduleSync),
    subscribeToSignalChanges(mediaPlaybackModel.hasPrevious, scheduleSync),
    subscribeToSignalChanges(mediaPlaybackModel.hasNext, scheduleSync),
    subscribeToSignalChanges(mediaPlaybackModel.canSeek, scheduleSync),
  ]

  return () => {
    disposed = true
    ws.off('android-media-session:action', handleNativeAction)
    for (const unsubscribe of subscriptions) unsubscribe()
    sendStop()
  }
}
