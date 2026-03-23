import {computed, state} from '@statx/core'
import {stateLocalStorage} from '@statx/persist'

import type {SearchFilters} from 'root/shared/contracts/file-manager'
import {getRuntimeCapabilities} from '../../core/runtime/runtime-capabilities'
import {
  resolveLayoutMode,
  getPersistedLayoutMode,
  MOBILE_BREAKPOINT_QUERY,
  type LayoutMode,
} from '../layout/layout-mode'

const DEFAULT_UPLOAD_CHUNK_SIZE_WS = 64 * 1024

// Desktop (Tauri) has two very different upload paths:
// - bytes over IPC (fallback): keep chunks moderate to avoid IPC overhead/memory spikes
// - native path upload (preferred): chunks can be large since Rust reads from disk directly
const DEFAULT_UPLOAD_CHUNK_SIZE_TAURI_BYTES = 512 * 1024
const DEFAULT_UPLOAD_CHUNK_SIZE_TAURI_PATH = 4 * 1024 * 1024

function getDefaultUploadChunkSize(kind: 'ws' | 'tauri', mode: 'bytes' | 'path'): number {
  if (kind !== 'tauri') return DEFAULT_UPLOAD_CHUNK_SIZE_WS
  return mode === 'path' ? DEFAULT_UPLOAD_CHUNK_SIZE_TAURI_PATH : DEFAULT_UPLOAD_CHUNK_SIZE_TAURI_BYTES
}

import {navigationModel} from '../navigation/navigation.model'
import type {ChromVoidState} from '../../core/state/app-state'
import type {CatalogService} from '../../core/catalog/catalog'
import type {TransportLike} from '../../core/transport/transport'
import type {UploadStats, UploadTaskDirection} from '../../types/upload-task'
import {UploadTask} from '../../types/upload-task'

// Единый словарь статусов, согласованный с ключами i18n `status:*`
export type Status = 'unknown' | 'not-inited' | 'stopped' | 'locking' | 'unlocking' | 'locked' | 'unlocked'
export type RemoteSessionState = 'inactive' | 'waiting_host_unlock' | 'ready'

export class Store {
  // Инъекции зависимостей (без прямого доступа к window внутри стора)
  private readonly ws: TransportLike
  private readonly appState: ChromVoidState
  private readonly catalog: CatalogService

  // UI состояние
  theme = stateLocalStorage<'light' | 'dark' | 'system'>('system', {name: 'theme-state'})
  isMobile = state(false)

  private mobileBreakpoint = state(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches
      : false,
  )
  private layoutQueryParam = state<string | null>(null)

  layoutMode = computed<LayoutMode>(() =>
    resolveLayoutMode({
      isMobile: this.isMobile(),
      matchesBreakpoint: this.mobileBreakpoint(),
      queryParam: this.layoutQueryParam(),
      persisted: getPersistedLayoutMode(),
    }),
  )

  isShowPasswordManager = stateLocalStorage<boolean>(false, {name: 'password-manager-mode'})
  unlockUnNextPowerOn = state(false)
  sidebarOpen = state(false)
  showRemoteStoragePage = state(false)
  showGatewayPage = state(false)
  showRemotePage = state(false)
  showSettingsPage = state(false)
  showNetworkPairPage = state(false)
  remoteSessionState = state<RemoteSessionState>('inactive')
  remoteSessionPeerId = state<string | null>(null)

  // Dual-pane режим для планшетов
  dualPaneMode = stateLocalStorage<boolean>(false, {name: 'dual-pane-mode'})

  // Фильтры и сортировка файлового списка (глобально)
  searchFilters = state<SearchFilters>({
    query: '',
    sortBy: 'name',
    sortDirection: 'asc',
    viewMode: 'list',
    showHidden: false,
    fileTypes: [],
  })

  // Файловая навигация и выделение
  currentPath = state<string>('/')
  selectedNodeIds = state<number[]>([])
  selectionMode = state(false)

  // ID файла для которого открыта панель деталей (null = закрыта)
  detailsPanelFileId = state<number | null>(null)

  // Уведомления (deprecated - переходим на statusMessage)
  notifications = state<
    Array<{id: string; type: 'success' | 'error' | 'warning' | 'info'; message: string; timestamp: number}>
  >([])

  // Последнее статус-сообщение для отображения в status-bar (вместо toast)
  statusMessage = state<{
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
    timestamp: number
  } | null>(null)

  // Прогресс загрузок (UI-уровень)
  uploadTasks = state<UploadTask[]>([])

