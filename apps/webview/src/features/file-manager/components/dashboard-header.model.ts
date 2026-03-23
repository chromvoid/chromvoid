import {computed, state} from '@statx/core'
import {open} from '@tauri-apps/plugin-dialog'

import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {getAppContext} from 'root/shared/services/app-context'

import type {SearchFilters} from 'root/shared/contracts/file-manager'

export const createDefaultDashboardHeaderFilters = (): SearchFilters => ({
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
})

const MOBILE_MEDIA_QUERY = '(max-width: 767px)'

const WS_STATUS_CLASS_MAP: Record<string, string> = {
  connected: 'connected',
  connecting: 'syncing',
  disconnected: 'offline',
  error: 'error',
}

const CATALOG_STATUS_CLASS_MAP: Record<string, string> = {
  idle: 'connected',
  syncing: 'syncing',
  loading: 'syncing',
  error: 'error',
}

export type DashboardHeaderSnapshot = {
  currentPath: string
  filters: SearchFilters
  totalFiles: number
  filteredFiles: number
  selectedCount: number
}

export class DashboardHeaderModel {
  readonly currentPath = state('/')
  readonly filters = state<SearchFilters>(createDefaultDashboardHeaderFilters())
  readonly totalFiles = state(0)
  readonly filteredFiles = state(0)
  readonly selectedCount = state(0)
  private readonly breakpointMobile = state(false)

  readonly isMobile = computed(() => {
    return getAppContext().store.layoutMode() === 'mobile'
  })

  readonly hasSelection = computed(() => this.selectedCount() > 0)
  readonly hasUploadTasks = computed(() => getAppContext().store.uploadTasks().length > 0)
  readonly selectionModeEnabled = computed(() => getAppContext().store.selectionMode())
  readonly wsStatusClass = computed(() => {
    const wsStatus = getAppContext().store.wsStatus()
    return WS_STATUS_CLASS_MAP[wsStatus] ?? 'offline'
  })
  readonly catalogStatusClass = computed(() => {
    const catalogStatus = getAppContext().store.catalogStatus()
    return CATALOG_STATUS_CLASS_MAP[catalogStatus] ?? 'connected'
  })

  private mediaQuery: MediaQueryList | null = null
  private readonly onMediaQueryChange = (event: MediaQueryListEvent) => {
    this.breakpointMobile.set(event.matches)
  }

  sync(snapshot: DashboardHeaderSnapshot) {
    this.currentPath.set(snapshot.currentPath)
    this.filters.set(snapshot.filters)
    this.totalFiles.set(snapshot.totalFiles)
    this.filteredFiles.set(snapshot.filteredFiles)
    this.selectedCount.set(snapshot.selectedCount)
  }

  startResponsiveSync() {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
    this.mediaQuery = mediaQuery
    this.breakpointMobile.set(mediaQuery.matches)
    mediaQuery.addEventListener('change', this.onMediaQueryChange)
  }

  stopResponsiveSync() {
    if (!this.mediaQuery) return
    this.mediaQuery.removeEventListener('change', this.onMediaQueryChange)
    this.mediaQuery = null
  }

  canUseNativePathUpload(): boolean {
    return (
      isTauriRuntime() &&
      getRuntimeCapabilities().supports_native_path_io &&
      getAppContext().store.remoteSessionState() === 'inactive'
    )
  }

  async pickNativeUploadPaths(): Promise<string[]> {
    const selected = await open({multiple: true, directory: false})
    if (Array.isArray(selected)) return selected
    if (selected) return [selected]
    return []
  }
}
