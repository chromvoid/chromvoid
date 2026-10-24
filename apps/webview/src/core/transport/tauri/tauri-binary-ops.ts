import type {RpcResult} from '@chromvoid/scheme'
import {isSuccess} from '@chromvoid/scheme'

import type {
  HostPathSaveTargetOptions,
  HostPathTokenGrant,
  NativeAudioCommand,
  NativeAudioCommandResult,
  ImagePhotoMetadata,
  NativeUploadFailed,
  NativeUploadFile,
  NativeUploadOptions,
  NativeUploadProgress,
  PreparedMediaStreamSource,
  PreparedPreviewFileSource,
  PreparedPreviewFileVariant,
  PreparedVideoDelivery,
  PreparedVideoProvider,
  PreparedVideoSource,
  PreviewCachePurgeReason,
  PreviewCachePurgeResult,
} from '../transport'
import type {
  CatalogFileReplaceOptions,
  CatalogFileReplaceResult,
  CatalogUploadResult,
} from '../../catalog/catalog'
import {normalizeFileMediaInfo} from '../../catalog/media-info'
import {
  shareDiagnosticErrorCode,
  shareDiagnosticErrorMessage,
  logShareDiagnostic,
} from '../../../features/file-manager/models/share-import.diagnostics'
import {tauriInvoke, tauriListen} from './ipc'

type UploadProgressPayload = {
  uploadId?: string
  sentBytes?: number
  totalBytes?: number
}

type NativeUploadSelectedPayload = {
  uploadId?: string
  files?: NativeUploadFile[]
}

type NativeUploadProgressPayload = {
  uploadId?: string
  fileId?: string
  nodeId?: number
  loadedBytes?: number
  loaded_bytes?: number
  totalBytes?: number
  total_bytes?: number
  percent?: number | null
  importProvenanceStatus?: string | null
  import_provenance_status?: string | null
  mediaLocationPermissionStatus?: string | null
  media_location_permission_status?: string | null
  requireOriginalStatus?: string | null
  require_original_status?: string | null
}

type NativeUploadFailedPayload = {
  uploadId?: string
  fileId?: string
  message?: string
  code?: string | null
}

type DownloadProgressPayload = {
  downloadId?: string
  writtenBytes?: number
  totalBytes?: number
}

type OpenExternalProgressPayload = {
  openId?: string
  nodeId?: number
  writtenBytes?: number
  totalBytes?: number
}

type BinaryPayload = {
  meta: {
    name: string
    type: string
    size: number
    chunk_size: number
  }
  bytes: number[]
}

type BinaryPayloadResult = {
  bytes: Uint8Array
  mimeType: string
  name: string
  chunkSize: number
}

type PreparedMediaStreamPayload = {
  kind?: PreparedMediaStreamSource['kind']
  stream_id?: string
  streamId?: string
  url: string
  fallback_url?: string
  fallbackUrl?: string
  delivery?: PreparedMediaStreamSource['delivery']
  name: string
  mime_type?: string
  mimeType?: string
  size: number
  source_revision?: number
  sourceRevision?: number
  expires_at?: number
  expiresAt?: number
}

type PreparedVideoDeliveryPayload = {
  delivery?: 'loopback-http' | 'mse' | 'native-video'
  platform?: 'desktop' | 'mobile'
  url?: string
  fetch_url?: string
  fetchUrl?: string
  init_segment?: {offset?: number; length?: number}
  initSegment?: {offset?: number; length?: number}
  media_segments?: Array<{
    offset?: number
    length?: number
    timestamp_us?: number
    timestampUs?: number
  }>
  mediaSegments?: Array<{
    offset?: number
    length?: number
    timestamp_us?: number
    timestampUs?: number
  }>
  native_source_token?: string
  nativeSourceToken?: string
}

type PreparedVideoPayload = {
  kind?: PreparedVideoSource['kind']
  stream_id?: string
  streamId?: string
  source_token?: string
  sourceToken?: string
  platform?: 'desktop' | 'mobile'
  provider?: PreparedVideoProvider
  deliveries?: PreparedVideoDeliveryPayload[]
  name?: string
  mime_type?: string
  mimeType?: string
  size?: number
  source_revision?: number
  sourceRevision?: number
  media_source_generation?: number
  mediaSourceGeneration?: number
  transport_session_generation?: number
  transportSessionGeneration?: number
  app_foreground_epoch?: number
  appForegroundEpoch?: number
  expires_at?: number
  expiresAt?: number
}

type PreparedPreviewFilePayload = {
  kind?: PreparedPreviewFileSource['kind']
  preview_id?: string
  previewId?: string
  path: string
  name: string
  mime_type?: string
  mimeType?: string
  size: number
  variant: PreparedPreviewFileVariant
}

type ImagePhotoMetadataPayload = {
  width?: number | null
  height?: number | null
  date_taken?: string | null
  dateTaken?: string | null
  camera_make?: string | null
  cameraMake?: string | null
  camera_model?: string | null
  cameraModel?: string | null
  lens_model?: string | null
  lensModel?: string | null
  exposure_time?: string | null
  exposureTime?: string | null
  aperture?: string | null
  iso?: number | null
  focal_length?: string | null
  focalLength?: string | null
  orientation?: string | null
  gps?: {
    latitude?: number | null
    longitude?: number | null
    altitude_meters?: number | null
    altitudeMeters?: number | null
  } | null
  source_revision?: number | null
  sourceRevision?: number | null
  import_provenance?: ImagePhotoImportProvenancePayload | null
  importProvenance?: ImagePhotoImportProvenancePayload | null
  gps_diagnostic?: ImagePhotoGpsDiagnosticPayload | null
  gpsDiagnostic?: ImagePhotoGpsDiagnosticPayload | null
}

