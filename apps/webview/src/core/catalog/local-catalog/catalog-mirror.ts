import {ClientCatalogNode} from './client-model'
import type {
  CatalogEvent,
  CatalogFolderBatchResponse,
  CatalogFolderListItem,
  CatalogFolderPageResponse,
  CatalogFolderState,
  CatalogJSON,
  NodeType,
  CatalogSyncManifestResponse,
  CatalogNodeClient,
} from './types'
import {CatalogEventType} from './types'
import {normalizeFileMediaInfo} from '../media-info'
import {joinPath, normalizePath} from './path'

const DEFAULT_FOLDER_QUERY_KEY = 'default'

export type DefaultCatalogSortableNode = {
  readonly nodeId?: number
  readonly name: string
  readonly isDir: boolean
  readonly path?: string | null
}

export function compareDefaultCatalogNodes(
  left: DefaultCatalogSortableNode,
  right: DefaultCatalogSortableNode,
): number {
  if (left.isDir !== right.isDir) {
    return left.isDir ? -1 : 1
  }

  const nameOrder = left.name.toLocaleLowerCase().localeCompare(right.name.toLocaleLowerCase())
  if (nameOrder !== 0) return nameOrder

  const exactNameOrder = left.name.localeCompare(right.name)
  if (exactNameOrder !== 0) return exactNameOrder

  const pathOrder = (left.path ?? '').localeCompare(right.path ?? '')
  if (pathOrder !== 0) return pathOrder

  return (left.nodeId ?? 0) - (right.nodeId ?? 0)
}

type MutableFolderPageState = {
  path: string
  version: number
  totalCount: number
  queryKey: string
  items: Array<number | null>
  loadedRanges: Array<{offset: number; limit: number}>
  loadingRanges: Array<{offset: number; limit: number}>
  error?: string | null
}

export interface CatalogMirrorApi {
  applyManifest(manifest: CatalogSyncManifestResponse): void
  applyFolderPage(page: CatalogFolderPageResponse, queryKey?: string): void
  applyFolderBatch(batch: CatalogFolderBatchResponse, queryKey?: string): void
  applyEvent(event: CatalogEvent): void
  applyEvents(events: readonly CatalogEvent[]): void
  getNode(id: number): ClientCatalogNode | undefined
  getChildren(pathOrId: string | number | null): ClientCatalogNode[]
  getFolderState(path: string, queryKey?: string): CatalogFolderState | undefined
  getFolderItems(path: string, queryKey?: string): Array<ClientCatalogNode | null>
  isFolderRangeLoaded(path: string, offset: number, limit: number, queryKey?: string): boolean
  setFolderRangeLoading(
    path: string,
    offset: number,
    limit: number,
    loading: boolean,
    queryKey?: string,
  ): void
  setFolderError(path: string, error: string | null, queryKey?: string): void
  invalidateFolder(path: string, queryKey?: string): void
  invalidateShard(shardId: string): void
  getPath(id: number): string
  findByPath(path: string): ClientCatalogNode | undefined
  subscribe(listener: () => void): () => void
}

export class CatalogMirror implements CatalogMirrorApi {
  private byId = new Map<number, ClientCatalogNode>()
  private idsByPath = new Map<string, number>()
  private childrenByPath = new Map<string, number[]>()
  private folderPages = new Map<string, MutableFolderPageState>()
  private listeners = new Set<() => void>()
  private transactionDepth = 0
  private pendingEmit = false

  private folderKey(path: string, queryKey = DEFAULT_FOLDER_QUERY_KEY): string {
    return `${normalizePath(path)}\u0000${queryKey || DEFAULT_FOLDER_QUERY_KEY}`
  }

  private withTransaction(fn: () => void): void {
    this.transactionDepth++
    try {
      fn()
    } finally {
      this.transactionDepth--
      if (this.transactionDepth === 0 && this.pendingEmit) {
        this.pendingEmit = false
        this.emit()
      }
    }
  }

