import {atom} from '@reatom/core'

export type UploadTaskStatus = 'queued' | 'uploading' | 'done' | 'error' | 'paused'

export type UploadTaskDirection = 'upload' | 'download'
export type UploadTaskKind = 'transfer' | 'open-external'

export type UploadStats = {
  total: number
  completed: number
  failed: number
  uploading: number
  overallProgress: number
  totalBytes: number
  loadedBytes: number
}

export type UploadTaskParams = {
  id: string
  name: string
  total: number
  direction?: UploadTaskDirection
  kind?: UploadTaskKind
  initialStatus?: UploadTaskStatus
  autoRemoveDoneMs?: number
  batchId?: string
  batchIndex?: number
  batchCount?: number
  retryable?: boolean
  errorMessage?: string | null
}

export class UploadTask {
  readonly id: string
  readonly name: string
  readonly direction: UploadTaskDirection
  readonly kind: UploadTaskKind
  readonly autoRemoveDoneMs: number | null
  readonly batchId: string
  readonly batchIndex: number
  readonly batchCount: number
  readonly retryable: boolean

  // Progress reactive fields
  readonly loaded = atom(0)
  readonly total = atom(0)
  readonly status = atom<UploadTaskStatus>('uploading')
  readonly speed = atom(0)
  readonly eta = atom(0)
  readonly errorMessage = atom<string | null>(null)

  constructor(params: UploadTaskParams) {
    this.id = params.id
    this.name = params.name
    this.direction = params.direction ?? 'upload'
    this.kind = params.kind ?? 'transfer'
    this.batchId = params.batchId ?? params.id
    this.batchIndex = Math.max(0, Math.floor(params.batchIndex ?? 0))
    this.batchCount = Math.max(1, Math.floor(params.batchCount ?? 1))
    this.retryable = params.retryable === true
    this.autoRemoveDoneMs =
      typeof params.autoRemoveDoneMs === 'number' && params.autoRemoveDoneMs > 0
        ? params.autoRemoveDoneMs
        : null
    this.total.set(Math.max(0, params.total))
    this.status.set(params.initialStatus ?? 'uploading')
    this.errorMessage.set(params.errorMessage ?? null)
  }

  setTotal(totalBytes: number): void {
    this.total.set(Math.max(0, totalBytes))
  }

  setProgress(loadedBytes: number, speedBytesPerSec?: number, etaSeconds?: number): void {
    const total = this.total()
    const clamped = Math.min(Math.max(0, loadedBytes), total > 0 ? total : loadedBytes)
    this.loaded.set(clamped)
    if (typeof speedBytesPerSec === 'number' && Number.isFinite(speedBytesPerSec)) {
      this.speed.set(Math.max(0, speedBytesPerSec))
    }
    if (typeof etaSeconds === 'number' && Number.isFinite(etaSeconds)) {
      this.eta.set(Math.max(0, etaSeconds))
    }
  }

  markDone(): void {
    const total = this.total()
    // We guarantee that loaded matches total at completion.
    if (Number.isFinite(total) && total > 0) this.loaded.set(total)
    this.status.set('done')
    this.errorMessage.set(null)
    this.speed.set(0)
    this.eta.set(0)
  }

  markError(message?: string | null): void {
    if (message !== undefined) this.errorMessage.set(message)
    this.status.set('error')
  }

  setErrorMessage(message: string | null): void {
    this.errorMessage.set(message)
  }

  markQueued(): void {
    this.status.set('queued')
    this.errorMessage.set(null)
  }

  pause(): void {
    this.status.set('paused')
  }

  resume(): void {
    this.status.set('uploading')
    this.errorMessage.set(null)
  }
}
