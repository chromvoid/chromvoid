import {action, atom, computed, wrap} from '@reatom/core'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {buildChildPath, parentPath as getParentPath} from 'root/app/navigation/navigation-snapshot'
import {compareDefaultCatalogNodes} from 'root/core/catalog/local-catalog/catalog-mirror'
import type {CatalogNotesListResponse} from 'root/core/catalog/local-catalog/types'
import type {AppContext} from 'root/shared/services/app-context'
import {tryGetAppContext} from 'root/shared/services/app-context'
import {subscribeCallbackAfterInitial, subscribeToSignalChanges} from 'root/shared/services/subscribed-signal'
import {normalizeCatalogNotesResponse, type CatalogMarkdownNote} from '../../services/catalog-notes'
import {formatDate, formatFileSize} from '../virtual-file-list/virtual-file-list.model-helpers'
import {formatNotesQuickViewSummary} from './notes-quick-view.presentation'

const NOTES_FILTER_CHIP_LIMIT = 6
const NOTES_FILTER_ALL_KEY = 'all'
const NOTES_SORT_MODES = ['name', 'recent', 'size'] as const

export type NotesQuickViewRow = CatalogMarkdownNote

export type NotesQuickViewMode = 'flat' | 'hierarchy'
export type NotesQuickViewFlatLayout = 'list' | 'grid'
export type NotesQuickViewDisplayMode = NotesQuickViewFlatLayout | 'tree'
export type NotesQuickViewSortMode = (typeof NOTES_SORT_MODES)[number]

export type NotesQuickViewFilterChip = {
  key: string
  label: string
  count: number
  active: boolean
}

export type NotesQuickViewRowView = {
  id: string
  row: NotesQuickViewRow
  title: string
  fileLabel: string
  previewTitle: string
  excerpt: string
  excerptDirection: 'auto' | 'ltr'
  parentLabel: string
  metadataParts: string[]
  compactMetadataParts: string[]
  previewTruncated: boolean
}

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
  label: string
}

export type NotesQuickViewErrorKey = 'notes:quick_view:error:load_failed'

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

type RemoteSessionGenerationSource = {
  remoteSessionGeneration?: {
    (): number | null
    subscribe?: (listener: (value: number | null) => void) => () => void
  }
}

