import {action, atom, computed, wrap} from '@reatom/core'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {buildChildPath, parentPath as getParentPath} from 'root/app/navigation/navigation-snapshot'
import {compareDefaultCatalogNodes} from 'root/core/catalog/local-catalog/catalog-mirror'
import type {
  CatalogNotesListItem,
  CatalogNotesListResponse,
} from 'root/core/catalog/local-catalog/types'
import type {AppContext} from 'root/shared/services/app-context'
import {tryGetAppContext} from 'root/shared/services/app-context'
import {
  subscribeCallbackAfterInitial,
  subscribeToSignalChanges,
} from 'root/shared/services/subscribed-signal'

export type NotesQuickViewRow = {
  id: string
  fileId: number
  fileName: string
  path: string
  parentPath: string
  size?: number
  lastModified?: number
  sourceRevision?: number
  mimeType?: string
}

export type NotesQuickViewMode = 'flat' | 'hierarchy'

export type NotesQuickViewTreeNote = {
  type: 'note'
  id: string
  level: number
  row: NotesQuickViewRow
}

export type NotesQuickViewTreeDirectory = {
  type: 'directory'
  id: string
  name: string
  path: string
  parentPath: string
  level: number
  noteCount: number
  expanded: boolean
  children: NotesQuickViewTreeItem[]
}

export type NotesQuickViewTreeItem = NotesQuickViewTreeNote | NotesQuickViewTreeDirectory

export type NotesQuickViewSummary = {
  total: number
  visible: number
}

type NotesQuickViewProjection = {
  rows: NotesQuickViewRow[]
  tree: NotesQuickViewTreeItem[]
}

type CatalogSubscription = {
  subscribe?: (listener: () => void) => () => void
}

type NotesLoader = {
  listNotes?: () => Promise<CatalogNotesListResponse>
}

type TransportConnection = {
  connected?: {
    (): boolean
    subscribe?: (listener: (value: boolean) => void) => () => void
  }
}

