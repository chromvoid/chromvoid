import {action, atom, computed, wrap} from '@reatom/core'

import type {AppContext} from 'root/shared/services/app-context'
import {toast} from 'root/shared/services/toast-manager'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import {canShareFiles, shareFiles} from 'root/shared/services/share'
import {saveImageToGallery} from 'root/shared/services/save-image-to-gallery'
import {resolveFileFormat} from 'root/utils/file-format-registry'

import type {FileItemData} from 'root/shared/contracts/file-manager'

type NotificationKind = 'success' | 'error' | 'warning' | 'info'
type ExternalOpenProgressUpdate = {
  loaded: number
  total: number
  status: 'uploading'
}

export const OPEN_EXTERNAL_HUD_DELAY_MS = 150

export class FileDownloadFlow {
  readonly externalOpenTaskByNodeId = atom<Record<number, string>>({})
  readonly shareTaskByNodeId = atom<Record<number, string>>({})

  readonly externalOpenPendingIds = computed<number[]>(() => {
    return Object.keys(this.externalOpenTaskByNodeId())
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  })

  private shareTaskSeq = 0

  constructor(private readonly ctx: AppContext) {}

  private readonly updateTransferTaskFromExternalCallback = action(
    (
      taskId: string,
      updates: {
        loaded?: number
        total?: number
        speed?: number
        eta?: number
        status?: 'uploading'
      },
    ): void => {
      this.ctx.store.updateUploadTask(taskId, updates)
    },
    'fileDownload.externalCallback.updateTransferTask',
  )

  isExternalOpenPending(nodeId: number): boolean {
    return this.externalOpenTaskByNodeId()[nodeId] !== undefined
  }

  isSharePending(nodeId: number): boolean {
    return this.shareTaskByNodeId()[nodeId] !== undefined
  }

  async handleShare(item: FileItemData): Promise<void> {
    if (item.isDir) return
    if (this.isSharePending(item.id)) return

    const shareTaskId = this.setShareTask([item.id])
    try {
      await wrap(
        shareFiles([
          {
            fileId: item.id,
            fileName: item.name,
            mimeType: item.mimeType,
            lastModified: item.lastModified,
          },
        ]),
      )
    } finally {
      this.clearShareTask([item.id], shareTaskId)
    }
  }

  async shareFileById(item: {
    fileId: number
    fileName: string
    mimeType?: string
    lastModified?: number
  }): Promise<void> {
    if (!canShareFiles()) return
    if (this.isSharePending(item.fileId)) return

    const shareTaskId = this.setShareTask([item.fileId])
    try {
      await wrap(shareFiles([item]))
    } finally {
      this.clearShareTask([item.fileId], shareTaskId)
    }
  }

  async shareFilesBatch(
    items: Array<{
      fileId: number
      fileName: string
      mimeType?: string
      lastModified?: number
    }>,
  ): Promise<void> {
    const pending = this.shareTaskByNodeId()
    const shareItems = items.filter((item) => pending[item.fileId] === undefined)
    if (shareItems.length === 0) return

    const shareIds = shareItems.map((item) => item.fileId)
    const shareTaskId = this.setShareTask(shareIds)
    try {
      await wrap(shareFiles(shareItems))
    } finally {
      this.clearShareTask(shareIds, shareTaskId)
    }
  }

  async handleSaveToGallery(item: FileItemData): Promise<void> {
    if (item.isDir) return
    const caps = getRuntimeCapabilities()
    if (caps.platform !== 'android') return
    if (resolveFileFormat(item).openBehavior.kind !== 'gallery') return

    const dismissSaving = toast.loading(i18n('file-manager:saving-to-gallery', {name: item.name}), undefined, {
      position: 'bottom-center',
    })

    try {
      await wrap(saveImageToGallery(item.id, item.name, item.mimeType))
      dismissSaving()
      const message = i18n('file-manager:saved-to-gallery', {name: item.name})
      this.notify('success', message)
      toast.success(message, undefined, {position: 'bottom-center'})
    } catch (error) {
      dismissSaving()
      const message = i18n('file-manager:save-to-gallery-failed', {
        message: error instanceof Error ? error.message : String(error),
      })
      this.notify('error', message)
      toast.error(message, undefined, {position: 'bottom-center'})
    }
  }