  private deleteSubtree(nodeId: number): void {
    const node = this.byId.get(nodeId)
    if (!node) return

    const path = node.path

    // Delete descendants first.
    const childIds = this.childrenByPath.get(path) ?? []
    for (const id of [...childIds]) {
      this.deleteSubtree(id)
    }
    this.childrenByPath.delete(path)

    // Detach from parent.
    const parent = node.parentPath ?? '/'
    const siblings = this.childrenByPath.get(parent) ?? []
    this.childrenByPath.set(
      parent,
      siblings.filter((id) => id !== nodeId),
    )

    // Remove node itself.
    this.byId.delete(nodeId)
    this.idsByPath.delete(path)
  }

  applyManifest(manifest: CatalogSyncManifestResponse): void {
    this.withTransaction(() => {
      this.byId.clear()
      this.idsByPath.clear()
      this.childrenByPath.clear()
      this.folderPages.clear()

      const now = Date.now()
      const root: CatalogJSON = {
        i: 0,
        t: 0,
        n: '/',
        s: 0,
        z: 0,
        b: now,
        m: now,
        c: manifest.root_summaries,
      }
      this.buildFromCatalogJSON(root, '')
      for (const eager of Object.values(manifest.eager_data ?? {})) {
        if (eager?.root) this.buildFromCatalogJSON(eager.root, '/')
      }
      const rootIds = manifest.root_summaries
        .map((node) => this.idsByPath.get(normalizePath(joinPath('/', node.n))) ?? null)
        .filter((id): id is number => typeof id === 'number')
        .sort((left, right) => compareDefaultCatalogNodes(this.byId.get(left)!, this.byId.get(right)!))
      const state: MutableFolderPageState = {
        path: '/',
        version: manifest.root_version,
        totalCount: rootIds.length,
        queryKey: DEFAULT_FOLDER_QUERY_KEY,
        items: rootIds,
        loadedRanges: rootIds.length > 0 ? [{offset: 0, limit: rootIds.length}] : [],
        loadingRanges: [],
        error: null,
      }
      this.folderPages.set(this.folderKey('/'), state)
      this.emit()
    })
  }

  applyFolderPage(page: CatalogFolderPageResponse, queryKey = DEFAULT_FOLDER_QUERY_KEY): void {
    this.withTransaction(() => this.applyFolderPageNoEmit(page, queryKey))
  }

  applyFolderBatch(batch: CatalogFolderBatchResponse, queryKey = DEFAULT_FOLDER_QUERY_KEY): void {
    this.withTransaction(() => {
      for (const page of batch.pages) this.applyFolderPageNoEmit(page, queryKey)
      this.emit()
    })
  }

  private applyFolderPageNoEmit(page: CatalogFolderPageResponse, queryKey: string): void {
    const path = normalizePath(page.current_path)
    const key = this.folderKey(path, queryKey)
    if (page.reload_required) {
      this.folderPages.delete(key)
      this.emit()
      return
    }

    const state =
      this.folderPages.get(key) ??
      ({
        path,
        version: page.version,
        totalCount: page.total_count,
        queryKey,
        items: Array.from({length: page.total_count}, () => null),
        loadedRanges: [],
        loadingRanges: [],
        error: null,
      } satisfies MutableFolderPageState)

    if (state.version !== page.version || state.totalCount !== page.total_count) {
      state.version = page.version
      state.totalCount = page.total_count
      state.items = Array.from({length: page.total_count}, () => null)
      state.loadedRanges = []
      state.loadingRanges = []
    }

    page.items.forEach((item, index) => {
      const absoluteIndex = page.offset + index
      if (absoluteIndex >= state.items.length) return
      const node = this.upsert(this.catalogNodeFromFolderItem(path, item))
      state.items[absoluteIndex] = node.nodeId
    })

    state.loadedRanges.push({offset: page.offset, limit: page.items.length})
    state.loadingRanges = state.loadingRanges.filter(
      (range) => range.offset !== page.offset || range.limit !== page.limit,
    )
    state.error = null
    this.folderPages.set(key, state)
    this.childrenByPath.set(
      path,
      state.items.filter((id): id is number => typeof id === 'number'),
    )
    this.emit()
  }