export type NotesQuickViewModelDeps = {
  getContext?: () => AppContext | null
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function rowMatchesQuery(row: NotesQuickViewRow, query: string): boolean {
  if (!query) {
    return true
  }

  return [row.fileName, row.path, row.parentPath, row.heading, row.excerpt].some(
    (value) => typeof value === 'string' && normalizeSearchValue(value).includes(query),
  )
}

function compareRowsByName(left: NotesQuickViewRow, right: NotesQuickViewRow): number {
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

function compareNotesQuickViewRows(
  left: NotesQuickViewRow,
  right: NotesQuickViewRow,
  sortMode: NotesQuickViewSortMode,
): number {
  if (sortMode === 'recent') {
    const byDate = (right.lastModified ?? 0) - (left.lastModified ?? 0)
    return byDate || compareRowsByName(left, right)
  }

  if (sortMode === 'size') {
    const bySize = (right.size ?? 0) - (left.size ?? 0)
    return bySize || compareRowsByName(left, right)
  }

  return compareRowsByName(left, right)
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

function extensionlessNoteTitle(fileName: string): string {
  const title = fileName.replace(/\.(?:md|markdown)$/i, '').trim()
  return title || fileName
}

function topLevelDirectory(row: NotesQuickViewRow): {key: string; label: string} | null {
  const [first, second] = splitCatalogPath(row.path)
  if (!first || !second) {
    return null
  }

  return {
    key: `dir:/${first}`,
    label: first,
  }
}

function rowMatchesFilter(row: NotesQuickViewRow, filterKey: string): boolean {
  if (filterKey === NOTES_FILTER_ALL_KEY) {
    return true
  }

  return topLevelDirectory(row)?.key === filterKey
}

function createRowView(row: NotesQuickViewRow): NotesQuickViewRowView {
  const fileLabel = extensionlessNoteTitle(row.fileName)
  const title = fileLabel || row.heading || row.fileName
  const previewTitle = row.heading || title
  const parentLabel = row.parentPath || '/'
  const excerpt = row.excerpt || row.heading
  const metadataParts = [
    formatFileSize(row.size),
    row.previewWords !== undefined ? `${row.previewWords} words` : undefined,
    formatDate(row.lastModified),
  ].filter((part): part is string => Boolean(part))
  const compactMetadataParts = [
    row.size !== undefined ? formatFileSize(row.size) : undefined,
    row.lastModified !== undefined ? formatDate(row.lastModified) : undefined,
  ].filter((part): part is string => Boolean(part))

  return {
    id: row.id,
    row,
    title,
    fileLabel,
    previewTitle,
    excerpt: excerpt || parentLabel,
    excerptDirection: excerpt ? 'auto' : 'ltr',
    parentLabel,
    metadataParts,
    compactMetadataParts,
    previewTruncated: Boolean(row.previewTruncated),
  }
}
export class NotesQuickViewModel {
  readonly query = atom('', 'notes.quickView.query')
  readonly viewMode = atom<NotesQuickViewMode>('flat', 'notes.quickView.viewMode')
  readonly flatLayout = atom<NotesQuickViewFlatLayout>('list', 'notes.quickView.flatLayout')
  readonly sortMode = atom<NotesQuickViewSortMode>('name', 'notes.quickView.sortMode')
  readonly filterKey = atom(NOTES_FILTER_ALL_KEY, 'notes.quickView.filterKey')
  private readonly catalogRevision = atom(0, 'notes.quickView.catalogRevision')
  private readonly noteRows = atom<NotesQuickViewRow[]>([], 'notes.quickView.noteRows')
  private readonly isLoadingNotes = atom(false, 'notes.quickView.isLoadingNotes')
  readonly loadErrorKey = atom<NotesQuickViewErrorKey | null>(null, 'notes.quickView.loadErrorKey')
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
    const sortMode = this.sortMode()
    const rows = [...this.noteRows()].sort((left, right) => compareNotesQuickViewRows(left, right, sortMode))

    return {
      rows,
      tree: this.buildTree(rows),
    } satisfies NotesQuickViewProjection
  }, 'notes.quickView.projection')

  readonly rows = computed(() => this.projection().rows, 'notes.quickView.rows')

  private readonly filterGroups = computed(() => {
    const groups = new Map<string, {label: string; count: number}>()
    for (const row of this.rows()) {
      const directory = topLevelDirectory(row)
      if (!directory) {
        continue
      }

      const group = groups.get(directory.key)
      groups.set(directory.key, {
        label: directory.label,
        count: (group?.count ?? 0) + 1,
      })
    }

    return [...groups.entries()]
      .map(([key, value]) => ({key, ...value}))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
  }, 'notes.quickView.filterGroups')

  readonly activeFilterKey = computed(() => {
    const key = this.filterKey()
    if (key === NOTES_FILTER_ALL_KEY) {
      return NOTES_FILTER_ALL_KEY
    }

    return this.filterGroups().some((group) => group.key === key) ? key : NOTES_FILTER_ALL_KEY
  }, 'notes.quickView.activeFilterKey')

  readonly filterChips = computed(() => {
    const activeKey = this.activeFilterKey()
    const rows = this.rows()
    const directoryChips = this.filterGroups().slice(0, NOTES_FILTER_CHIP_LIMIT - 1)
    return [
      {
        key: NOTES_FILTER_ALL_KEY,
        label: 'All notes',
        count: rows.length,
        active: activeKey === NOTES_FILTER_ALL_KEY,
      },
      ...directoryChips.map((group) => ({
        key: group.key,
        label: group.label,
        count: group.count,
        active: activeKey === group.key,
      })),
    ] satisfies NotesQuickViewFilterChip[]
  }, 'notes.quickView.filterChips')

  readonly filteredRows = computed(() => {
    const filterKey = this.activeFilterKey()
    return this.rows().filter((row) => rowMatchesFilter(row, filterKey))
  }, 'notes.quickView.filteredRows')

  readonly visibleRows = computed(() => {
    const query = normalizeSearchValue(this.query())
    return this.filteredRows().filter((row) => rowMatchesQuery(row, query))
  }, 'notes.quickView.visibleRows')

  readonly visibleTree = computed(() => {
    const query = normalizeSearchValue(this.query())
    const collapsedDirectoryPaths = this.collapsedDirectoryPaths()
    return this.filterTree(this.buildTree(this.filteredRows()), query, collapsedDirectoryPaths)
  }, 'notes.quickView.visibleTree')

  readonly visibleRowViews = computed(
    () => this.visibleRows().map(createRowView),
    'notes.quickView.visibleRowViews',
  )

  readonly rowViewsById = computed(() => {
    const views = new Map<string, NotesQuickViewRowView>()
    for (const row of this.rows()) {
      views.set(row.id, createRowView(row))
    }
    return views
  }, 'notes.quickView.rowViewsById')

  readonly displayMode = computed<NotesQuickViewDisplayMode>(() => {
    if (this.viewMode() === 'hierarchy') {
      return 'tree'
    }

    return this.flatLayout()
  }, 'notes.quickView.displayMode')

  readonly summary = computed(() => {
    const rows = this.rows()
    const visibleRows = this.visibleRows()

    return formatNotesQuickViewSummary(rows.length, visibleRows.length)
  }, 'notes.quickView.summary')

  readonly hasActiveFilters = computed(
    () => this.query().trim().length > 0 || this.activeFilterKey() !== NOTES_FILTER_ALL_KEY,
    'notes.quickView.hasActiveFilters',
  )

  private readonly getContext: () => AppContext | null
  private unsubscribeCatalog?: () => void
  private unsubscribeTransport?: () => void
  private unsubscribeTransportSession?: () => void
  private connectionCount = 0
  private loadRunId = 0
  private loadActive = false
  private loadRequested = false
  private loadScheduled = false
  private hasLoadedNotesThisConnection = false
  private mobileScrollTop: number | null = null

  constructor(deps: NotesQuickViewModelDeps = {}) {
    this.getContext = deps.getContext ?? tryGetAppContext
  }

  connect(): void {
    this.connectionCount += 1
    if (this.connectionCount > 1) {
      return
    }

    this.hasLoadedNotesThisConnection = false
    const catalog = this.getCatalogSubscription()
    if (typeof catalog?.subscribe === 'function') {
      this.unsubscribeCatalog = subscribeCallbackAfterInitial(catalog.subscribe.bind(catalog), () => {
        this.invalidateNotesLoad()
        this.bumpCatalogRevision()
        this.scheduleNotesLoad()
      })
    }

    this.subscribeTransportConnection()
    this.subscribeTransportSessionGeneration()
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
    this.unsubscribeTransportSession?.()
    this.unsubscribeTransportSession = undefined
    this.loadRunId += 1
    this.loadRequested = false
    this.loadScheduled = false
    this.hasLoadedNotesThisConnection = false
    this.isLoadingNotes.set(false)
    this.loadErrorKey.set(null)
  }

  readonly setQuery = action((value: string) => {
    this.query.set(value)
  }, 'notes.quickView.setQuery')

  readonly setViewMode = action((value: NotesQuickViewMode) => {
    this.viewMode.set(value)
  }, 'notes.quickView.setViewMode')

  readonly setDisplayMode = action((value: NotesQuickViewDisplayMode) => {
    if (value === 'tree') {
      this.viewMode.set('hierarchy')
      return
    }

    this.viewMode.set('flat')
    this.flatLayout.set(value)
  }, 'notes.quickView.setDisplayMode')

  readonly setFlatLayout = action((value: NotesQuickViewFlatLayout) => {
    this.viewMode.set('flat')
    this.flatLayout.set(value)
  }, 'notes.quickView.setFlatLayout')

  readonly setSortMode = action((value: NotesQuickViewSortMode) => {
    this.sortMode.set(value)
  }, 'notes.quickView.setSortMode')

  readonly cycleSortMode = action(() => {
    const currentIndex = NOTES_SORT_MODES.indexOf(this.sortMode())
    const nextIndex = (currentIndex + 1) % NOTES_SORT_MODES.length
    this.sortMode.set(NOTES_SORT_MODES[nextIndex] ?? 'name')
  }, 'notes.quickView.cycleSortMode')

  readonly setFilterKey = action((value: string) => {
    this.filterKey.set(value || NOTES_FILTER_ALL_KEY)
  }, 'notes.quickView.setFilterKey')

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
    this.filterKey.set(NOTES_FILTER_ALL_KEY)
  }, 'notes.quickView.clearFilters')

  readonly retryLoad = action(() => {
    this.loadErrorKey.set(null)
    this.invalidateNotesLoad()
    this.scheduleNotesLoad()
  }, 'notes.quickView.retryLoad')

  readonly openNote = action((row: NotesQuickViewRow) => {
    const source = {
      path: row.path,
      parentPath: row.parentPath,
      fileName: row.fileName,
      ...(row.size !== undefined ? {size: row.size} : {}),
      ...(row.mimeType ? {mimeType: row.mimeType} : {}),
      ...(row.lastModified !== undefined ? {lastModified: row.lastModified} : {}),
      ...(row.sourceRevision !== undefined ? {sourceRevision: row.sourceRevision} : {}),
    }
    navigationModel.openMarkdownDocument(
      row.fileId,
      'push',
      this.viewMode() === 'hierarchy' ? {parentPath: row.parentPath, source} : {source},
    )
  }, 'notes.quickView.openNote')

  readonly openNoteById = action((rowId: string) => {
    const row = this.rows().find((item) => item.id === rowId)
    if (row) {
      this.openNote(row)
    }
  }, 'notes.quickView.openNoteById')

  saveMobileScrollPosition(scrollTop: number): void {
    this.mobileScrollTop = Number.isFinite(scrollTop) ? Math.max(0, Math.floor(scrollTop)) : 0
  }

  getMobileScrollPosition(): number | null {
    return this.mobileScrollTop
  }

  clearMobileScrollPosition(): void {
    this.mobileScrollTop = null
  }

  readonly state = {
    query: this.query,
    viewMode: this.viewMode,
    flatLayout: this.flatLayout,
    sortMode: this.sortMode,
    filterKey: this.filterKey,
    activeFilterKey: this.activeFilterKey,
    filterChips: this.filterChips,
    filteredRows: this.filteredRows,
    rows: this.rows,
    visibleRows: this.visibleRows,
    visibleRowViews: this.visibleRowViews,
    rowViewsById: this.rowViewsById,
    visibleTree: this.visibleTree,
    displayMode: this.displayMode,
    summary: this.summary,
    hasCatalog: this.hasCatalog,
    isLoading: this.isLoading,
    loadErrorKey: this.loadErrorKey,
    hasActiveFilters: this.hasActiveFilters,
  }

  readonly actions = {
    setQuery: this.setQuery,
    setViewMode: this.setViewMode,
    setDisplayMode: this.setDisplayMode,
    setFlatLayout: this.setFlatLayout,
    setSortMode: this.setSortMode,
    cycleSortMode: this.cycleSortMode,
    setFilterKey: this.setFilterKey,
    toggleDirectory: this.toggleDirectory,
    expandAllDirectories: this.expandAllDirectories,
    clearFilters: this.clearFilters,
    retryLoad: this.retryLoad,
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

  private subscribeTransportSessionGeneration(): void {
    const generation = (this.getContext()?.store as RemoteSessionGenerationSource | undefined)
      ?.remoteSessionGeneration
    if (typeof generation?.subscribe !== 'function') {
      return
    }

    this.unsubscribeTransportSession = subscribeToSignalChanges(
      generation,
      (nextGeneration, previousGeneration) => {
        if (nextGeneration === previousGeneration) {
          return
        }
        this.invalidateNotesLoad()
        this.scheduleNotesLoad()
      },
      {
        readSnapshot: () => generation(),
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
      this.loadErrorKey.set(null)
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

      this.noteRows.set(normalizeCatalogNotesResponse(response))
      this.hasLoadedNotesThisConnection = true
      this.loadErrorKey.set(null)
    } catch {
      if (this.isLoadCurrent(runId)) {
        if (!this.hasLoadedNotesThisConnection) {
          this.noteRows.set([])
        }
        this.loadErrorKey.set('notes:quick_view:error:load_failed')
      }
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