  async handleOpenExternal(item: FileItemData): Promise<void> {
    if (item.isDir) return
    if (this.isExternalOpenPending(item.id)) return
    const caps = getRuntimeCapabilities()
    if (!caps.supports_open_external) {
      if (canShareFiles()) {
        await this.handleShare(item)
        return
      }
      this.notify('info', i18n('file-manager:desktop-only-open'))
      return
    }

    const {store, ws} = this.ctx
    const openId = crypto.randomUUID()
    const pendingTaskId = `pending:${openId}`
    const totalBytes = typeof item.size === 'number' ? Math.max(0, Math.floor(item.size)) : 0
    let taskId: string | null = null
    let latestProgress: ExternalOpenProgressUpdate | null = null
    this.setExternalOpenTask(item.id, pendingTaskId)

    let hudTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      hudTimer = null
      if (this.externalOpenTaskByNodeId()[item.id] !== pendingTaskId) return

      const created = store.createOpenExternalTask(item.name, totalBytes)
      taskId = created.id
      if (!this.replaceExternalOpenTask(item.id, pendingTaskId, taskId)) return
      if (latestProgress) {
        this.updateTransferTaskFromExternalCallback(taskId, latestProgress)
      }
    }, OPEN_EXTERNAL_HUD_DELAY_MS)

    const cancelPendingHud = () => {
      if (hudTimer === null) return
      clearTimeout(hudTimer)
      hudTimer = null
    }

    try {
      if (ws.kind !== 'tauri' || typeof ws.openExternal !== 'function') {
        throw new Error('Open external transport unavailable')
      }

      await wrap(
        ws.openExternal(item.id, {
          openId,
          onProgress: (writtenBytes: number, total: number) => {
            latestProgress = {
              loaded: writtenBytes,
              total,
              status: 'uploading',
            }
            if (taskId !== null) {
              this.updateTransferTaskFromExternalCallback(taskId, latestProgress)
            }
          },
        }),
      )
      cancelPendingHud()
      if (taskId !== null) {
        store.updateUploadTask(taskId, {status: 'done'})
      }
    } catch (error) {
      cancelPendingHud()
      if (taskId !== null) {
        store.updateUploadTask(taskId, {status: 'error'})
      }
      this.notify(
        'error',
        i18n('file-manager:open-file-failed-detail', {
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    } finally {
      this.clearExternalOpenTask(item.id, taskId ?? pendingTaskId)
    }
  }

  async handleDownload(item: FileItemData): Promise<void> {
    const {catalog, ws, store} = this.ctx
    if (item.isDir) return

    let taskId: string | null = null

    try {
      const caps = getRuntimeCapabilities()
      if (caps.supports_photo_library_save && resolveFileFormat(item).openBehavior.kind === 'gallery') {
        await this.handleSaveToGallery(item)
        return
      }

      if (
        caps.supports_native_path_io &&
        ws.kind === 'tauri' &&
        typeof ws.pickDownloadTarget === 'function' &&
        typeof ws.downloadFilePath === 'function'
      ) {
        const target = await wrap(ws.pickDownloadTarget({defaultPath: item.name}))
        if (!target) {
          this.notify('info', i18n('file-manager:save-cancelled', {name: item.name}))
          return
        }

        const totalBytes = typeof item.size === 'number' ? Math.max(0, Math.floor(item.size)) : 0
        taskId = store.createDownloadTask(item.name, totalBytes).id

        const startTime = Date.now()
        let lastUiUpdate = 0
        const result = await wrap(
          ws.downloadFilePath(item.id, target.token, {
            totalBytes,
            onProgress: (writtenBytes: number, total: number, percent: number) => {
              const now = Date.now()
              if (percent < 100 && now - lastUiUpdate < 120) return
              lastUiUpdate = now

              const totalSafe = total > 0 ? total : totalBytes
              const loaded = Math.min(
                Math.max(0, writtenBytes),
                totalSafe > 0 ? totalSafe : writtenBytes,
              )
              const elapsed = Math.max(0.001, (Date.now() - startTime) / 1000)
              const speed = loaded / elapsed
              const eta = totalSafe > 0 ? (totalSafe - loaded) / Math.max(1, speed) : 0
              if (taskId) {
                this.updateTransferTaskFromExternalCallback(taskId, {
                  loaded,
                  speed,
                  eta: Number.isFinite(eta) ? eta : 0,
                })
              }
            },
          }),
        )

        if (totalBytes > 0 && result.bytes_written !== totalBytes) {
          this.notify(
            'warning',
            i18n('file-manager:save-size-mismatch', {
              name: item.name,
              actual: result.bytes_written,
              expected: totalBytes,
              path: target.name,
            }),
          )
          return
        }

        if (taskId) {
          store.updateUploadTask(taskId, {loaded: totalBytes})
          store.updateUploadTask(taskId, {status: 'done'})
        }

        this.notify(
          'success',
          i18n('file-manager:saved', {name: item.name, path: target.name}),
        )
        return
      }

      const totalBytes = typeof item.size === 'number' ? Math.max(0, Math.floor(item.size)) : 0
      taskId = store.createDownloadTask(item.name, totalBytes).id

      const stream = await wrap(catalog.api.download(item.id))
      const chunks: ArrayBuffer[] = []
      let total = 0
      let chunkCount = 0
      const startTime = Date.now()
      let lastUiUpdate = 0
      const iterator = stream[Symbol.asyncIterator]()
      while (true) {
        const next = await wrap(iterator.next())
        if (next.done) break

        const chunk = next.value
        const copy = new ArrayBuffer(chunk.byteLength)
        new Uint8Array(copy).set(chunk)
        chunks.push(copy)
        total += copy.byteLength
        chunkCount++

        const now = Date.now()
        if (totalBytes > 0 && now - lastUiUpdate >= 120) {
          lastUiUpdate = now
          const loaded = Math.min(total, totalBytes)
          const elapsed = Math.max(0.001, (Date.now() - startTime) / 1000)
          const speed = loaded / elapsed
          const eta = (totalBytes - loaded) / Math.max(1, speed)
          if (taskId) store.updateUploadTask(taskId, {loaded, speed, eta: Number.isFinite(eta) ? eta : 0})
        }
      }

      const expectedSize = item.size ?? total
      if (expectedSize && total !== expectedSize) {
        if (taskId) store.updateUploadTask(taskId, {status: 'error'})
        this.notify(
          'error',
          i18n('file-manager:download-size-error', {
            name: item.name,
            actual: total,
            expected: expectedSize,
            chunks: chunkCount,
          }),
        )
        return
      }

      const mime = resolveFileFormat(item).mimeType
      const blob = new Blob(chunks, {type: mime})
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = item.name
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Let the browser start the download before revoking the URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)

      if (taskId) {
        store.updateUploadTask(taskId, {loaded: totalBytes || total})
        store.updateUploadTask(taskId, {status: 'done'})
      }

      this.notify('success', i18n('file-manager:downloaded', {name: item.name}))
    } catch (error) {
      if (taskId) store.updateUploadTask(taskId, {status: 'error'})
      this.notify(
        'error',
        i18n('file-manager:download-failed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  private setExternalOpenTask(nodeId: number, taskId: string) {
    this.externalOpenTaskByNodeId.set({
      ...this.externalOpenTaskByNodeId(),
      [nodeId]: taskId,
    })
  }

  private clearExternalOpenTask(nodeId: number, taskId: string) {
    const next = {...this.externalOpenTaskByNodeId()}
    if (next[nodeId] !== taskId) return
    delete next[nodeId]
    this.externalOpenTaskByNodeId.set(next)
  }

  private replaceExternalOpenTask(nodeId: number, expectedTaskId: string, nextTaskId: string): boolean {
    const current = this.externalOpenTaskByNodeId()
    if (current[nodeId] !== expectedTaskId) return false
    this.externalOpenTaskByNodeId.set({
      ...current,
      [nodeId]: nextTaskId,
    })
    return true
  }

  private setShareTask(nodeIds: number[]): string {
    const taskId = String(++this.shareTaskSeq)
    const next = {...this.shareTaskByNodeId()}
    for (const nodeId of nodeIds) {
      next[nodeId] = taskId
    }
    this.shareTaskByNodeId.set(next)
    return taskId
  }

  private clearShareTask(nodeIds: number[], taskId: string) {
    const next = {...this.shareTaskByNodeId()}
    let changed = false
    for (const nodeId of nodeIds) {
      if (next[nodeId] !== taskId) continue
      delete next[nodeId]
      changed = true
    }
    if (changed) {
      this.shareTaskByNodeId.set(next)
    }
  }

  private notify(type: NotificationKind, message: string) {
    this.ctx.store.pushNotification(type, message)
  }
}