  applyEvent(event: CatalogEvent): void {
    const type = event.type
    const md = (event.metadata ?? {}) as Record<string, unknown>
    switch (type) {
      case CatalogEventType.NODE_CREATED: {
        const parentId = md['parentId'] as number | null | undefined
        const name = String(md['name'] ?? '')
        const explicitParentPath = (md['parentPath'] as string | undefined) || undefined
        const parentPath = explicitParentPath ?? (parentId ? this.getPath(parentId) : '/')
        const path = normalizePath(joinPath(parentPath, name))
        const t = (md['type'] as NodeType | number | undefined) ?? 0
        const node: CatalogNodeClient = {
          nodeId: event.nodeId,
          nodeType: (typeof t === 'number' ? (t as NodeType) : (t as NodeType)) ?? (0 as NodeType),
          name,
          size: (md['size'] as number) ?? 0,
          birthtime: typeof md['birthtime'] === 'number' ? md['birthtime'] : event.timestamp,
          modtime: Date.now(),
          isDir: t === 0 || t === 255,
          isFile: t === 1,
          isSymlink: t === 2,
          path,
          hasChildren: Boolean(md['deferredContent']) || false,
          deferredChildren: Boolean(md['deferredContent']) || false,
          sourceRevision: typeof md['sourceRevision'] === 'number' ? md['sourceRevision'] : undefined,
          mediaInspectedRevision:
            typeof md['mediaInspectedRevision'] === 'number' ? md['mediaInspectedRevision'] : undefined,
          mimeType: (md['mimeType'] as string) || undefined,
          mediaInfo: normalizeFileMediaInfo(md['mediaInfo']),
        }
        this.upsert(new ClientCatalogNode(node))
        this.invalidateFolder(parentPath)
        this.emit()
        break
      }
      case CatalogEventType.NODE_MOVED: {
        const oldParentId = md['oldParentId'] as number | null
        const newParentId = md['newParentId'] as number | null
        const newName = md['newName'] as string | undefined
        const node = this.byId.get(event.nodeId)
        if (!node) break
        const oldParentPath = oldParentId ? this.getPath(oldParentId) : (node.parentPath ?? '/')
        const newParentPath = newParentId ? this.getPath(newParentId) : '/'
        const nextName = newName ?? node.name
        const newPath = normalizePath(joinPath(newParentPath, nextName))
        this.idsByPath.delete(node.path)
        ;(node as unknown as {name: string}).name = nextName
        ;(node as unknown as {path: string}).path = newPath
        this.idsByPath.set((node as unknown as {path: string}).path, node.nodeId)
        const oldChildren = this.childrenByPath.get(oldParentPath) ?? []
        this.childrenByPath.set(
          oldParentPath,
          oldChildren.filter((id) => id !== node.nodeId),
        )
        const newChildren = this.childrenByPath.get(newParentPath) ?? []
        if (!newChildren.includes(node.nodeId)) newChildren.push(node.nodeId)
        this.childrenByPath.set(newParentPath, newChildren)
        this.invalidateFolder(oldParentPath)
        this.invalidateFolder(newParentPath)
        this.emit()
        break
      }
      case CatalogEventType.NODE_RENAMED: {
        const newName = String(md['newName'] ?? '')
        const node = this.byId.get(event.nodeId)
        if (!node) break
        const parent = node.parentPath ?? '/'
        const newPath = normalizePath(joinPath(parent, newName))
        this.idsByPath.delete(node.path)
        ;(node as unknown as {name: string}).name = newName
        ;(node as unknown as {path: string}).path = newPath
        this.idsByPath.set(newPath, node.nodeId)
        this.invalidateFolder(parent)
        this.emit()
        break
      }
      case CatalogEventType.NODE_UPDATED: {
        const node = this.byId.get(event.nodeId)
        if (!node) break
        const size = md['size'] as number | undefined
        const mime = md['mime'] as string | undefined
        const modtime = md['modtime'] as number | undefined
        const sourceRevision = md['sourceRevision'] as number | undefined
        const mediaInspectedRevision = md['mediaInspectedRevision'] as number | undefined
        const hasMediaInfo = Object.prototype.hasOwnProperty.call(md, 'mediaInfo')
        if (size !== undefined) (node as unknown as {size: number}).size = size
        if (mime !== undefined) (node as unknown as {mimeType?: string}).mimeType = mime
        if (modtime !== undefined) (node as unknown as {modtime: number}).modtime = modtime
        if (sourceRevision !== undefined) {
          ;(node as unknown as {sourceRevision?: number}).sourceRevision = sourceRevision
        }
        if (mediaInspectedRevision !== undefined) {
          ;(node as unknown as {mediaInspectedRevision?: number}).mediaInspectedRevision =
            mediaInspectedRevision
        }
        if (hasMediaInfo) {
          ;(node as unknown as {mediaInfo?: ReturnType<typeof normalizeFileMediaInfo>}).mediaInfo =
            normalizeFileMediaInfo(md['mediaInfo'])
        }
        this.invalidateFolder(node.parentPath ?? '/')
        this.emit()
        break
      }
      case CatalogEventType.NODE_DELETED: {
        const parent = this.byId.get(event.nodeId)?.parentPath ?? '/'
        this.deleteSubtree(event.nodeId)
        this.invalidateFolder(parent)
        this.emit()
        break
      }
    }
  }

