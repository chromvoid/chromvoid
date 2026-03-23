import {state} from '@statx/core'

export type UploadTaskStatus = 'uploading' | 'done' | 'error' | 'paused'

export type UploadTaskDirection = 'upload' | 'download'

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
}

export class UploadTask {
  readonly id: string
  readonly name: string
  readonly direction: UploadTaskDirection

  // Реактивные поля прогресса
  readonly loaded = state(0)
  readonly total = state(0)
  readonly status = state<UploadTaskStatus>('uploading')
  readonly speed = state(0)
  readonly eta = state(0)

  constructor(params: UploadTaskParams) {
    this.id = params.id
    this.name = params.name
    this.direction = params.direction ?? 'upload'
    this.total.set(Math.max(0, params.total))
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
    // Гарантируем, что loaded совпадает с total по завершении
    if (Number.isFinite(total) && total > 0) this.loaded.set(total)
    this.status.set('done')
    this.speed.set(0)
    this.eta.set(0)
  }

  markError(): void {
    this.status.set('error')
  }

  pause(): void {
    this.status.set('paused')
  }

  resume(): void {
    this.status.set('uploading')
  }
}
