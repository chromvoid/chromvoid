import {isSuccess, type RpcResult} from '@chromvoid/scheme'

import {loadFileSourceById} from 'root/features/media/components/file-loader'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {resolveFileFormat} from 'root/utils/file-format-registry'

export type ShareableFileInput = {
  fileId: number
  fileName: string
  mimeType?: string
  lastModified?: number
}

function canUseTauriNativeShare(): boolean {
  const capabilities = getRuntimeCapabilities()
  return isTauriRuntime() && capabilities.supports_native_share
}

function isGenericMimeType(mimeType: string): boolean {
  return mimeType.trim().toLowerCase() === 'application/octet-stream'
}

function normalizeMimeType(mimeType: string | undefined): string | undefined {
  const normalized = mimeType?.trim()
  return normalized ? normalized : undefined
}

function resolveShareMimeType(item: ShareableFileInput): string | undefined {
  const explicitMimeType = normalizeMimeType(item.mimeType)
  if (explicitMimeType && !isGenericMimeType(explicitMimeType)) {
    return explicitMimeType
  }

  const inferredMimeType = normalizeMimeType(resolveFileFormat({name: item.fileName}).mimeType)
  if (inferredMimeType && !isGenericMimeType(inferredMimeType)) {
    return inferredMimeType
  }

  return explicitMimeType
}

/**
 * Feature-detect Web Share API with file support
 */
export function canShareFiles(): boolean {
  if (isTauriRuntime()) {
    return getRuntimeCapabilities().supports_native_share
  }

  if (typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare !== 'function') return false

  try {
    const testFile = new File([''], 'test.txt', {type: 'text/plain'})
    return navigator.canShare({files: [testFile]})
  } catch {
    return false
  }
}

async function shareFilesViaTauri(items: ShareableFileInput[]): Promise<void> {
  const response = await tauriInvoke<RpcResult<{shared: boolean}>>('catalog_share_files', {
    args: {
      items: items.map((item) => ({
        nodeId: item.fileId,
        fileName: item.fileName,
        mimeType: resolveShareMimeType(item) ?? null,
      })),
    },
  })

  if (!isSuccess(response)) {
    const message = response.error || 'catalog:share-files failed'
    const code = response.code ? ` (${response.code})` : ''
    throw new Error(`${message}${code}`)
  }
}

async function buildShareFile(item: ShareableFileInput): Promise<File> {
  const mimeType = resolveShareMimeType(item)
  const source = await loadFileSourceById(item.fileId, item.fileName, {
    mimeType,
    lastModified: item.lastModified,
  })
  if (!source.blob) {
    await source.release()
    throw new Error('Browser share requires a Blob-backed source')
  }

  try {
    return new File([source.blob], item.fileName, {
      type: mimeType ?? source.mimeType,
      lastModified: item.lastModified,
    })
  } finally {
    await source.release()
  }
}

/**
 * Shares files through the runtime-supported sharing path.
 */
export async function shareFiles(items: ShareableFileInput[]): Promise<void> {
  if (items.length === 0) return

  try {
    if (isTauriRuntime()) {
      if (canUseTauriNativeShare()) {
        await shareFilesViaTauri(items)
      }
      return
    }

    const files = await Promise.all(items.map((item) => buildShareFile(item)))
    await navigator.share({files})
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }
    console.error('Failed to share file:', error)
  }
}

/**
 * Shares a file through the runtime-supported sharing path.
 */
export async function shareFile(fileId: number, fileName: string): Promise<void> {
  await shareFiles([{fileId, fileName}])
}