  // Ошибки
  lastErrorMessage = computed<string | null>(() => {
    const wsError = this.ws.lastError()
    const catalogError = this.catalog.lastError()
    return wsError ?? (catalogError ? String(catalogError) : null)
  })

  // Агрегированные метрики прогресса загрузок
  hasActiveUploads = computed<boolean>(() => this.uploadTasks().some((t) => t.status() === 'uploading'))
  overallUploadProgress = computed<number>(() => this.getUploadStats().overallProgress)

  // Вычисляемые селекторы статусов сервисов
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

  // Консистентный статус приложения (минимальная логика на основании доступных данных)
  status = computed<Status>(
    () => {
      const s = this.appState.data()
      if (!s || this.wsStatus() !== 'connected') return 'unknown'

      // Пока нет явного поля статуса хранилища — используем флаги UI
      if (this.unlockUnNextPowerOn()) return 'unlocking'

      // По умолчанию показываем "locked" как безопасное значение
      return 'locked'
    },
    {name: 'status'},
  )

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

  setShowNetworkPairPage(next: boolean) {
    if (navigationModel.isConnected()) {
      if (next) {
        navigationModel.navigateToSurface('network-pair')
      } else if (navigationModel.currentSurface() === 'network-pair') {
        navigationModel.navigateToSurface('files')
      }
      return
    }

    this.showNetworkPairPage.set(next)
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
      navigationModel.goBack()
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
    const task = new UploadTask({id, name: params.name, total: params.total, direction: params.direction})
    this.addUploadTask(task)
    return {id, task}
  }

  createDownloadTask(name: string, total: number): {id: string; task: UploadTask} {
    return this.createTransferTask({name, total, direction: 'download'})
  }

  addUploadTask(task: UploadTask) {
    this.uploadTasks.set([...this.uploadTasks(), task])
  }

