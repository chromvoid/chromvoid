import {navigationModel} from 'root/app/navigation/navigation.model'
import type {ResolvedOverlayState} from 'root/app/navigation/navigation.types'
import {mediaPlaybackModel} from 'root/features/media/models/media-playback.model'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'

function formatAudioDebugPayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

export function traceAudioOverlay(event: string, meta: Record<string, unknown> = {}): void {
  writeAndroidUnlockDebug('media-playback/overlay', event, meta)
  console.info(
    '[media-playback][overlay]',
    formatAudioDebugPayload({
      event,
      ...meta,
    }),
  )
}

type OverlaySessionStartIntent = {
  fileId: number
  trackId: number
  index: number
  token: number
}

export class AudioOverlaySessionSync {
  private overlaySessionStartIntent: OverlaySessionStartIntent | null = null
  private overlaySessionStartToken = 0
  private previousOverlayKind: ResolvedOverlayState['kind'] | null = null

  syncFromPlayback(): void {
    const overlay = navigationModel.snapshot().overlay
    if (overlay?.kind !== 'audio') return
    if (mediaPlaybackModel.sessionKind() !== 'audio') return

    const currentTrack = mediaPlaybackModel.currentTrack()
    if (!currentTrack || overlay.fileId === currentTrack.id) return

    const overlayStartIntent = this.overlaySessionStartIntent
    if (
      overlayStartIntent &&
      overlay.fileId === overlayStartIntent.fileId &&
      currentTrack.id !== overlayStartIntent.trackId
    ) {
      traceAudioOverlay('overlayReplaceSkipped', {
        reason: 'overlay_session_start_pending',
        overlayFileId: overlay.fileId,
        pendingIndex: overlayStartIntent.index,
        pendingTrackId: overlayStartIntent.trackId,
        currentTrackId: currentTrack.id,
        currentIndex: mediaPlaybackModel.currentIndex(),
      })
      return
    }

    const overlayTrackIsInCurrentSession = mediaPlaybackModel
      .tracks()
      .some((track) => track.id === overlay.fileId)
    if (!overlayTrackIsInCurrentSession) return

    traceAudioOverlay('overlayReplaceFromPlayback', {
      previousFileId: overlay.fileId,
      nextFileId: currentTrack.id,
      currentIndex: mediaPlaybackModel.currentIndex(),
    })
    navigationModel.openAudio(currentTrack.id, 'replace')
  }

  syncFromOverlay(): void {
    const overlay = navigationModel.resolvedOverlay()
    const previousOverlayKind = this.previousOverlayKind
    this.previousOverlayKind = overlay.kind

    if (overlay.kind !== 'audio') {
      this.overlaySessionStartIntent = null
      if (previousOverlayKind === 'audio' && mediaPlaybackModel.sessionKind() === 'audio') {
        traceAudioOverlay('overlayClosedMinimizePlayer', {
          previousTrackId: mediaPlaybackModel.currentTrackId(),
          driverKind: mediaPlaybackModel.driverKind(),
          fullPlayerOpen: mediaPlaybackModel.fullPlayerOpen(),
        })
        mediaPlaybackModel.minimizeFullPlayer()
      }
      return
    }

    const track = overlay.tracks[overlay.index]
    if (!track) {
      this.overlaySessionStartIntent = null
      traceAudioOverlay('overlaySyncSkipped', {
        reason: 'track_missing',
        overlayFileId: overlay.fileId,
        overlayIndex: overlay.index,
        trackCount: overlay.tracks.length,
      })
      return
    }

    const current = mediaPlaybackModel.currentTrack()
    const sameTrack = mediaPlaybackModel.sessionKind() === 'audio' && current?.id === track.id
    traceAudioOverlay('overlaySyncRequested', {
      overlayFileId: overlay.fileId,
      overlayIndex: overlay.index,
      overlayTrackId: track.id,
      trackCount: overlay.tracks.length,
      currentTrackId: current?.id ?? null,
      sessionKind: mediaPlaybackModel.sessionKind(),
      driverKind: mediaPlaybackModel.driverKind(),
      sameTrack,
      fullPlayerOpen: mediaPlaybackModel.fullPlayerOpen(),
    })
    if (!sameTrack) {
      const token = ++this.overlaySessionStartToken
      this.overlaySessionStartIntent = {
        fileId: overlay.fileId,
        trackId: track.id,
        index: overlay.index,
        token,
      }
      traceAudioOverlay('overlayStartsSession', {
        overlayFileId: overlay.fileId,
        overlayIndex: overlay.index,
        overlayTrackId: track.id,
        currentTrackId: current?.id ?? null,
        autoplay: true,
      })
      void mediaPlaybackModel.startAudioSession(overlay.tracks, overlay.index, {autoplay: true}).finally(() => {
        if (this.overlaySessionStartIntent?.token === token) {
          this.overlaySessionStartIntent = null
        }
      })
      return
    }

    this.overlaySessionStartIntent = null
    traceAudioOverlay('overlayOpensFullPlayer', {
      overlayFileId: overlay.fileId,
      overlayIndex: overlay.index,
      overlayTrackId: track.id,
    })
    mediaPlaybackModel.openFullPlayer()
  }

  reset(): void {
    this.overlaySessionStartIntent = null
    this.previousOverlayKind = null
  }
}
