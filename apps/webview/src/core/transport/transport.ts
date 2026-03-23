import type {RuntimeCapabilities} from '../runtime/runtime-capabilities'

export type Atom<T> = {
  (): T
  set: (v: T) => void
  subscribe: (cb: (v: T) => void) => () => void
}

export type TransportEventHandler<TPayload = unknown> = (message: unknown, payload: TPayload) => void

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

  uploadFile(
    nodeId: number,
    file: File,
    opts?: {
      chunkSize?: number
      name?: string
      type?: string
      onProgress?: (c: number, t: number, p: number) => void
    },
  ): Promise<void>

  // Optional fast path for Desktop (Tauri): upload directly from a native file path.
  // Web runtimes can't access paths for security reasons.
  statPath?: (path: string) => Promise<{name: string; size: number}>
  uploadFilePath?: (
    nodeId: number,
    path: string,
    opts?: {
      uploadId?: string
      chunkSize?: number
      totalBytes?: number
      onProgress?: (c: number, t: number, p: number) => void
    },
  ) => Promise<void>

  downloadFilePath?: (
    nodeId: number,
    targetPath: string,
    opts?: {
      downloadId?: string
      totalBytes?: number
      onProgress?: (writtenBytes: number, totalBytes: number, percent: number) => void
    },
  ) => Promise<{bytes_written: number; name: string; mime_type: string}>

  downloadFile(nodeId: number): Promise<AsyncIterable<Uint8Array>>

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
