import {computed, state} from '@statx/core'
import {save} from '@tauri-apps/plugin-dialog'
import {getCurrentWindow} from '@tauri-apps/api/window'

import type {AppContext} from 'root/shared/services/app-context'
import {getAppContext} from 'root/shared/services/app-context'
import {dialogService} from 'root/shared/services/dialog'
import {CatalogUIService} from 'root/shared/services/catalog-ui'
import {DragDropService} from 'root/shared/services/drag-drop'
import {PASS_DIR} from 'root/core/pass-utils'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {isSuccess, type RpcResult} from '@chromvoid/scheme'
import {isImageFile, isVideoFile, isPlayableVideoFile} from 'root/utils/mime-type'
import {canShareFiles, shareFile} from 'root/shared/services/share'

import type {ContextMenuItem} from './components/context-menu'
import type {FileItemData, FileListItem, SearchFilters} from 'root/shared/contracts/file-manager'

type NotificationKind = 'success' | 'error' | 'warning' | 'info'

export class FileManagerModel {
  readonly isLoading = state(false)
  readonly error = state<string | null>(null)
  readonly isDragActive = state(false)

  private readonly ctx: AppContext
  private readonly catalogUI = new CatalogUIService()

  private readonly catalogRevision = state(0)
  private connected = false

  private unsubscribeMirror?: () => void
  private unsubscribeAuth?: () => void
  private dragDrop?: DragDropService
  private unlistenTauriDragDrop?: () => void

  constructor(ctx: AppContext = getAppContext()) {
    this.ctx = ctx
  }

  get currentPath() {
    return this.ctx.store.currentPath
  }

  get searchFilters() {
    return this.ctx.store.searchFilters
  }

  get selectedItems() {
    return this.ctx.store.selectedNodeIds
  }

  readonly fileItems = computed<FileListItem[]>(() => {
    // Ensure recompute when catalog mirror changes.
    void this.catalogRevision()
    return this.getFileItems()
  })

  readonly filteredCount = computed<number>(() => {
    return this.catalogUI.filterAndSort(this.fileItems(), this.searchFilters()).length
  })

  readonly totalFiles = computed<number>(() => this.fileItems().length)
  readonly selectedCount = computed<number>(() => this.selectedItems().length)

  connect(): void {
    if (this.connected) return
    this.connected = true

    window.addEventListener('command-bar:command', this.onCommandBarCommand)
    this.setupCatalogSubscription()

    const {ws} = this.ctx
    this.unsubscribeAuth = ws.connected.subscribe((isConnected: boolean) => {
      if (isConnected) {
        this.setupCatalogSubscription()
      }
    })

    const caps = getRuntimeCapabilities()
    const isTauri = isTauriRuntime()
    this.dragDrop = new DragDropService({
      onFiles: async (files: FileList) => {
        // In Desktop (Tauri) we prefer path-based uploads via native drag-drop.
        if (this.canUseNativePathUpload()) return
        await this.handleFileUpload(files)
      },
      onActiveChange: (active: boolean) => {
        this.isDragActive.set(active)
      },
    })
    this.dragDrop.attach()

    if (isTauri && caps.supports_native_path_io) {
      void this.setupTauriDragDrop()
    }
  }

  cleanup(): void {
    if (!this.connected) return
    this.connected = false

    if (this.unsubscribeMirror) {
      this.unsubscribeMirror()
      this.unsubscribeMirror = undefined
    }
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth()
      this.unsubscribeAuth = undefined
    }
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

