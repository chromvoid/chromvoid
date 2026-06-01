import type {
  AndroidAudioCommand,
  AndroidAudioCommandResult,
  AndroidAudioPreparedTrack,
  AndroidAudioTrackInput,
} from 'root/core/transport/transport'
import {runtimeModeModel} from 'root/core/runtime/runtime-mode.model'
import {getAppContext} from 'root/shared/services/app-context'
import type {ResolvedAudioTrack} from 'root/app/navigation/navigation.types'
import {resolveFileFormat} from 'root/utils/file-format-registry'
import type {MediaPlaybackIntent, MediaPlaybackLoadingState, MediaPlaybackSourceKind, MediaPlaybackState} from './media-playback.model'
import type {AudioPlaybackDriver, AudioPlaybackDriverKind, AudioSessionInput} from './audio-playback-driver'

type AndroidMedia3PlaybackDriverHost = {
  setDriverKind(kind: AudioPlaybackDriverKind): void
  setNativeSessionId(nativeSessionId: string | null): void
  setSourceState(state: {url: string | null; kind: MediaPlaybackSourceKind; streamId: string | null}): void
  setLoadingState(state: MediaPlaybackLoadingState): void
  setPlaybackState(state: MediaPlaybackState): void
  setPlaybackIntent(intent: MediaPlaybackIntent): void
  clearSeekRequest(): void
  reconcileAndroidPreparedTracks(tracks: AndroidAudioPreparedTrack[] | undefined): void
}

function createNativeSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `android-audio-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(nowMs() - startedAt))
}

export const ANDROID_MEDIA3_COMMAND_TIMEOUT_MS = 5_000

export class AndroidMedia3CommandTimeoutError extends Error {
  readonly code = 'ERR_NATIVE_AUDIO_COMMAND_TIMEOUT'

  constructor(command: AndroidAudioCommand['command']) {
    super(`Android native audio command timed out: ${command}`)
    this.name = 'AndroidMedia3CommandTimeoutError'
  }
}

class AndroidMedia3CommandRejectedError extends Error {
  readonly code = 'ERR_NATIVE_AUDIO_START_FAILED'

  constructor(command: AndroidAudioCommand['command']) {
    super(`Android native audio command rejected: ${command}`)
    this.name = 'AndroidMedia3CommandRejectedError'
  }
}

export function isAndroidMedia3CommandTimeoutError(error: unknown): error is AndroidMedia3CommandTimeoutError {
  return (
    error instanceof AndroidMedia3CommandTimeoutError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as {code?: unknown}).code === 'ERR_NATIVE_AUDIO_COMMAND_TIMEOUT')
  )
}

function formatAndroidTracePayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

export function redactAndroidNativeSessionId(nativeSessionId: string | null | undefined): string | null {
  if (!nativeSessionId) return null
  return `${nativeSessionId.length}:${nativeSessionId.slice(-6)}`
}

function toPositiveFiniteInteger(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Math.floor(value)
}

export function resolveAndroidTrackSourceRevision(track: ResolvedAudioTrack): number | null {
  return toPositiveFiniteInteger(track.sourceRevision)
}

function resolveAndroidTrackMimeType(
  track: ResolvedAudioTrack,
  options: {allowInferredMimeType: boolean},
): string | undefined {
  const explicitMimeType = track.mediaInfo?.playbackMimeType?.trim() || track.mimeType?.trim()
  if (explicitMimeType && explicitMimeType !== 'application/octet-stream') {
    return explicitMimeType
  }
  if (!options.allowInferredMimeType) {
    return explicitMimeType || undefined
  }

  const inferenceMimeType = explicitMimeType === 'application/octet-stream' ? undefined : explicitMimeType
  const inferred = resolveFileFormat({
    name: track.name,
    mimeType: inferenceMimeType,
    mediaInfo: track.mediaInfo,
  }).mimeType.trim()
  return inferred || explicitMimeType || undefined
}

function toAndroidTrackInput(track: ResolvedAudioTrack): AndroidAudioTrackInput {
  const size = toPositiveFiniteInteger(track.size)
  const sourceRevision = resolveAndroidTrackSourceRevision(track)
  const mimeType = resolveAndroidTrackMimeType(track, {
    allowInferredMimeType: size !== null && sourceRevision !== null,
  })

  if (!toPositiveFiniteInteger(track.id)) {
    throw new Error('Android native audio requires a local track id')
  }

  return {
    trackId: track.id,
    systemTitle: 'ChromVoid audio',
    ...(mimeType ? {mimeType} : {}),
    ...(size ? {size} : {}),
    ...(sourceRevision ? {sourceRevision} : {}),
  }
}

function commandTraceMeta(command: AndroidAudioCommand): Record<string, unknown> {
  const base = {
    command: command.command,
    nativeSessionId: redactAndroidNativeSessionId(command.nativeSessionId),
  }

  if (command.command === 'startSession') {
    return {
      ...base,
      index: command.index,
      autoplay: command.autoplay,
      trackCount: command.tracks.length,
      tracks: command.tracks.map((track) => ({
        trackId: track.trackId,
        sourceRevision: track.sourceRevision,
      })),
    }
  }

  if (command.command === 'seekTo') {
    return {
      ...base,
      positionMs: command.positionMs,
    }
  }

  if (command.command === 'selectTrack') {
    return {
      ...base,
      index: command.index,
    }
  }

  return base
}

export function canUseAndroidMedia3PlaybackForTracks(tracks: ResolvedAudioTrack[]): boolean {
  return tracks.length > 0 && tracks.every((track) => {
    try {
      toAndroidTrackInput(track)
      return true
    } catch {
      return false
    }
  })
}

export class AndroidMedia3PlaybackDriver implements AudioPlaybackDriver {
  readonly kind = 'android-media3'

  private nativeSessionId: string | null = null

  constructor(private readonly host: AndroidMedia3PlaybackDriverHost) {}

  async startSession(input: AudioSessionInput): Promise<void> {
    await this.stop()

    const nativeSessionId = createNativeSessionId()
    const command: AndroidAudioCommand = {
      command: 'startSession',
      nativeSessionId,
      tracks: input.tracks.map(toAndroidTrackInput),
      index: input.index,
      autoplay: input.autoplay,
    }

    this.nativeSessionId = nativeSessionId
    this.host.setDriverKind(this.kind)
    this.host.setNativeSessionId(nativeSessionId)
    this.host.setSourceState({url: null, kind: 'android-media3', streamId: null})
    this.host.clearSeekRequest()
    this.host.setLoadingState('loading')
    this.host.setPlaybackIntent(input.autoplay ? 'play' : 'pause')
    this.host.setPlaybackState(input.autoplay ? 'buffering' : 'paused')

    try {
      const result = await this.send(command)
      if (this.nativeSessionId !== nativeSessionId) return
      this.host.reconcileAndroidPreparedTracks(result?.tracks)
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
      console.warn('[media-playback] Android native audio stop failed', error)
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

  private async send(command: AndroidAudioCommand): Promise<AndroidAudioCommandResult | undefined> {
    const {ws} = getAppContext()
    if (ws.kind !== 'tauri' || typeof ws.sendAndroidAudioCommand !== 'function') {
      throw new Error('Android native audio transport is unavailable')
    }

    const startedAt = nowMs()
    this.trace('commandSend', commandTraceMeta(command))
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new AndroidMedia3CommandTimeoutError(command.command))
        }, ANDROID_MEDIA3_COMMAND_TIMEOUT_MS)
      })
      const result = await Promise.race([ws.sendAndroidAudioCommand(command), timeout])
      if (result?.accepted === false) {
        throw new AndroidMedia3CommandRejectedError(command.command)
      }
      this.trace('commandSent', {
        ...commandTraceMeta(command),
        elapsedMs: elapsedMs(startedAt),
      })
      return result
    } catch (error) {
      if (isAndroidMedia3CommandTimeoutError(error)) {
        this.nativeSessionId = null
        this.trace('commandTimedOut', {
          ...commandTraceMeta(command),
          elapsedMs: elapsedMs(startedAt),
          timeoutMs: ANDROID_MEDIA3_COMMAND_TIMEOUT_MS,
        })
      } else {
        this.trace('commandFailed', {
          ...commandTraceMeta(command),
          elapsedMs: elapsedMs(startedAt),
          error: error instanceof Error ? error.name : typeof error,
        })
      }
      throw error
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  }

  private trace(event: string, meta: Record<string, unknown>): void {
    console.info('[android-media3-playback-driver]', formatAndroidTracePayload({
      event,
      driverKind: this.kind,
      ...meta,
    }))
  }
}

export function disableAndroidMedia3PlaybackForRuntimeSession(reason?: string): void {
  runtimeModeModel.disableAndroidNativeAudioForRuntimeSession(reason ?? 'android_media3_runtime_failure')
}
