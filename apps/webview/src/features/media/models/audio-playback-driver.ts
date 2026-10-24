import type {ResolvedAudioTrack} from 'root/app/navigation/navigation.types'

export type AudioPlaybackDriverKind = 'web-audio-element' | 'ios-avplayer'

export interface AudioSessionInput {
  readonly tracks: ResolvedAudioTrack[]
  readonly index: number
  readonly autoplay: boolean
}

export interface AudioPlaybackDriver {
  readonly kind: AudioPlaybackDriverKind
  startSession(input: AudioSessionInput): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  stop(): Promise<void>
  seekTo(seconds: number): Promise<void>
  selectTrack(index: number): Promise<void>
  nextTrack(): Promise<void>
  previousTrack(): Promise<void>
}

/** A native session id as logs may show it: its length and last characters, never the whole. */
export function redactNativeSessionId(nativeSessionId: string | null | undefined): string | null {
  if (!nativeSessionId) return null
  return `${nativeSessionId.length}:${nativeSessionId.slice(-6)}`
}

/** The revision of a track's source, when it is a usable positive integer. */
export function resolveTrackSourceRevision(track: ResolvedAudioTrack): number | null {
  const value = track.sourceRevision
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Math.floor(value)
}

/** The native player did not answer a command in time. */
export function isNativeAudioCommandTimeoutError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as {code?: unknown}).code === 'ERR_NATIVE_AUDIO_COMMAND_TIMEOUT'
  )
}
