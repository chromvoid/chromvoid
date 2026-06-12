import type {RpcResult} from '@chromvoid/scheme'
import {isSuccess} from '@chromvoid/scheme'

import type {
  AndroidAudioCommand,
  AndroidAudioCommandResult,
  HostPathSaveTargetOptions,
  HostPathTokenGrant,
  NativeAudioCommand,
  NativeAudioCommandResult,
  ImagePhotoMetadata,
  NativeUploadFailed,
  NativeUploadFile,
  NativeUploadOptions,
  NativeUploadProgress,
  PreparedAndroidVideoSource,
  PreparedMediaStreamSource,
  PreparedPreviewFileSource,
  PreparedPreviewFileVariant,
  PreviewCachePurgeReason,
  PreviewCachePurgeResult,
} from '../transport'
import type {
  CatalogFileReplaceOptions,
  CatalogFileReplaceResult,
} from '../../catalog/catalog'
import {normalizeFileMediaInfo} from '../../catalog/media-info'
import {
  androidShareDiagnosticErrorCode,
  androidShareDiagnosticErrorMessage,
  logAndroidShareDiagnostic,
} from '../../../features/file-manager/models/android-share-import.diagnostics'
import {tauriInvoke, tauriListen} from './ipc'

declare module '@tauri-apps/api/core' {
  export function convertFileSrc(filePath: string, protocol?: string): string
}

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
  name: string
  mime_type?: string
  mimeType?: string
  size: number
  source_revision?: number
  sourceRevision?: number
  expires_at?: number
  expiresAt?: number
}

type PreparedAndroidVideoPayload = {
  started?: boolean
  token?: string
  mime_type?: string
  mimeType?: string
  size?: number
  source_revision?: number
  sourceRevision?: number
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
  android_status?: string | null
  androidStatus?: string | null
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

function logAndroidShareTransport(event: string, details: Record<string, unknown> = {}): void {
  logAndroidShareDiagnostic('transport', event, details)
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
    androidStatus: optionalString(payload.androidStatus ?? payload.android_status),
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
    chunkSize?: number
    name?: string
    type?: string
    onProgress?: (c: number, t: number, p: number) => void
  },
): Promise<{nodeId: number}> {
  const chunkSize = opts?.chunkSize && opts.chunkSize > 0 ? Math.floor(opts.chunkSize) : 512 * 1024
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))
  const hasRaf = typeof requestAnimationFrame === 'function'
  let lastYield = typeof performance !== 'undefined' ? performance.now() : Date.now()
  let sentChunks = 0
  let nodeId = typeof target === 'number' ? target : undefined
  const totalSize = file.size

  for (let offset = 0; offset < file.size || (file.size === 0 && offset === 0); offset += chunkSize) {
    const buffer = await file.slice(offset, offset + chunkSize).arrayBuffer()
    const bytes = new Uint8Array(buffer)

    const payload: Record<string, unknown> = {
      offset,
      chunk: bytes,
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
    const response = await tauriInvoke<RpcResult<{node_id?: number; nodeId?: number}>>(
      'catalog_upload_chunk',
      payload,
    )
    const result = unwrapRpcResult(response, 'catalog:upload chunk failed')
    nodeId = nodeId ?? result.node_id ?? result.nodeId

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
  return {nodeId}
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
      logAndroidShareTransport('invoke_start', {
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
        logAndroidShareTransport('invoke_finished', {uploadId, shareSessionId: sharedSessionId})
      } catch (error) {
        logAndroidShareTransport('invoke_failed', {
          uploadId,
          shareSessionId: sharedSessionId,
          code: androidShareDiagnosticErrorCode(error),
          message: androidShareDiagnosticErrorMessage(error),
        })
        throw error
      }
    },
  )
}

export async function uploadAndroidSharedFilesViaTauri(
  parentPath: string,
  shareSessionId: string,
  opts?: NativeUploadOptions,
): Promise<void> {
  return uploadSharedFilesViaTauri(parentPath, shareSessionId, opts)
}

export async function cancelSharedFilesViaTauri(sharedSessionId: string): Promise<void> {
  const response = await tauriInvoke<RpcResult<unknown>>('catalog_cancel_shared_files', {
    sharedSessionId,
  })
  unwrapRpcResult(response, 'catalog_cancel_shared_files failed')
}

export async function cancelAndroidSharedFilesViaTauri(shareSessionId: string): Promise<void> {
  return cancelSharedFilesViaTauri(shareSessionId)
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

export async function downloadFileViaTauri(nodeId: number): Promise<AsyncIterable<Uint8Array>> {
  const payload = await readBinaryPayloadResult('catalog_download', {nodeId}, 'catalog:download failed')
  return toChunkedStream(payload.bytes, payload.chunkSize)
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

  return {
    kind: 'media-stream',
    streamId,
    url: payload.url,
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

export async function startAndroidVideoViaTauri(
  nodeId: number,
  opts: {
    fileName: string
    mimeType?: string | null
    lastModified?: number | null
  },
): Promise<PreparedAndroidVideoSource> {
  const response = await tauriInvoke<RpcResult<PreparedAndroidVideoPayload>>('android_video_start', {
    args: {
      nodeId,
      fileName: opts.fileName,
      mimeType: opts.mimeType ?? null,
      lastModified: opts.lastModified ?? null,
    },
  })
  const payload = unwrapRpcResult(response, 'android_video_start failed')
  const mimeType = payload.mimeType ?? payload.mime_type
  const sourceRevision = payload.sourceRevision ?? payload.source_revision

  if (!payload.started) {
    throw new Error('android_video_start did not start playback')
  }
  if (!payload.token) {
    throw new Error('android_video_start returned no token')
  }
  if (!mimeType) {
    throw new Error('android_video_start returned no mimeType')
  }
  if (typeof payload.size !== 'number') {
    throw new Error('android_video_start returned no size')
  }
  if (typeof sourceRevision !== 'number') {
    throw new Error('android_video_start returned no sourceRevision')
  }

  return {
    kind: 'android-native-video',
    token: payload.token,
    mimeType,
    size: payload.size,
    sourceRevision,
  }
}

export async function stopAndroidVideoViaTauri(source: PreparedAndroidVideoSource): Promise<void> {
  const response = await tauriInvoke<RpcResult<unknown>>('android_video_stop', {
    token: source.token,
  })
  unwrapRpcResult(response, 'android_video_stop failed')
}

export async function sendAndroidAudioCommandViaTauri(
  command: AndroidAudioCommand,
): Promise<AndroidAudioCommandResult> {
  const response = await tauriInvoke<RpcResult<AndroidAudioCommandResult>>(
    'android_audio_session_command',
    {
      args: command,
    },
  )
  return unwrapRpcResult(response, 'android_audio_session_command failed')
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

export async function warmupAndroidAudioViaTauri(): Promise<boolean> {
  const response = await tauriInvoke<RpcResult<{accepted?: boolean}>>('android_audio_warmup')
  const result = unwrapRpcResult(response, 'android_audio_warmup failed')
  return Boolean(result.accepted)
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
