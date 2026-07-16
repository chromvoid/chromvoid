import {atom, computed, wrap} from '@reatom/core'

import {PASS_DIR} from 'root/core/pass-utils'
import {
  CATALOG_FOLDER_PAGE_DEFAULT_ITEMS,
  CATALOG_FOLDER_PAGE_MAX_ITEMS,
  type CatalogFolderFilter,
  type CatalogFolderPageRequest,
  type CatalogFolderSort,
  type CatalogFolderState,
  type CatalogNodeClient,
} from 'root/core/catalog/local-catalog/types'
import {normalizePath} from 'root/core/catalog/local-catalog/path'
import type {AppContext} from 'root/shared/services/app-context'
import {CatalogUIService} from 'root/shared/services/catalog-ui'
import {
  subscribeAfterInitial,
  subscribeCallbackAfterInitial,
  subscribeToSignalChanges,
} from 'root/shared/services/subscribed-signal'
import {
  isRealFileListItem,
  type FileItemData,
  type FileListItem,
  type FileListRenderItem,
  type FileListVisibleRange,
} from 'root/shared/contracts/file-manager'

import type {FileMediaInspectionFlow} from '../media-inspection-flow.model'
import {logFileManagerDebug} from '../file-manager-debug'
import {
  fileThumbnailStore,
  getFileThumbnailKey,
  isFileThumbnailCandidate,
} from './file-thumbnail-cache.model'

const SYSTEM_SHARD_ROOTS = [PASS_DIR, '.wallet'].map((root) =>
  root.startsWith('/') ? root : '/' + root,
)
const INITIAL_FILE_THUMBNAIL_WINDOW = 40

type EntryMetaCandidate = {
  entryId: number
  title: string | undefined
  revision: number
}

export function isSystemShardPath(path: string): boolean {
  const normalized = path.startsWith('/') ? path : '/' + path
  return SYSTEM_SHARD_ROOTS.some((root) => normalized === root || normalized.startsWith(root + '/'))
}

export function shouldHideFileManagerNode(name: string, currentPath: string, isDir: boolean): boolean {
  if (name === '/') return true
  if (currentPath === '/' && isDir && name === 'root') return true

  // macOS can create AppleDouble sidecar files on WebDAV/remote FS.
  // These are implementation details and should never appear in WebView listings.
  if (name.startsWith('._')) return true
  if (name === '.DS_Store') return true

  return isDir && isSystemShardPath(name)
}

export class FileListModel {
  readonly fileItems = computed<FileListItem[]>(() => {
    void this.catalogRevision()
    return this.getFileItems()
  })

  readonly renderItems = computed<FileListRenderItem[]>(() => {
    void this.catalogRevision()
    return this.getRenderItems()
  })

  readonly totalCount = computed<number>(() => {
    const state = this.getCurrentFolderState()
    return state?.totalCount ?? this.fileItems().length
  })

  readonly filteredCount = computed<number>(() => {
    const state = this.getCurrentFolderState()
    if (state) return state.totalCount
    return this.renderItems().filter(isRealFileListItem).length
  })

  readonly visibleCount = computed<number>(() => {
    const renderedCount = this.renderItems().filter(isRealFileListItem).length
    return Math.max(this.filteredCount(), renderedCount)
  })

  readonly folderTotalCount = computed<number>(() => {
    void this.catalogRevision()
    const path = normalizePath(this.currentPath())
    const defaultState = this.getFolderStateForPath(path, 'default')
    return Math.max(defaultState?.totalCount ?? 0, this.fileItems().length)
  })

  readonly displayTotalCount = computed<number>(() =>
    Math.max(this.folderTotalCount(), this.visibleCount()),
  )

  readonly selectedCount = computed<number>(() => this.selectedItems().length)

