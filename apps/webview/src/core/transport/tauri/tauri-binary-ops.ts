import type {RpcResult} from '@chromvoid/scheme'
import {isSuccess} from '@chromvoid/scheme'

import {tauriInvoke, tauriListen} from './ipc'

type UploadProgressPayload = {
  uploadId?: string
  sentBytes?: number
  totalBytes?: number
}

type DownloadProgressPayload = {
  downloadId?: string
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

function unwrapRpcResult<T>(result: RpcResult<T>, fallbackMessage: string): T {
  if (!isSuccess(result)) {
    const message = result.error || fallbackMessage
    const code = result.code ? ` (${result.code})` : ''
    throw new Error(`${message}${code}`)
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

export async function uploadFileViaTauri(
  nodeId: number,
  file: File,
  opts?: {
    chunkSize?: number
    name?: string
    type?: string
    onProgress?: (c: number, t: number, p: number) => void
  },
): Promise<void> {
  const chunkSize = opts?.chunkSize && opts.chunkSize > 0 ? Math.floor(opts.chunkSize) : 512 * 1024
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))
  const hasRaf = typeof requestAnimationFrame === 'function'
  let lastYield = typeof performance !== 'undefined' ? performance.now() : Date.now()
  let sentChunks = 0

  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const buffer = await file.slice(offset, offset + chunkSize).arrayBuffer()
    const bytes = new Uint8Array(buffer)

    const response = await tauriInvoke<RpcResult<unknown>>('catalog_upload_chunk', {
      nodeId,
      offset,
      chunk: bytes,
    })
    unwrapRpcResult(response, 'catalog:upload chunk failed')

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
  }
}

export async function statPathViaTauri(path: string): Promise<{name: string; size: number}> {
  const response = await tauriInvoke<RpcResult<{name: string; size: number}>>('file_stat', {path})
  return unwrapRpcResult(response, 'file_stat failed')
}

export async function uploadFilePathViaTauri(
  nodeId: number,
  path: string,
  opts?: {
    uploadId?: string
    chunkSize?: number
    totalBytes?: number
    onProgress?: (c: number, t: number, p: number) => void
  },
): Promise<void> {
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
    const readChunkSize = Math.max(chunkSize, 8 * 1024 * 1024)
    const response = await tauriInvoke<RpcResult<unknown>>('catalog_upload_path', {
      nodeId,
      path,
      uploadId,
      readChunkSize,
    })
    unwrapRpcResult(response, 'catalog:upload path failed')
  } finally {
    safeUnlisten(unlisten, 'catalog_upload_path')
  }
}

async function readBinaryPayload(
  command: string,
  nodeId: number,
  fallbackMessage: string,
): Promise<AsyncIterable<Uint8Array>> {
  const response = await tauriInvoke<RpcResult<BinaryPayload>>(command, {nodeId})
  const payload = unwrapRpcResult(response, fallbackMessage)
  const bytes = new Uint8Array(payload.bytes)
  const chunkSize =
    payload.meta.chunk_size && payload.meta.chunk_size > 0 ? payload.meta.chunk_size : 64 * 1024
  return toChunkedStream(bytes, chunkSize)
}

export async function downloadFileViaTauri(nodeId: number): Promise<AsyncIterable<Uint8Array>> {
  return readBinaryPayload('catalog_download', nodeId, 'catalog:download failed')
}

export async function downloadFilePathViaTauri(
  nodeId: number,
  targetPath: string,
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
      {args: {nodeId, targetPath, downloadId}},
    )
    return unwrapRpcResult(response, 'catalog_download_path failed')
  } finally {
    safeUnlisten(unlisten, 'catalog_download_path')
  }
}

export async function readSecretViaTauri(nodeId: number): Promise<AsyncIterable<Uint8Array>> {
  return readBinaryPayload('catalog_secret_read', nodeId, 'catalog:secret:read failed')
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
