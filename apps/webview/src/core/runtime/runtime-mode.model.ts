import {atom, computed} from '@reatom/core'

import {runtimeCapabilitiesAtom} from './runtime-capabilities'

export type RuntimeRemoteHost = {
  type: string
  [key: string]: unknown
}

export type RuntimeCoreMode = 'local' | 'switching' | {remote: {host: RuntimeRemoteHost}}

export type RuntimeModeSwitchResult = {
  current_mode?: RuntimeCoreMode
  remote_core_features?: unknown
}

export type NativeMediaStreamOptions = {
  transportKind?: string | null
}

function isRuntimeCoreMode(value: unknown): value is RuntimeCoreMode {
  if (value === 'local' || value === 'switching') return true
  return (
    typeof value === 'object' &&
    value !== null &&
    'remote' in value &&
    typeof (value as {remote?: unknown}).remote === 'object' &&
    (value as {remote?: unknown}).remote !== null
  )
}

function normalizeRemoteCoreFeatures(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((feature): feature is string => typeof feature === 'string')
    : []
}

class RuntimeModeModel {
  readonly coreMode = atom<RuntimeCoreMode>('local', 'runtime.coreMode')
  readonly nativeMediaStreamDisabledForRuntimeSession = atom(
    false,
    'runtime.nativeMediaStreamDisabledForRuntimeSession',
  )
  readonly androidNativeVideoDisabledForRuntimeSession = atom(
    false,
    'runtime.androidNativeVideoDisabledForRuntimeSession',
  )
  readonly androidNativeAudioDisabledForRuntimeSession = atom(
    false,
    'runtime.androidNativeAudioDisabledForRuntimeSession',
  )
  readonly androidNativeAudioDisabledReasonForRuntimeSession = atom<string | null>(
    null,
    'runtime.androidNativeAudioDisabledReasonForRuntimeSession',
  )
  readonly remoteCoreFeatures = atom<readonly string[]>([], 'runtime.remoteCoreFeatures')

  readonly supportsMediaStreamProtocol = computed<boolean>(() =>
    Boolean(runtimeCapabilitiesAtom().supports_media_stream_protocol),
  )

  readonly supportsNativeVideoPlayback = computed<boolean>(() =>
    Boolean(runtimeCapabilitiesAtom().supports_native_video_playback),
  )

  readonly supportsNativeAudioPlayback = computed<boolean>(() =>
    Boolean(runtimeCapabilitiesAtom().supports_native_audio_playback),
  )

  readonly supportsAndroidNativeVideo = computed<boolean>(() =>
    Boolean(runtimeCapabilitiesAtom().supports_android_native_video),
  )

  readonly androidNativeAudioRolloutEnabled = computed<boolean>(() =>
    Boolean(runtimeCapabilitiesAtom().android_native_audio_playback_rollout_enabled),
  )

  readonly localCoreMode = computed<boolean>(() => this.coreMode() === 'local')

  readonly remoteCoreMode = computed<boolean>(() => {
    const mode = this.coreMode()
    return typeof mode === 'object' && mode !== null && 'remote' in mode
  })

  readonly remoteMediaInspectionSplitAvailable = computed<boolean>(() =>
    this.remoteCoreFeatures().includes('remote_media_inspection_split_v1'),
  )

  readonly remoteMediaInspectionVisibleAllowed = computed<boolean>(
    () => this.localCoreMode() || this.remoteMediaInspectionSplitAvailable(),
  )

  readonly nativeMediaStreamAvailable = computed<boolean>(
    () =>
      this.supportsMediaStreamProtocol() &&
      this.localCoreMode() &&
      !this.nativeMediaStreamDisabledForRuntimeSession(),
  )

  readonly androidNativeVideoAvailable = computed<boolean>(
    () =>
      this.supportsAndroidNativeVideo() &&
      this.localCoreMode() &&
      !this.androidNativeVideoDisabledForRuntimeSession(),
  )

  readonly nativeVideoPlaybackAvailable = computed<boolean>(
    () =>
      this.supportsNativeVideoPlayback() &&
      this.localCoreMode() &&
      !this.androidNativeVideoDisabledForRuntimeSession(),
  )

