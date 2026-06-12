import {atom, wrap} from '@reatom/core'
import {getCurrentWindow} from '@tauri-apps/api/window'

import type {AppContext} from 'root/shared/services/app-context'
import type {HostPathTokenGrant} from 'root/core/transport/transport'
import {DragDropService} from 'root/shared/services/drag-drop'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'

export class FileUploadFlow {
  readonly isDragActive = atom(false)

  private dragDrop?: DragDropService
  private unlistenTauriDragDrop?: () => void
  private toolbarUploadTrigger?: () => void

  constructor(
    private readonly ctx: AppContext,
    private readonly getCurrentPath: () => string,
  ) {}

  connect(): void {
    const caps = getRuntimeCapabilities()
    const isTauri = isTauriRuntime()

    this.dragDrop = new DragDropService({
      onFiles: async (files: FileList) => {
        // Android/iOS native imports preserve platform metadata; desktop path tokens are picker-issued.
        if (this.canUseNativeUpload()) return
        await this.handleFileUpload(files)
      },
      onActiveChange: (active: boolean) => {
        this.isDragActive.set(active)
      },
    })
    this.dragDrop.attach()
    writeAndroidUnlockDebug('file-manager-model', 'connect:dragDrop attached', {
      isTauri,
      nativePathIo: caps.supports_native_path_io,
    })

    if (isTauri && caps.supports_native_path_io) {
      writeAndroidUnlockDebug('file-manager-model', 'connect:setupTauriDragDrop scheduled')
      void this.setupTauriDragDrop()
    }
  }

  cleanup(): void {
    this.dragDrop?.detach()
    this.dragDrop = undefined

    if (this.unlistenTauriDragDrop) {
      try {
        this.unlistenTauriDragDrop()
      } catch {
        // Best-effort cleanup.
      }
      this.unlistenTauriDragDrop = undefined
    }
  }

  async handleFileUpload(files: FileList): Promise<void> {
    // For API: transmit the UI path; the store itself converts the root to undefined.
    await this.ctx.store.startUploadFiles(this.getCurrentPath(), Array.from(files))
  }

  async handlePathUpload(files: HostPathTokenGrant[]): Promise<void> {
    await this.ctx.store.startUploadPaths(this.getCurrentPath(), files)
  }

  async handleNativeUpload(): Promise<void> {
    await this.ctx.store.startNativeUploadFiles(this.getCurrentPath())
  }

  async handleToolbarUpload(): Promise<void> {
    if (this.canUseNativeUpload()) {
      await this.handleNativeUpload()
      return
    }

    if (this.canUseNativePathUpload()) {
      try {
        const files = await wrap(this.ctx.ws.pickUploadFiles?.() ?? Promise.resolve([]))
        if (files.length > 0) {
          await this.handlePathUpload(files)
        }
        return
      } catch {
        // fall through to the registered browser input trigger
      }
    }

    this.toolbarUploadTrigger?.()
  }

  registerToolbarUploadTrigger(trigger: () => void): () => void {
    this.toolbarUploadTrigger = trigger
    return () => {
      if (this.toolbarUploadTrigger === trigger) {
        this.toolbarUploadTrigger = undefined
      }
    }
  }

  canUseNativePathUpload(): boolean {
    return (
      isTauriRuntime() &&
      getRuntimeCapabilities().supports_native_path_io &&
      this.ctx.store.remoteSessionState() === 'inactive'
    )
  }

  canUseNativeUpload(): boolean {
    return (
      isTauriRuntime() &&
      getRuntimeCapabilities().supports_native_file_upload &&
      this.ctx.store.remoteSessionState() === 'inactive'
    )
  }

  private async setupTauriDragDrop(): Promise<void> {
    try {
      writeAndroidUnlockDebug('file-manager-model', 'setupTauriDragDrop:start')
      const win = getCurrentWindow()

      // NOTE: Tauri drag-drop events carry native file paths.
      this.unlistenTauriDragDrop = await wrap(win.onDragDropEvent(wrap((event: unknown) => {
        const payload = (event as {payload?: unknown})?.payload ?? event
        const type = (payload as {type?: string})?.type

        if (type === 'enter') {
          this.isDragActive.set(true)
          return
        }

        if (type === 'leave') {
          this.isDragActive.set(false)
          return
        }

        if (type === 'drop') {
          this.isDragActive.set(false)

          // Native drop paths are intentionally not consumed by upload IPC. Path upload grants
          // must be issued by the backend picker; regular browser FileList drops use DragDropService.
        }
      })))
      writeAndroidUnlockDebug('file-manager-model', 'setupTauriDragDrop:listener ready')
    } catch {
      writeAndroidUnlockDebug('file-manager-model', 'setupTauriDragDrop:error')
      // Best-effort: web drag-drop still works.
    }
  }
}