type ImagePhotoImportProvenancePayload = {
  source_revision?: number | null
  sourceRevision?: number | null
  platform?: string | null
  image_candidate?: boolean | null
  imageCandidate?: boolean | null
  permission_status?: string | null
  permissionStatus?: string | null
  require_original_status?: string | null
  requireOriginalStatus?: string | null
  original_stream_used?: boolean | null
  originalStreamUsed?: boolean | null
  regular_stream_fallback?: boolean | null
  regularStreamFallback?: boolean | null
  uri_scheme?: string | null
  uriScheme?: string | null
  uri_authority?: string | null
  uriAuthority?: string | null
  captured_at_ms?: number | null
  capturedAtMs?: number | null
}

type ImagePhotoGpsDiagnosticPayload = {
  status?: string | null
  rust_exif_status?: string | null
  rustExifStatus?: string | null
  xmp_status?: string | null
  xmpStatus?: string | null
  import_provenance_status?: string | null
  importProvenanceStatus?: string | null
}

type PreviewCachePurgePayload = {
  files_removed?: number
  filesRemoved?: number
  directories_removed?: number
  directoriesRemoved?: number
  bytes_removed?: number
  bytesRemoved?: number
  skipped_entries?: number
  skippedEntries?: number
}

type CatalogFileReplacePayload = {
  node_id?: number
  nodeId?: number
  size?: number
  mime_type?: string
  mimeType?: string
  modtime?: number
  source_revision?: number
  sourceRevision?: number
  media_info?: unknown
  mediaInfo?: unknown
  media_inspected_revision?: number
  mediaInspectedRevision?: number
}

type HostPathUploadFilesPayload = {
  files?: HostPathTokenGrant[]
}

type HostPathSaveTargetPayload = {
  target?: HostPathTokenGrant | null
}

function unwrapRpcResult<T>(result: RpcResult<T>, fallbackMessage: string): T {
  if (!isSuccess(result)) {
    const message = result.error || fallbackMessage
    const code = result.code ? ` (${result.code})` : ''
    const error = new Error(`${message}${code}`)
    const codedError = error as Error & {code?: string}
    codedError.code = result.code ?? undefined
    throw codedError
  }

  return result.result
}

function toChunkedStream(bytes: Uint8Array, chunkSize: number): AsyncIterable<Uint8Array> {
  async function* generate(): AsyncIterable<Uint8Array> {
    for (let index = 0; index < bytes.length; index += chunkSize) {
      yield bytes.subarray(index, Math.min(bytes.length, index + chunkSize))
    }
  }

  return generate()
}

function safeUnlisten(unlisten: (() => void) | undefined, context: string): void {
  if (!unlisten) return

  try {
    unlisten()
  } catch (error) {
    console.warn(`[dashboard][tauri] ${context}: unlisten failed`, error)
  }
}

function logShareTransport(event: string, details: Record<string, unknown> = {}): void {
  logShareDiagnostic('transport', event, details)
}

