import {describe, expect, it, vi} from 'vitest'

import {CatalogMirror} from '../../src/core/catalog/local-catalog/catalog-mirror'
import {FileListModel} from '../../src/features/file-manager/models/file-list.model'
import {fileThumbnailStore} from '../../src/features/file-manager/models/file-thumbnail-cache.model'
import type {FileMediaInspectionFlow} from '../../src/features/file-manager/media-inspection-flow.model'
import type {
  CatalogFolderPageRequest,
  CatalogFolderState,
  CatalogNodeClient,
  CatalogSyncManifestResponse,
} from '../../src/core/catalog/local-catalog/types'
import type {Atom} from '../../src/core/transport/transport'
import type {AppContext} from '../../src/shared/services/app-context'
import type {SearchFilters} from '../../src/shared/contracts/file-manager'

function createAtom<T>(initial: T): Atom<T> {
  let value = initial
  const listeners = new Set<(next: T) => void>()
  const signal = (() => value) as unknown as Atom<T>

  signal.set = (next: T) => {
    value = next
    for (const listener of listeners) listener(next)
  }

  signal.subscribe = (listener: (next: T) => void) => {
    listeners.add(listener)
    listener(value)
    return () => listeners.delete(listener)
  }

  return signal
}

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
}

function createNode(
  id: number,
  name: string,
  options: {isDir?: boolean; mimeType?: string} = {},
): CatalogNodeClient {
  const isDir = options.isDir ?? false
  return {
    nodeId: id,
    nodeType: isDir ? 0 : 1,
    name,
    size: isDir ? 0 : 1024,
    birthtime: 1710000000000,
    modtime: 1710000000000,
    isDir,
    isFile: !isDir,
    isSymlink: false,
    path: `/big/${name}`,
    hasChildren: isDir,
    mimeType: options.mimeType ?? 'image/jpeg',
    sourceRevision: id,
    mediaInspectedRevision: 0,
    mediaInfo: null,
  }
}

function createContext(options?: {
  filters?: SearchFilters
  selectedNodeIds?: number[]
  folderState?: CatalogFolderState
  folderItems?: Array<CatalogNodeClient | null>
  ensureFolderRangeLoaded?: ReturnType<typeof vi.fn>
  catalogSubscribeInitial?: boolean
}) {
  const folderState =
    options?.folderState ??
    ({
      path: '/big',
      version: 7,
      totalCount: 10_000,
      queryKey: 'default',
      loadedRanges: [{offset: 0, limit: 200}],
      loadingRanges: [],
      error: null,
    } satisfies CatalogFolderState)
  const folderItems =
    options?.folderItems ??
    Array.from({length: 10_000}, (_, index) =>
      index === 5 ? createNode(5, 'visible.jpg') : index === 250 ? createNode(250, 'outside.jpg') : null,
    )
  const ensureFolderRangeLoaded = options?.ensureFolderRangeLoaded ?? vi.fn().mockResolvedValue(undefined)
  const catalogListeners = new Set<() => void>()
  const searchFilters = createAtom<SearchFilters>(options?.filters ?? DEFAULT_FILTERS)
  const connected = createAtom(true)

  const ctx = {
    ws: {
      connected,
      connecting: createAtom(false),
      lastError: createAtom<string | undefined>(undefined),
    },
    store: {
      currentPath: createAtom('/big'),
      setCurrentPath: vi.fn(),
      searchFilters,
      selectedNodeIds: createAtom<number[]>(options?.selectedNodeIds ?? []),
      pushNotification: vi.fn(),
    },
    catalog: {
      catalog: {
        getChildren: vi.fn().mockReturnValue(folderItems.filter(Boolean)),
        getFolderState: vi.fn().mockReturnValue(folderState),
        getFolderItems: vi.fn().mockReturnValue(folderItems),
        subscribe: vi.fn((listener: () => void) => {
          catalogListeners.add(listener)
          if (options?.catalogSubscribeInitial) {
            listener()
          }
          return () => catalogListeners.delete(listener)
        }),
      },
      getEntryMeta: vi.fn(),
      ensureEntryMeta: vi.fn(),
      ensureFolderRangeLoaded,
    },
    state: {
      data: createAtom({}),
    },
  } as unknown as AppContext

  return {ctx, connected, ensureFolderRangeLoaded}
}

