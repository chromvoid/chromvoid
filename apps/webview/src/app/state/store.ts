import {action, atom, computed, withLocalStorage, wrap} from '@reatom/core'

import type {SearchFilters} from 'root/shared/contracts/file-manager'
import {i18n} from 'root/i18n'
import {beginMobileFilePickerSession} from 'root/shared/services/mobile-file-picker-session'
import {registerUploadedImageForDerivativePrewarm} from '../../features/media/components/image-derivative-prewarm'
import {getRuntimeCapabilities} from '../../core/runtime/runtime-capabilities'
import type {
  AndroidShareImportResult,
  AndroidSharePartialImportDecision,
  AndroidSharedFilesHandoff,
} from '../../features/file-manager/models/android-share-import.model'
import {
  logAndroidShareDiagnostic,
  sanitizeAndroidShareDiagnosticMessage,
  summarizeAndroidSharePayload,
} from '../../features/file-manager/models/android-share-import.diagnostics'
import {
  resolveLayoutMode,
  getPersistedLayoutMode,
  MOBILE_BREAKPOINT_QUERY,
  type LayoutMode,
} from '../layout/layout-mode'

const DEFAULT_UPLOAD_CHUNK_SIZE_WS = 64 * 1024

// Desktop (Tauri) has two very different upload paths:
// - bytes over IPC (fallback): keep chunks moderate to avoid IPC overhead/memory spikes
// - native path upload (preferred): keep chunks moderate so Rust can emit smooth progress
const DEFAULT_UPLOAD_CHUNK_SIZE_TAURI_BYTES = 512 * 1024
const DEFAULT_UPLOAD_CHUNK_SIZE_TAURI_PATH = 512 * 1024
const UPLOAD_PROGRESS_UPDATE_INTERVAL_MS = 50

import {navigationModel} from '../navigation/navigation.model'
import type {ChromVoidState} from '../../core/state/app-state'
import type {CatalogService} from '../../core/catalog/catalog'
import {toast} from '../../shared/services/toast-manager'
import type {
  NativeUploadCompleted,
  NativeUploadFailed,
  NativeUploadFile,
  NativeUploadProgress,
  TransportLike,
} from '../../core/transport/transport'
import type {UploadStats, UploadTaskDirection, UploadTaskStatus} from '../../types/upload-task'
import {UploadTask} from '../../types/upload-task'

function getDefaultUploadChunkSize(kind: 'ws' | 'tauri', mode: 'bytes' | 'path'): number {
  if (kind !== 'tauri') return DEFAULT_UPLOAD_CHUNK_SIZE_WS
  return mode === 'path' ? DEFAULT_UPLOAD_CHUNK_SIZE_TAURI_PATH : DEFAULT_UPLOAD_CHUNK_SIZE_TAURI_BYTES
}

function isNativeUploadImageFile(file: NativeUploadFile | undefined): boolean {
  if (!file) return false
  if (file.mimeType?.startsWith('image/')) return true
  return /\.(avif|bmp|gif|heic|heif|jpe?g|png|tiff?|webp)$/i.test(file.name)
}

type NativeUploadTaskCallbacks = {
  uploadId: string
  readChunkSize: number
  onSelected: (files: NativeUploadFile[]) => void
  onProgress: (progress: NativeUploadProgress) => void
  onCompleted: (progress: NativeUploadCompleted) => void
  onFailed: (failed: NativeUploadFailed) => void
}

type NativeUploadBatchResult = {
  selectedCount: number
  completedCount: number
  completed: AndroidSharePartialImportDecision['completed']
  failedCount: number
  failedMessage: string
  failedCode: string | null
  hasAtRiskNativeImageUpload: boolean
}

type NativeUploadBatchOutcome =
  | {ok: true; result: NativeUploadBatchResult}
  | {ok: false; result: NativeUploadBatchResult; error: unknown}

type UploadTaskUpdate = {
  loaded?: number
  total?: number
  speed?: number
  eta?: number
  status?: UploadTaskStatus
}

type VaultLockSource = 'manual' | 'system'

type VaultLockedOptions = {
  reason?: string
  source?: VaultLockSource
}

function nativeUploadErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const message = (error as {message?: unknown}).message
    if (typeof message === 'string') return message
  }
  return String(error)
}

function nativeUploadErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as {code?: unknown}).code
  return typeof code === 'string' ? code : null
}

function summarizeNativeUploadFiles(files: NativeUploadFile[]): Record<string, unknown> {
  const knownBytes = files.reduce((sum, file) => sum + Math.max(0, file.totalBytes), 0)
  const unknownSizes = files.filter((file) => file.totalBytes <= 0).length
  const mimeTypes = Array.from(
    new Set(files.map((file) => file.mimeType).filter((mimeType): mimeType is string => Boolean(mimeType))),
  )

  return {
    selectedFiles: files.length,
    selectedKnownBytes: knownBytes,
    selectedUnknownSizes: unknownSizes,
    selectedMimeTypes: mimeTypes,
  }
}

function logAndroidShareStore(event: string, details: Record<string, unknown> = {}): void {
  logAndroidShareDiagnostic('store', event, details)
}

