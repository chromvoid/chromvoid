import {atom, computed} from '@reatom/core'

import {runtimeCapabilitiesAtom} from './runtime-capabilities'
import {
  desktopNativeVideoProbeAllows,
  loopbackHttpProbeAllows,
  mobileNativeVideoProbeAllows,
  mseControllerProbeAllows,
  runtimeMediaProbeStateAtom,
} from './runtime-media-probes'

export type RuntimeRemoteHost = {
  type: string
  [key: string]: unknown
}

export type RuntimeCoreMode = 'local' | 'switching' | {remote: {host: RuntimeRemoteHost}}

export type RuntimeModeSwitchResult = {
  current_mode?: RuntimeCoreMode
  remote_core_features?: unknown
  transport_session_generation?: unknown
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

function normalizeTransportSessionGeneration(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

class RuntimeModeModel {
  readonly coreMode = atom<RuntimeCoreMode>('local', 'runtime.coreMode')
  readonly nativeMediaStreamDisabledForRuntimeSession = atom(
    false,
    'runtime.nativeMediaStreamDisabledForRuntimeSession',
  )
  readonly nativeVideoDisabledForRuntimeSession = atom(
    false,
    'runtime.nativeVideoDisabledForRuntimeSession',
  )
  readonly nativeAudioDisabledForRuntimeSession = atom(
    false,
    'runtime.nativeAudioDisabledForRuntimeSession',
  )
  readonly nativeAudioDisabledReasonForRuntimeSession = atom<string | null>(
    null,
    'runtime.nativeAudioDisabledReasonForRuntimeSession',
  )
  readonly remoteCoreFeatures = atom<readonly string[]>([], 'runtime.remoteCoreFeatures')
  readonly transportSessionGeneration = atom<number | null>(null, 'runtime.transportSessionGeneration')

  readonly supportsMediaStreamProtocol = computed<boolean>(() =>
    Boolean(runtimeCapabilitiesAtom().supports_media_stream_protocol),
  )

  readonly supportsNativeVideoPlayback = computed<boolean>(() =>
    Boolean(runtimeCapabilitiesAtom().supports_native_video_playback),
  )

  readonly supportsMediaHttpStream = computed<boolean>(() =>
    Boolean(runtimeCapabilitiesAtom().supports_media_http_stream),
  )

  readonly supportsMseVideoPlayback = computed<boolean>(() =>
    Boolean(runtimeCapabilitiesAtom().supports_mse_video_playback),
  )

  readonly supportsDesktopNativeVideoPlayback = computed<boolean>(() =>
    Boolean(runtimeCapabilitiesAtom().supports_desktop_native_video_playback),
  )

  readonly supportsMobileNativeVideoPlayback = computed<boolean>(() =>
    Boolean(runtimeCapabilitiesAtom().supports_mobile_native_video_playback),
  )

  readonly supportsNativeAudioPlayback = computed<boolean>(() =>
    Boolean(runtimeCapabilitiesAtom().supports_native_audio_playback),
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
      (this.localCoreMode() || this.remoteCoreMode()) &&
      !this.nativeMediaStreamDisabledForRuntimeSession(),
  )

  readonly httpVideoSourceAvailable = computed<boolean>(() => {
    const capabilities = runtimeCapabilitiesAtom()
    const mediaProbes = runtimeMediaProbeStateAtom()
    return (
      capabilities.desktop &&
      this.supportsMediaHttpStream() &&
      loopbackHttpProbeAllows(mediaProbes) &&
      (this.localCoreMode() || this.remoteCoreMode()) &&
      !this.nativeMediaStreamDisabledForRuntimeSession()
    )
  })

  readonly mseVideoPlaybackAvailable = computed<boolean>(
    () =>
      this.supportsMseVideoPlayback() &&
      mseControllerProbeAllows(runtimeMediaProbeStateAtom()) &&
      this.httpVideoSourceAvailable(),
  )

  readonly desktopNativeVideoSourceAvailable = computed<boolean>(() => {
    const capabilities = runtimeCapabilitiesAtom()
    const mediaProbes = runtimeMediaProbeStateAtom()
    return (
      capabilities.desktop &&
      this.supportsNativeVideoPlayback() &&
      this.supportsDesktopNativeVideoPlayback() &&
      desktopNativeVideoProbeAllows(mediaProbes) &&
      (this.localCoreMode() || this.remoteCoreMode()) &&
      !this.nativeVideoDisabledForRuntimeSession()
    )
  })

  readonly mobileNativeVideoSourceAvailable = computed<boolean>(() => {
    const capabilities = runtimeCapabilitiesAtom()
    const mediaProbes = runtimeMediaProbeStateAtom()
    return (
      capabilities.mobile &&
      this.supportsNativeVideoPlayback() &&
      this.supportsMobileNativeVideoPlayback() &&
      mobileNativeVideoProbeAllows(mediaProbes) &&
      (this.localCoreMode() || this.remoteCoreMode()) &&
      !this.nativeVideoDisabledForRuntimeSession()
    )
  })

  readonly nativeVideoPlaybackAvailable = computed<boolean>(() => {
    const capabilities = runtimeCapabilitiesAtom()
    const mediaProbes = runtimeMediaProbeStateAtom()
    const nativeProbeAllowed = capabilities.mobile
      ? mobileNativeVideoProbeAllows(mediaProbes)
      : capabilities.desktop
        ? desktopNativeVideoProbeAllows(mediaProbes)
        : true
    return (
      this.supportsNativeVideoPlayback() &&
      nativeProbeAllowed &&
      (this.localCoreMode() || this.remoteCoreMode()) &&
      !this.nativeVideoDisabledForRuntimeSession()
    )
  })

  readonly nativeAudioPlaybackAvailable = computed<boolean>(
    () =>
      this.supportsNativeAudioPlayback() &&
      (this.localCoreMode() || this.remoteCoreMode()) &&
      !this.nativeAudioDisabledForRuntimeSession(),
  )

  setCoreMode(
    mode: unknown,
    remoteCoreFeatures: unknown = [],
    transportSessionGeneration: unknown = null,
  ): void {
    const nextMode = isRuntimeCoreMode(mode) ? mode : 'switching'
    const isRemote = typeof nextMode === 'object' && nextMode !== null && 'remote' in nextMode
    this.coreMode.set(nextMode)
    this.remoteCoreFeatures.set(isRemote ? normalizeRemoteCoreFeatures(remoteCoreFeatures) : [])
    this.transportSessionGeneration.set(
      isRemote ? normalizeTransportSessionGeneration(transportSessionGeneration) : null,
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
    const transportSessionGeneration =
      typeof result === 'object' && result !== null && 'transport_session_generation' in result
        ? (result as RuntimeModeSwitchResult).transport_session_generation
        : null
    this.setCoreMode(nextMode, remoteCoreFeatures, transportSessionGeneration)
  }

  canUseNativeMediaStream(options: NativeMediaStreamOptions = {}): boolean {
    if (options.transportKind && options.transportKind !== 'tauri') return false
    return this.nativeMediaStreamAvailable()
  }

  canUseMediaStreamSource(options: NativeMediaStreamOptions = {}): boolean {
    if (options.transportKind && options.transportKind !== 'tauri') return false
    return !this.nativeMediaStreamDisabledForRuntimeSession()
  }

  canUseHttpVideoSource(options: NativeMediaStreamOptions = {}): boolean {
    if (options.transportKind && options.transportKind !== 'tauri') return false
    return this.httpVideoSourceAvailable()
  }

  canUseMseVideoPlayback(options: NativeMediaStreamOptions = {}): boolean {
    if (options.transportKind && options.transportKind !== 'tauri') return false
    return this.mseVideoPlaybackAvailable()
  }

  canUseDesktopNativeVideoSource(options: NativeMediaStreamOptions = {}): boolean {
    if (options.transportKind && options.transportKind !== 'tauri') return false
    return this.desktopNativeVideoSourceAvailable()
  }

  canUseMobileNativeVideoSource(options: NativeMediaStreamOptions = {}): boolean {
    if (options.transportKind && options.transportKind !== 'tauri') return false
    return this.mobileNativeVideoSourceAvailable()
  }

  canUseNativeVideoPlayback(options: NativeMediaStreamOptions = {}): boolean {
    if (options.transportKind && options.transportKind !== 'tauri') return false
    return this.nativeVideoPlaybackAvailable()
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

  disableNativeVideoForRuntimeSession(): void {
    this.nativeVideoDisabledForRuntimeSession.set(true)
  }

  resetNativeVideoForRuntimeSession(): void {
    this.nativeVideoDisabledForRuntimeSession.set(false)
  }

  disableNativeAudioPlaybackForRuntimeSession(reason: string | null = 'runtime_failure'): void {
    this.nativeAudioDisabledForRuntimeSession.set(true)
    this.nativeAudioDisabledReasonForRuntimeSession.set(reason)
  }

  resetNativeAudioPlaybackForRuntimeSession(): void {
    this.nativeAudioDisabledForRuntimeSession.set(false)
    this.nativeAudioDisabledReasonForRuntimeSession.set(null)
  }

  handleTransportDisconnect(): void {
    this.coreMode.set('local')
    this.remoteCoreFeatures.set([])
    this.transportSessionGeneration.set(null)
    this.resetNativeMediaStreamForRuntimeSession()
    this.resetNativeVideoForRuntimeSession()
    this.resetNativeAudioPlaybackForRuntimeSession()
  }
}

export const runtimeModeModel = new RuntimeModeModel()