function requireNumber(value: unknown, message: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new Error(message)
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function normalizeNativeUploadProgress(payload: NativeUploadProgressPayload): NativeUploadProgress | null {
  const uploadId = optionalString(payload.uploadId)
  const fileId = optionalString(payload.fileId)
  if (!uploadId || !fileId) return null
  const nodeId = optionalNumber(payload.nodeId)

  return {
    uploadId,
    fileId,
    loadedBytes: optionalNumber(payload.loadedBytes ?? payload.loaded_bytes) ?? 0,
    totalBytes: optionalNumber(payload.totalBytes ?? payload.total_bytes) ?? 0,
    percent: optionalNumber(payload.percent),
    importProvenanceStatus: optionalString(
      payload.importProvenanceStatus ?? payload.import_provenance_status,
    ),
    mediaLocationPermissionStatus: optionalString(
      payload.mediaLocationPermissionStatus ?? payload.media_location_permission_status,
    ),
    requireOriginalStatus: optionalString(payload.requireOriginalStatus ?? payload.require_original_status),
    ...(nodeId === null ? {} : {nodeId}),
  }
}

function preparedPreviewProtocolUrl(previewId: string): string {
  return `chromvoid-preview://localhost/${encodeURIComponent(previewId)}`
}

function normalizeNativeUploadFailed(payload: NativeUploadFailedPayload): NativeUploadFailed | null {
  const uploadId = optionalString(payload.uploadId)
  const message = optionalString(payload.message)
  if (!uploadId || !message) return null

  const fileId = optionalString(payload.fileId)
  return {
    uploadId,
    message,
    code: optionalString(payload.code),
    ...(fileId === null ? {} : {fileId}),
  }
}

function normalizeImagePhotoImportProvenance(
  payload: ImagePhotoImportProvenancePayload | null | undefined,
): ImagePhotoMetadata['importProvenance'] {
  if (!payload || typeof payload !== 'object') return null

  const sourceRevision = optionalNumber(payload.sourceRevision ?? payload.source_revision)

  return {
    sourceRevision: sourceRevision ?? 0,
    platform: optionalString(payload.platform) ?? 'unknown',
    imageCandidate: optionalBoolean(payload.imageCandidate ?? payload.image_candidate) ?? false,
    permissionStatus: optionalString(payload.permissionStatus ?? payload.permission_status) ?? 'unknown',
    requireOriginalStatus:
      optionalString(payload.requireOriginalStatus ?? payload.require_original_status) ?? 'unknown',
    originalStreamUsed: optionalBoolean(payload.originalStreamUsed ?? payload.original_stream_used) ?? false,
    regularStreamFallback:
      optionalBoolean(payload.regularStreamFallback ?? payload.regular_stream_fallback) ?? false,
    uriScheme: optionalString(payload.uriScheme ?? payload.uri_scheme),
    uriAuthority: optionalString(payload.uriAuthority ?? payload.uri_authority),
    capturedAtMs: optionalNumber(payload.capturedAtMs ?? payload.captured_at_ms),
  }
}

function normalizeImagePhotoGpsDiagnostic(
  payload: ImagePhotoGpsDiagnosticPayload | null | undefined,
): ImagePhotoMetadata['gpsDiagnostic'] {
  if (!payload || typeof payload !== 'object') return null

  return {
    status: optionalString(payload.status) ?? 'unknown',
    rustExifStatus: optionalString(payload.rustExifStatus ?? payload.rust_exif_status),
    xmpStatus: optionalString(payload.xmpStatus ?? payload.xmp_status),
    importProvenanceStatus: optionalString(
      payload.importProvenanceStatus ?? payload.import_provenance_status,
    ),
  }
}

function normalizeImagePhotoMetadata(payload: ImagePhotoMetadataPayload): ImagePhotoMetadata {
  const gps = payload.gps
  const latitude = optionalNumber(gps?.latitude)
  const longitude = optionalNumber(gps?.longitude)
  const sourceRevision = optionalNumber(payload.sourceRevision ?? payload.source_revision)

  return {
    width: optionalNumber(payload.width),
    height: optionalNumber(payload.height),
    dateTaken: optionalString(payload.dateTaken ?? payload.date_taken),
    cameraMake: optionalString(payload.cameraMake ?? payload.camera_make),
    cameraModel: optionalString(payload.cameraModel ?? payload.camera_model),
    lensModel: optionalString(payload.lensModel ?? payload.lens_model),
    exposureTime: optionalString(payload.exposureTime ?? payload.exposure_time),
    aperture: optionalString(payload.aperture),
    iso: optionalNumber(payload.iso),
    focalLength: optionalString(payload.focalLength ?? payload.focal_length),
    orientation: optionalString(payload.orientation),
    gps:
      latitude !== null && longitude !== null
        ? {
            latitude,
            longitude,
            altitudeMeters: optionalNumber(gps?.altitudeMeters ?? gps?.altitude_meters),
          }
        : null,
    importProvenance: normalizeImagePhotoImportProvenance(
      payload.importProvenance ?? payload.import_provenance,
    ),
    gpsDiagnostic: normalizeImagePhotoGpsDiagnostic(payload.gpsDiagnostic ?? payload.gps_diagnostic),
    sourceRevision,
  }
}

export async function uploadFileViaTauri(
  target: number | {parentPath?: string; name: string},
  file: File,
  opts?: {
    createOnly?: boolean
    chunkSize?: number
    name?: string
    type?: string
    onProgress?: (c: number, t: number, p: number) => void
  },
): Promise<CatalogUploadResult> {
  const chunkSize = opts?.chunkSize && opts.chunkSize > 0 ? Math.floor(opts.chunkSize) : 512 * 1024
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))
  const hasRaf = typeof requestAnimationFrame === 'function'
  let lastYield = typeof performance !== 'undefined' ? performance.now() : Date.now()
  let sentChunks = 0
  let nodeId = typeof target === 'number' ? target : undefined
  let committedResult: CatalogUploadResult | undefined
  const totalSize = file.size

  for (let offset = 0; offset < file.size || (file.size === 0 && offset === 0); offset += chunkSize) {
    const buffer = await file.slice(offset, offset + chunkSize).arrayBuffer()
    const bytes = new Uint8Array(buffer)

    const payload: Record<string, unknown> = {
      offset,
      chunk: bytes,
      ...(opts?.createOnly ? {createOnly: true} : {}),
    }
    if (nodeId !== undefined) {
      payload['nodeId'] = nodeId
    } else if (typeof target !== 'number') {
      payload['parentPath'] = target.parentPath ?? '/'
      payload['name'] = target.name
      payload['totalSize'] = totalSize
      payload['mimeType'] = opts?.type ?? file.type
      payload['chunkSize'] = chunkSize
    }
    const response = await tauriInvoke<RpcResult<Record<string, unknown>>>(
      'catalog_upload_chunk',
      payload,
    )
    const result = unwrapRpcResult(response, 'catalog:upload chunk failed')
    const resultNodeId = Number(result['node_id'] ?? result['nodeId'])
    nodeId = nodeId ?? (Number.isFinite(resultNodeId) ? resultNodeId : undefined)
    if (nodeId !== undefined && result['completed'] === true) {
      const size = Number(result['size'])
      const modtime = Number(result['modtime'])
      const sourceRevision = Number(result['source_revision'] ?? result['sourceRevision'])
      const mediaInspectedRevision = Number(
        result['media_inspected_revision'] ?? result['mediaInspectedRevision'],
      )
      committedResult = {
        nodeId,
        created: result['created'] === true,
        size: Number.isFinite(size) ? size : undefined,
        mimeType:
          typeof result['mime_type'] === 'string'
            ? result['mime_type']
            : typeof result['mimeType'] === 'string'
              ? result['mimeType']
              : null,
        modtime: Number.isFinite(modtime) ? modtime : undefined,
        sourceRevision: Number.isFinite(sourceRevision) ? sourceRevision : null,
        mediaInfo: normalizeFileMediaInfo(result['media_info'] ?? result['mediaInfo']),
        mediaInspectedRevision: Number.isFinite(mediaInspectedRevision)
          ? mediaInspectedRevision
          : null,
      }
    }

    sentChunks++
    if (opts?.onProgress) {
      const percent = Math.min(100, Math.round((sentChunks / totalChunks) * 100))
      opts.onProgress(sentChunks, totalChunks, percent)
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - lastYield > 32) {
      lastYield = now
      await new Promise((resolve) => {
        if (hasRaf) {
          requestAnimationFrame(() => resolve(undefined))
          return
        }

        setTimeout(resolve, 0)
      })
    }
    if (file.size === 0) break
  }
  if (nodeId === undefined) throw new Error('catalog:upload returned no node id')
  return committedResult ?? {nodeId}
}

export async function pickUploadFilesViaTauri(): Promise<HostPathTokenGrant[]> {
  const response = await tauriInvoke<RpcResult<HostPathUploadFilesPayload>>(
    'host_path_pick_upload_files',
  )
  const result = unwrapRpcResult(response, 'host_path_pick_upload_files failed')
  return Array.isArray(result.files) ? result.files : []
}

export async function pickDownloadTargetViaTauri(
  options: HostPathSaveTargetOptions,
): Promise<HostPathTokenGrant | null> {
  const response = await tauriInvoke<RpcResult<HostPathSaveTargetPayload>>(
    'host_path_pick_download_target',
    {args: options},
  )
  const result = unwrapRpcResult(response, 'host_path_pick_download_target failed')
  return result.target ?? null
}