export type NotesQuickViewModelDeps = {
  getContext?: () => AppContext | null
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function toOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function rowMatchesQuery(row: NotesQuickViewRow, query: string): boolean {
  if (!query) {
    return true
  }

  return [row.fileName, row.path, row.parentPath].some((value) =>
    normalizeSearchValue(value).includes(query),
  )
}

function compareNotesQuickViewRows(left: NotesQuickViewRow, right: NotesQuickViewRow): number {
  return compareDefaultCatalogNodes(
    {
      name: left.fileName,
      isDir: false,
      path: left.path,
      nodeId: left.fileId,
    },
    {
      name: right.fileName,
      isDir: false,
      path: right.path,
      nodeId: right.fileId,
    },
  )
}

function compareTreeItems(left: NotesQuickViewTreeItem, right: NotesQuickViewTreeItem): number {
  return compareDefaultCatalogNodes(
    {
      name: left.type === 'directory' ? left.name : left.row.fileName,
      isDir: left.type === 'directory',
      path: left.type === 'directory' ? left.path : left.row.path,
      nodeId: left.type === 'note' ? left.row.fileId : undefined,
    },
    {
      name: right.type === 'directory' ? right.name : right.row.fileName,
      isDir: right.type === 'directory',
      path: right.type === 'directory' ? right.path : right.row.path,
      nodeId: right.type === 'note' ? right.row.fileId : undefined,
    },
  )
}

function splitCatalogPath(path: string): string[] {
  return path.split('/').filter(Boolean)
}

function rowFromNotesItem(item: CatalogNotesListItem): NotesQuickViewRow | null {
  const fileId = Number(item.node_id)
  if (!Number.isFinite(fileId)) {
    return null
  }

  const path = item.path || buildChildPath(item.parent_path || '/', item.name)
  const mimeType = typeof item.mime_type === 'string' ? item.mime_type : undefined
  const size = toOptionalFiniteNumber(item.size)
  const lastModified = toOptionalFiniteNumber(item.updated_at)
  const sourceRevision = toOptionalFiniteNumber(item.source_revision)

  return {
    id: String(fileId),
    fileId,
    fileName: item.name,
    path,
    parentPath: item.parent_path || getParentPath(path),
    ...(size !== undefined ? {size} : {}),
    ...(lastModified !== undefined ? {lastModified} : {}),
    ...(sourceRevision !== undefined ? {sourceRevision} : {}),
    ...(mimeType ? {mimeType} : {}),
  }
}

export class NotesQuickViewModel {
  readonly query = atom('', 'notes.quickView.query')
  readonly viewMode = atom<NotesQuickViewMode>('flat', 'notes.quickView.viewMode')
  private readonly catalogRevision = atom(0, 'notes.quickView.catalogRevision')
  private readonly noteRows = atom<NotesQuickViewRow[]>([], 'notes.quickView.noteRows')
  private readonly isLoadingNotes = atom(false, 'notes.quickView.isLoadingNotes')
  private readonly collapsedDirectoryPaths = atom<ReadonlySet<string>>(
    new Set<string>(),
    'notes.quickView.collapsedDirectoryPaths',
  )

  readonly hasCatalog = computed(() => {
    void this.catalogRevision()
    return Boolean(this.getNotesLoader())
  }, 'notes.quickView.hasCatalog')
  readonly isLoading = computed(() => {
    void this.catalogRevision()
    return Boolean(this.getContext()?.catalog?.syncing?.()) || this.isLoadingNotes()
  }, 'notes.quickView.isLoading')

  private readonly projection = computed(() => {
    const rows = [...this.noteRows()].sort(compareNotesQuickViewRows)

    return {
      rows,
      tree: this.buildTree(rows),
    } satisfies NotesQuickViewProjection
  }, 'notes.quickView.projection')

  readonly rows = computed(() => this.projection().rows, 'notes.quickView.rows')

  readonly visibleRows = computed(() => {
    const query = normalizeSearchValue(this.query())
    return this.rows().filter((row) => rowMatchesQuery(row, query))
  }, 'notes.quickView.visibleRows')

  readonly visibleTree = computed(() => {
    const query = normalizeSearchValue(this.query())
    const collapsedDirectoryPaths = this.collapsedDirectoryPaths()
    return this.filterTree(this.projection().tree, query, collapsedDirectoryPaths)
  }, 'notes.quickView.visibleTree')

  readonly summary = computed(() => {
    const rows = this.rows()
    const visibleRows = this.visibleRows()

    return {
      total: rows.length,
      visible: visibleRows.length,
    } satisfies NotesQuickViewSummary
  }, 'notes.quickView.summary')

  readonly hasActiveFilters = computed(
    () => this.query().trim().length > 0,
    'notes.quickView.hasActiveFilters',
  )

  private readonly getContext: () => AppContext | null
  private unsubscribeCatalog?: () => void
  private unsubscribeTransport?: () => void
  private connectionCount = 0
  private loadRunId = 0
  private loadActive = false
  private loadRequested = false
  private loadScheduled = false

  constructor(deps: NotesQuickViewModelDeps = {}) {
    this.getContext = deps.getContext ?? tryGetAppContext
  }

  connect(): void {
    this.connectionCount += 1
    if (this.connectionCount > 1) {
      return
    }

    const catalog = this.getCatalogSubscription()
    if (typeof catalog?.subscribe === 'function') {
      this.unsubscribeCatalog = subscribeCallbackAfterInitial(catalog.subscribe.bind(catalog), () => {
        this.invalidateNotesLoad()
        this.bumpCatalogRevision()
        this.scheduleNotesLoad()
      })
    }

    this.subscribeTransportConnection()
    this.bumpCatalogRevision()
    this.scheduleNotesLoad()
  }

  disconnect(): void {
    if (this.connectionCount === 0) {
      return
    }
    this.connectionCount -= 1
    if (this.connectionCount > 0) {
      return
    }

    this.unsubscribeCatalog?.()
    this.unsubscribeCatalog = undefined
    this.unsubscribeTransport?.()
    this.unsubscribeTransport = undefined
    this.loadRunId += 1
    this.loadRequested = false
    this.loadScheduled = false
    this.isLoadingNotes.set(false)
  }

  readonly setQuery = action((value: string) => {
    this.query.set(value)
  }, 'notes.quickView.setQuery')

  readonly setViewMode = action((value: NotesQuickViewMode) => {
    this.viewMode.set(value)
  }, 'notes.quickView.setViewMode')

  readonly toggleDirectory = action((path: string) => {
    if (!path) {
      return
    }

    const next = new Set(this.collapsedDirectoryPaths())
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    this.collapsedDirectoryPaths.set(next)
  }, 'notes.quickView.toggleDirectory')

  readonly expandAllDirectories = action(() => {
    this.collapsedDirectoryPaths.set(new Set<string>())
  }, 'notes.quickView.expandAllDirectories')

  readonly clearFilters = action(() => {
    this.query.set('')
  }, 'notes.quickView.clearFilters')

  readonly openNote = action((row: NotesQuickViewRow) => {
    if (this.viewMode() === 'hierarchy') {
      navigationModel.openMarkdownDocument(row.fileId, 'push', row.parentPath)
      return
    }

    navigationModel.openMarkdownDocument(row.fileId, 'push', {
      source: {
        path: row.path,
        fileName: row.fileName,
        ...(row.size !== undefined ? {size: row.size} : {}),
        ...(row.mimeType ? {mimeType: row.mimeType} : {}),
        ...(row.lastModified !== undefined ? {lastModified: row.lastModified} : {}),
        ...(row.sourceRevision !== undefined ? {sourceRevision: row.sourceRevision} : {}),
      },
    })
  }, 'notes.quickView.openNote')

  readonly openNoteById = action((rowId: string) => {
    const row = this.rows().find((item) => item.id === rowId)
    if (row) {
      this.openNote(row)
    }
  }, 'notes.quickView.openNoteById')

  readonly state = {
    query: this.query,
    viewMode: this.viewMode,
    rows: this.rows,
    visibleRows: this.visibleRows,
    visibleTree: this.visibleTree,
    summary: this.summary,
    hasCatalog: this.hasCatalog,
    isLoading: this.isLoading,
    hasActiveFilters: this.hasActiveFilters,
  }

  readonly actions = {
    setQuery: this.setQuery,
    setViewMode: this.setViewMode,
    toggleDirectory: this.toggleDirectory,
    expandAllDirectories: this.expandAllDirectories,
    clearFilters: this.clearFilters,
    openNote: this.openNote,
    openNoteById: this.openNoteById,
  }

  private getCatalogSubscription(): CatalogSubscription | null {
    const catalog = this.getContext()?.catalog as {catalog?: unknown} | undefined
    const reader = catalog?.catalog
    return reader && typeof reader === 'object' ? (reader as CatalogSubscription) : null
  }

  private getNotesLoader(): NotesLoader | null {
    const catalog = this.getContext()?.catalog as NotesLoader | undefined
    return typeof catalog?.listNotes === 'function' ? catalog : null
  }

  private getTransportConnection(): TransportConnection | null {
    const ws = this.getContext()?.ws as TransportConnection | undefined
    return ws && typeof ws === 'object' ? ws : null
  }

  private isTransportConnected(): boolean {
    return Boolean(this.getTransportConnection()?.connected?.())
  }

  private subscribeTransportConnection(): void {
    const connected = this.getTransportConnection()?.connected
    if (typeof connected?.subscribe !== 'function') {
      return
    }

    this.unsubscribeTransport = subscribeToSignalChanges(
      connected,
      (nextConnected, wasConnected) => {
        if (!wasConnected && nextConnected) {
          this.invalidateNotesLoad()
          this.scheduleNotesLoad()
        }
      },
      {
        readSnapshot: () => Boolean(connected()),
      },
    )
  }

  private scheduleNotesLoad(): void {
    this.loadRequested = true
    if (this.loadActive || this.loadScheduled) {
      return
    }

    this.loadScheduled = true
    queueMicrotask(() => {
      this.loadScheduled = false
      if (!this.loadRequested || this.connectionCount === 0) {
        return
      }

      this.loadRequested = false
      void this.runNotesLoad(++this.loadRunId)
    })
  }

  private invalidateNotesLoad(): void {
    this.loadRunId += 1
  }

  private async runNotesLoad(runId: number): Promise<void> {
    const loader = this.getNotesLoader()
    if (!loader?.listNotes) {
      this.noteRows.set([])
      this.isLoadingNotes.set(false)
      return
    }
    if (!this.isTransportConnected()) {
      this.isLoadingNotes.set(false)
      return
    }

    this.loadActive = true
    this.isLoadingNotes.set(true)
    try {
      const response = await wrap(loader.listNotes())
      if (!this.isLoadCurrent(runId)) {
        return
      }

      this.noteRows.set(response.items.map(rowFromNotesItem).filter((row): row is NotesQuickViewRow => Boolean(row)))
    } catch {
      // Notes keeps the last successful projection if the refresh fails.
    } finally {
      this.loadActive = false
      if (runId === this.loadRunId) {
        this.isLoadingNotes.set(false)
        this.bumpCatalogRevision()
      }
      if (this.loadRequested && this.connectionCount > 0) {
        this.scheduleNotesLoad()
      }
    }
  }

  private isLoadCurrent(runId: number): boolean {
    return this.connectionCount > 0 && runId === this.loadRunId && this.isTransportConnected()
  }

  private buildTree(rows: NotesQuickViewRow[]): NotesQuickViewTreeItem[] {
    const rootItems: NotesQuickViewTreeItem[] = []
    const directories = new Map<string, NotesQuickViewTreeDirectory>()

    for (const row of rows) {
      const parts = splitCatalogPath(row.path)
      const directoryParts = parts.slice(0, -1)
      let currentPath = '/'
      let children = rootItems

      directoryParts.forEach((directoryName, index) => {
        currentPath = buildChildPath(currentPath, directoryName)
        let directory = directories.get(currentPath)
        if (!directory) {
          directory = {
            type: 'directory',
            id: `dir:${currentPath}`,
            name: directoryName,
            path: currentPath,
            parentPath: getParentPath(currentPath),
            level: index + 1,
            noteCount: 0,
            expanded: true,
            children: [],
          }
          directories.set(currentPath, directory)
          children.push(directory)
        }
        children = directory.children
      })

      children.push({
        type: 'note',
        id: `note:${row.id}`,
        level: directoryParts.length + 1,
        row,
      })
    }

    this.sortAndCountTree(rootItems)
    return rootItems
  }

  private sortAndCountTree(items: NotesQuickViewTreeItem[]): number {
    items.sort(compareTreeItems)
    let count = 0
    for (const item of items) {
      if (item.type === 'note') {
        count += 1
        continue
      }

      item.noteCount = this.sortAndCountTree(item.children)
      count += item.noteCount
    }
    return count
  }

  private filterTree(
    items: NotesQuickViewTreeItem[],
    query: string,
    collapsedDirectoryPaths: ReadonlySet<string>,
  ): NotesQuickViewTreeItem[] {
    const visibleItems: NotesQuickViewTreeItem[] = []
    const forceExpanded = query.length > 0

    for (const item of items) {
      if (item.type === 'note') {
        if (rowMatchesQuery(item.row, query)) {
          visibleItems.push(item)
        }
        continue
      }

      const children = this.filterTree(item.children, query, collapsedDirectoryPaths)
      if (children.length === 0) {
        continue
      }

      const expanded = forceExpanded || !collapsedDirectoryPaths.has(item.path)
      visibleItems.push({
        ...item,
        expanded,
        children: expanded ? children : [],
      })
    }

    return visibleItems
  }

  private bumpCatalogRevision(): void {
    this.catalogRevision.set(this.catalogRevision() + 1)
  }
}

export const notesQuickViewModel = new NotesQuickViewModel()