  private readonly catalogUI = new CatalogUIService()
  private readonly catalogRevision = atom(0)
  private readonly visibleRange = atom<FileListVisibleRange>({
    startIndex: 0,
    endIndex: INITIAL_FILE_THUMBNAIL_WINDOW,
  })
  private readonly vaultLockPending = computed<boolean>(() => this.readVaultLockPending())
  private readonly visibleRealItems = computed<FileListItem[]>(() => {
    const range = this.visibleRange()
    const startIndex = Math.max(0, Math.floor(range.startIndex))
    const endIndex = Math.max(startIndex, Math.ceil(range.endIndex))
    return this.renderItems().slice(startIndex, endIndex).filter(isRealFileListItem)
  })
  private readonly mediaInspectionCandidates = computed<FileListItem[]>(() => {
    if (this.vaultLockPending()) return []
    return this.visibleRealItems().filter((item) => this.mediaInspection.shouldQueueVisible(item))
  })
  private readonly visibleThumbnailCandidates = computed<FileListItem[]>(() => {
    if (this.vaultLockPending()) return []
    const viewMode = this.searchFilters().viewMode
    if (viewMode !== 'list' && viewMode !== 'grid') return []
    return this.visibleRealItems().filter(isFileThumbnailCandidate)
  })
  private readonly entryMetaCandidates = computed<EntryMetaCandidate[]>(() => {
    const revision = this.catalogRevision()
    return this.visibleRealItems()
      .filter((item) => item.isDir)
      .map((item) => {
        const meta = this.ctx.catalog.getEntryMeta(item.id)
        return {
          entryId: item.id,
          title: meta?.title ? String(meta.title) : undefined,
          revision,
        }
      })
  })

  private connected = false
  private lastMediaCandidateKey: string | null = null
  private lastThumbnailCandidateKey: string | null = null
  private lastFolderSnapshotKey: string | null = null
  private readonly hydratedEntryMetaKeys = new Set<string>()

  private unsubscribeMirror?: () => void
  private unsubscribeAuth?: () => void
  private unsubscribeMediaCandidates?: () => void
  private unsubscribeThumbnailCandidates?: () => void
  private unsubscribeEntryMetaCandidates?: () => void
  private unsubscribeVaultLockPending?: () => void

  constructor(
    private readonly ctx: AppContext,
    private readonly mediaInspection: FileMediaInspectionFlow,
  ) {}

  get currentPath() {
    return this.ctx.store.currentPath
  }

  get searchFilters() {
    return this.ctx.store.searchFilters
  }

  get selectedItems() {
    return this.ctx.store.selectedNodeIds
  }

  connect(): void {
    if (this.connected) return
    this.connected = true

    this.validateCurrentPath()
    this.setupCatalogSubscription()
    this.setupVisibleSideEffectSubscriptions()
    void this.ensureVisibleRangeLoaded(this.visibleRange())

    const {ws} = this.ctx
    this.unsubscribeAuth = subscribeToSignalChanges(ws.connected, (isConnected, wasConnected) => {
      logFileManagerDebug('file-list-model', 'connect:ws.connected changed', {
        isConnected,
        previous: wasConnected,
      })
      if (isConnected) {
        this.setupCatalogSubscription()
        return
      }

      this.teardownCatalogSubscription()
    })
  }