export async function pickTextFileTargetViaTauri(
  options: HostPathSaveTargetOptions,
): Promise<HostPathTokenGrant | null> {
  const response = await tauriInvoke<RpcResult<HostPathSaveTargetPayload>>(
    'host_path_pick_text_file_target',
    {args: options},
  )
  const result = unwrapRpcResult(response, 'host_path_pick_text_file_target failed')
  return result.target ?? null
}

export async function writeTextFileViaTauri(pathToken: string, content: string): Promise<void> {
  const response = await tauriInvoke<RpcResult<unknown>>('write_text_file', {pathToken, content})
  unwrapRpcResult(response, 'write_text_file failed')
}

export async function uploadFilePathViaTauri(
  target: number | {parentPath?: string; name: string},
  pathToken: string,
  opts?: {
    uploadId?: string
    chunkSize?: number
    totalBytes?: number
    onProgress?: (c: number, t: number, p: number) => void
  },
): Promise<{nodeId: number}> {
  const uploadId = opts?.uploadId ?? crypto.randomUUID()
  const chunkSize = opts?.chunkSize && opts.chunkSize > 0 ? Math.floor(opts.chunkSize) : 512 * 1024
  const totalBytes = typeof opts?.totalBytes === 'number' ? Math.max(0, Math.floor(opts.totalBytes)) : 0
  const totalChunks = Math.max(1, Math.ceil((totalBytes || 1) / chunkSize))
  const onProgress = opts?.onProgress

  let unlisten: (() => void) | undefined
  if (onProgress) {
    unlisten = await tauriListen<UploadProgressPayload>('upload:progress', (payload) => {
      if (!payload || typeof payload !== 'object') return
      if (payload.uploadId !== uploadId) return

      const sent = typeof payload.sentBytes === 'number' ? Math.max(0, payload.sentBytes) : 0
      const total = typeof payload.totalBytes === 'number' ? Math.max(0, payload.totalBytes) : totalBytes
      const sentChunks = Math.min(totalChunks, Math.max(1, Math.ceil(sent / chunkSize)))
      const percent = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0
      onProgress(sentChunks, totalChunks, percent)
    })
  }

  try {
    const readChunkSize = chunkSize
    const payload: Record<string, unknown> = {
      pathToken,
      uploadId,
      readChunkSize,
    }
    if (typeof target === 'number') {
      payload['nodeId'] = target
    } else {
      payload['parentPath'] = target.parentPath ?? '/'
      payload['name'] = target.name
      payload['totalBytes'] = totalBytes
    }
    const response = await tauriInvoke<RpcResult<{node_id?: number; nodeId?: number}>>(
      'catalog_upload_path',
      payload,
    )
    const result = unwrapRpcResult(response, 'catalog:upload path failed')
    const nodeId = result.node_id ?? result.nodeId
    if (typeof nodeId !== 'number') throw new Error('catalog:upload path returned no node id')
    return {nodeId}
  } finally {
    safeUnlisten(unlisten, 'catalog_upload_path')
  }
}

export async function uploadNativeFilesViaTauri(
  parentPath: string,
  opts?: NativeUploadOptions,
): Promise<void> {
  return runNativeUploadViaTauri('catalog_upload_native_files', opts, async (uploadId, readChunkSize) => {
    const response = await tauriInvoke<RpcResult<unknown>>('catalog_upload_native_files', {
      parentPath,
      uploadId,
      readChunkSize,
    })
    unwrapRpcResult(response, 'catalog_upload_native_files failed')
  })
}

export async function uploadSharedFilesViaTauri(
  parentPath: string,
  sharedSessionId: string,
  opts?: NativeUploadOptions,
): Promise<void> {
  return runNativeUploadViaTauri(
    'catalog_upload_shared_files',
    opts,
    async (uploadId, readChunkSize) => {
      logShareTransport('invoke_start', {
        uploadId,
        shareSessionId: sharedSessionId,
        readChunkSize: readChunkSize ?? null,
      })
      try {
        const response = await tauriInvoke<RpcResult<unknown>>('catalog_upload_shared_files', {
          parentPath,
          uploadId,
          sharedSessionId,
          readChunkSize,
        })
        unwrapRpcResult(response, 'catalog_upload_shared_files failed')
        logShareTransport('invoke_finished', {uploadId, shareSessionId: sharedSessionId})
      } catch (error) {
        logShareTransport('invoke_failed', {
          uploadId,
          shareSessionId: sharedSessionId,
          code: shareDiagnosticErrorCode(error),
          message: shareDiagnosticErrorMessage(error),
        })
        throw error
      }
    },
  )
}

export async function cancelSharedFilesViaTauri(sharedSessionId: string): Promise<void> {
  const response = await tauriInvoke<RpcResult<unknown>>('catalog_cancel_shared_files', {
    sharedSessionId,
  })
  unwrapRpcResult(response, 'catalog_cancel_shared_files failed')
}

export async function startNativeOtpQrScanViaTauri(scanId: string): Promise<void> {
  const response = await tauriInvoke<RpcResult<null>>('native_otp_qr_scan_start', {scanId})
  unwrapRpcResult(response, 'native OTP QR scanner is unavailable')
}

export async function cancelNativeOtpQrScanViaTauri(scanId: string): Promise<void> {
  const response = await tauriInvoke<RpcResult<null>>('native_otp_qr_scan_cancel', {scanId})
  unwrapRpcResult(response, 'native OTP QR scanner cancel failed')
}

