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
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
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

const SYSTEM_SHARD_ROOTS = [PASS_DIR, '.wallet'].map((root) =>
  root.startsWith('/') ? root : '/' + root,
)

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

  readonly selectedCount = computed<number>(() => this.selectedItems().length)

  private readonly catalogUI = new CatalogUIService()
  private readonly catalogRevision = atom(0)
  private readonly visibleRange = atom<FileListVisibleRange>({
    startIndex: 0,
    endIndex: CATALOG_FOLDER_PAGE_DEFAULT_ITEMS,
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
  private readonly hydratedEntryMetaKeys = new Set<string>()

  private unsubscribeMirror?: () => void
  private unsubscribeAuth?: () => void
  private unsubscribeMediaCandidates?: () => void
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
      writeAndroidUnlockDebug('file-list-model', 'connect:ws.connected changed', {
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
    this.mediaInspection.cancelPending('file-list-cleanup')

    this.teardownVisibleSideEffectSubscriptions()
    this.teardownCatalogSubscription()
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth()
      this.unsubscribeAuth = undefined
    }
  }

  getFileItemById(nodeId: number): FileItemData | null {
    return this.fileItems().find((item) => item.id === nodeId) ?? null
  }

  getSelectedFileItems(): FileListItem[] {
    const selectedIds = this.selectedItems()
    if (selectedIds.length === 0) {
      return []
    }

    const selectedSet = new Set(selectedIds)
    return this.fileItems().filter((item) => selectedSet.has(item.id))
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
    if (!loader || !this.ctx.ws?.connected()) return

    const currentPath = normalizePath(this.currentPath())
    if (isSystemShardPath(currentPath)) return

    const request = this.createFolderPageRequest(currentPath, normalizedRange)
    try {
      await loader.ensureFolderRangeLoaded(request, this.getFolderQueryKey())
    } catch {
      // CatalogService stores page errors in folder state for the current query.
    }
  }

  private setupCatalogSubscription(): void {
    const {catalog, ws} = this.ctx
    this.teardownCatalogSubscription()

    if (!catalog?.catalog || !ws?.connected()) {
      writeAndroidUnlockDebug('file-list-model', 'setupCatalogSubscription:skipped', {
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
          void this.ensureVisibleRangeLoaded(this.visibleRange())
        },
      )
      writeAndroidUnlockDebug('file-list-model', 'setupCatalogSubscription:subscribed')

      this.validateCurrentPath()
      this.bumpCatalogRevision()
      void this.ensureVisibleRangeLoaded(this.visibleRange())
      writeAndroidUnlockDebug('file-list-model', 'setupCatalogSubscription:initial bump')
    } catch {
      writeAndroidUnlockDebug('file-list-model', 'setupCatalogSubscription:error')
    }
  }

  private teardownCatalogSubscription(): void {
    if (!this.unsubscribeMirror) {
      return
    }

    this.unsubscribeMirror()
    this.unsubscribeMirror = undefined
    writeAndroidUnlockDebug('file-list-model', 'setupCatalogSubscription:unsubscribed')
  }

  private setupVisibleSideEffectSubscriptions(): void {
    this.unsubscribeMediaCandidates = subscribeAfterInitial(this.mediaInspectionCandidates, () => {
      const items = this.mediaInspectionCandidates()
      this.queueMediaInspectionCandidates(items)
    })
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
    this.queueEntryMetaHydration(this.entryMetaCandidates())
  }

  private teardownVisibleSideEffectSubscriptions(): void {
    this.unsubscribeMediaCandidates?.()
    this.unsubscribeMediaCandidates = undefined
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
    const catalog = this.ctx.catalog?.catalog as {
      getFolderState?: (path: string, queryKey?: string) => CatalogFolderState | undefined
    } | undefined
    return catalog?.getFolderState?.(this.currentPath(), this.getFolderQueryKey())
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
      expected_version: state?.version ?? null,
      sort: this.getFolderSort(),
      filter: this.getFolderFilter(),
    }
  }

  private getFolderQueryKey(filters = this.searchFilters()): string {
    const query = filters.query.trim()
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
    return {
      query: filters.query.trim() || null,
      include_hidden: filters.showHidden,
      file_types: [...filters.fileTypes],
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
}
