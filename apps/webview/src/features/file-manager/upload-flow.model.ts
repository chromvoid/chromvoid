import {atom, wrap} from '@reatom/core'
import {open} from '@tauri-apps/plugin-dialog'
import {getCurrentWindow} from '@tauri-apps/api/window'

import type {AppContext} from 'root/shared/services/app-context'
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
        // In native runtimes we avoid routing file bytes through the WebView.
        if (this.canUseNativeUpload() || this.canUseNativePathUpload()) return
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

  async handlePathUpload(paths: string[]): Promise<void> {
    await this.ctx.store.startUploadPaths(this.getCurrentPath(), paths)
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
        const selected = await wrap(open({multiple: true, directory: false}))
        const paths = Array.isArray(selected) ? selected : selected ? [selected] : []
        if (paths.length > 0) {
          await this.handlePathUpload(paths)
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
      this.unlistenTauriDragDrop = await win.onDragDropEvent((event: unknown) => {
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

          const paths = (payload as {paths?: unknown})?.paths
          if (this.canUseNativePathUpload() && Array.isArray(paths) && paths.length > 0) {
            void this.handlePathUpload(paths.filter((p): p is string => typeof p === 'string'))
          }
        }
      })
      writeAndroidUnlockDebug('file-manager-model', 'setupTauriDragDrop:listener ready')
    } catch {
      writeAndroidUnlockDebug('file-manager-model', 'setupTauriDragDrop:error')
      // Best-effort: web drag-drop still works.
    }
  }
}