async function runNativeUploadViaTauri(
  context: string,
  opts: NativeUploadOptions | undefined,
  invokeUpload: (uploadId: string, readChunkSize: number | undefined) => Promise<void>,
): Promise<void> {
  const uploadId = opts?.uploadId ?? crypto.randomUUID()
  const unlisteners: Array<() => void> = []

  try {
    unlisteners.push(
      await tauriListen<NativeUploadSelectedPayload>('upload:native-selected', (payload) => {
        if (!payload || typeof payload !== 'object') return
        if (payload.uploadId !== uploadId) return
        if (!Array.isArray(payload.files)) return
        opts?.onSelected?.(payload.files)
      }),
    )
    unlisteners.push(
      await tauriListen<NativeUploadProgressPayload>('upload:native-progress', (payload) => {
        if (!payload || typeof payload !== 'object') return
        if (payload.uploadId !== uploadId) return
        const progress = normalizeNativeUploadProgress(payload)
        if (progress) opts?.onProgress?.(progress)
      }),
    )
    unlisteners.push(
      await tauriListen<NativeUploadProgressPayload>('upload:native-completed', (payload) => {
        if (!payload || typeof payload !== 'object') return
        if (payload.uploadId !== uploadId) return
        const progress = normalizeNativeUploadProgress(payload)
        if (progress) opts?.onCompleted?.(progress)
      }),
    )
    unlisteners.push(
      await tauriListen<NativeUploadFailedPayload>('upload:native-failed', (payload) => {
        if (!payload || typeof payload !== 'object') return
        if (payload.uploadId !== uploadId) return
        const failed = normalizeNativeUploadFailed(payload)
        if (failed) opts?.onFailed?.(failed)
      }),
    )

    const readChunkSize =
      opts?.readChunkSize && opts.readChunkSize > 0 ? Math.floor(opts.readChunkSize) : undefined
    await invokeUpload(uploadId, readChunkSize)
  } finally {
    for (const unlisten of unlisteners) {
      safeUnlisten(unlisten, context)
    }
  }
}

export async function replaceFileViaTauri(
  nodeId: number,
  bytes: Uint8Array,
  options: CatalogFileReplaceOptions,
): Promise<CatalogFileReplaceResult> {
  const response = await tauriInvoke<RpcResult<CatalogFileReplacePayload>>('catalog_file_replace', {
    nodeId,
    size: bytes.byteLength,
    mimeType: options.mimeType ?? null,
    expectedSourceRevision: options.expectedSourceRevision,
    conflictMode: options.conflictMode ?? 'fail_if_stale',
    bytes,
  })
  const payload = unwrapRpcResult(response, 'catalog:file:replace failed')
  const mimeType = payload.mimeType ?? payload.mime_type
  if (!mimeType) {
    throw new Error('catalog_file_replace returned no mimeType')
  }

  const sourceRevision = payload.sourceRevision ?? payload.source_revision
  const mediaInspectedRevision = payload.mediaInspectedRevision ?? payload.media_inspected_revision
  return {
    nodeId: requireNumber(payload.nodeId ?? payload.node_id, 'catalog_file_replace returned no nodeId'),
    size: requireNumber(payload.size, 'catalog_file_replace returned no size'),
    mimeType,
    modtime: requireNumber(payload.modtime, 'catalog_file_replace returned no modtime'),
    sourceRevision: typeof sourceRevision === 'number' && Number.isFinite(sourceRevision) ? sourceRevision : null,
    mediaInfo: normalizeFileMediaInfo(payload.mediaInfo ?? payload.media_info),
    mediaInspectedRevision:
      typeof mediaInspectedRevision === 'number' && Number.isFinite(mediaInspectedRevision)
        ? mediaInspectedRevision
        : null,
  }
}

async function readBinaryPayloadResult(
  command: string,
  args: Record<string, unknown>,
  fallbackMessage: string,
): Promise<BinaryPayloadResult> {
  const response = await tauriInvoke<RpcResult<BinaryPayload>>(command, args)
  const payload = unwrapRpcResult(response, fallbackMessage)
  return {
    bytes: new Uint8Array(payload.bytes),
    mimeType: payload.meta.type || 'application/octet-stream',
    name: payload.meta.name || 'preview',
    chunkSize: payload.meta.chunk_size && payload.meta.chunk_size > 0 ? payload.meta.chunk_size : 64 * 1024,
  }
}

/**
 * Chunk size for ranged catalog downloads. Each chunk is a separate
 * `catalog_download_range` IPC call, so consumers that stop iterating (abort,
 * running-size limits) stop further IPC instead of having the whole file
 * materialized in a single invoke.
 */
export const TAURI_DOWNLOAD_RANGE_CHUNK_BYTES = 2 * 1024 * 1024

type DownloadRangeSource = {
  size: number
  sourceRevision: number
}

type RpcDispatchCommandResultPayload = {
  command?: string
  result?: unknown
}

async function resolveDownloadRangeSource(nodeId: number): Promise<DownloadRangeSource | null> {
  try {
    const response = await tauriInvoke<RpcResult<RpcDispatchCommandResultPayload>>('rpc_dispatch', {
      args: {
        v: 1,
        command: 'catalog:source:metadata',
        data: {node_id: nodeId},
      },
    })
    if (!isSuccess(response)) {
      return null
    }

    const payload = response.result?.result
    if (!payload || typeof payload !== 'object') {
      return null
    }

    const record = payload as {size?: unknown; source_revision?: unknown; sourceRevision?: unknown}
    const size = optionalNumber(record.size)
    const sourceRevision = optionalNumber(record.sourceRevision ?? record.source_revision)
    if (size === null || size < 0 || sourceRevision === null) {
      return null
    }

    return {size: Math.floor(size), sourceRevision}
  } catch (error) {
    console.warn(
      '[dashboard][tauri] catalog:source:metadata lookup failed; falling back to whole-file download',
      error,
    )
    return null
  }
}

function rangedDownloadStream(
  nodeId: number,
  source: DownloadRangeSource,
  chunkBytes: number,
): AsyncIterable<Uint8Array> {
  async function* generate(): AsyncIterable<Uint8Array> {
    for (let offset = 0; offset < source.size; offset += chunkBytes) {
      const length = Math.min(chunkBytes, source.size - offset)
      const response = await tauriInvoke<RpcResult<number[]>>('catalog_download_range', {
        nodeId,
        offset,
        length,
        expectedSourceRevision: source.sourceRevision,
      })
      const bytes = unwrapRpcResult(response, 'catalog:downloadRange failed')
      yield new Uint8Array(bytes)
    }
  }

  return generate()
}