  applyEvents(events: readonly CatalogEvent[]): void {
    if (events.length === 0) return
    this.withTransaction(() => {
      for (const event of events) this.applyEvent(event)
    })
  }

  getNode(id: number): ClientCatalogNode | undefined {
    return this.byId.get(id)
  }

  getChildren(pathOrId: string | number | null): ClientCatalogNode[] {
    const path = typeof pathOrId === 'number' ? this.getPath(pathOrId) : (pathOrId ?? '/')
    const ids = this.childrenByPath.get(normalizePath(path)) ?? []
    return ids
      .map((id) => this.byId.get(id)!)
      .filter(Boolean)
      .sort(compareDefaultCatalogNodes)
  }

  getFolderState(path: string, queryKey = DEFAULT_FOLDER_QUERY_KEY): CatalogFolderState | undefined {
    const state = this.folderPages.get(this.folderKey(path, queryKey))
    if (!state) return undefined
    return {
      path: state.path,
      version: state.version,
      totalCount: state.totalCount,
      queryKey: state.queryKey,
      loadedRanges: state.loadedRanges.map((range) => ({...range})),
      loadingRanges: state.loadingRanges.map((range) => ({...range})),
      error: state.error ?? null,
    }
  }

  getFolderItems(path: string, queryKey = DEFAULT_FOLDER_QUERY_KEY): Array<ClientCatalogNode | null> {
    const state = this.folderPages.get(this.folderKey(path, queryKey))
    if (!state) return this.getChildren(path)
    return state.items.map((id) => (id === null ? null : (this.byId.get(id) ?? null)))
  }

  isFolderRangeLoaded(
    path: string,
    offset: number,
    limit: number,
    queryKey = DEFAULT_FOLDER_QUERY_KEY,
  ): boolean {
    const state = this.folderPages.get(this.folderKey(path, queryKey))
    if (!state) return false
    const end = Math.min(state.totalCount, offset + limit)
    for (let index = offset; index < end; index++) {
      if (state.items[index] === null || state.items[index] === undefined) return false
    }
    return true
  }

  setFolderRangeLoading(
    path: string,
    offset: number,
    limit: number,
    loading: boolean,
    queryKey = DEFAULT_FOLDER_QUERY_KEY,
  ): void {
    const key = this.folderKey(path, queryKey)
    const state =
      this.folderPages.get(key) ??
      ({
        path: normalizePath(path),
        version: 0,
        totalCount: 0,
        queryKey,
        items: [],
        loadedRanges: [],
        loadingRanges: [],
        error: null,
      } satisfies MutableFolderPageState)
    if (loading) {
      if (!state.loadingRanges.some((range) => range.offset === offset && range.limit === limit)) {
        state.loadingRanges.push({offset, limit})
      }
    } else {
      state.loadingRanges = state.loadingRanges.filter(
        (range) => range.offset !== offset || range.limit !== limit,
      )
    }
    this.folderPages.set(key, state)
    this.emit()
  }

