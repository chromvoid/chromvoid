import {describe, expect, it, vi} from 'vitest'

import {FileListModel} from '../../src/features/file-manager/models/file-list.model'
import type {FileMediaInspectionFlow} from '../../src/features/file-manager/media-inspection-flow.model'
import type {CatalogFolderState, CatalogNodeClient} from '../../src/core/catalog/local-catalog/types'
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

function createNode(id: number, name: string): CatalogNodeClient {
  return {
    nodeId: id,
    nodeType: 1,
    name,
    size: 1024,
    birthtime: 1710000000000,
    modtime: 1710000000000,
    isDir: false,
    isFile: true,
    isSymlink: false,
    path: `/big/${name}`,
    hasChildren: false,
    mimeType: 'image/jpeg',
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

  const ctx = {
    ws: {
      connected: createAtom(true),
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

  return {ctx, ensureFolderRangeLoaded}
}

describe('FileListModel lazy folder paging', () => {
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
        filter: {query: 'pic', include_hidden: true, file_types: ['images']},
      }),
      expect.stringContaining('"query":"pic"'),
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
})