// Unified status dictionary aligned with i18n `status:*
export type Status = 'unknown' | 'not-inited' | 'stopped' | 'locking' | 'unlocking' | 'locked' | 'unlocked'
export type RemoteSessionState = 'inactive' | 'waiting_host_unlock' | 'ready'

export class Store {
  private readonly uploadTaskAutoRemoveTimers = new Map<string, ReturnType<typeof setTimeout>>()

  // Dependency injections (without direct access to the window inside the store)
  private readonly ws: TransportLike
  private readonly appState: ChromVoidState
  private readonly catalog: CatalogService

  // UI condition
  theme = atom<'light' | 'dark' | 'system'>('system', 'theme-state').extend(
    withLocalStorage({key: 'theme-state'}),
  )
  isMobile = atom(false)

  private mobileBreakpoint = atom(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches
      : false,
  )
  private layoutQueryParam = atom<string | null>(null)

  layoutMode = computed<LayoutMode>(() =>
    resolveLayoutMode({
      isMobile: this.isMobile(),
      matchesBreakpoint: this.mobileBreakpoint(),
      queryParam: this.layoutQueryParam(),
      persisted: getPersistedLayoutMode(),
    }),
  )

  isShowPasswordManager = atom<boolean>(false, 'password-manager-mode').extend(
    withLocalStorage({key: 'password-manager-mode'}),
  )
  unlockUnNextPowerOn = atom(false)
  vaultLockPending = atom(false)
  sidebarOpen = atom(false)
  showRemoteStoragePage = atom(false)
  showGatewayPage = atom(false)
  showRemotePage = atom(false)
  showSettingsPage = atom(false)
  remoteSessionState = atom<RemoteSessionState>('inactive')
  remoteSessionPeerId = atom<string | null>(null)

  // Dual-pane mode for tablets
  dualPaneMode = atom<boolean>(false, 'dual-pane-mode').extend(withLocalStorage({key: 'dual-pane-mode'}))

  // Filters and file list sorting (globally)
  searchFilters = atom<SearchFilters>({
    query: '',
    sortBy: 'name',
    sortDirection: 'asc',
    viewMode: 'list',
    showHidden: false,
    fileTypes: [],
  })

  // File navigation and highlighting
  currentPath = atom<string>('/')
  selectedNodeIds = atom<number[]>([])
  selectionMode = atom(false)

  // The file ID for which the part panel is open (null = closed)
  detailsPanelFileId = atom<number | null>(null)

  // Notifications (deprecated - go to statusMessage)
  notifications = atom<
    Array<{id: string; type: 'success' | 'error' | 'warning' | 'info'; message: string; timestamp: number}>
  >([])

  // Last status message to display in status-bar (instead of toast)
  statusMessage = atom<{
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
    timestamp: number
  } | null>(null)

  // Download progress (UI-level)
  uploadTasks = atom<UploadTask[]>([])

  // Mistakes.
  lastErrorMessage = computed<string | null>(() => {
    const wsError = this.ws.lastError()
    const catalogError = this.catalog.lastError()
    return wsError ?? (catalogError ? String(catalogError) : null)
  })

  clearLastError() {
    this.ws.lastError.set(undefined)
    this.catalog.lastError.set(null)
  }

  // Aggregate metrics of download progress
  hasActiveUploads = computed<boolean>(() =>
    this.uploadTasks().some((t) => t.status() === 'queued' || t.status() === 'uploading'),
  )
  overallUploadProgress = computed<number>(() => this.getUploadStats().overallProgress)

  // Calculated Service Status Selectors
  wsStatus = computed<'disconnected' | 'connecting' | 'connected'>(() => {
    if (this.ws.connected()) return 'connected'
    if (this.ws.connecting()) return 'connecting'
    return 'disconnected'
  })

  catalogStatus = computed<'idle' | 'syncing' | 'error'>(() => {
    if (this.catalog.syncing()) return 'syncing'
    if (this.catalog.lastError()) return 'error'
    return 'idle'
  })

  // Consistent status of the application (minimum logic based on available data)
  status = computed<Status>(() => {
    const s = this.appState.data()
    if (!s || this.wsStatus() !== 'connected') return 'unknown'

    // While there is no clear storage status field – use UI flags
    if (this.unlockUnNextPowerOn()) return 'unlocking'

    // By default, show “locked” as a safe value.
    return 'locked'
  }, 'status')

  constructor(ws: TransportLike, appState: ChromVoidState, catalog: CatalogService) {
    this.ws = ws
    this.appState = appState
    this.catalog = catalog
    this.initBreakpointListener()
  }