  cleanup(): void {
    if (!this.connected) return
    this.connected = false
    this.lastMediaCandidateKey = null
    this.lastThumbnailCandidateKey = null
    this.mediaInspection.cancelPending('file-list-cleanup')

    this.teardownVisibleSideEffectSubscriptions()
    this.teardownCatalogSubscription()
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth()
      this.unsubscribeAuth = undefined
    }
  }

  getFileItemById(nodeId: number): FileItemData | null {
    return (
      this.renderItems()
        .filter(isRealFileListItem)
        .find((item) => item.id === nodeId) ??
      this.fileItems().find((item) => item.id === nodeId) ??
      null
    )
  }

  getSelectedFileItems(): FileListItem[] {
    const selectedIds = this.selectedItems()
    if (selectedIds.length === 0) {
      return []
    }

    const selectedSet = new Set(selectedIds)
    return this.fileItems().filter((item) => selectedSet.has(item.id))
  }

  prewarmVisibleThumbnails(): Promise<void> {
    return fileThumbnailStore.preload(this.visibleThumbnailCandidates())
  }

  getSingleSelectedItem(): FileListItem | null {
    const items = this.getSelectedFileItems()
    return items.length === 1 ? (items[0] ?? null) : null
  }

  validateCurrentPath(): void {
    const {catalog} = this.ctx
    if (!catalog?.catalog) {
      return
    }

    const currentPath = this.currentPath()
    if (isSystemShardPath(currentPath)) {
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
      this.ctx.store.pushNotification('warning', 'Catalog was updated, returning to the root folder')
    }
  }

  bumpCatalogRevision(): void {
    this.catalogRevision.set(this.catalogRevision() + 1)
  }

  async ensureVisibleRangeLoaded(range: FileListVisibleRange = this.visibleRange()): Promise<void> {
    const normalizedRange = this.normalizeVisibleRange(range)
    this.visibleRange.set(normalizedRange)

    const loader = this.getLazyFolderLoader()
    if (!loader || !this.ctx.ws?.connected()) {
      this.logFolderSnapshot('ensureVisibleRangeLoaded:skipped', {
        reason: loader ? 'disconnected' : 'missing-loader',
        requestedStartIndex: normalizedRange.startIndex,
        requestedEndIndex: normalizedRange.endIndex,
      })
      return
    }

    const currentPath = normalizePath(this.currentPath())
    if (isSystemShardPath(currentPath)) {
      this.logFolderSnapshot('ensureVisibleRangeLoaded:skipped', {
        reason: 'system-shard',
        requestedStartIndex: normalizedRange.startIndex,
        requestedEndIndex: normalizedRange.endIndex,
      })
      return
    }

    const request = this.createFolderPageRequest(currentPath, normalizedRange)
    const queryKey = this.getFolderQueryKey()
    this.logFolderSnapshot('ensureVisibleRangeLoaded:start', {
      requestedStartIndex: normalizedRange.startIndex,
      requestedEndIndex: normalizedRange.endIndex,
      requestOffset: request.offset,
      requestLimit: request.limit ?? null,
      expectedVersion: request.expected_version ?? null,
    })
    try {
      await wrap(loader.ensureFolderRangeLoaded(request, queryKey))
      this.logFolderSnapshot('ensureVisibleRangeLoaded:done', {
        requestOffset: request.offset,
        requestLimit: request.limit ?? null,
      })
    } catch (error) {
      this.logFolderSnapshot('ensureVisibleRangeLoaded:error', {
        requestOffset: request.offset,
        requestLimit: request.limit ?? null,
        error: error instanceof Error ? error.message : String(error),
      })
      // CatalogService stores page errors in folder state for the current query.
    }
  }

  private setupCatalogSubscription(): void {
    const {catalog, ws} = this.ctx
    this.teardownCatalogSubscription()

    if (!catalog?.catalog || !ws?.connected()) {
      logFileManagerDebug('file-list-model', 'setupCatalogSubscription:skipped', {
        hasCatalog: Boolean(catalog),
        connected: ws?.connected() ?? false,
      })
      return
    }

    try {
      this.unsubscribeMirror = subscribeCallbackAfterInitial(
        catalog.catalog.subscribe.bind(catalog.catalog),
        () => {
          this.validateCurrentPath()
          this.bumpCatalogRevision()
          this.logFolderSnapshot('setupCatalogSubscription:update', {
            catalogRevision: this.catalogRevision(),
          })
          void this.ensureVisibleRangeLoaded(this.visibleRange())
        },
      )
      logFileManagerDebug('file-list-model', 'setupCatalogSubscription:subscribed')

      this.validateCurrentPath()
      this.bumpCatalogRevision()
      void this.ensureVisibleRangeLoaded(this.visibleRange())
      this.logFolderSnapshot('setupCatalogSubscription:initial bump', {
        catalogRevision: this.catalogRevision(),
      })
    } catch {
      logFileManagerDebug('file-list-model', 'setupCatalogSubscription:error')
    }
  }

  private teardownCatalogSubscription(): void {
    if (!this.unsubscribeMirror) {
      return
    }

    this.unsubscribeMirror()
    this.unsubscribeMirror = undefined
    logFileManagerDebug('file-list-model', 'setupCatalogSubscription:unsubscribed')
  }

  private setupVisibleSideEffectSubscriptions(): void {
    this.unsubscribeMediaCandidates = subscribeAfterInitial(this.mediaInspectionCandidates, () => {
      const items = this.mediaInspectionCandidates()
      this.queueMediaInspectionCandidates(items)
    })
    this.unsubscribeThumbnailCandidates = subscribeAfterInitial(
      this.visibleThumbnailCandidates,
      () => this.queueVisibleThumbnails(this.visibleThumbnailCandidates()),
    )
    this.unsubscribeEntryMetaCandidates = subscribeAfterInitial(this.entryMetaCandidates, () => {
      const candidates = this.entryMetaCandidates()
      this.queueEntryMetaHydration(candidates)
    })
    this.unsubscribeVaultLockPending = subscribeAfterInitial(this.vaultLockPending, () => {
      const pending = this.vaultLockPending()
      if (!pending) return
      this.mediaInspection.cancelPending('vault-lock')
      this.lastMediaCandidateKey = null
    })

    this.queueMediaInspectionCandidates(this.mediaInspectionCandidates())
    this.queueVisibleThumbnails(this.visibleThumbnailCandidates())
    this.queueEntryMetaHydration(this.entryMetaCandidates())
  }

  private teardownVisibleSideEffectSubscriptions(): void {
    this.unsubscribeMediaCandidates?.()
    this.unsubscribeMediaCandidates = undefined
    this.unsubscribeThumbnailCandidates?.()
    this.unsubscribeThumbnailCandidates = undefined
    this.unsubscribeEntryMetaCandidates?.()
    this.unsubscribeEntryMetaCandidates = undefined
    this.unsubscribeVaultLockPending?.()
    this.unsubscribeVaultLockPending = undefined
  }

  private readVaultLockPending(): boolean {
    const pending = (this.ctx.store as {vaultLockPending?: () => boolean}).vaultLockPending
    return typeof pending === 'function' ? pending() : false
  }

  private queueMediaInspectionCandidates(items: readonly FileListItem[]): void {
    const key = items.map((item) => this.mediaCandidateKey(item)).join('|')
    if (key === this.lastMediaCandidateKey) return
    this.lastMediaCandidateKey = key
    this.mediaInspection.queueVisible(items)
  }

  private mediaCandidateKey(item: FileItemData): string {
    return `${item.id}:${item.sourceRevision ?? 0}:${item.mimeType ?? ''}`
  }

  private queueVisibleThumbnails(items: readonly FileListItem[]): void {
    const key = items.map(getFileThumbnailKey).join('|')
    if (key === this.lastThumbnailCandidateKey) return
    this.lastThumbnailCandidateKey = key
    void fileThumbnailStore.preload(items)
  }

  private queueEntryMetaHydration(candidates: readonly EntryMetaCandidate[]): void {
    for (const candidate of candidates) {
      const key = `${candidate.entryId}:${candidate.revision}`
      if (this.hydratedEntryMetaKeys.has(key)) continue
      this.hydratedEntryMetaKeys.add(key)
      void this.hydrateEntryMeta(candidate)
    }
  }

  private async hydrateEntryMeta(candidate: EntryMetaCandidate): Promise<void> {
    try {
      await wrap(this.ctx.catalog.ensureEntryMeta(candidate.entryId))
      const nextMeta = this.ctx.catalog.getEntryMeta(candidate.entryId)
      const nextTitle = nextMeta?.title ? String(nextMeta.title) : undefined
      if (nextTitle !== candidate.title) {
        this.bumpCatalogRevision()
      }
    } catch {
      // Metadata hydration is best-effort; the raw catalog name remains usable.
    }
  }

  private getLazyFolderLoader():
    | {ensureFolderRangeLoaded: (request: CatalogFolderPageRequest, queryKey?: string) => Promise<void>}
    | null {
    const loader = this.ctx.catalog as unknown as {
      ensureFolderRangeLoaded?: (request: CatalogFolderPageRequest, queryKey?: string) => Promise<void>
    }
    return typeof loader.ensureFolderRangeLoaded === 'function'
      ? {ensureFolderRangeLoaded: loader.ensureFolderRangeLoaded.bind(loader)}
      : null
  }

  private getCurrentFolderState(): CatalogFolderState | undefined {
    return this.getFolderStateForPath(normalizePath(this.currentPath()), this.getFolderQueryKey())
  }

  private getFolderStateForPath(path: string, queryKey: string): CatalogFolderState | undefined {
    const catalog = this.ctx.catalog?.catalog as {
      getFolderState?: (path: string, queryKey?: string) => CatalogFolderState | undefined
    } | undefined
    return catalog?.getFolderState?.(path, queryKey)
  }

  private normalizeVisibleRange(range: FileListVisibleRange): FileListVisibleRange {
    const startIndex = Math.max(0, Math.floor(Number(range.startIndex) || 0))
    const endIndex = Math.max(startIndex, Math.ceil(Number(range.endIndex) || 0))
    return {startIndex, endIndex}
  }

  private createFolderPageRequest(
    currentPath: string,
    range: FileListVisibleRange,
  ): CatalogFolderPageRequest {
    const pageOffset =
      Math.floor(range.startIndex / CATALOG_FOLDER_PAGE_DEFAULT_ITEMS) *
      CATALOG_FOLDER_PAGE_DEFAULT_ITEMS
    const desiredLimit = Math.max(
      CATALOG_FOLDER_PAGE_DEFAULT_ITEMS,
      range.endIndex - pageOffset,
    )
    const limit = Math.min(CATALOG_FOLDER_PAGE_MAX_ITEMS, desiredLimit)
    const state = this.getCurrentFolderState()

    return {
      path: currentPath,
      offset: pageOffset,
      limit,
      expected_version: this.getExpectedFolderVersion(state),
      sort: this.getFolderSort(),
      filter: this.getFolderFilter(),
    }
  }

  private getExpectedFolderVersion(state: CatalogFolderState | undefined): number | null {
    if (!state) return null
    if (state.totalCount === 0 && state.loadedRanges.length === 0) return null
    return state.version
  }

  private getFolderQueryKey(filters = this.searchFilters()): string {
    const query = filters.query.trim()
    const hasFileTypes = filters.fileTypes.length > 0
    let searchMode = 'direct'
    if (query !== '') {
      searchMode = 'recursive-content'
    } else if (hasFileTypes) {
      searchMode = 'recursive-file-types'
    }
    if (
      query === '' &&
      filters.sortBy === 'name' &&
      filters.sortDirection === 'asc' &&
      filters.showHidden === false &&
      filters.fileTypes.length === 0
    ) {
      return 'default'
    }

    return JSON.stringify({
      searchMode,
      query,
      sortBy: filters.sortBy,
      sortDirection: filters.sortDirection,
      showHidden: filters.showHidden,
      fileTypes: filters.fileTypes,
    })
  }

  private getFolderSort(filters = this.searchFilters()): CatalogFolderSort {
    return {
      by: filters.sortBy,
      direction: filters.sortDirection,
    }
  }

  private getFolderFilter(filters = this.searchFilters()): CatalogFolderFilter {
    const query = filters.query.trim()
    const shouldFilterRecursively = query !== '' || filters.fileTypes.length > 0
    return {
      query: query || null,
      include_hidden: filters.showHidden,
      file_types: [...filters.fileTypes],
      ...(shouldFilterRecursively ? {recursive: true} : {}),
      ...(query ? {include_text_content: true} : {}),
    }
  }

  private nodeToFileListItem(node: CatalogNodeClient, currentPath: string): FileListItem | null {
    const {catalog} = this.ctx
    if (node.name == null) return null
    const name = String(node.name)
    if (shouldHideFileManagerNode(name, currentPath, Boolean(node.isDir))) {
      return null
    }

    const entryId = node.isDir ? node.nodeId : undefined
    const pmMeta = entryId ? catalog.getEntryMeta(entryId) : undefined
    const displayName = pmMeta?.title ? String(pmMeta.title) : node.name || ''
    const selected = this.selectedItems()

    return {
      id: node.nodeId,
      path: node.path ?? '',
      name: displayName,
      isDir: node.isDir,
      size: node.size,
      lastModified: node.modtime !== undefined ? Number(node.modtime) : undefined,
      sourceRevision: node.sourceRevision,
      mediaInspectedRevision: node.mediaInspectedRevision,
      mimeType: typeof node.mimeType === 'string' ? node.mimeType : undefined,
      mediaInfo: node.mediaInfo ?? null,
      selected: selected.includes(node.nodeId),
    }
  }

  private getRenderItems(): FileListRenderItem[] {
    const {catalog, ws} = this.ctx
    if (!catalog?.catalog || !ws?.connected()) return []

    const currentPath = normalizePath(this.currentPath())
    if (isSystemShardPath(currentPath)) return []

    const queryKey = this.getFolderQueryKey()
    const pageApi = catalog.catalog as {
      getFolderState?: (path: string, queryKey?: string) => CatalogFolderState | undefined
      getFolderItems?: (path: string, queryKey?: string) => Array<CatalogNodeClient | null>
    }
    const state = pageApi.getFolderState?.(currentPath, queryKey)
    if (state) {
      const items = pageApi.getFolderItems?.(currentPath, queryKey) ?? []
      return items.map((node) => (node ? this.nodeToFileListItem(node, currentPath) : null))
    }

    return this.catalogUI.filterAndSort(this.getFileItems(), this.searchFilters())
  }

  private getFileItems(): FileListItem[] {
    const {catalog, ws} = this.ctx
    if (!catalog?.catalog || !ws?.connected()) {
      return []
    }

    const currentPath = this.currentPath()

    if (isSystemShardPath(currentPath)) {
      return []
    }

    try {
      const children = catalog.catalog.getChildren(currentPath)
      if (!children || !Array.isArray(children)) {
        return []
      }

      return (children as CatalogNodeClient[])
        .map((node) => this.nodeToFileListItem(node, currentPath))
        .filter(isRealFileListItem)
    } catch {
      return []
    }
  }

  private logFolderSnapshot(event: string, extra?: Record<string, unknown>): void {
    const rawPath = this.currentPath()
    const path = normalizePath(rawPath)
    const queryKey = this.getFolderQueryKey()
    const state = this.getFolderStateForPath(path, queryKey)
    const renderItems = this.renderItems()
    const fileItems = this.fileItems()
    const realRenderItems = renderItems.filter(isRealFileListItem)
    const key = `${event}|${path}|${queryKey}|${state?.version ?? 'none'}|${state?.totalCount ?? 'none'}|${renderItems.length}|${realRenderItems.length}|${fileItems.length}|${JSON.stringify(extra ?? {})}`
    if (key === this.lastFolderSnapshotKey) return
    this.lastFolderSnapshotKey = key

    logFileManagerDebug('file-list-model', event, {
      rawPath,
      path,
      queryKey,
      renderSlots: renderItems.length,
      renderRealCount: realRenderItems.length,
      fileItems: fileItems.length,
      totalCount: this.totalCount(),
      filteredCount: this.filteredCount(),
      folderState: state
        ? {
          version: state.version,
          totalCount: state.totalCount,
          loadedRanges: state.loadedRanges,
          loadingRanges: state.loadingRanges,
          error: state.error ?? null,
        }
        : null,
      firstRenderItems: realRenderItems.slice(0, 5).map((item) => ({
        id: item.id,
        name: item.name,
        isDir: item.isDir,
      })),
      ...extra,
    })
  }
}
