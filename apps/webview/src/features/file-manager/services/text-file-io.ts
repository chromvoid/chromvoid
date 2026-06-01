import {getAppContext} from 'root/shared/services/app-context'
import type {
  CatalogFileReplaceConflictMode,
  CatalogFileReplaceResult,
  CatalogSourceMetadata,
} from 'root/core/catalog/catalog'
import {resolveFileFormat} from 'root/utils/file-format-registry'

export type FileTextLoadOptions = {
  signal?: AbortSignal
  maxBytes?: number
  allowMetadataFallback?: boolean
}

export type FileTextLoadResult = {
  text: string
  size: number
  mimeType: string
  sourceRevision: number | null
  sourceMetadataUnavailable?: true
}

export type FileTextSaveOptions = {
  mimeType?: string
  expectedSourceRevision: number | null
  conflictMode?: CatalogFileReplaceConflictMode
  signal?: AbortSignal
  maxBytes?: number
}

export type FileLoadErrorCode =
  | 'TEXT_TOO_LARGE'
  | 'TEXT_INVALID_UTF8'
  | 'TEXT_NOT_FOUND'
  | 'TEXT_NOT_FILE'
  | 'TEXT_SOURCE_MISMATCH'
  | 'TEXT_STALE_SOURCE'
  | 'TEXT_ACCESS_DENIED'
  | 'TEXT_WRITE_UNAVAILABLE'
  | 'TEXT_LOAD_FAILED'
  | 'TEXT_SAVE_FAILED'
  | 'DERIVATIVE_UNAVAILABLE'
  | 'MEDIA_BLOB_FALLBACK_LIMIT'

export type FileLoadErrorDetails = {
  readonly variant?: string
  readonly sourceSize?: number | null
  readonly fallbackLimitBytes?: number | null
  readonly reason?: string | null
}

export class FileLoadError extends Error {
  constructor(
    readonly code: FileLoadErrorCode,
    message: string,
    readonly details: FileLoadErrorDetails = {},
  ) {
    super(message)
  }
}

export function isMediaBlobFallbackLimitError(error: unknown): error is FileLoadError {
  return error instanceof FileLoadError && error.code === 'MEDIA_BLOB_FALLBACK_LIMIT'
}

export function isDerivativeUnavailableError(error: unknown): error is FileLoadError {
  return error instanceof FileLoadError && error.code === 'DERIVATIVE_UNAVAILABLE'
}

const DEFAULT_MAX_TEXT_BYTES = 1_048_576
const NODE_TYPE_FILE = 1

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

function getErrorCode(error: unknown): string {
  const coded = error as {code?: unknown}
  if (typeof coded?.code === 'string' && coded.code) {
    return coded.code
  }
  return error instanceof Error ? error.message : String(error)
}

function toTextIoError(error: unknown, fallbackCode: 'TEXT_LOAD_FAILED' | 'TEXT_SAVE_FAILED'): FileLoadError {
  if (error instanceof FileLoadError) {
    return error
  }

  const code = getErrorCode(error)
  if (/ERR_STALE_SOURCE|STALE_SOURCE/i.test(code)) {
    return new FileLoadError('TEXT_STALE_SOURCE', 'TEXT_STALE_SOURCE')
  }
  if (/ACCESS_DENIED/i.test(code)) {
    return new FileLoadError('TEXT_ACCESS_DENIED', 'TEXT_ACCESS_DENIED')
  }
  if (/NODE_NOT_FOUND|not\s*found/i.test(code)) {
    return new FileLoadError('TEXT_NOT_FOUND', 'TEXT_NOT_FOUND')
  }
  if (/ERR_NOT_FILE|NOT_FILE/i.test(code)) {
    return new FileLoadError('TEXT_NOT_FILE', 'TEXT_NOT_FILE')
  }
  if (/ERR_WRITE_LOCKED|WRITE_LOCKED|WRITE_UNAVAILABLE|UNSUPPORTED|not supported/i.test(code)) {
    return new FileLoadError('TEXT_WRITE_UNAVAILABLE', 'TEXT_WRITE_UNAVAILABLE')
  }

  return new FileLoadError(fallbackCode, fallbackCode)
}

