import type {
  NativeAudioCommand,
  NativeAudioCommandResult,
  NativeAudioPreparedTrack,
  NativeAudioTrackInput,
} from 'root/core/transport/transport'
import {runtimeModeModel} from 'root/core/runtime/runtime-mode.model'
import {getAppContext} from 'root/shared/services/app-context'
import type {ResolvedAudioTrack} from 'root/app/navigation/navigation.types'
import {resolveFileFormat} from 'root/utils/file-format-registry'
import type {MediaPlaybackIntent, MediaPlaybackLoadingState, MediaPlaybackSourceKind, MediaPlaybackState} from './media-playback.model'
import type {AudioPlaybackDriver, AudioPlaybackDriverKind, AudioSessionInput} from './audio-playback-driver'
import {resolveAndroidTrackSourceRevision} from './android-media3-playback-driver'

type IosAvPlayerPlaybackDriverHost = {
  setDriverKind(kind: AudioPlaybackDriverKind): void
  setNativeSessionId(nativeSessionId: string | null): void
  setSourceState(state: {url: string | null; kind: MediaPlaybackSourceKind; streamId: string | null}): void
  setLoadingState(state: MediaPlaybackLoadingState): void
  setPlaybackState(state: MediaPlaybackState): void
  setPlaybackIntent(intent: MediaPlaybackIntent): void
  clearSeekRequest(): void
  reconcileNativePreparedTracks(tracks: NativeAudioPreparedTrack[] | undefined): void
}

function createNativeSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `ios-audio-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function toPositiveFiniteInteger(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Math.floor(value)
}

function resolveNativeTrackMimeType(track: ResolvedAudioTrack): string | undefined {
  const explicitMimeType = track.mediaInfo?.playbackMimeType?.trim() || track.mimeType?.trim()
  if (explicitMimeType && explicitMimeType !== 'application/octet-stream') {
    return explicitMimeType
  }

  const inferred = resolveFileFormat({
    name: track.name,
    mimeType: explicitMimeType === 'application/octet-stream' ? undefined : explicitMimeType,
    mediaInfo: track.mediaInfo,
  }).mimeType.trim()
  return inferred || explicitMimeType || undefined
}

function toNativeTrackInput(track: ResolvedAudioTrack): NativeAudioTrackInput {
  const size = toPositiveFiniteInteger(track.size)
  const sourceRevision = resolveAndroidTrackSourceRevision(track)
  const mimeType = resolveNativeTrackMimeType(track)

  if (!toPositiveFiniteInteger(track.id)) {
    throw new Error('iOS native audio requires a local track id')
  }

  return {
    trackId: track.id,
    systemTitle: 'ChromVoid audio',
    ...(mimeType ? {mimeType} : {}),
    ...(size ? {size} : {}),
    ...(sourceRevision ? {sourceRevision} : {}),
  }
}

export function canUseIosAvPlayerPlaybackForTracks(tracks: ResolvedAudioTrack[]): boolean {
  return tracks.length > 0 && tracks.every((track) => {
    try {
      toNativeTrackInput(track)
      return true
    } catch {
      return false
    }
  })
}

class IosAvPlayerCommandRejectedError extends Error {
  readonly code = 'ERR_NATIVE_AUDIO_START_FAILED'

  constructor(command: NativeAudioCommand['command']) {
    super(`iOS native audio command rejected: ${command}`)
    this.name = 'IosAvPlayerCommandRejectedError'
  }
}

export class IosAvPlayerPlaybackDriver implements AudioPlaybackDriver {
  readonly kind = 'ios-avplayer'

  private nativeSessionId: string | null = null

  constructor(private readonly host: IosAvPlayerPlaybackDriverHost) {}

  async startSession(input: AudioSessionInput): Promise<void> {
    await this.stop()

    const nativeSessionId = createNativeSessionId()
    const command: NativeAudioCommand = {
      command: 'startSession',
      nativeSessionId,
      tracks: input.tracks.map(toNativeTrackInput),
      index: input.index,
      autoplay: input.autoplay,
    }

    this.nativeSessionId = nativeSessionId
    this.host.setDriverKind(this.kind)
    this.host.setNativeSessionId(nativeSessionId)
    this.host.setSourceState({url: null, kind: 'ios-avplayer', streamId: null})
    this.host.clearSeekRequest()
    this.host.setLoadingState('loading')
    this.host.setPlaybackIntent(input.autoplay ? 'play' : 'pause')
    this.host.setPlaybackState(input.autoplay ? 'buffering' : 'paused')

    try {
      const result = await this.send(command)
      if (this.nativeSessionId !== nativeSessionId) return
      this.host.reconcileNativePreparedTracks(result?.tracks)
    } catch (error) {
      if (this.nativeSessionId === nativeSessionId) {
        this.nativeSessionId = null
        this.host.setNativeSessionId(null)
        this.host.setSourceState({url: null, kind: 'none', streamId: null})
      }
      throw error
    }
  }

  async play(): Promise<void> {
    await this.sendSessionCommand('play')
  }

  async pause(): Promise<void> {
    await this.sendSessionCommand('pause')
  }

  async stop(): Promise<void> {
    const nativeSessionId = this.nativeSessionId
    this.nativeSessionId = null
    this.host.setNativeSessionId(null)
    this.host.setSourceState({url: null, kind: 'none', streamId: null})

    if (!nativeSessionId) return

    await this.send({
      command: 'stop',
      nativeSessionId,
    }).catch((error) => {
      console.warn('[media-playback] iOS native audio stop failed', error)
    })
  }

  async seekTo(seconds: number): Promise<void> {
    const nativeSessionId = this.nativeSessionId
    if (!nativeSessionId || !Number.isFinite(seconds)) return
    await this.send({
      command: 'seekTo',
      nativeSessionId,
      positionMs: Math.max(0, Math.round(seconds * 1000)),
    })
  }

  async selectTrack(index: number): Promise<void> {
    const nativeSessionId = this.nativeSessionId
    if (!nativeSessionId) return
    await this.send({
      command: 'selectTrack',
      nativeSessionId,
      index,
    })
  }

  async nextTrack(): Promise<void> {
    await this.sendSessionCommand('nextTrack')
  }

  async previousTrack(): Promise<void> {
    await this.sendSessionCommand('previousTrack')
  }

  private async sendSessionCommand(command: 'play' | 'pause' | 'nextTrack' | 'previousTrack'): Promise<void> {
    const nativeSessionId = this.nativeSessionId
    if (!nativeSessionId) return
    await this.send({
      command,
      nativeSessionId,
    })
  }

  private async send(command: NativeAudioCommand): Promise<NativeAudioCommandResult | undefined> {
    const {ws} = getAppContext()
    if (ws.kind !== 'tauri' || typeof ws.sendNativeAudioCommand !== 'function') {
      throw new Error('iOS native audio transport is unavailable')
    }

    const result = await ws.sendNativeAudioCommand(command)
    if (result?.accepted === false) {
      throw new IosAvPlayerCommandRejectedError(command.command)
    }
    return result
  }
}

export function disableIosAvPlayerPlaybackForRuntimeSession(reason?: string): void {
  runtimeModeModel.disableNativeAudioPlaybackForRuntimeSession(reason ?? 'ios_avplayer_runtime_failure')
}