    window.removeEventListener('command-bar:command', this.onCommandBarCommand)
  }

  clearError(): void {
    this.error.set(null)
  }

  handleNavigate(path: string): void {
    const {store} = this.ctx
    store.setCurrentPath(path)
  }

  handleFiltersChange(filters: SearchFilters): void {
    const {store} = this.ctx
    store.setSearchFilters(filters)
  }

  handleSelectionChange(selectedNodeIds: number[]): void {
    const {store} = this.ctx
    store.setSelectedItems(selectedNodeIds)
  }

  getFileItemById(nodeId: number): FileItemData | null {
    const items = this.getFileItems()
    return items.find((i) => i.id === nodeId) ?? null
  }

  async handleMove(source: FileItemData, target: FileItemData): Promise<void> {
    const {catalog, store} = this.ctx
    try {
      if (!target?.isDir) return
      if (!source || source.id === target.id) return
      const sourcePath = source.path || ''
      const targetPath = target.path || '/'
      // Нельзя перемещать папку в саму себя или в своего потомка
      if (source.isDir && targetPath.startsWith(sourcePath)) {
        this.showNotification('warning', 'Нельзя переместить папку в саму себя или её подпапку')
        return
      }
      // Если родитель уже совпадает — ничего не делаем
      try {
        const parentPath = sourcePath.endsWith('/')
          ? sourcePath.slice(0, sourcePath.lastIndexOf('/', sourcePath.length - 2) + 1) || '/'
          : sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1) || '/'
        if (parentPath === targetPath) return
      } catch {
        // Ignore parent path parse issues.
      }

      this.isLoading.set(true)
      // Для API используем UI-путь (без префикса /root)
      await catalog.api.move(source.id, targetPath)
      try {
        await catalog.refresh()
      } catch {
        // ignore
      }
      try {
        store.setSelectedItems([])
      } catch {
        // ignore
      }
      this.showNotification('success', `Перемещено: "${source.name}" → "${target.name}"`)
    } catch (error) {
      this.showNotification(
        'error',
        `Не удалось переместить: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      this.isLoading.set(false)
    }
  }

  async handleItemOpen(item: FileItemData): Promise<void> {
    const {catalog, store} = this.ctx
    if (!item.isDir) return

    // Формируем новый путь с правильной нормализацией
    const currentPath = this.currentPath()
    const newPath = this.buildDirectoryPath(currentPath, item.name)

    // Проверяем что новый путь отличается от текущего
    if (newPath === currentPath) {
      return
    }

    // Валидируем что папка существует в каталоге
    try {
      if (catalog?.catalog) {
        // Проверяем доступность пути
        catalog.catalog.getChildren(newPath)
        // Если не выбросилась ошибка, значит путь валидный
        store.setCurrentPath(newPath)
      }
    } catch {
      this.showNotification('error', `Не удалось открыть папку "${item.name}"`)
    }
  }

  async handleOpen(item: FileItemData): Promise<void> {
    if (item.isDir) {
      await this.handleItemOpen(item)
      return
    }

    if (isImageFile(item.name)) {
      window.dispatchEvent(
        new CustomEvent('open-gallery', {
          detail: {fileId: item.id},
        }),
      )
      return
    }

    if (isPlayableVideoFile(item.name)) {
      window.dispatchEvent(
        new CustomEvent('open-video', {
          detail: {fileId: item.id, fileName: item.name},
        }),
      )
      return
    }

    await this.handleOpenExternal(item)
  }

  async handleShare(item: FileItemData): Promise<void> {
    if (item.isDir) return
    await shareFile(item.id, item.name)
  }

  async handleOpenExternal(item: FileItemData): Promise<void> {
    if (item.isDir) return
    const caps = getRuntimeCapabilities()
    if (!caps.supports_open_external) {
      if (canShareFiles()) {
        await this.handleShare(item)
        return
      }
      this.showNotification('info', 'Открытие доступно только в desktop приложении')
      return
    }
    try {
      const res = await tauriInvoke<RpcResult<unknown>>('catalog_open_external', {
        args: {nodeId: item.id},
      })
      if (!res || typeof res !== 'object') {
        this.showNotification('error', 'Не удалось открыть файл')
        return
      }
      if (!isSuccess(res)) {
        const msg = res.error || 'Не удалось открыть файл'
        this.showNotification('error', msg)
        return
      }
    } catch (error) {
      this.showNotification(
        'error',
        `Не удалось открыть файл: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async handleRename(item: FileItemData): Promise<void> {
    const {catalog} = this.ctx
    const currentPath = this.currentPath()
    const newNameRaw = item.isDir
      ? await dialogService.showRenameFolderDialog(item.name, currentPath)
      : await dialogService.showRenameFileDialog(item.name, currentPath)
    const newName = newNameRaw?.trim()
    if (!newName || newName === item.name) return

    try {
      this.isLoading.set(true)
      await catalog.api.rename(item.id, newName)
      this.showNotification('success', `"${item.name}" переименован в "${newName}"`)
    } catch (error) {
      this.showNotification(
        'error',
        `Не удалось переименовать файл: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      this.isLoading.set(false)
    }
  }

  async handleDownload(item: FileItemData): Promise<void> {
    const {catalog, ws, store} = this.ctx
    if (item.isDir) return

    let taskId: string | null = null

    try {
      const caps = getRuntimeCapabilities()
      if (caps.supports_native_path_io && ws.kind === 'tauri' && typeof ws.downloadFilePath === 'function') {
        const targetPath = await save({defaultPath: item.name})
        if (!targetPath) {
          this.showNotification('info', `Сохранение "${item.name}" отменено`)
          return
        }

        const totalBytes = typeof item.size === 'number' ? Math.max(0, Math.floor(item.size)) : 0
        taskId = store.createDownloadTask(item.name, totalBytes).id

        const startTime = Date.now()
        let lastUiUpdate = 0
        const result = await ws.downloadFilePath(item.id, targetPath, {
          totalBytes,
          onProgress: (writtenBytes: number, total: number, percent: number) => {
            const now = Date.now()
            if (percent < 100 && now - lastUiUpdate < 120) return
            lastUiUpdate = now

            const totalSafe = total > 0 ? total : totalBytes
            const loaded = Math.min(Math.max(0, writtenBytes), totalSafe > 0 ? totalSafe : writtenBytes)
            const elapsed = Math.max(0.001, (Date.now() - startTime) / 1000)
            const speed = loaded / elapsed
            const eta = totalSafe > 0 ? (totalSafe - loaded) / Math.max(1, speed) : 0
            if (taskId) store.updateUploadTask(taskId, {loaded, speed, eta: Number.isFinite(eta) ? eta : 0})
          },
        })

        try {
          if (typeof ws.statPath === 'function') {
            const st = await ws.statPath(targetPath)
            if (st.size !== result.bytes_written) {
              this.showNotification(
                'warning',
                `Файл "${item.name}" сохранён, но размер отличается: ${st.size} vs ${result.bytes_written}. Путь: ${targetPath}`,
              )
              return
            }
          }
        } catch (e) {
          console.warn('[dashboard] statPath after download failed', e)
        }

        if (taskId) {
          store.updateUploadTask(taskId, {loaded: totalBytes})
          store.updateUploadTask(taskId, {status: 'done'})
        }

        this.showNotification('success', `Файл "${item.name}" сохранён: ${targetPath}`)
        return
      }

      const totalBytes = typeof item.size === 'number' ? Math.max(0, Math.floor(item.size)) : 0
      taskId = store.createDownloadTask(item.name, totalBytes).id

      const stream = await catalog.api.download(item.id)
      const chunks: ArrayBuffer[] = []
      let total = 0
      let chunkCount = 0
      const startTime = Date.now()
      let lastUiUpdate = 0
      for await (const chunk of stream) {
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
        this.showNotification(
          'error',
          `Ошибка загрузки "${item.name}": получено ${total} байт из ожидаемых ${expectedSize} (чанков: ${chunkCount})`,
        )
        return
      }

      const ext = item.name.split('.').pop()?.toLowerCase()
      const mime =
        ext === 'png'
          ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'gif'
              ? 'image/gif'
              : ext === 'webp'
                ? 'image/webp'
                : 'application/octet-stream'
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

      this.showNotification('success', `Файл "${item.name}" скачан`)
    } catch (error) {
      if (taskId) store.updateUploadTask(taskId, {status: 'error'})
      this.showNotification(
        'error',
        `Не удалось скачать файл: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async handleDelete(item: FileItemData): Promise<void> {
    const {catalog, store} = this.ctx
    const confirmed = await dialogService.showDeleteConfirmDialog([item.name], item.isDir)
    if (!confirmed) return

    try {
      this.isLoading.set(true)
      await catalog.api.delete(item.id)
      try {
        await catalog.refresh()
      } catch {
        // ignore
      }
      try {
        store.setSelectedItems([])
      } catch {
        // ignore
      }
      this.showNotification('success', `"${item.name}" удален`)
    } catch (error) {
      this.showNotification(
        'error',
        `Не удалось удалить файл: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      this.isLoading.set(false)
    }
  }

  async handleDownloadSelected(): Promise<void> {
    const selected = this.selectedItems()
    if (selected.length === 0) return
    const items = this.fileItems().filter((i) => selected.includes(i.id))
    for (const item of items) {
      if (!item.isDir) {
        await this.handleDownload(item)
      }
    }
  }

  async handleDeleteSelected(): Promise<void> {
    const {catalog, store} = this.ctx
    const selected = this.selectedItems()
    if (selected.length === 0) return

    const items = this.fileItems().filter((i) => selected.includes(i.id))
    const confirmed = await dialogService.showDeleteConfirmDialog(items.map((i) => i.name))
    if (!confirmed) return
    for (const item of items) {
      try {
        await catalog.api.delete(item.id)
      } catch (error) {
        this.showNotification(
          'error',
          `Не удалось удалить ${item.name}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    try {
      await catalog.refresh()
    } catch {
      // ignore
    }
    try {
      store.setSelectedItems([])
    } catch {
      // ignore
    }
    this.showNotification('success', 'Выбранные элементы удалены')
  }

  async handleCreateDir(): Promise<void> {
    const {catalog} = this.ctx
    const currentPath = this.currentPath()
    const displayPath = currentPath === '/' ? 'корневой каталог' : currentPath

    const name = await dialogService.showCreateFolderDialog(displayPath)
    if (!name) return

    try {
      this.isLoading.set(true)
      // Для API: в корне передаём undefined, иначе — UI-путь
      await catalog.api.createDir(name, currentPath === '/' ? undefined : currentPath)
      try {
        await catalog.refresh()
      } catch {
        // ignore
      }
      this.showNotification('success', `Папка "${name}" создана`)
    } catch (error) {
      this.showNotification(
        'error',
        `Не удалось создать папку: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      this.isLoading.set(false)
    }
  }

  async handleFileUpload(files: FileList): Promise<void> {
    const {store} = this.ctx
    for (const file of Array.from(files)) {
      // Для API: передаём UI-путь; стор сам преобразует корень в undefined
      await store.startUploadFile(this.currentPath(), file)
    }
  }

  async handlePathUpload(paths: string[]): Promise<void> {
    const {store} = this.ctx
    for (const p of paths) {
      await store.startUploadPath(this.currentPath(), p)
    }
  }

  openDetailsPanel(item: FileItemData): void {
    if (item.isDir) return
    this.ctx.store.openDetailsPanel(item.id)
  }

  getContextMenuItems(item: FileItemData): ContextMenuItem[] {
    const isSecretFile = !item.isDir && ['.password', '.note', '.seed', '.private-key'].includes(item.name)

    const isImage = !item.isDir && isImageFile(item.name)
    const isVideo = !item.isDir && isVideoFile(item.name)
    const isPlayableVideo = !item.isDir && isPlayableVideoFile(item.name)
    const showShare = canShareFiles()

    const items: ContextMenuItem[] = [
      {
        id: 'open',
        label: item.isDir ? 'Открыть' : isImage ? 'Просмотр' : isPlayableVideo ? 'Воспроизвести' : 'Открыть',
        icon: item.isDir
          ? 'folder-open'
          : isImage
            ? 'eye'
            : isPlayableVideo
              ? 'play-circle'
              : 'box-arrow-up-right',
        action: () => {
          void this.handleOpen(item)
        },
      },
      {
        id: 'open-external',
        label: 'Открыть в системе',
        icon: 'box-arrow-up-right',
        action: () => {
          void this.handleOpenExternal(item)
        },
        disabled: item.isDir,
        shortcut: 'Ctrl+O',
      },
      ...(showShare && !item.isDir
        ? ([
            {
              id: 'share',
              label: 'Поделиться',
              icon: 'share',
              action: () => {
                void this.handleShare(item)
              },
            },
          ] as ContextMenuItem[])
        : ([] as ContextMenuItem[])),
      {id: 'separator-1', label: '', icon: '', action: () => {}, separator: true},
      ...(isSecretFile
        ? ([
            {
              id: 'secret-show',
              label: 'Показать секрет',
              icon: 'eye',
              action: async () => {
                try {
                  const text = await this.readSecretAsText(item.id)
                  alert(text)
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e)
                  this.showNotification('error', `Не удалось прочитать секрет: ${msg}`)
                }
              },
            },
            {
              id: 'secret-copy',
              label: 'Копировать секрет',
              icon: 'clipboard',
              action: async () => {
                try {
                  const text = await this.readSecretAsText(item.id)
                  await navigator.clipboard.writeText(text)
                  this.showNotification('success', 'Секрет скопирован в буфер обмена')
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e)
                  this.showNotification('error', `Не удалось скопировать: ${msg}`)
                }
              },
            },
            {id: 'secret-sep', label: '', icon: '', action: () => {}, separator: true},
          ] as ContextMenuItem[])
        : ([] as ContextMenuItem[])),

      {
        id: 'rename',
        label: 'Переименовать',
        icon: 'pencil',
        action: () => {
          void this.handleRename(item)
        },
        shortcut: 'F2',
      },
      {
        id: 'download',
        label: 'Скачать',
        icon: 'download',
        action: () => {
          void this.handleDownload(item)
        },
        disabled: item.isDir,
      },
      {id: 'separator-2', label: '', icon: '', action: () => {}, separator: true},
      {
        id: 'delete',
        label: 'Удалить',
        icon: 'trash',
        action: () => {
          void this.handleDelete(item)
        },
        shortcut: 'Del',
      },
    ]

    return items
  }

  readonly onCommandBarCommand = (e: Event) => {
    const detail = (e as CustomEvent).detail as
      | {action?: string; files?: FileList; paths?: string[]}
      | undefined
    const action = detail?.action

    if (action === 'new-folder') {
      void this.handleCreateDir()
      return
    }

    if (action === 'upload-files') {
      const files = detail?.files
      if (files && files.length > 0) {
        void this.handleFileUpload(files)
      }
      return
    }

    if (action === 'upload-paths') {
      const paths = detail?.paths
      if (Array.isArray(paths) && paths.length > 0) {
        void this.handlePathUpload(paths)
      }
    }
  }

  private setupTauriDragDrop = async () => {
    try {
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
    } catch {
      // Best-effort: web drag-drop still works.
    }
  }

  private setupCatalogSubscription = () => {
    const {catalog, ws} = this.ctx
    if (this.unsubscribeMirror) {
      this.unsubscribeMirror()
      this.unsubscribeMirror = undefined
    }

    if (!catalog || !ws?.connected()) {
      return
    }

    try {
      this.unsubscribeMirror = catalog.catalog.subscribe(() => {
        this.validateCurrentPath()
        this.bumpCatalogRevision()
      })

      // Force initial refresh.
      this.bumpCatalogRevision()
    } catch {
      // Ошибка подписки на каталог, будет повторная попытка при аутентификации
    }
  }

  private bumpCatalogRevision() {
    this.catalogRevision.set(this.catalogRevision() + 1)
  }

  private validateCurrentPath = () => {
    const {catalog} = this.ctx
    if (!catalog?.catalog) {
      return
    }

    const currentPath = this.currentPath()
    if (this.isPassManagerPath(currentPath)) {
      this.ctx.store.setCurrentPath('/')
      return
    }
    if (currentPath === '/') {
      return
    }

    try {
      const children = catalog.catalog.getChildren(currentPath)
      void children
    } catch {
      this.ctx.store.setCurrentPath('/')
      this.showNotification('warning', 'Каталог был обновлен, возвращение в корневую папку')
    }
  }

  private buildDirectoryPath(currentPath: string, itemName: string): string {
    const basePath = currentPath.endsWith('/') ? currentPath : currentPath + '/'
    const newPath = basePath + itemName + '/'
    return newPath.replace(/\/+/g, '/')
  }

  private async readSecretAsText(nodeId: number): Promise<string> {
    const {catalog} = this.ctx
    const stream = await catalog.secrets.read(nodeId)
    const decoder = new TextDecoder()
    let text = ''
    for await (const chunk of stream) {
      text += decoder.decode(chunk, {stream: true})
    }
    text += decoder.decode()
    return text
  }

  private showNotification(type: NotificationKind, message: string) {
    this.ctx.store.pushNotification(type, message)
  }

  private canUseNativePathUpload(): boolean {
    return (
      isTauriRuntime() &&
      getRuntimeCapabilities().supports_native_path_io &&
      this.ctx.store.remoteSessionState() === 'inactive'
    )
  }

  private isPassManagerPath(path: string): boolean {
    const normalized = path.startsWith('/') ? path : '/' + path
    const roots = [PASS_DIR, '.wallet'].map((root) => (root.startsWith('/') ? root : '/' + root))
    return roots.some((root) => normalized === root || normalized.startsWith(root + '/'))
  }

  private getFileItems(): FileListItem[] {
    const {catalog, ws} = this.ctx
    if (!catalog?.catalog || !ws?.connected()) {
      return []
    }

    const currentPath = this.currentPath()

    if (this.isPassManagerPath(currentPath)) {
      this.ctx.store.setCurrentPath('/')
      return []
    }

    try {
      const children = catalog.catalog.getChildren(currentPath)
      if (!children || !Array.isArray(children)) {
        if (currentPath !== '/') {
          this.validateCurrentPath()
        }
        return []
      }

      const selected = this.selectedItems()
      const items = children
        .filter((node) => {
          if (node.name == null) return false
          const name = String(node.name)
          if (node.name === '/') return false
          if (currentPath === '/' && node.isDir && node.name === 'root') return false

          // macOS can create AppleDouble sidecar files on WebDAV/remote FS.
          // These are implementation details and should never appear in WebView listings.
          if (name.startsWith('._')) return false
          if (name === '.DS_Store') return false
          if (name === PASS_DIR || name === '.wallet') return false

          return true
        })
        .map((node) => {
          const entryId = node.isDir ? node.nodeId : undefined
          const pmMeta = entryId ? catalog.getEntryMeta(entryId) : undefined
          const displayName = pmMeta?.title ? String(pmMeta.title) : node.name || ''
          if (entryId) {
            void catalog.ensureEntryMeta(entryId)
          }

          return {
            id: node.nodeId,
            path: node.path ?? '',
            name: displayName,
            isDir: node.isDir,
            size: node.size,
            lastModified: node.modtime !== undefined ? Number(node.modtime) : undefined,
            selected: selected.includes(node.nodeId),
          } satisfies FileListItem
        })

      return items
    } catch {
      if (currentPath !== '/') {
        this.validateCurrentPath()
      }
      return []
    }
  }
}