export async function downloadFileViaTauri(
  nodeId: number,
  opts?: {rangeChunkBytes?: number},
): Promise<AsyncIterable<Uint8Array>> {
  const rangeSource = await resolveDownloadRangeSource(nodeId)
  if (rangeSource === null) {
    // Compatibility path: without size/source-revision metadata the ranged
    // protocol cannot be used, so keep the whole-file transfer.
    const payload = await readBinaryPayloadResult('catalog_download', {nodeId}, 'catalog:download failed')
    return toChunkedStream(payload.bytes, payload.chunkSize)
  }

  const chunkBytes =
    opts?.rangeChunkBytes && opts.rangeChunkBytes > 0
      ? Math.floor(opts.rangeChunkBytes)
      : TAURI_DOWNLOAD_RANGE_CHUNK_BYTES
  return rangedDownloadStream(nodeId, rangeSource, chunkBytes)
}

export async function previewImageViaTauri(
  nodeId: number,
  opts: {
    fileName: string
    mimeType?: string | null
    lastModified?: number | null
    refreshDerivativeCache?: boolean
  },
): Promise<BinaryPayloadResult> {
  return readBinaryPayloadResult(
    'catalog_preview_image',
    {
      args: {
        nodeId,
        fileName: opts.fileName,
        mimeType: opts.mimeType ?? null,
        lastModified: opts.lastModified ?? null,
        ...(opts.refreshDerivativeCache === true ? {refreshDerivativeCache: true} : {}),
      },
    },
    'catalog:preview-image failed',
  )
}

export async function thumbnailImageViaTauri(
  nodeId: number,
  opts: {
    fileName: string
    mimeType?: string | null
    lastModified?: number | null
    refreshDerivativeCache?: boolean
  },
): Promise<BinaryPayloadResult> {
  return readBinaryPayloadResult(
    'catalog_thumbnail_image',
    {
      args: {
        nodeId,
        fileName: opts.fileName,
        mimeType: opts.mimeType ?? null,
        lastModified: opts.lastModified ?? null,
        ...(opts.refreshDerivativeCache === true ? {refreshDerivativeCache: true} : {}),
      },
    },
    'catalog:thumbnail-image failed',
  )
}

export async function imageMetadataViaTauri(
  nodeId: number,
  opts: {
    fileName: string
    mimeType?: string | null
    lastModified?: number | null
  },
): Promise<ImagePhotoMetadata> {
  const response = await tauriInvoke<RpcResult<ImagePhotoMetadataPayload>>('catalog_image_metadata', {
    args: {
      nodeId,
      fileName: opts.fileName,
      mimeType: opts.mimeType ?? null,
      lastModified: opts.lastModified ?? null,
    },
  })
  return normalizeImagePhotoMetadata(unwrapRpcResult(response, 'catalog:image-metadata failed'))
}

export async function preparePreviewFileViaTauri(
  nodeId: number,
  opts: {
    fileName: string
    mimeType?: string | null
    lastModified?: number | null
    variant: PreparedPreviewFileVariant
    refreshDerivativeCache?: boolean
  },
): Promise<PreparedPreviewFileSource> {
  const previewId = crypto.randomUUID()
  const response = await tauriInvoke<RpcResult<PreparedPreviewFilePayload>>(
    'prepare_catalog_preview_file',
    {
      args: {
        nodeId,
        fileName: opts.fileName,
        mimeType: opts.mimeType ?? null,
        lastModified: opts.lastModified ?? null,
        variant: opts.variant,
        previewId,
        ...(opts.refreshDerivativeCache === true ? {refreshDerivativeCache: true} : {}),
      },
    },
  )
  const payload = unwrapRpcResult(response, 'prepare_catalog_preview_file failed')
  const resolvedPreviewId = payload.previewId ?? payload.preview_id
  const mimeType = payload.mimeType ?? payload.mime_type

  if (!resolvedPreviewId) {
    throw new Error('prepare_catalog_preview_file returned no previewId')
  }
  if (!mimeType) {
    throw new Error('prepare_catalog_preview_file returned no mimeType')
  }

  return {
    kind: payload.kind ?? 'asset-file',
    previewId: resolvedPreviewId,
    path: payload.path,
    url: preparedPreviewProtocolUrl(resolvedPreviewId),
    name: payload.name,
    mimeType,
    size: payload.size,
    variant: payload.variant,
  }
}

export async function releasePreviewFileViaTauri(source: PreparedPreviewFileSource): Promise<void> {
  const response = await tauriInvoke<RpcResult<unknown>>('release_catalog_preview_file', {
    args: {
      previewId: source.previewId,
      path: source.path,
    },
  })
  unwrapRpcResult(response, 'release_catalog_preview_file failed')
}

export async function purgePreviewSourcesViaTauri(
  reason: PreviewCachePurgeReason,
): Promise<PreviewCachePurgeResult> {
  const response = await tauriInvoke<RpcResult<PreviewCachePurgePayload>>(
    'purge_catalog_preview_cache',
    {
      args: {
        reason,
      },
    },
  )
  const payload = unwrapRpcResult(response, 'purge_catalog_preview_cache failed')

  return {
    filesRemoved: payload.filesRemoved ?? payload.files_removed ?? 0,
    directoriesRemoved: payload.directoriesRemoved ?? payload.directories_removed ?? 0,
    bytesRemoved: payload.bytesRemoved ?? payload.bytes_removed ?? 0,
    skippedEntries: payload.skippedEntries ?? payload.skipped_entries ?? 0,
  }
}