  private initBreakpointListener() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(MOBILE_BREAKPOINT_QUERY)
    const handler = (e: MediaQueryListEvent) => this.mobileBreakpoint.set(e.matches)
    mql.addEventListener('change', handler)
  }

  setTheme(next: 'light' | 'dark' | 'system') {
    this.theme.set(next)
  }

  switchTheme() {
    const current = this.theme()
    const nextThemeMap = {
      light: 'dark',
      dark: 'system',
      system: 'light',
    } as const
    this.theme.set(nextThemeMap[current])
  }

  passManagerToggle() {
    if (navigationModel.isConnected()) {
      navigationModel.navigateToSurface(this.isShowPasswordManager() ? 'files' : 'passwords')
      return
    }

    this.isShowPasswordManager.set(!this.isShowPasswordManager())
  }

  setLayoutQueryParam(value: string | null) {
    this.layoutQueryParam.set(value)
  }

  setSidebarOpen(next: boolean) {
    this.sidebarOpen.set(next)
  }

  beginVaultLockRequest() {
    this.vaultLockPending.set(true)
    if (this.layoutMode() === 'mobile') {
      this.sidebarOpen.set(false)
    }
  }

  finishVaultLockRequest() {
    this.vaultLockPending.set(false)
  }

  setShowRemoteStoragePage(next: boolean) {
    if (navigationModel.isConnected()) {
      if (next) {
        navigationModel.navigateToSurface('remote-storage')
      } else if (navigationModel.currentSurface() === 'remote-storage') {
        navigationModel.navigateToSurface('files')
      }
      return
    }

    this.showRemoteStoragePage.set(next)
  }

  setShowGatewayPage(next: boolean) {
    if (navigationModel.isConnected()) {
      if (next) {
        navigationModel.navigateToSurface('gateway')
      } else if (navigationModel.currentSurface() === 'gateway') {
        navigationModel.navigateToSurface('files')
      }
      return
    }

    this.showGatewayPage.set(next)
  }

  setShowRemotePage(next: boolean) {
    if (navigationModel.isConnected()) {
      if (next) {
        navigationModel.navigateToSurface('remote')
      } else if (navigationModel.currentSurface() === 'remote') {
        navigationModel.navigateToSurface('files')
      }
      return
    }

    this.showRemotePage.set(next)
  }

  setShowSettingsPage(next: boolean) {
    if (navigationModel.isConnected()) {
      if (next) {
        navigationModel.navigateToSurface('settings')
      } else if (navigationModel.currentSurface() === 'settings') {
        navigationModel.navigateToSurface('files')
      }
      return
    }

    this.showSettingsPage.set(next)
  }

  setRemoteSessionWaiting(peerId: string | null) {
    this.remoteSessionPeerId.set(peerId)
    this.remoteSessionState.set('waiting_host_unlock')
  }

  setRemoteSessionReady(peerId: string | null) {
    this.remoteSessionPeerId.set(peerId)
    this.remoteSessionState.set('ready')
  }

  resetRemoteSession() {
    this.remoteSessionPeerId.set(null)
    this.remoteSessionState.set('inactive')
  }

  toggleSidebar() {
    this.sidebarOpen.set(!this.sidebarOpen())
  }

  setDualPaneMode(enabled: boolean) {
    this.dualPaneMode.set(enabled)
  }

  toggleDualPaneMode() {
    this.dualPaneMode.set(!this.dualPaneMode())
  }

  setSearchFilters(filters: SearchFilters) {
    this.searchFilters.set(filters)
  }

  setCurrentPath(path: string) {
    if (navigationModel.isConnected()) {
      navigationModel.navigateFilesPath(path)
      return
    }

    this.currentPath.set(path)
  }

  setSelectedItems(nodeIds: number[]) {
    this.selectedNodeIds.set(nodeIds)
  }

  setSelectionMode(enabled: boolean) {
    this.selectionMode.set(enabled)
    if (!enabled) {
      this.selectedNodeIds.set([])
    }
  }

  toggleSelectionMode() {
    this.setSelectionMode(!this.selectionMode())
  }

  openDetailsPanel(fileId: number) {
    if (navigationModel.isConnected()) {
      navigationModel.openDetails(fileId)
      return
    }

    this.detailsPanelFileId.set(fileId)
  }

  closeDetailsPanel() {
    if (navigationModel.isConnected() && navigationModel.snapshot().overlay?.kind === 'details') {
      navigationModel.closeOverlay()
      return
    }

    this.detailsPanelFileId.set(null)
  }

  pushNotification(type: 'success' | 'error' | 'warning' | 'info', message: string) {
    this.statusMessage.set({type, message, timestamp: Date.now()})
  }

  // -------------------- Upload tasks API --------------------
  /**
   * Creates a transfer task (upload/download) in the global progress panel.
   * Note: The state container is still named `uploadTasks` for backward compatibility.
   */
  createTransferTask(params: {name: string; total: number; direction: UploadTaskDirection}): {
    id: string
    task: UploadTask
  } {
    const id = crypto.randomUUID()
    const task = new UploadTask({
      id,
      name: params.name,
      total: params.total,
      direction: params.direction,
      kind: 'transfer',
    })
    this.addUploadTask(task)
    return {id, task}
  }

  createDownloadTask(name: string, total: number): {id: string; task: UploadTask} {
    return this.createTransferTask({name, total, direction: 'download'})
  }

  createOpenExternalTask(name: string, total: number): {id: string; task: UploadTask} {
    const id = crypto.randomUUID()
    const task = new UploadTask({
      id,
      name,
      total,
      direction: 'download',
      kind: 'open-external',
      autoRemoveDoneMs: 4000,
    })
    this.addUploadTask(task)
    return {id, task}
  }

  addUploadTask(task: UploadTask) {
    this.clearUploadTaskAutoRemove(task.id)
    this.uploadTasks.set([...this.uploadTasks(), task])
  }

  private addUploadTasks(tasks: UploadTask[]) {
    if (tasks.length === 0) return
    for (const task of tasks) {
      this.clearUploadTaskAutoRemove(task.id)
    }
    this.uploadTasks.set([...this.uploadTasks(), ...tasks])
  }

  updateUploadTask(
    taskId: string,
    updates: UploadTaskUpdate,
  ) {
    const task = this.uploadTasks().find((t) => t.id === taskId)
    if (!task) return
    this.clearUploadTaskAutoRemove(taskId)
    if (typeof updates.total === 'number') {
      task.setTotal(updates.total)
    }
    if (
      typeof updates.loaded === 'number' ||
      typeof updates.total === 'number' ||
      typeof updates.speed === 'number' ||
      typeof updates.eta === 'number'
    ) {
      task.setProgress(
        typeof updates.loaded === 'number' ? updates.loaded : task.loaded(),
        typeof updates.speed === 'number' ? updates.speed : undefined,
        typeof updates.eta === 'number' ? updates.eta : undefined,
      )
    }
    if (updates.status) {
      switch (updates.status) {
        case 'done':
          task.markDone()
          this.scheduleUploadTaskAutoRemove(task)
          break
        case 'queued':
          task.markQueued()
          break
        case 'error':
          task.markError()
          break
        case 'paused':
          task.pause()
          break
        case 'uploading':
          task.resume()
          break
      }
    }
  }

  private readonly addUploadTasksFromExternalCallback = action((tasks: UploadTask[]): void => {
    this.addUploadTasks(tasks)
  }, 'store.uploadTasks.externalCallback.add')

  private readonly updateUploadTaskFromExternalCallback = action((taskId: string, updates: UploadTaskUpdate): void => {
    this.updateUploadTask(taskId, updates)
  }, 'store.uploadTasks.externalCallback.update')

  private readonly registerUploadedImageFromExternalCallback = action(
    (asset: {id: number; name: string; mimeType: string | null; lastModified?: number}): void => {
      registerUploadedImageForDerivativePrewarm(asset)
    },
    'store.uploadTasks.externalCallback.registerImage',
  )

  clearCompletedUploadTasks() {
    const completedTaskIds = this.uploadTasks()
      .filter((t) => t.status() === 'done')
      .map((t) => t.id)
    for (const taskId of completedTaskIds) {
      this.clearUploadTaskAutoRemove(taskId)
    }
    this.uploadTasks.set(this.uploadTasks().filter((t) => t.status() !== 'done'))
  }

  cancelUploadTask(taskId: string) {
    this.clearUploadTaskAutoRemove(taskId)
    this.uploadTasks.set(this.uploadTasks().filter((t) => t.id !== taskId))
  }

  handleVaultLocked(options: VaultLockedOptions = {}) {
    this.finishVaultLockRequest()

    // Clear volatile state that assumes an unlocked vault.
    navigationModel.reset()

    this.clearAllUploadTaskAutoRemoveTimers()
    this.uploadTasks.set([])
    this.selectedNodeIds.set([])
    this.detailsPanelFileId.set(null)
    this.currentPath.set('/')
    this.showGatewayPage.set(false)
    this.showRemotePage.set(false)
    this.showSettingsPage.set(false)
    this.resetRemoteSession()

    const message = options.reason
      ? i18n('notification:vault-locked-reason', {reason: options.reason})
      : i18n('notification:vault-locked')
    if (options.source === 'manual') {
      toast.success(message)
      return
    }

    toast.warning(message)
  }

  handleRemoteHostLocked() {
    navigationModel.reset()

    this.clearAllUploadTaskAutoRemoveTimers()
    this.uploadTasks.set([])
    this.selectedNodeIds.set([])
    this.detailsPanelFileId.set(null)
    this.currentPath.set('/')
    this.showGatewayPage.set(false)
    this.showRemotePage.set(false)
    this.showSettingsPage.set(false)

    toast.warning(i18n('notification:remote-vault-locked'))
  }

  private getUploadStatsForTasks(tasks: UploadTask[]): UploadStats {
    const total = tasks.length
    const completed = tasks.filter((t) => t.status() === 'done').length
    const failed = tasks.filter((t) => t.status() === 'error').length
    const uploading = tasks.filter((t) => t.status() === 'queued' || t.status() === 'uploading').length
    const totalBytes = tasks.reduce((sum, t) => sum + (t.total() || 0), 0)
    const loadedBytes = tasks.reduce((sum, t) => {
      const total = t.total() || 0
      if (total <= 0) return sum
      return sum + Math.min(t.loaded() || 0, total)
    }, 0)
    const overallProgress = totalBytes > 0 ? (loadedBytes / totalBytes) * 100 : 0
    return {total, completed, failed, uploading, overallProgress, totalBytes, loadedBytes}
  }

  getUploadStats(): UploadStats {
    return this.getUploadStatsForTasks(this.uploadTasks())
  }

  getActiveTransferBatchStats(): UploadStats {
    const tasks = this.uploadTasks()
    const activeTask = [...tasks]
      .reverse()
      .find((task) => task.kind === 'transfer' && (task.status() === 'queued' || task.status() === 'uploading'))

    if (!activeTask) {
      return this.getUploadStatsForTasks(tasks)
    }

    const batchTasks = tasks.filter((task) => task.kind === 'transfer' && task.batchId === activeTask.batchId)
    return this.getUploadStatsForTasks(batchTasks.length > 0 ? batchTasks : tasks)
  }

  private scheduleUploadTaskAutoRemove(task: UploadTask) {
    if (task.autoRemoveDoneMs == null) return

    this.clearUploadTaskAutoRemove(task.id)
    const timer = setTimeout(() => {
      this.uploadTaskAutoRemoveTimers.delete(task.id)
      this.cancelUploadTask(task.id)
    }, task.autoRemoveDoneMs)
    this.uploadTaskAutoRemoveTimers.set(task.id, timer)
  }

  private clearUploadTaskAutoRemove(taskId: string) {
    const timer = this.uploadTaskAutoRemoveTimers.get(taskId)
    if (!timer) return
    clearTimeout(timer)
    this.uploadTaskAutoRemoveTimers.delete(taskId)
  }

  private clearAllUploadTaskAutoRemoveTimers() {
    for (const timer of this.uploadTaskAutoRemoveTimers.values()) {
      clearTimeout(timer)
    }
    this.uploadTaskAutoRemoveTimers.clear()
  }

  async startUploadFile(currentPath: string, file: File): Promise<void> {
    await this.startUploadFiles(currentPath, [file])
  }

  async startUploadFiles(currentPath: string, files: File[]): Promise<void> {
    if (files.length === 0) return

    const batchId = crypto.randomUUID()
    const batchCount = files.length
    const entries = files.map((file, index) => {
      const taskId = crypto.randomUUID()
      return {
        file,
        taskId,
        task: new UploadTask({
          id: taskId,
          name: file.name,
          total: file.size,
          initialStatus: 'queued',
          batchId,
          batchIndex: index,
          batchCount,
        }),
      }
    })

    this.addUploadTasks(entries.map((entry) => entry.task))

    for (const entry of entries) {
      await this.uploadFileTask(currentPath, entry.file, entry.taskId)
    }
  }

  private async uploadFileTask(currentPath: string, file: File, taskId: string): Promise<void> {
    this.updateUploadTask(taskId, {status: 'uploading'})
    try {
      if (!this.catalog || !this.ws || !this.ws.connected()) {
        throw new Error('Services unavailable')
      }

      const chunkSize = getDefaultUploadChunkSize(this.ws.kind, 'bytes')

      const startTime = Date.now()
      let lastUiUpdate = 0
      const uploaded = await wrap(
        this.ws.uploadFile({parentPath: currentPath === '/' ? undefined : currentPath, name: file.name}, file, {
          chunkSize,
          name: file.name,
          type: file.type,
          onProgress: (chunk: number, total: number, percent: number) => {
            const now = Date.now()
            // Throttle progress updates to keep UI responsive during fast uploads.
            if (percent < 100 && now - lastUiUpdate < UPLOAD_PROGRESS_UPDATE_INTERVAL_MS) return
            lastUiUpdate = now

            const loaded = Math.min(
              file.size,
              total > 0 ? Math.round((chunk / total) * file.size) : Math.round((percent / 100) * file.size),
            )
            const elapsed = Math.max(0.001, (Date.now() - startTime) / 1000)
            const speed = loaded / elapsed
            const eta = (file.size - loaded) / Math.max(1, speed)
            this.updateUploadTaskFromExternalCallback(taskId, {loaded, speed, eta: Number.isFinite(eta) ? eta : 0})
          },
        }),
      )

      // After the correct completion of the upload (now waiting for the actual completion of the recording on the server)
      // Establish final progress and status
      this.updateUploadTask(taskId, {loaded: file.size})
      this.updateUploadTask(taskId, {status: 'done'})
      registerUploadedImageForDerivativePrewarm({
        id: uploaded.nodeId,
        name: file.name,
        mimeType: file.type,
        lastModified: file.lastModified,
      })

      // Update the catalog mirror after successful download
      void this.catalog.refresh().catch(() => {})
      this.pushNotification('success', i18n('uploads:file-uploaded', {name: file.name}))
    } catch (error) {
      this.updateUploadTask(taskId, {status: 'error'})
      this.pushNotification(
        'error',
        i18n('uploads:file-upload-error', {
          suffix: i18n('uploads:name-suffix', {name: file.name}),
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  async startUploadPath(currentPath: string, path: string): Promise<void> {
    await this.startUploadPaths(currentPath, [path])
  }

  async startUploadPaths(currentPath: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return

    const caps = getRuntimeCapabilities()

    // Path-based uploads are only available in Desktop (Tauri) runtime.
    if (
      !caps.supports_native_path_io ||
      this.ws.kind !== 'tauri' ||
      !this.ws.statPath ||
      !this.ws.uploadFilePath
    ) {
      this.pushNotification('error', i18n('uploads:path-upload-desktop-only'))
      return
    }

    if (!this.catalog || !this.ws || !this.ws.connected()) {
      this.pushNotification(
        'error',
        i18n('uploads:file-upload-error', {
          suffix: '',
          message: i18n('uploads:services-unavailable'),
        }),
      )
      return
    }

    const statPath = this.ws.statPath
    const batchId = crypto.randomUUID()
    const entries: Array<{
      path: string
      taskId: string
      name: string
      size: number
    }> = []

    for (const path of paths) {
      try {
        const stat = await wrap(statPath(path))
        entries.push({
          path,
          taskId: crypto.randomUUID(),
          name: stat.name,
          size: stat.size,
        })
      } catch (error) {
        this.pushNotification(
          'error',
          i18n('uploads:file-upload-error', {
            suffix: '',
            message: error instanceof Error ? error.message : String(error),
          }),
        )
      }
    }

    if (entries.length === 0) return

    const batchCount = entries.length
    this.addUploadTasks(
      entries.map(
        (entry, index) =>
          new UploadTask({
            id: entry.taskId,
            name: entry.name,
            total: entry.size,
            initialStatus: 'queued',
            batchId,
            batchIndex: index,
            batchCount,
          }),
      ),
    )

    for (const entry of entries) {
      await this.uploadPathTask(currentPath, entry.path, entry.name, entry.size, entry.taskId)
    }
  }

  private async uploadPathTask(
    currentPath: string,
    path: string,
    name: string,
    size: number,
    taskId: string,
  ): Promise<void> {
    this.updateUploadTask(taskId, {status: 'uploading'})

    try {
      if (!this.catalog || !this.ws || !this.ws.connected() || !this.ws.uploadFilePath) {
        throw new Error(i18n('uploads:services-unavailable'))
      }

      const chunkSize = getDefaultUploadChunkSize(this.ws.kind, 'path')
      const startTime = Date.now()
      let lastUiUpdate = 0
      const uploaded = await wrap(
        this.ws.uploadFilePath({parentPath: currentPath === '/' ? undefined : currentPath, name}, path, {
          uploadId: taskId,
          chunkSize,
          totalBytes: size,
          onProgress: (chunk: number, total: number, percent: number) => {
            const now = Date.now()
            if (percent < 100 && now - lastUiUpdate < UPLOAD_PROGRESS_UPDATE_INTERVAL_MS) return
            lastUiUpdate = now

            const loaded = Math.min(
              size,
              total > 0 ? Math.round((chunk / total) * size) : Math.round((percent / 100) * size),
            )
            const elapsed = Math.max(0.001, (Date.now() - startTime) / 1000)
            const speed = loaded / elapsed
            const eta = (size - loaded) / Math.max(1, speed)
            this.updateUploadTaskFromExternalCallback(taskId, {loaded, speed, eta: Number.isFinite(eta) ? eta : 0})
          },
        }),
      )

      this.updateUploadTask(taskId, {loaded: size})
      this.updateUploadTask(taskId, {status: 'done'})
      registerUploadedImageForDerivativePrewarm({
        id: uploaded.nodeId,
        name,
        mimeType: null,
      })
      void this.catalog.refresh().catch(() => {})
      this.pushNotification('success', i18n('uploads:file-uploaded', {name}))
    } catch (error) {
      this.updateUploadTask(taskId, {status: 'error'})
      this.pushNotification(
        'error',
        i18n('uploads:file-upload-error', {
          suffix: '',
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  async startNativeUploadFiles(currentPath: string): Promise<void> {
    const caps = getRuntimeCapabilities()
    if (
      !caps.supports_native_file_upload ||
      this.ws.kind !== 'tauri' ||
      typeof this.ws.uploadNativeFiles !== 'function' ||
      this.remoteSessionState() !== 'inactive'
    ) {
      this.pushNotification('error', i18n('uploads:native-upload-unavailable'))
      return
    }

    const uploadId = crypto.randomUUID()
    const outcome = await wrap(
      this.runNativeUploadTaskBatch({
        uploadId,
        start: async (callbacks) => {
          const filePickerSession = beginMobileFilePickerSession()
          try {
            await this.ws.uploadNativeFiles?.(currentPath === '/' ? '/' : currentPath, callbacks)
          } finally {
            filePickerSession.end()
          }
        },
      }),
    )

    if (!outcome.ok) {
      this.pushNotification(
        'error',
        i18n('uploads:file-upload-error', {
          suffix: '',
          message: nativeUploadErrorMessage(outcome.error),
        }),
      )
      return
    }

    void this.catalog.refresh().catch(() => {})
    if (outcome.result.selectedCount > 0) {
      this.pushNotification(
        'success',
        i18n('uploads:native-files-uploaded', {
          count: String(outcome.result.completedCount || outcome.result.selectedCount),
        }),
      )
    }
    if (outcome.result.hasAtRiskNativeImageUpload) {
      this.pushNotification('warning', i18n('uploads:native-image-location-at-risk'))
    }
  }

  async startSharedFilesImport(
    payload: AndroidSharedFilesHandoff,
    uploadId = crypto.randomUUID(),
  ): Promise<AndroidShareImportResult> {
    const caps = getRuntimeCapabilities()
    logAndroidShareStore('import_requested', {
      uploadId,
      wsKind: this.ws.kind,
      connected: this.ws.connected(),
      remoteSessionState: this.remoteSessionState(),
      supportsShareImport: caps.supports_share_import,
      supportsNativeFileUpload: caps.supports_native_file_upload,
      hasUploadSharedFiles: typeof this.ws.uploadSharedFiles === 'function',
      ...summarizeAndroidSharePayload(payload),
    })
    if (
      !caps.supports_share_import ||
      !caps.supports_native_file_upload ||
      this.ws.kind !== 'tauri' ||
      typeof this.ws.uploadSharedFiles !== 'function' ||
      this.remoteSessionState() !== 'inactive'
    ) {
      logAndroidShareStore('import_rejected_unsupported', {
        uploadId,
        ...summarizeAndroidSharePayload(payload),
      })
      throw new Error(i18n('uploads:share-import-unsupported'))
    }

    const outcome = await wrap(
      this.runNativeUploadTaskBatch({
        uploadId,
        diagnosticSource: 'android_share',
        diagnosticSessionId: payload.sessionId,
        start: (callbacks) => this.ws.uploadSharedFiles?.('/', payload.sessionId, callbacks) ?? Promise.resolve(),
      }),
    )

    if (outcome.ok) {
      logAndroidShareStore('import_batch_success', {
        uploadId,
        selectedCount: outcome.result.selectedCount,
        completedCount: outcome.result.completedCount,
        failedCount: outcome.result.failedCount,
        hasAtRiskNativeImageUpload: outcome.result.hasAtRiskNativeImageUpload,
      })
      void this.catalog.refresh().then(
        () => logAndroidShareStore('catalog_refresh_finished', {uploadId, result: 'success'}),
        (error) => logAndroidShareStore('catalog_refresh_failed', {
          uploadId,
          message: sanitizeAndroidShareDiagnosticMessage(nativeUploadErrorMessage(error)),
        }),
      )
      navigationModel.navigateFilesPath('/', 'replace')
      logAndroidShareStore('files_root_navigation_requested', {uploadId})
      if (outcome.result.selectedCount > 0) {
        this.pushNotification(
          'success',
          i18n('uploads:android-share-imported', {
            count: String(outcome.result.completedCount || outcome.result.selectedCount),
          }),
        )
      }
      if (outcome.result.hasAtRiskNativeImageUpload) {
        this.pushNotification('warning', i18n('uploads:native-image-location-at-risk'))
      }
      return {kind: 'success'}
    }

    if (outcome.result.completed.length > 0) {
      logAndroidShareStore('import_batch_partial', {
        uploadId,
        completedCount: outcome.result.completed.length,
        failedCount: outcome.result.failedCount,
        failedCode: outcome.result.failedCode,
        failedMessage: sanitizeAndroidShareDiagnosticMessage(outcome.result.failedMessage),
      })
      void this.catalog.refresh().then(
        () => logAndroidShareStore('catalog_refresh_finished', {uploadId, result: 'partial_success'}),
        (error) => logAndroidShareStore('catalog_refresh_failed', {
          uploadId,
          message: sanitizeAndroidShareDiagnosticMessage(nativeUploadErrorMessage(error)),
        }),
      )
      return {
        kind: 'partial',
        decision: {
          uploadId,
          completed: outcome.result.completed,
          failedCount: outcome.result.failedCount,
          failedMessage: outcome.result.failedMessage,
          failedCode: outcome.result.failedCode,
        },
      }
    }

    logAndroidShareStore('import_batch_failed', {
      uploadId,
      selectedCount: outcome.result.selectedCount,
      completedCount: outcome.result.completedCount,
      failedCount: outcome.result.failedCount,
      failedCode: outcome.result.failedCode,
      failedMessage: sanitizeAndroidShareDiagnosticMessage(outcome.result.failedMessage),
    })
    this.pushNotification(
      'error',
      i18n('uploads:file-upload-error', {
        suffix: '',
        message: outcome.result.failedMessage,
      }),
    )
    return {kind: 'failed'}
  }

  async startAndroidSharedFilesImport(
    payload: AndroidSharedFilesHandoff,
    uploadId = crypto.randomUUID(),
  ): Promise<AndroidShareImportResult> {
    return this.startSharedFilesImport(payload, uploadId)
  }

  private async runNativeUploadTaskBatch(options: {
    uploadId: string
    diagnosticSource?: 'android_share'
    diagnosticSessionId?: string
    start: (callbacks: NativeUploadTaskCallbacks) => Promise<void>
  }): Promise<NativeUploadBatchOutcome> {
    const {uploadId} = options
    const logDiagnostics = (event: string, details: Record<string, unknown> = {}) => {
      if (options.diagnosticSource !== 'android_share') return
      logAndroidShareStore(event, {
        uploadId,
        sessionId: options.diagnosticSessionId ?? null,
        ...details,
      })
    }
    const taskIds = new Set<string>()
    const selectedFiles = new Map<string, NativeUploadFile>()
    const startTimes = new Map<string, number>()
    const completedFiles = new Map<string, AndroidSharePartialImportDecision['completed'][number]>()
    const failedFileIds = new Set<string>()
    let selectedCount = 0
    let hasAtRiskNativeImageUpload = false
    let failedMessage = ''
    let failedCode: string | null = null

    const markBatchFailed = () => {
      logDiagnostics('batch_mark_failed', {taskCount: taskIds.size})
      for (const taskId of taskIds) {
        const task = this.uploadTasks().find((item) => item.id === taskId)
        if (task && task.status() !== 'done') {
          failedFileIds.add(taskId)
          this.updateUploadTaskFromExternalCallback(taskId, {status: 'error'})
        }
      }
    }

    const handleSelected = (files: NativeUploadFile[]) => {
      selectedCount = files.length
      logDiagnostics('native_selected', summarizeNativeUploadFiles(files))
      const tasks = files.map((file, index) => {
        selectedFiles.set(file.fileId, file)
        taskIds.add(file.fileId)
        startTimes.set(file.fileId, Date.now())
        return new UploadTask({
          id: file.fileId,
          name: file.name,
          total: file.totalBytes,
          initialStatus: 'uploading',
          batchId: uploadId,
          batchIndex: index,
          batchCount: files.length,
        })
      })
      if (tasks.length > 0) {
        this.addUploadTasksFromExternalCallback(tasks)
      }
    }

    const handleProgress = (progress: NativeUploadProgress) => {
      if (progress.uploadId !== uploadId) return
      if (!taskIds.has(progress.fileId)) return
      const total = Math.max(0, Math.floor(progress.totalBytes || 0))
      const loaded = Math.max(0, Math.floor(progress.loadedBytes || 0))
      const started = startTimes.get(progress.fileId) ?? Date.now()
      const elapsed = Math.max(0.001, (Date.now() - started) / 1000)
      const speed = loaded / elapsed
      const eta = total > 0 ? (total - loaded) / Math.max(1, speed) : 0
      this.updateUploadTaskFromExternalCallback(progress.fileId, {
        loaded,
        total,
        speed,
        eta: Number.isFinite(eta) ? eta : 0,
        status: 'uploading',
      })
    }

    const handleCompleted = (progress: NativeUploadCompleted) => {
      if (progress.uploadId !== uploadId) return
      if (!taskIds.has(progress.fileId)) return
      const file = selectedFiles.get(progress.fileId)
      const total = Math.max(0, Math.floor(progress.totalBytes || progress.loadedBytes || 0))
      logDiagnostics('native_file_completed', {
        fileId: progress.fileId,
        nodeId: progress.nodeId ?? null,
        loadedBytes: Math.max(0, Math.floor(progress.loadedBytes || 0)),
        totalBytes: total,
        importProvenanceStatus: progress.importProvenanceStatus ?? null,
        mediaLocationPermissionStatus: progress.mediaLocationPermissionStatus ?? null,
        requireOriginalStatus: progress.requireOriginalStatus ?? null,
      })
      this.updateUploadTaskFromExternalCallback(progress.fileId, {
        loaded: total,
        total,
        status: 'done',
      })
      if (typeof progress.nodeId === 'number' && file) {
        completedFiles.set(progress.fileId, {
          fileId: progress.fileId,
          nodeId: progress.nodeId,
          name: file.name,
        })
      }
      if (
        isNativeUploadImageFile(file) &&
        progress.importProvenanceStatus === 'at_risk'
      ) {
        hasAtRiskNativeImageUpload = true
      }
      if (file && typeof progress.nodeId === 'number') {
        this.registerUploadedImageFromExternalCallback({
          id: progress.nodeId,
          name: file.name,
          mimeType: file.mimeType ?? null,
        })
      }
    }

    const handleFailed = (failed: NativeUploadFailed) => {
      if (failed.uploadId !== uploadId) return
      failedMessage = failed.message
      failedCode = failed.code ?? null
      logDiagnostics('native_failed', {
        fileId: failed.fileId ?? null,
        code: failedCode,
        message: sanitizeAndroidShareDiagnosticMessage(failedMessage),
      })
      if (failed.fileId && taskIds.has(failed.fileId)) {
        failedFileIds.add(failed.fileId)
        this.updateUploadTaskFromExternalCallback(failed.fileId, {status: 'error'})
        return
      }
      markBatchFailed()
    }

    try {
      logDiagnostics('batch_start', {
        readChunkSize: getDefaultUploadChunkSize(this.ws.kind, 'path'),
        connected: this.ws.connected(),
      })
      if (!this.catalog || !this.ws || !this.ws.connected()) {
        throw new Error(i18n('uploads:services-unavailable'))
      }

      await wrap(
        options.start({
          uploadId,
          readChunkSize: getDefaultUploadChunkSize(this.ws.kind, 'path'),
          onSelected: handleSelected,
          onProgress: handleProgress,
          onCompleted: handleCompleted,
          onFailed: handleFailed,
        }),
      )

      logDiagnostics('batch_start_returned', {
        selectedCount,
        completedCount: completedFiles.size,
        failedCount: failedFileIds.size,
      })
      return {ok: true, result: getResult(false)}
    } catch (error) {
      failedMessage = failedMessage || nativeUploadErrorMessage(error)
      failedCode = failedCode || nativeUploadErrorCode(error)
      logDiagnostics('batch_threw', {
        selectedCount,
        completedCount: completedFiles.size,
        failedCount: failedFileIds.size,
        code: failedCode,
        message: sanitizeAndroidShareDiagnosticMessage(failedMessage),
      })
      markBatchFailed()
      return {ok: false, error, result: getResult(true)}
    }

    function getResult(failed: boolean): NativeUploadBatchResult {
      const completed = Array.from(completedFiles.values())
      const remainingFailures = failed ? Math.max(0, selectedCount - completed.length) : 0
      return {
        selectedCount,
        completedCount: completed.length,
        completed,
        failedCount: Math.max(failedFileIds.size, remainingFailures),
        failedMessage,
        failedCode,
        hasAtRiskNativeImageUpload,
      }
    }
  }

  // NOTE: upload streaming is handled by the transport (Tauri IPC).
}
