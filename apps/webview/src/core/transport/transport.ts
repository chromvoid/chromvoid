import type {RuntimeCapabilities} from '../runtime/runtime-capabilities'
import type {
  CatalogFileReplaceOptions,
  CatalogFileReplaceResult,
  CatalogSourceMetadata,
} from '../catalog/catalog'

export type Atom<T> = {
  (): T
  set: (v: T) => void
  subscribe: (cb: (v: T) => void) => () => void
}

export type TransportEventHandler<TPayload = unknown> = (message: unknown, payload: TPayload) => void

export type PreparedPreviewFileVariant = 'raw' | 'preview-image' | 'thumbnail-image'
export type PreviewCachePurgeReason = 'startup' | 'vault-lock' | 'background' | 'session-end' | 'test'

export type MediaStreamErrorCode =
  | 'ERR_MEDIA_STREAM_NOT_FOUND'
  | 'ERR_MEDIA_STREAM_LOCKED'
  | 'ERR_MEDIA_STREAM_STALE'
  | 'ERR_MEDIA_RANGE_INVALID'
  | 'ERR_MEDIA_RANGE_REQUIRED'
  | 'ERR_MEDIA_RANGE_READ_FAILED'
  | 'ERR_MEDIA_UNSUPPORTED'
  | 'ERR_MEDIA_SOURCE_LOAD_FAILED'

export type MediaStreamErrorEvent = {
  streamId: string
  code: MediaStreamErrorCode
  httpStatus?: number | null
  nodeId?: number | null
  sourceRevision?: number | null
}

export type PreparedPreviewFileSource = {
  kind: 'asset-file' | 'content-uri'
  previewId: string
  path: string
  url: string
  name: string
  mimeType: string
  size: number
  variant: PreparedPreviewFileVariant
}

export type PreparedMediaStreamSource = {
  kind: 'media-stream'
  streamId: string
  url: string
  name: string
  mimeType: string
  size: number
  sourceRevision: number
  expiresAt: number
}

export type PreparedAndroidVideoSource = {
  kind: 'android-native-video'
  token: string
  mimeType: string
  size: number
  sourceRevision: number
}

export type AndroidVideoPlayerEvent = {
  token: string
  event: 'started' | 'ready' | 'buffering' | 'idle' | 'ended' | 'error' | 'released'
  positionMs?: number
  durationMs?: number
  error?: string
}

export type AndroidAudioErrorCode =
  | 'ERR_NATIVE_AUDIO_RANGE_INVALID'
  | 'ERR_NATIVE_AUDIO_SOURCE_READ'
  | 'ERR_NATIVE_AUDIO_SOURCE_STALE'
  | 'ERR_NATIVE_AUDIO_VAULT_LOCKED'
  | 'ERR_NATIVE_AUDIO_UNSUPPORTED'
  | 'ERR_NATIVE_AUDIO_SESSION_STALE'
  | 'ERR_NATIVE_AUDIO_START_FAILED'
  | 'ERR_NATIVE_AUDIO_COMMAND_TIMEOUT'

export type AndroidAudioTrackInput = {
  trackId: number
  systemTitle: 'ChromVoid audio'
  mimeType?: string
  size?: number
  sourceRevision?: number
}

export type AndroidAudioPreparedTrack = {
  trackId: number
  mimeType: string
  size: number
  sourceRevision: number
}

export type AndroidAudioCommand =
  | {
      command: 'startSession'
      nativeSessionId: string
      tracks: AndroidAudioTrackInput[]
      index: number
      autoplay: boolean
    }
  | {
      command: 'play' | 'pause' | 'stop' | 'nextTrack' | 'previousTrack'
      nativeSessionId: string
    }
  | {command: 'seekTo'; nativeSessionId: string; positionMs: number}
  | {command: 'selectTrack'; nativeSessionId: string; index: number}

export type AndroidAudioCommandResult = {
  accepted: boolean
  tracks?: AndroidAudioPreparedTrack[]
}

export type AndroidAudioReleaseReason = 'service_destroyed' | 'system_stop'

export type AndroidAudioPlayerEvent = {
  event: 'state' | 'error' | 'ended' | 'released'
  nativeSessionId: string
  trackId?: number
  sourceRevision?: number
  index?: number
  playbackState?: 'preparing' | 'paused' | 'playing' | 'buffering' | 'stopped' | 'error'
  playbackIntent?: 'play' | 'pause' | 'stop'
  loadingState?: 'idle' | 'loading' | 'loaded' | 'error'
  positionMs?: number
  durationMs?: number
  hasPrevious?: boolean
  hasNext?: boolean
  canSeek?: boolean
  code?: AndroidAudioErrorCode | string
  reason?: AndroidAudioReleaseReason | string
  recoverable?: boolean
}