export async function prepareMediaStreamViaTauri(
  nodeId: number,
  opts: {
    fileName: string
    mimeType?: string | null
    lastModified?: number | null
  },
): Promise<PreparedMediaStreamSource> {
  const response = await tauriInvoke<RpcResult<PreparedMediaStreamPayload>>('prepare_media_stream', {
    args: {
      nodeId,
      fileName: opts.fileName,
      mimeType: opts.mimeType ?? null,
      lastModified: opts.lastModified ?? null,
    },
  })
  const payload = unwrapRpcResult(response, 'prepare_media_stream failed')
  const streamId = payload.streamId ?? payload.stream_id
  const mimeType = payload.mimeType ?? payload.mime_type
  const sourceRevision = payload.sourceRevision ?? payload.source_revision
  const expiresAt = payload.expiresAt ?? payload.expires_at
  const fallbackUrl = payload.fallbackUrl ?? payload.fallback_url
  const delivery = payload.delivery ?? 'custom-scheme'

  if (payload.kind !== 'media-stream') {
    throw new Error('prepare_media_stream returned invalid kind')
  }
  if (!streamId) {
    throw new Error('prepare_media_stream returned no streamId')
  }
  if (!mimeType) {
    throw new Error('prepare_media_stream returned no mimeType')
  }
  if (typeof sourceRevision !== 'number') {
    throw new Error('prepare_media_stream returned no sourceRevision')
  }
  if (typeof expiresAt !== 'number') {
    throw new Error('prepare_media_stream returned no expiresAt')
  }
  if (delivery !== 'custom-scheme' && delivery !== 'loopback-http') {
    throw new Error('prepare_media_stream returned invalid delivery')
  }

  return {
    kind: 'media-stream',
    streamId,
    url: payload.url,
    fallbackUrl: typeof fallbackUrl === 'string' && fallbackUrl.length > 0 ? fallbackUrl : undefined,
    delivery,
    name: payload.name,
    mimeType,
    size: payload.size,
    sourceRevision,
    expiresAt,
  }
}

export async function releaseMediaStreamViaTauri(source: PreparedMediaStreamSource): Promise<void> {
  const response = await tauriInvoke<RpcResult<unknown>>('release_media_stream', {
    args: {
      streamId: source.streamId,
    },
  })
  unwrapRpcResult(response, 'release_media_stream failed')
}

function normalizePreparedVideoDelivery(
  delivery: PreparedVideoDeliveryPayload,
): PreparedVideoDelivery {
  if (delivery.delivery === 'loopback-http') {
    if (delivery.platform !== 'desktop') {
      throw new Error('prepare_media_source returned invalid loopback platform')
    }
    if (typeof delivery.url !== 'string' || !delivery.url) {
      throw new Error('prepare_media_source returned no loopback url')
    }
    return {
      delivery: 'loopback-http',
      platform: delivery.platform,
      url: delivery.url,
    }
  }

  if (delivery.delivery === 'native-video') {
    const nativeSourceToken = delivery.nativeSourceToken ?? delivery.native_source_token
    if (delivery.platform !== 'desktop' && delivery.platform !== 'mobile') {
      throw new Error('prepare_media_source returned invalid native platform')
    }
    if (typeof nativeSourceToken !== 'string' || !nativeSourceToken) {
      throw new Error('prepare_media_source returned no nativeSourceToken')
    }
    return {
      delivery: 'native-video',
      platform: delivery.platform,
      nativeSourceToken,
    }
  }

  if (delivery.delivery === 'mse') {
    const fetchUrl = delivery.fetchUrl ?? delivery.fetch_url
    const initSegmentPayload = delivery.initSegment ?? delivery.init_segment
    const mediaSegmentsPayload = delivery.mediaSegments ?? delivery.media_segments
    return {
      delivery: 'mse',
      platform: delivery.platform === 'mobile' ? 'mobile' : 'desktop',
      ...(typeof fetchUrl === 'string' && fetchUrl ? {fetchUrl} : {}),
      ...(initSegmentPayload &&
      typeof initSegmentPayload.offset === 'number' &&
      typeof initSegmentPayload.length === 'number'
        ? {initSegment: {offset: initSegmentPayload.offset, length: initSegmentPayload.length}}
        : {}),
      ...(Array.isArray(mediaSegmentsPayload)
        ? {
            mediaSegments: mediaSegmentsPayload
              .map((segment) => {
                const timestampUs = segment.timestampUs ?? segment.timestamp_us
                return typeof segment.offset === 'number' &&
                  typeof segment.length === 'number' &&
                  typeof timestampUs === 'number'
                  ? {offset: segment.offset, length: segment.length, timestampUs}
                  : null
              })
              .filter((segment): segment is {offset: number; length: number; timestampUs: number} =>
                segment !== null,
              ),
          }
        : {}),
    }
  }

  throw new Error('prepare_media_source returned invalid delivery')
}