  updateUploadTask(
    taskId: string,
    updates: {
      loaded?: number
      speed?: number
      eta?: number
      status?: 'uploading' | 'done' | 'error' | 'paused'
    },
  ) {
    const task = this.uploadTasks().find((t) => t.id === taskId)
    if (!task) return
    if (
      typeof updates.loaded === 'number' ||
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

  clearCompletedUploadTasks() {
    this.uploadTasks.set(this.uploadTasks().filter((t) => t.status() !== 'done'))
  }

  cancelUploadTask(taskId: string) {
    this.uploadTasks.set(this.uploadTasks().filter((t) => t.id !== taskId))
  }

  handleVaultLocked(reason?: string) {
    // Clear volatile state that assumes an unlocked vault.
    navigationModel.reset()

    this.uploadTasks.set([])
    this.selectedNodeIds.set([])
    this.detailsPanelFileId.set(null)
    this.currentPath.set('/')
    this.showGatewayPage.set(false)
    this.showRemotePage.set(false)
    this.showSettingsPage.set(false)
    this.showNetworkPairPage.set(false)
    this.resetRemoteSession()

    const suffix = reason ? ` (${reason})` : ''
    this.pushNotification('warning', `Vault locked${suffix}`)
  }

  handleRemoteHostLocked() {
    navigationModel.reset()

    this.uploadTasks.set([])
    this.selectedNodeIds.set([])
    this.detailsPanelFileId.set(null)
    this.currentPath.set('/')
    this.showGatewayPage.set(false)
    this.showRemotePage.set(false)
    this.showSettingsPage.set(false)
    this.showNetworkPairPage.set(false)

    this.pushNotification('warning', 'Remote vault locked on host device')
  }

  getUploadStats(): UploadStats {
    const tasks = this.uploadTasks()
    const total = tasks.length
    const completed = tasks.filter((t) => t.status() === 'done').length
    const failed = tasks.filter((t) => t.status() === 'error').length
    const uploading = tasks.filter((t) => t.status() === 'uploading').length
    const totalBytes = tasks.reduce((sum, t) => sum + (t.total() || 0), 0)
    const loadedBytes = tasks.reduce((sum, t) => sum + (t.loaded() || 0), 0)
    const overallProgress = totalBytes > 0 ? (loadedBytes / totalBytes) * 100 : 0
    return {total, completed, failed, uploading, overallProgress, totalBytes, loadedBytes}
  }

  async startUploadFile(currentPath: string, file: File): Promise<void> {
    const taskId = crypto.randomUUID()
    const task = new UploadTask({id: taskId, name: file.name, total: file.size})
    this.addUploadTask(task)

    try {
      if (!this.catalog || !this.ws || !this.ws.connected()) {
        throw new Error('Сервисы недоступны')
      }

      const chunkSize = getDefaultUploadChunkSize(this.ws.kind, 'bytes')

      const prepared = (await this.catalog.api.prepareUpload(
        currentPath === '/' ? undefined : currentPath,
        file.name,
        file.size,
        chunkSize,
        file.type,
      )) as {nodeId: number}

      const startTime = Date.now()
      let lastUiUpdate = 0
      await this.ws.uploadFile(prepared.nodeId, file, {
        chunkSize,
        name: file.name,
        type: file.type,
        onProgress: (chunk: number, total: number, percent: number) => {
          const now = Date.now()
          // Throttle progress updates to keep UI responsive during fast uploads.
          if (percent < 100 && now - lastUiUpdate < 120) return
          lastUiUpdate = now

          const loaded = Math.min(
            file.size,
            total > 0 ? Math.round((chunk / total) * file.size) : Math.round((percent / 100) * file.size),
          )
          const elapsed = Math.max(0.001, (Date.now() - startTime) / 1000)
          const speed = loaded / elapsed
          const eta = (file.size - loaded) / Math.max(1, speed)
          this.updateUploadTask(taskId, {loaded, speed, eta: Number.isFinite(eta) ? eta : 0})
        },
      })

      // После корректного завершения upload (теперь ждёт реального завершения записи на сервере)
      // устанавливаем финальный прогресс и статус
      this.updateUploadTask(taskId, {loaded: file.size})
      this.updateUploadTask(taskId, {status: 'done'})

      // Обновляем зеркало каталога после успешной загрузки
      void this.catalog.refresh().catch(() => {})
      this.pushNotification('success', `Файл "${file.name}" загружен`)
    } catch (error) {
      this.updateUploadTask(taskId, {status: 'error'})
      this.pushNotification(
        'error',
        `Ошибка загрузки "${file.name}": ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async startUploadPath(currentPath: string, path: string): Promise<void> {
    const taskId = crypto.randomUUID()
    const caps = getRuntimeCapabilities()

    // Path-based uploads are only available in Desktop (Tauri) runtime.
    if (
      !caps.supports_native_path_io ||
      this.ws.kind !== 'tauri' ||
      !this.ws.statPath ||
      !this.ws.uploadFilePath
    ) {
      this.pushNotification('error', 'Загрузка по пути доступна только в Desktop-режиме')
      return
    }

    try {
      if (!this.catalog || !this.ws || !this.ws.connected()) {
        throw new Error('Сервисы недоступны')
      }

      const stat = await this.ws.statPath(path)
      const task = new UploadTask({id: taskId, name: stat.name, total: stat.size})
      this.addUploadTask(task)

      const chunkSize = getDefaultUploadChunkSize(this.ws.kind, 'path')
      const prepared = (await this.catalog.api.prepareUpload(
        currentPath === '/' ? undefined : currentPath,
        stat.name,
        stat.size,
        chunkSize,
        '',
      )) as {nodeId: number}

      const startTime = Date.now()
      let lastUiUpdate = 0
      await this.ws.uploadFilePath(prepared.nodeId, path, {
        uploadId: taskId,
        chunkSize,
        totalBytes: stat.size,
        onProgress: (chunk: number, total: number, percent: number) => {
          const now = Date.now()
          if (percent < 100 && now - lastUiUpdate < 120) return
          lastUiUpdate = now

          const loaded = Math.min(
            stat.size,
            total > 0 ? Math.round((chunk / total) * stat.size) : Math.round((percent / 100) * stat.size),
          )
          const elapsed = Math.max(0.001, (Date.now() - startTime) / 1000)
          const speed = loaded / elapsed
          const eta = (stat.size - loaded) / Math.max(1, speed)
          this.updateUploadTask(taskId, {loaded, speed, eta: Number.isFinite(eta) ? eta : 0})
        },
      })

      this.updateUploadTask(taskId, {loaded: stat.size})
      this.updateUploadTask(taskId, {status: 'done'})
      void this.catalog.refresh().catch(() => {})
      this.pushNotification('success', `Файл "${stat.name}" загружен`)
    } catch (error) {
      this.updateUploadTask(taskId, {status: 'error'})
      this.pushNotification(
        'error',
        `Ошибка загрузки: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  // NOTE: upload streaming is handled by the transport (Tauri IPC).
}

declare global {
  interface Window {
    store: Store
    env: 'dev' | 'prod'
  }
}