function assertTextSourceMetadata(metadata: CatalogSourceMetadata, fileName: string): void {
  if (metadata.nodeType !== NODE_TYPE_FILE) {
    throw new FileLoadError('TEXT_NOT_FILE', 'TEXT_NOT_FILE')
  }
  if (metadata.name !== fileName) {
    throw new FileLoadError('TEXT_SOURCE_MISMATCH', 'TEXT_SOURCE_MISMATCH')
  }
}

function resolveTextMimeType(fileName: string, mimeType: string | null | undefined): string {
  return mimeType?.trim() || resolveFileFormat({name: fileName, mimeType}).mimeType
}

export async function loadTextFileById(
  fileId: number,
  fileName: string,
  options?: FileTextLoadOptions,
): Promise<FileTextLoadResult> {
  throwIfAborted(options?.signal)

  const {catalog} = getAppContext()
  let metadata: CatalogSourceMetadata | null = null
  let sourceMetadataUnavailable = false
  try {
    metadata = await catalog.api.sourceMetadata(fileId)
  } catch (error) {
    const mapped = toTextIoError(error, 'TEXT_LOAD_FAILED')
    if (options?.allowMetadataFallback && mapped.code === 'TEXT_WRITE_UNAVAILABLE') {
      sourceMetadataUnavailable = true
    } else {
      throw mapped
    }
  }
  if (metadata) {
    assertTextSourceMetadata(metadata, fileName)
  }

  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_TEXT_BYTES
  let stream: AsyncIterable<Uint8Array>
  try {
    stream = await catalog.api.download(fileId)
  } catch (error) {
    throw toTextIoError(error, 'TEXT_LOAD_FAILED')
  }
  const decoder = new TextDecoder('utf-8', {fatal: true})
  let size = 0
  let text = ''

  try {
    for await (const chunk of stream) {
      throwIfAborted(options?.signal)

      size += chunk.byteLength
      if (size > maxBytes) {
        throw new FileLoadError('TEXT_TOO_LARGE', `TEXT_TOO_LARGE:${maxBytes}`)
      }

      text += decoder.decode(chunk, {stream: true})
    }

    text += decoder.decode()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    if (error instanceof FileLoadError) {
      throw error
    }
    const mapped = toTextIoError(error, 'TEXT_LOAD_FAILED')
    if (mapped.code !== 'TEXT_LOAD_FAILED') {
      throw mapped
    }
    throw new FileLoadError('TEXT_INVALID_UTF8', 'TEXT_INVALID_UTF8')
  }

  return {
    text,
    size,
    mimeType: resolveTextMimeType(fileName, metadata?.mimeType),
    sourceRevision: metadata?.sourceRevision ?? null,
    ...(sourceMetadataUnavailable ? {sourceMetadataUnavailable} : {}),
  }
}

export async function saveTextFileById(
  fileId: number,
  fileName: string,
  text: string,
  options?: FileTextSaveOptions,
): Promise<CatalogFileReplaceResult> {
  throwIfAborted(options?.signal)

  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_TEXT_BYTES
  const bytes = new TextEncoder().encode(text)
  if (bytes.byteLength > maxBytes) {
    throw new FileLoadError('TEXT_TOO_LARGE', `TEXT_TOO_LARGE:${maxBytes}`)
  }

  throwIfAborted(options?.signal)

  const {catalog} = getAppContext()
  try {
    return await catalog.api.replaceFile(fileId, bytes, {
      mimeType: resolveTextMimeType(fileName, options?.mimeType),
      expectedSourceRevision: options?.expectedSourceRevision ?? null,
      conflictMode: options?.conflictMode ?? 'fail_if_stale',
    })
  } catch (error) {
    throw toTextIoError(error, 'TEXT_SAVE_FAILED')
  }
}