function lazyFolderManifest(): CatalogSyncManifestResponse {
  return {
    root_version: 1,
    format: 'manifest',
    manifest_budget_bytes: 128 * 1024,
    shards: [
      {
        shard_id: 'attachments',
        version: 1,
        size: 0,
        node_count: 1,
        strategy: 'lazy',
        has_deltas: false,
        loaded: false,
      },
    ],
    root_summaries: [
      {
        i: 11,
        t: 0,
        n: 'attachments',
        s: 0,
        z: 0,
        b: 1,
        m: 1,
        h: true,
      },
    ],
    eager_data: {},
  }
}

describe('FileListModel lazy folder paging', () => {
  it('prewarms only the current visible projection window', async () => {
    const folderItems = Array.from({length: 60}, (_, index) =>
      createNode(index + 1, `image-${String(index).padStart(2, '0')}.jpg`),
    )
    const {ctx} = createContext({
      folderItems,
      folderState: {
        path: '/big',
        version: 7,
        totalCount: folderItems.length,
        queryKey: 'default',
        loadedRanges: [{offset: 0, limit: folderItems.length}],
        loadingRanges: [],
        error: null,
      },
    })
    const mediaInspection = {
      shouldQueueVisible: vi.fn(() => false),
      queueVisible: vi.fn(),
      cancelPending: vi.fn(),
    } as unknown as FileMediaInspectionFlow
    const preload = vi.spyOn(fileThumbnailStore, 'preload').mockResolvedValue(undefined)
    const model = new FileListModel(ctx, mediaInspection)

    await model.prewarmVisibleThumbnails()

    const initialItems = [...(preload.mock.calls[0]?.[0] ?? [])]
    expect(initialItems).toHaveLength(40)
    expect(initialItems[0]?.name).toBe('image-00.jpg')
    expect(initialItems.at(-1)?.name).toBe('image-39.jpg')

    await model.ensureVisibleRangeLoaded({startIndex: 40, endIndex: 50})
    await model.prewarmVisibleThumbnails()

    const nextItems = [...(preload.mock.calls[1]?.[0] ?? [])]
    expect(nextItems.map((item) => item.name)).toEqual(
      folderItems.slice(40, 50).map((item) => item.name),
    )
    preload.mockRestore()
  })

  it('exposes 10,000 render slots without creating real file items for unloaded children', () => {
    const {ctx} = createContext()
    const mediaInspection = {
      shouldQueueVisible: vi.fn(() => true),
      queueVisible: vi.fn(),
      cancelPending: vi.fn(),
    } as unknown as FileMediaInspectionFlow
    const model = new FileListModel(ctx, mediaInspection)

    const renderItems = model.renderItems()

    expect(renderItems).toHaveLength(10_000)
    expect(renderItems.filter(Boolean)).toHaveLength(2)
    expect(model.filteredCount()).toBe(10_000)
    expect(model.totalCount()).toBe(10_000)
    expect(model.visibleCount()).toBe(10_000)
    expect(model.folderTotalCount()).toBe(10_000)
    expect(model.displayTotalCount()).toBe(10_000)
  })

  it('keeps visible and folder counts honest while a filtered page state is catching up', () => {
    const filteredState = {
      path: '/big',
      version: 8,
      totalCount: 0,
      queryKey: 'filtered',
      loadedRanges: [],
      loadingRanges: [{offset: 0, limit: 200}],
      error: null,
    } satisfies CatalogFolderState
    const defaultState = {
      ...filteredState,
      version: 7,
      totalCount: 2,
      queryKey: 'default',
      loadingRanges: [],
    } satisfies CatalogFolderState
    const visible = createNode(5, 'visible.jpg')
    const {ctx} = createContext({
      filters: {...DEFAULT_FILTERS, fileTypes: ['images']},
      folderItems: [visible],
      folderState: filteredState,
    })
    const getFolderState = vi
      .mocked(ctx.catalog.catalog.getFolderState!)
      .mockImplementation((_path, queryKey) => (queryKey === 'default' ? defaultState : filteredState))
    const mediaInspection = {
      shouldQueueVisible: vi.fn(() => false),
      queueVisible: vi.fn(),
      cancelPending: vi.fn(),
    } as unknown as FileMediaInspectionFlow
    const model = new FileListModel(ctx, mediaInspection)

    expect(model.renderItems().filter(Boolean)).toHaveLength(1)
    expect(model.filteredCount()).toBe(0)
    expect(model.visibleCount()).toBe(1)
    expect(model.folderTotalCount()).toBe(2)
    expect(model.displayTotalCount()).toBe(2)
    expect(getFolderState).toHaveBeenCalledWith('/big', 'default')
  })

  it('resolves active recursive search results by id for open flows', () => {
    const nestedResult = createNode(42, 'PLAN.md', {mimeType: 'text/markdown'})
    ;(nestedResult as {path: string}).path = '/big/nested/PLAN.md'
    const recursiveState = {
      path: '/big',
      version: 7,
      totalCount: 10,
      queryKey: '{"searchMode":"recursive-content","query":"launch"}',
      loadedRanges: [{offset: 0, limit: 10}],
      loadingRanges: [],
      error: null,
    } satisfies CatalogFolderState
    const defaultState = {...recursiveState, totalCount: 2, queryKey: 'default'} satisfies CatalogFolderState
    const {ctx} = createContext({
      filters: {
        ...DEFAULT_FILTERS,
        query: 'launch',
      },
      folderState: recursiveState,
      folderItems: [nestedResult],
    })
    ;(ctx.catalog.catalog as {getChildren: ReturnType<typeof vi.fn>}).getChildren.mockReturnValue([])
    vi.mocked(ctx.catalog.catalog.getFolderState!).mockImplementation((_path, queryKey) =>
      queryKey === 'default' ? defaultState : recursiveState,
    )
    const mediaInspection = {
      shouldQueueVisible: vi.fn(() => true),
      queueVisible: vi.fn(),
      cancelPending: vi.fn(),
    } as unknown as FileMediaInspectionFlow
    const model = new FileListModel(ctx, mediaInspection)

    expect(model.getFileItemById(42)).toEqual(
      expect.objectContaining({
        id: 42,
        path: '/big/nested/PLAN.md',
      }),
    )
    expect(model.visibleCount()).toBe(10)
    expect(model.folderTotalCount()).toBe(2)
    expect(model.displayTotalCount()).toBe(10)
  })

  it('requests the visible page from the catalog service with current sort and filters', async () => {
    const ensureFolderRangeLoaded = vi.fn().mockResolvedValue(undefined)
    const {ctx} = createContext({
      ensureFolderRangeLoaded,
      filters: {
        ...DEFAULT_FILTERS,
        query: 'pic',
        sortBy: 'size',
        sortDirection: 'desc',
        showHidden: true,
        fileTypes: ['images'],
      },
    })
    const mediaInspection = {
      shouldQueueVisible: vi.fn(() => true),
      queueVisible: vi.fn(),
      cancelPending: vi.fn(),
    } as unknown as FileMediaInspectionFlow
    const model = new FileListModel(ctx, mediaInspection)

    await model.ensureVisibleRangeLoaded({startIndex: 450, endIndex: 470})

    expect(ensureFolderRangeLoaded).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/big',
        offset: 400,
        limit: 200,
        expected_version: 7,
        sort: {by: 'size', direction: 'desc'},
        filter: {
          query: 'pic',
          include_hidden: true,
          file_types: ['images'],
          recursive: true,
          include_text_content: true,
        },
      }),
      expect.stringContaining('"searchMode":"recursive-content"'),
    )
  })

  it('passes the Markdown quick filter through lazy folder requests recursively', async () => {
    const ensureFolderRangeLoaded = vi.fn().mockResolvedValue(undefined)
    const {ctx} = createContext({
      ensureFolderRangeLoaded,
      filters: {
        ...DEFAULT_FILTERS,
        fileTypes: ['markdown'],
      },
    })
    const mediaInspection = {
      shouldQueueVisible: vi.fn(() => true),
      queueVisible: vi.fn(),
      cancelPending: vi.fn(),
    } as unknown as FileMediaInspectionFlow
    const model = new FileListModel(ctx, mediaInspection)

    await model.ensureVisibleRangeLoaded({startIndex: 0, endIndex: 20})

    expect(ensureFolderRangeLoaded).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {query: null, include_hidden: false, file_types: ['markdown'], recursive: true},
      }),
      expect.stringContaining('"searchMode":"recursive-file-types"'),
    )
  })

  it('passes multiple quick filters through lazy folder requests as a recursive OR set', async () => {
    const ensureFolderRangeLoaded = vi.fn().mockResolvedValue(undefined)
    const {ctx} = createContext({
      ensureFolderRangeLoaded,
      filters: {
        ...DEFAULT_FILTERS,
        fileTypes: ['markdown', 'images'],
      },
    })
    const mediaInspection = {
      shouldQueueVisible: vi.fn(() => true),
      queueVisible: vi.fn(),
      cancelPending: vi.fn(),
    } as unknown as FileMediaInspectionFlow
    const model = new FileListModel(ctx, mediaInspection)

    await model.ensureVisibleRangeLoaded({startIndex: 0, endIndex: 20})

    expect(ensureFolderRangeLoaded).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          query: null,
          include_hidden: false,
          file_types: ['markdown', 'images'],
          recursive: true,
        },
      }),
      expect.stringContaining('"searchMode":"recursive-file-types"'),
    )
  })

  it('queues media inspection only for loaded real items in the visible range', () => {
    const {ctx} = createContext()
    const queueVisible = vi.fn()
    const mediaInspection = {
      shouldQueueVisible: vi.fn(() => true),
      queueVisible,
      cancelPending: vi.fn(),
    } as unknown as FileMediaInspectionFlow
    const model = new FileListModel(ctx, mediaInspection)

    model.connect()

    expect(queueVisible).toHaveBeenCalledWith([
      expect.objectContaining({id: 5, name: 'visible.jpg'}),
    ])
    expect(queueVisible).not.toHaveBeenCalledWith([
      expect.objectContaining({id: 250, name: 'outside.jpg'}),
    ])
    model.cleanup()
  })

  it('suppresses synchronous catalog subscribe callback after explicit initial lazy load', () => {
    const ensureFolderRangeLoaded = vi.fn().mockResolvedValue(undefined)
    const {ctx} = createContext({
      ensureFolderRangeLoaded,
      catalogSubscribeInitial: true,
    })
    const mediaInspection = {
      shouldQueueVisible: vi.fn(() => true),
      queueVisible: vi.fn(),
      cancelPending: vi.fn(),
    } as unknown as FileMediaInspectionFlow
    const model = new FileListModel(ctx, mediaInspection)

    model.connect()

    expect(ensureFolderRangeLoaded).toHaveBeenCalledTimes(2)
    model.cleanup()
  })

  it('reloads the currently opened lazy folder after a transport reconnect', async () => {
    const ensureFolderRangeLoaded = vi.fn().mockResolvedValue(undefined)
    const {ctx, connected} = createContext({
      ensureFolderRangeLoaded,
      folderItems: [createNode(5, 'visible-after-reconnect.jpg')],
      folderState: {
        path: '/big',
        version: 11,
        totalCount: 1,
        queryKey: 'default',
        loadedRanges: [{offset: 0, limit: 200}],
        loadingRanges: [],
        error: null,
      },
    })
    const mediaInspection = {
      shouldQueueVisible: vi.fn(() => true),
      queueVisible: vi.fn(),
      cancelPending: vi.fn(),
    } as unknown as FileMediaInspectionFlow
    const model = new FileListModel(ctx, mediaInspection)

    model.connect()
    expect(model.fileItems().map((item) => item.name)).toEqual(['visible-after-reconnect.jpg'])
    ensureFolderRangeLoaded.mockClear()

    connected.set(false)
    connected.set(true)
    await Promise.resolve()

    expect(ensureFolderRangeLoaded).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/big',
        offset: 0,
        limit: 200,
        expected_version: 11,
      }),
      'default',
    )
    expect(model.fileItems().map((item) => item.name)).toEqual(['visible-after-reconnect.jpg'])
    model.cleanup()
  })

  it('renders the first lazy folder page after entering a directory once', async () => {
    const mirror = new CatalogMirror()
    mirror.applyManifest(lazyFolderManifest())
    const currentPath = createAtom('/')
    let pendingLoad: Promise<void> | null = null
    const ensureFolderRangeLoaded = vi.fn((request: CatalogFolderPageRequest, queryKey?: string) => {
      if (request.path !== '/attachments') {
        return Promise.resolve()
      }
      if (pendingLoad) return pendingLoad

      mirror.setFolderRangeLoading(request.path, request.offset, request.limit ?? 200, true, queryKey)
      pendingLoad = Promise.resolve().then(() => {
        mirror.applyFolderPage(
          {
            current_path: '/attachments',
            version: 2,
            total_count: 1,
            offset: 0,
            limit: 1,
            next_offset: null,
            reload_required: false,
            filter_counts: {all: 1, markdown: 0, images: 1},
            items: [
              {
                node_id: 42,
                name: 'first-open.jpg',
                is_dir: false,
                size: 4096,
                mime_type: 'image/jpeg',
                media_info: null,
                media_inspected_revision: 0,
                created_at: 1,
                updated_at: 2,
              },
            ],
          },
          queryKey,
        )
      })
      return pendingLoad
    })
    const ctx = {
      ws: {
        connected: createAtom(true),
        connecting: createAtom(false),
        lastError: createAtom<string | undefined>(undefined),
      },
      store: {
        currentPath,
        setCurrentPath: (path: string) => currentPath.set(path),
        searchFilters: createAtom<SearchFilters>(DEFAULT_FILTERS),
        selectedNodeIds: createAtom<number[]>([]),
        pushNotification: vi.fn(),
      },
      catalog: {
        catalog: mirror,
        getEntryMeta: vi.fn(),
        ensureEntryMeta: vi.fn(),
        ensureFolderRangeLoaded,
      },
      state: {
        data: createAtom({}),
      },
    } as unknown as AppContext
    const mediaInspection = {
      shouldQueueVisible: vi.fn(() => true),
      queueVisible: vi.fn(),
      cancelPending: vi.fn(),
    } as unknown as FileMediaInspectionFlow
    const model = new FileListModel(ctx, mediaInspection)

    model.connect()
    currentPath.set('/attachments/')
    await model.ensureVisibleRangeLoaded({startIndex: 0, endIndex: 20})
    await Promise.resolve()

    expect(ensureFolderRangeLoaded).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/attachments',
        offset: 0,
        limit: 200,
      }),
      'default',
    )
    const attachmentRequests = ensureFolderRangeLoaded.mock.calls
      .map(([request]) => request)
      .filter((request) => request.path === '/attachments')
    expect(attachmentRequests.some((request) => request.expected_version === 0)).toBe(false)
    expect(model.renderItems().filter(Boolean).map((item) => item?.name)).toEqual(['first-open.jpg'])
    expect(model.fileItems().map((item) => item.name)).toEqual(['first-open.jpg'])
    model.cleanup()
  })
})