  setFolderError(path: string, error: string | null, queryKey = DEFAULT_FOLDER_QUERY_KEY): void {
    const key = this.folderKey(path, queryKey)
    const state = this.folderPages.get(key)
    if (!state) return
    state.error = error
    this.emit()
  }

  invalidateFolder(path: string, queryKey?: string): void {
    const normalized = normalizePath(path)
    if (queryKey !== undefined) {
      this.folderPages.delete(this.folderKey(normalized, queryKey))
    } else {
      for (const key of [...this.folderPages.keys()]) {
        if (key.startsWith(`${normalized}\u0000`)) this.folderPages.delete(key)
      }
    }
    this.emit()
  }

  invalidateShard(shardId: string): void {
    const shardPath = normalizePath('/' + shardId.replace(/^\/+/, ''))
    for (const state of [...this.folderPages.values()]) {
      if (state.path === shardPath || state.path.startsWith(`${shardPath}/`)) {
        this.invalidateFolder(state.path)
      }
    }
  }

  getPath(id: number): string {
    const n = this.byId.get(id)
    if (!n) return '/'
    return n.path
  }

  findByPath(path: string): ClientCatalogNode | undefined {
    const normalized = normalizePath(path)
    const id = this.idsByPath.get(normalized)
    return id !== undefined ? this.byId.get(id) : undefined
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    if (this.transactionDepth > 0) {
      this.pendingEmit = true
      return
    }
    for (const l of this.listeners) l()
  }

  private upsert(nodeLike: ClientCatalogNode | CatalogNodeClient): ClientCatalogNode {
    const node = nodeLike instanceof ClientCatalogNode ? nodeLike : new ClientCatalogNode(nodeLike)
    this.byId.set(node.nodeId, node)
    this.idsByPath.set(node.path, node.nodeId)
    const parent = node.parentPath ?? '/'
    if (node.parentPath === null) {
      if (node.isDir && !this.childrenByPath.has(node.path)) this.childrenByPath.set(node.path, [])
      return node
    }
    if (!this.childrenByPath.has(parent)) this.childrenByPath.set(parent, [])
    const list = this.childrenByPath.get(parent)!
    if (!list.includes(node.nodeId)) list.push(node.nodeId)
    if (node.isDir && !this.childrenByPath.has(node.path)) this.childrenByPath.set(node.path, [])
    return node
  }

  private catalogNodeFromFolderItem(parentPath: string, item: CatalogFolderListItem): CatalogNodeClient {
    const nodeType = (item.is_dir ? 0 : 1) as NodeType
    return {
      nodeId: item.node_id,
      nodeType,
      name: item.name,
      size: item.size ?? 0,
      birthtime: item.created_at,
      modtime: item.updated_at,
      isDir: item.is_dir,
      isFile: !item.is_dir,
      isSymlink: false,
      path: normalizePath(joinPath(parentPath, item.name)),
      hasChildren: item.is_dir,
      deferredChildren: item.is_dir,
      mediaInspectedRevision: item.media_inspected_revision,
      mimeType: item.mime_type ?? undefined,
      mediaInfo: normalizeFileMediaInfo(item.media_info),
    }
  }

  private buildFromCatalogJSON(node: CatalogJSON, parentPath: string): void {
    const isDir = node.t === 0 || node.t === 255
    const name = node.n
    const path = parentPath === '' ? '/' : normalizePath(joinPath(parentPath, name))
    const client: CatalogNodeClient = {
      nodeId: node.i,
      nodeType: node.t,
      name,
      size: node.s,
      birthtime: node.b,
      modtime: node.m,
      isDir,
      isFile: node.t === 1,
      isSymlink: node.t === 2,
      path,
      hasChildren: Boolean(node.h) || (Array.isArray(node.c) && node.c.length > 0),
      deferredChildren: Boolean(node.h),
      sourceRevision: node.r,
      mediaInspectedRevision: node.q,
      mimeType: node.y,
      mediaInfo: normalizeFileMediaInfo(node.u),
    }
    this.upsert(client)
    if (node.c && isDir) {
      for (const child of node.c) this.buildFromCatalogJSON(child, path)
    }
  }
}