export async function prepareMediaSourceViaTauri(opts: {
  kind: 'video'
  nodeId: number
  sourceRevision?: number | null
  ownerToken?: string | null
  fileName?: string | null
  mimeType?: string | null
  lastModified?: number | null
}): Promise<PreparedVideoSource> {
  const response = await tauriInvoke<RpcResult<PreparedVideoPayload>>('prepare_media_source', {
    args: {
      kind: opts.kind,
      nodeId: opts.nodeId,
      sourceRevision: opts.sourceRevision ?? null,
      ownerToken: opts.ownerToken ?? null,
      fileName: opts.fileName ?? null,
      mimeType: opts.mimeType ?? null,
      lastModified: opts.lastModified ?? null,
    },
  })
  const payload = unwrapRpcResult(response, 'prepare_media_source failed')
  const streamId = payload.streamId ?? payload.stream_id
  const sourceToken = payload.sourceToken ?? payload.source_token
  const mimeType = payload.mimeType ?? payload.mime_type
  const sourceRevision = payload.sourceRevision ?? payload.source_revision
  const mediaSourceGeneration = payload.mediaSourceGeneration ?? payload.media_source_generation
  const transportSessionGeneration =
    payload.transportSessionGeneration ?? payload.transport_session_generation
  const appForegroundEpoch = payload.appForegroundEpoch ?? payload.app_foreground_epoch ?? 1
  const expiresAt = payload.expiresAt ?? payload.expires_at

  if (payload.kind !== 'video-source') {
    throw new Error('prepare_media_source returned invalid kind')
  }
  if (!streamId || !sourceToken) {
    throw new Error('prepare_media_source returned no source token')
  }
  if (payload.platform !== 'desktop' && payload.platform !== 'mobile') {
    throw new Error('prepare_media_source returned invalid platform')
  }
  if (
    payload.provider !== 'local-catalog' &&
    payload.provider !== 'mobile-local-catalog' &&
    payload.provider !== 'remote-usb' &&
    payload.provider !== 'remote-network' &&
    payload.provider !== 'mock'
  ) {
    throw new Error('prepare_media_source returned invalid provider')
  }
  if (!mimeType) {
    throw new Error('prepare_media_source returned no mimeType')
  }
  if (typeof payload.size !== 'number') {
    throw new Error('prepare_media_source returned no size')
  }
  if (typeof sourceRevision !== 'number') {
    throw new Error('prepare_media_source returned no sourceRevision')
  }
  if (typeof mediaSourceGeneration !== 'number') {
    throw new Error('prepare_media_source returned no mediaSourceGeneration')
  }
  if (typeof appForegroundEpoch !== 'number') {
    throw new Error('prepare_media_source returned invalid appForegroundEpoch')
  }
  if (typeof expiresAt !== 'number') {
    throw new Error('prepare_media_source returned no expiresAt')
  }
  if (!Array.isArray(payload.deliveries) || payload.deliveries.length === 0) {
    throw new Error('prepare_media_source returned no deliveries')
  }

  return {
    kind: 'video-source',
    streamId,
    sourceToken,
    platform: payload.platform,
    provider: payload.provider,
    deliveries: payload.deliveries.map(normalizePreparedVideoDelivery),
    name: payload.name ?? '',
    mimeType,
    size: payload.size,
    sourceRevision,
    mediaSourceGeneration,
    ...(typeof transportSessionGeneration === 'number' ? {transportSessionGeneration} : {}),
    appForegroundEpoch,
    expiresAt,
  }
}

export async function releaseMediaSourceViaTauri(source: PreparedVideoSource): Promise<void> {
  const response = await tauriInvoke<RpcResult<unknown>>('release_media_source', {
    args: {
      streamId: source.streamId,
      sourceToken: source.sourceToken,
    },
  })
  unwrapRpcResult(response, 'release_media_source failed')
}

export async function sendNativeAudioCommandViaTauri(
  command: NativeAudioCommand,
): Promise<NativeAudioCommandResult> {
  const response = await tauriInvoke<RpcResult<NativeAudioCommandResult>>(
    'native_audio_session_command',
    {
      args: command,
    },
  )
  return unwrapRpcResult(response, 'native_audio_session_command failed')
}

export async function downloadFilePathViaTauri(
  nodeId: number,
  targetPathToken: string,
  opts?: {
    downloadId?: string
    totalBytes?: number
    onProgress?: (writtenBytes: number, totalBytes: number, percent: number) => void
  },
): Promise<{bytes_written: number; name: string; mime_type: string}> {
  const downloadId = opts?.downloadId ?? crypto.randomUUID()
  const onProgress = opts?.onProgress
  const fallbackTotalBytes =
    typeof opts?.totalBytes === 'number' ? Math.max(0, Math.floor(opts.totalBytes)) : 0

  let unlisten: (() => void) | undefined
  if (onProgress) {
    unlisten = await tauriListen<DownloadProgressPayload>('download:progress', (payload) => {
      if (!payload || typeof payload !== 'object') return
      if (payload.downloadId !== downloadId) return

      const written = typeof payload.writtenBytes === 'number' ? Math.max(0, payload.writtenBytes) : 0
      const total =
        typeof payload.totalBytes === 'number' ? Math.max(0, payload.totalBytes) : fallbackTotalBytes
      const percent = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0
      onProgress(written, total, percent)
    })
  }

  try {
    const response = await tauriInvoke<RpcResult<{bytes_written: number; name: string; mime_type: string}>>(
      'catalog_download_path',
      {args: {nodeId, targetPathToken, downloadId}},
    )
    return unwrapRpcResult(response, 'catalog_download_path failed')
  } finally {
    safeUnlisten(unlisten, 'catalog_download_path')
  }
}

export async function openExternalViaTauri(
  nodeId: number,
  opts?: {
    openId?: string
    onProgress?: (writtenBytes: number, totalBytes: number, percent: number) => void
  },
): Promise<{path: string}> {
  const openId = opts?.openId ?? crypto.randomUUID()
  const onProgress = opts?.onProgress

  let unlisten: (() => void) | undefined
  if (onProgress) {
    try {
      unlisten = await tauriListen<OpenExternalProgressPayload>('open_external:progress', (payload) => {
        if (!payload || typeof payload !== 'object') return
        if (payload.openId !== openId) return

        const written = typeof payload.writtenBytes === 'number' ? Math.max(0, payload.writtenBytes) : 0
        const total = typeof payload.totalBytes === 'number' ? Math.max(0, payload.totalBytes) : 0
        const percent = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0
        onProgress(written, total, percent)
      })
    } catch (error) {
      console.warn('[dashboard][tauri] open_external:progress listen failed', error)
    }
  }

  try {
    const response = await tauriInvoke<RpcResult<{path: string}>>('catalog_open_external', {
      args: {nodeId, openId},
    })
    return unwrapRpcResult(response, 'catalog_open_external failed')
  } finally {
    safeUnlisten(unlisten, 'catalog_open_external')
  }
}

export async function readSecretViaTauri(nodeId: number): Promise<AsyncIterable<Uint8Array>> {
  const payload = await readBinaryPayloadResult('catalog_secret_read', {nodeId}, 'catalog:secret:read failed')
  return toChunkedStream(payload.bytes, payload.chunkSize)
}

export async function writeSecretViaTauri(nodeId: number, data: ArrayBuffer): Promise<void> {
  const bytes = new Uint8Array(data)
  const response = await tauriInvoke<RpcResult<unknown>>('catalog_secret_write_chunk', {
    nodeId,
    offset: 0,
    chunk: bytes,
  })
  unwrapRpcResult(response, 'catalog:secret:write failed')
}
