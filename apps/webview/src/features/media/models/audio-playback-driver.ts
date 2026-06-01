import type {ResolvedAudioTrack} from 'root/app/navigation/navigation.types'

export type AudioPlaybackDriverKind = 'web-audio-element' | 'android-media3' | 'ios-avplayer'

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
