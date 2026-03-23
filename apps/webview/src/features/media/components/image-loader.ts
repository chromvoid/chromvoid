import {getAppContext} from 'root/shared/services/app-context'
import {getMimeType} from 'root/utils/mime-type'

export type ImageLoadResult = {
  url: string
  size: number
}

export type ImageLoadOptions = {
  signal?: AbortSignal
}

/**
 * In-memory blob cache keyed by fileId.
 * Keeps the Blob alive so multiple consumers can create independent
 * object URLs from the same data without re-downloading.
 */
const MAX_BLOB_CACHE = 20
const blobCache = new Map<number, Blob>()

function cachePut(fileId: number, blob: Blob) {
  blobCache.set(fileId, blob)
  if (blobCache.size > MAX_BLOB_CACHE) {
    // Evict oldest (first inserted)
    const oldest = blobCache.keys().next().value
    if (oldest !== undefined) {
      blobCache.delete(oldest)
    }
  }
}

/**
 * Downloads an image by fileId and creates a blob URL.
 * Returns a cached blob if available (each call gets its own object URL).
 * Caller is responsible for revoking the returned URL when done.
 */
export async function loadImageByFileId(
  fileId: number,
  fileName: string,
  options?: ImageLoadOptions,
): Promise<ImageLoadResult> {
  const cached = blobCache.get(fileId)
  if (cached) {
    const url = URL.createObjectURL(cached)
    return {url, size: cached.size}
  }

  const {catalog} = getAppContext()
  const stream = await catalog.api.download(fileId)

  const chunks: Uint8Array[] = []
  let total = 0

  for await (const chunk of stream) {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    chunks.push(chunk)
    total += chunk.byteLength
  }

  const mimeType = getMimeType(fileName)
  const blob = new Blob(chunks as BlobPart[], {type: mimeType})
  cachePut(fileId, blob)
  const url = URL.createObjectURL(blob)

  return {url, size: total}
}

/**
 * Removes a specific fileId from the blob cache.
 * Call when a file is deleted or modified.
 */
export function invalidateImageCache(fileId: number) {
  blobCache.delete(fileId)
}

/**
 * Checks if we're in mock mode (no real backend)
 */
export function isMockTransport(): boolean {
  const {ws} = getAppContext()
  return ws.kind === 'ws' && ws.constructor.name === 'MockTransport'
}