export type NativeAudioTrackInput = AndroidAudioTrackInput
export type NativeAudioPreparedTrack = AndroidAudioPreparedTrack
export type NativeAudioCommand = AndroidAudioCommand
export type NativeAudioCommandResult = AndroidAudioCommandResult
export type NativeAudioPlayerEvent = AndroidAudioPlayerEvent

export type NativeUploadFile = {
  fileId: string
  nodeId?: number
  name: string
  mimeType?: string | null
  totalBytes: number
}

export type NativeUploadProgress = {
  uploadId: string
  fileId: string
  nodeId?: number
  loadedBytes: number
  totalBytes: number
  percent?: number | null
  importProvenanceStatus?: 'preserved' | 'at_risk' | 'not_applicable' | 'unknown' | string | null
  mediaLocationPermissionStatus?: string | null
  requireOriginalStatus?: string | null
}

export type NativeUploadCompleted = NativeUploadProgress

export type NativeUploadFailed = {
  uploadId: string
  fileId?: string
  message: string
  code?: string | null
}

export type NativeUploadOptions = {
  uploadId?: string
  readChunkSize?: number
  onSelected?: (files: NativeUploadFile[]) => void
  onProgress?: (progress: NativeUploadProgress) => void
  onCompleted?: (progress: NativeUploadCompleted) => void
  onFailed?: (failed: NativeUploadFailed) => void
}

export type PreviewCachePurgeResult = {
  filesRemoved: number
  directoriesRemoved: number
  bytesRemoved: number
  skippedEntries: number
}

export type ImagePhotoGpsMetadata = {
  latitude: number
  longitude: number
  altitudeMeters?: number | null
}

export type ImagePhotoImportProvenance = {
  sourceRevision: number
  platform: string
  imageCandidate: boolean
  permissionStatus: 'not_required' | 'granted' | 'denied' | 'unknown' | string
  requireOriginalStatus: string
  originalStreamUsed: boolean
  regularStreamFallback: boolean
  uriScheme?: string | null
  uriAuthority?: string | null
  capturedAtMs?: number | null
}

export type ImagePhotoGpsDiagnostic = {
  status:
    | 'available'
    | 'not_image'
    | 'source_too_large'
    | 'not_found'
    | 'invalid'
    | 'extractor_failed'
    | string
  rustExifStatus?: string | null
  xmpStatus?: string | null
  androidStatus?: string | null
  importProvenanceStatus?: string | null
}

export type ImagePhotoMetadata = {
  width?: number | null
  height?: number | null
  dateTaken?: string | null
  cameraMake?: string | null
  cameraModel?: string | null
  lensModel?: string | null
  exposureTime?: string | null
  aperture?: string | null
  iso?: number | null
  focalLength?: string | null
  orientation?: string | null
  gps?: ImagePhotoGpsMetadata | null
  importProvenance?: ImagePhotoImportProvenance | null
  gpsDiagnostic?: ImagePhotoGpsDiagnostic | null
  sourceRevision?: number | null
}

