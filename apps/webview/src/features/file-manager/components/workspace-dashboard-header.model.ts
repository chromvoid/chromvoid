import {isTauriRuntime} from 'root/core/runtime/runtime'
import type {HostPathTokenGrant} from 'root/core/transport/transport'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {atom, computed} from '@reatom/core'
import {getAppContext} from 'root/shared/services/app-context'

import type {SearchFilters} from 'root/shared/contracts/file-manager'
import type {
  MobileFileViewMode,
  MobileQuickFilterChip,
} from '../models/file-search-filters.model'
import type {FileManagerMobileAction} from '../models/file-manager-mobile-actions.model'

export const createDefaultWorkspaceDashboardHeaderFilters = (): SearchFilters => ({
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
})

const MOBILE_MEDIA_QUERY = '(max-width: 767px)'

const CATALOG_STATUS_CLASS_MAP: Record<string, string> = {
  idle: 'connected',
  syncing: 'syncing',
  loading: 'syncing',
  error: 'error',
}

export type WorkspaceDashboardHeaderSnapshot = {
  currentPath: string
  filters: SearchFilters
  totalFiles: number
  filteredFiles: number
  selectedCount: number
  canDownloadSelection: boolean
  quickFilterChips: MobileQuickFilterChip[]
  mobileViewMode: MobileFileViewMode
  mobileAddActions: FileManagerMobileAction[]
  mobileSelectionActions: FileManagerMobileAction[]
}

export class WorkspaceDashboardHeaderModel {
  readonly currentPath = atom('/')
  readonly filters = atom<SearchFilters>(createDefaultWorkspaceDashboardHeaderFilters())
  readonly totalFiles = atom(0)
  readonly filteredFiles = atom(0)
  readonly selectedCount = atom(0)
  readonly canDownloadSelection = atom(false)
  readonly quickFilterChips = atom<MobileQuickFilterChip[]>([])
  readonly mobileViewMode = atom<MobileFileViewMode>('list')
  readonly mobileAddActions = atom<FileManagerMobileAction[]>([])
  readonly mobileSelectionActions = atom<FileManagerMobileAction[]>([])
  private readonly breakpointMobile = atom(false)

  readonly isMobile = computed(() => {
    return getAppContext().store.layoutMode() === 'mobile'
  })

  readonly hasSelection = computed(() => this.selectedCount() > 0)
  readonly hasUploadTasks = computed(() => getAppContext().store.uploadTasks().length > 0)
  readonly selectionModeEnabled = computed(() => getAppContext().store.selectionMode())
  readonly catalogStatusClass = computed(() => {
    const catalogStatus = getAppContext().store.catalogStatus()
    return CATALOG_STATUS_CLASS_MAP[catalogStatus] ?? 'connected'
  })

  private mediaQuery: MediaQueryList | null = null
  private readonly onMediaQueryChange = (event: MediaQueryListEvent) => {
    this.breakpointMobile.set(event.matches)
  }

  sync(snapshot: WorkspaceDashboardHeaderSnapshot) {
    this.currentPath.set(snapshot.currentPath)
    this.filters.set(snapshot.filters)
    this.totalFiles.set(snapshot.totalFiles)
    this.filteredFiles.set(snapshot.filteredFiles)
    this.selectedCount.set(snapshot.selectedCount)
    this.canDownloadSelection.set(snapshot.canDownloadSelection)
    this.quickFilterChips.set(snapshot.quickFilterChips)
    this.mobileViewMode.set(snapshot.mobileViewMode)
    this.mobileAddActions.set(snapshot.mobileAddActions)
    this.mobileSelectionActions.set(snapshot.mobileSelectionActions)
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

  canUseNativeUpload(): boolean {
    return (
      isTauriRuntime() &&
      getRuntimeCapabilities().supports_native_file_upload &&
      getAppContext().store.remoteSessionState() === 'inactive'
    )
  }

  async pickNativeUploadFiles(): Promise<HostPathTokenGrant[]> {
    return getAppContext().ws.pickUploadFiles?.() ?? []
  }
}