  readonly nativeAudioPlaybackAvailable = computed<boolean>(
    () =>
      this.supportsNativeAudioPlayback() &&
      this.localCoreMode() &&
      !this.androidNativeAudioDisabledForRuntimeSession(),
  )

  readonly androidNativeAudioAvailable = computed<boolean>(() => {
    const capabilities = runtimeCapabilitiesAtom()
    return (
      capabilities.platform === 'android' &&
      capabilities.mobile &&
      this.androidNativeAudioRolloutEnabled() &&
      this.localCoreMode() &&
      !this.androidNativeAudioDisabledForRuntimeSession()
    )
  })

  setCoreMode(mode: unknown, remoteCoreFeatures: unknown = []): void {
    const nextMode = isRuntimeCoreMode(mode) ? mode : 'switching'
    this.coreMode.set(nextMode)
    this.remoteCoreFeatures.set(
      typeof nextMode === 'object' && nextMode !== null && 'remote' in nextMode
        ? normalizeRemoteCoreFeatures(remoteCoreFeatures)
        : [],
    )
  }

  handleModeChanged(result: RuntimeModeSwitchResult | unknown): void {
    const nextMode =
      typeof result === 'object' && result !== null && 'current_mode' in result
        ? (result as RuntimeModeSwitchResult).current_mode
        : undefined
    const remoteCoreFeatures =
      typeof result === 'object' && result !== null && 'remote_core_features' in result
        ? (result as RuntimeModeSwitchResult).remote_core_features
        : []
    this.setCoreMode(nextMode, remoteCoreFeatures)
  }

  canUseNativeMediaStream(options: NativeMediaStreamOptions = {}): boolean {
    if (options.transportKind && options.transportKind !== 'tauri') return false
    return this.nativeMediaStreamAvailable()
  }

  canUseAndroidNativeVideo(options: NativeMediaStreamOptions = {}): boolean {
    if (options.transportKind && options.transportKind !== 'tauri') return false
    return this.androidNativeVideoAvailable()
  }

  canUseNativeVideoPlayback(options: NativeMediaStreamOptions = {}): boolean {
    if (options.transportKind && options.transportKind !== 'tauri') return false
    return this.nativeVideoPlaybackAvailable()
  }

  canUseAndroidNativeAudio(options: NativeMediaStreamOptions = {}): boolean {
    if (options.transportKind && options.transportKind !== 'tauri') return false
    return this.androidNativeAudioAvailable()
  }

  canUseNativeAudioPlayback(options: NativeMediaStreamOptions = {}): boolean {
    if (options.transportKind && options.transportKind !== 'tauri') return false
    return this.nativeAudioPlaybackAvailable()
  }

  disableNativeMediaStreamForRuntimeSession(): void {
    this.nativeMediaStreamDisabledForRuntimeSession.set(true)
  }

  resetNativeMediaStreamForRuntimeSession(): void {
    this.nativeMediaStreamDisabledForRuntimeSession.set(false)
  }

  disableAndroidNativeVideoForRuntimeSession(): void {
    this.androidNativeVideoDisabledForRuntimeSession.set(true)
  }

  resetAndroidNativeVideoForRuntimeSession(): void {
    this.androidNativeVideoDisabledForRuntimeSession.set(false)
  }

  disableAndroidNativeAudioForRuntimeSession(reason: string | null = 'runtime_failure'): void {
    this.androidNativeAudioDisabledForRuntimeSession.set(true)
    this.androidNativeAudioDisabledReasonForRuntimeSession.set(reason)
  }

  disableNativeAudioPlaybackForRuntimeSession(reason: string | null = 'runtime_failure'): void {
    this.disableAndroidNativeAudioForRuntimeSession(reason)
  }

  resetAndroidNativeAudioForRuntimeSession(): void {
    this.androidNativeAudioDisabledForRuntimeSession.set(false)
    this.androidNativeAudioDisabledReasonForRuntimeSession.set(null)
  }

  handleTransportDisconnect(): void {
    this.coreMode.set('local')
    this.remoteCoreFeatures.set([])
    this.resetNativeMediaStreamForRuntimeSession()
    this.resetAndroidNativeVideoForRuntimeSession()
    this.resetAndroidNativeAudioForRuntimeSession()
  }
}

export const runtimeModeModel = new RuntimeModeModel()