export type TransportLike = {
  kind: 'ws' | 'tauri'

  connected: Atom<boolean>
  connecting: Atom<boolean>
  lastError: Atom<string | undefined>

  connect(): void
  disconnect(): void

  on(event: string, handler: TransportEventHandler): void
  off(event: string, handler: TransportEventHandler): void

  getRuntimeCapabilities?: () => RuntimeCapabilities

  sendCatalog(command: string, data: Record<string, unknown>): Promise<unknown>
  sendPassmanager(command: string, data: Record<string, unknown>): Promise<unknown>

  uploadFile(
    target: number | {parentPath?: string; name: string},
    file: File,
    opts?: {
      chunkSize?: number
      name?: string
      type?: string
      onProgress?: (c: number, t: number, p: number) => void
    },
  ): Promise<{nodeId: number}>

  // Optional fast path for Desktop (Tauri): upload directly from a native file path.
  // Web runtimes can't access paths for security reasons.
  statPath?: (path: string) => Promise<{name: string; size: number}>
  uploadFilePath?: (
    target: number | {parentPath?: string; name: string},
    path: string,
    opts?: {
      uploadId?: string
      chunkSize?: number
      totalBytes?: number
      onProgress?: (c: number, t: number, p: number) => void
    },
  ) => Promise<{nodeId: number}>

  uploadNativeFiles?: (
    parentPath: string,
    opts?: NativeUploadOptions,
  ) => Promise<void>

  uploadSharedFiles?: (
    parentPath: string,
    sharedSessionId: string,
    opts?: NativeUploadOptions,
  ) => Promise<void>

  uploadAndroidSharedFiles?: (
    parentPath: string,
    shareSessionId: string,
    opts?: NativeUploadOptions,
  ) => Promise<void>

  cancelSharedFiles?: (sharedSessionId: string) => Promise<void>
  cancelAndroidSharedFiles?: (shareSessionId: string) => Promise<void>
  startNativeOtpQrScan?: (scanId: string) => Promise<void>
  cancelNativeOtpQrScan?: (scanId: string) => Promise<void>

  downloadFilePath?: (
    nodeId: number,
    targetPath: string,
    opts?: {
      downloadId?: string
      totalBytes?: number
      onProgress?: (writtenBytes: number, totalBytes: number, percent: number) => void
    },
  ) => Promise<{bytes_written: number; name: string; mime_type: string}>

  openExternal?: (
    nodeId: number,
    opts?: {
      openId?: string
      onProgress?: (writtenBytes: number, totalBytes: number, percent: number) => void
    },
  ) => Promise<{path: string}>

  downloadFile(nodeId: number): Promise<AsyncIterable<Uint8Array>>
  sourceMetadata?(nodeId: number): Promise<CatalogSourceMetadata>
  replaceFile?(
    nodeId: number,
    bytes: Uint8Array,
    options: CatalogFileReplaceOptions,
  ): Promise<CatalogFileReplaceResult>
  previewImage?(
    nodeId: number,
    opts: {
      fileName: string
      mimeType?: string | null
      lastModified?: number | null
      refreshDerivativeCache?: boolean
    },
  ): Promise<{bytes: Uint8Array; mimeType: string; name: string; chunkSize: number}>
  thumbnailImage?(
    nodeId: number,
    opts: {
      fileName: string
      mimeType?: string | null
      lastModified?: number | null
      refreshDerivativeCache?: boolean
    },
  ): Promise<{bytes: Uint8Array; mimeType: string; name: string; chunkSize: number}>
  imageMetadata?(
    nodeId: number,
    opts: {
      fileName: string
      mimeType?: string | null
      lastModified?: number | null
    },
  ): Promise<ImagePhotoMetadata>
  preparePreviewFile?(
    nodeId: number,
    opts: {
      fileName: string
      mimeType?: string | null
      lastModified?: number | null
      variant: PreparedPreviewFileVariant
      refreshDerivativeCache?: boolean
    },
  ): Promise<PreparedPreviewFileSource>
  releasePreviewFile?(source: PreparedPreviewFileSource): Promise<void>
  purgePreviewSources?(reason: PreviewCachePurgeReason): Promise<PreviewCachePurgeResult>
  prepareMediaStream?(
    nodeId: number,
    opts: {
      fileName: string
      mimeType?: string | null
      lastModified?: number | null
    },
  ): Promise<PreparedMediaStreamSource>
  releaseMediaStream?(source: PreparedMediaStreamSource): Promise<void>
  startAndroidVideo?(
    nodeId: number,
    opts: {
      fileName: string
      mimeType?: string | null
      lastModified?: number | null
    },
  ): Promise<PreparedAndroidVideoSource>
  stopAndroidVideo?(source: PreparedAndroidVideoSource): Promise<void>
  warmupAndroidAudio?(): Promise<boolean>
  sendAndroidAudioCommand?(command: AndroidAudioCommand): Promise<AndroidAudioCommandResult>
  sendNativeAudioCommand?(command: NativeAudioCommand): Promise<NativeAudioCommandResult>

  readSecret(nodeId: number): Promise<AsyncIterable<Uint8Array>>
  writeSecret(nodeId: number, data: ArrayBuffer): Promise<void>
  eraseSecret(nodeId: number): Promise<void>

  generateOTP(params: {
    otpId?: string
    entryId?: string
    ts?: number
    digits?: number
    period?: number
    ha?: string
  }): Promise<string>
  setOTPSecret(params: {
    otpId: string
    entryId?: string
    secret: string
    encoding?: string
    algorithm?: string
    digits?: number
    period?: number
  }): Promise<void>
  removeOTPSecret(params: {otpId: string; entryId?: string}): Promise<void>
}
