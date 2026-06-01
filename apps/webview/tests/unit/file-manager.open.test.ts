import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {CatalogEventType, type CatalogEvent} from '../../src/core/catalog/local-catalog/types'
import type {Atom} from '../../src/core/transport/transport'
import {FileManagerModel} from '../../src/features/file-manager/file-manager.model'
import {OPEN_EXTERNAL_HUD_DELAY_MS} from '../../src/features/file-manager/download-flow.model'
import type {FileItemData, SearchFilters} from '../../src/shared/contracts/file-manager'
import {subscribeFileCommand, type FileCommand} from '../../src/shared/services/file-command-service'
import type {AppContext} from '../../src/shared/services/app-context'
import {dialogService} from '../../src/shared/services/dialog-service'
import * as gallerySaveService from '../../src/shared/services/save-image-to-gallery'
import * as shareService from '../../src/shared/services/share'
import * as toastManager from '../../src/shared/services/toast-manager'

function createAtom<T>(initial: T): Atom<T> {
  let value = initial
  const listeners = new Set<(next: T) => void>()
  const signal = (() => value) as unknown as Atom<T>

  signal.set = (next: T) => {
    value = next
    for (const listener of listeners) {
      listener(next)
    }
  }

  signal.subscribe = (listener: (next: T) => void) => {
    listeners.add(listener)
    listener(value)
    return () => listeners.delete(listener)
  }

  return signal
}

function createContext(options?: {
  children?: Array<Record<string, unknown>>
  selectedNodeIds?: number[]
  selectionMode?: boolean
  searchFilters?: SearchFilters
  openExternalImpl?: (
    nodeId: number,
    opts?: {openId?: string; onProgress?: (writtenBytes: number, total: number) => void},
  ) => Promise<{path: string}>
  downloadImpl?: (nodeId: number) => Promise<AsyncIterable<Uint8Array>>
  uploadImpl?: (
    target: number | {parentPath?: string; name: string},
    totalSize: number,
    source: AsyncIterable<Uint8Array>,
    meta?: {name?: string; type?: string; chunkSize?: number},
  ) => Promise<{nodeId: number}>
  inspectMediaInfoImpl?: (nodeId: number) => Promise<{
    nodeId: number
    mediaInfo: FileItemData['mediaInfo']
    sourceRevision: number | null
    mediaInspectedRevision: number | null
  }>
}) {
  const currentPath = createAtom('/')
  const setCurrentPath = vi.fn()
  let openTaskCounter = 0
  let downloadTaskCounter = 0
  const children = options?.children ?? []
  const searchFilters = createAtom<SearchFilters>(
    options?.searchFilters ?? {
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    },
  )
  const openExternal = vi.fn(options?.openExternalImpl ?? (() => Promise.resolve({path: '/tmp/report.pdf'})))
  const downloadFile = vi.fn(
    options?.downloadImpl ??
      (() =>
        Promise.resolve({
          async *[Symbol.asyncIterator]() {},
        })),
  )
  const createOpenExternalTask = vi.fn((name: string, total: number) => {
    openTaskCounter += 1
    return {id: `open-task-${openTaskCounter}`, task: {name, total}}
  })
  const createDownloadTask = vi.fn((name: string, total: number) => {
    downloadTaskCounter += 1
    return {id: `download-task-${downloadTaskCounter}`, task: {name, total}}
  })
  const updateUploadTask = vi.fn()
  const renameFile = vi.fn().mockResolvedValue(undefined)
  const uploadFile = vi.fn(options?.uploadImpl ?? (() => Promise.resolve({nodeId: 77})))
  const inspectMediaInfo = vi.fn(
    options?.inspectMediaInfoImpl ??
      ((nodeId: number) =>
        Promise.resolve({nodeId, mediaInfo: null, sourceRevision: null, mediaInspectedRevision: null})),
  )
  const refreshCatalog = vi.fn().mockResolvedValue(undefined)
  const pushNotification = vi.fn()
  const catalogListeners = new Set<() => void>()
  const applyCatalogEvent = vi.fn((event: CatalogEvent) => {
    if (event.type === CatalogEventType.NODE_RENAMED) {
      const child = children.find((node) => node.nodeId === event.nodeId)
      const newName = String(event.metadata?.newName ?? '')
      if (child && newName) {
        const path = typeof child.path === 'string' ? child.path : '/'
        const slash = path.lastIndexOf('/')
        const parentPath = slash <= 0 ? '/' : path.slice(0, slash + 1)
        child.name = newName
        child.path = `${parentPath}${newName}`
      }
    } else if (event.type === CatalogEventType.NODE_UPDATED) {
      const child = children.find((node) => node.nodeId === event.nodeId)
      if (child) {
        Object.assign(child, event.metadata)
      }
    }

    for (const listener of catalogListeners) {
      listener()
    }
  })
  const subscribeCatalog = vi.fn((listener: () => void) => {
    catalogListeners.add(listener)
    return () => catalogListeners.delete(listener)
  })
  const ctx = {
    ws: {
      kind: 'tauri',
      connected: createAtom(true),
      connecting: createAtom(false),
      lastError: createAtom<string | undefined>(undefined),
      openExternal,
    },
    store: {
      currentPath,
      setCurrentPath,
      searchFilters,
      setSearchFilters(next: SearchFilters) {
        searchFilters.set(next)
      },
      selectedNodeIds: createAtom<number[]>(options?.selectedNodeIds ?? []),
      selectionMode: createAtom(Boolean(options?.selectionMode)),
      setSelectionMode(enabled: boolean) {
        ctx.store.selectionMode.set(enabled)
        if (!enabled) {
          ctx.store.selectedNodeIds.set([])
        }
      },
      createOpenExternalTask,
      createDownloadTask,
      updateUploadTask,
      pushNotification,
    },
    catalog: {
      catalog: {
        getChildren: vi.fn().mockReturnValue(children),
        applyEvent: applyCatalogEvent,
        subscribe: subscribeCatalog,
      },
      refresh: refreshCatalog,
      api: {
        download: downloadFile,
        rename: renameFile,
        upload: uploadFile,
        inspectMediaInfo,
      },
      getEntryMeta: vi.fn(),
      ensureEntryMeta: vi.fn(),
    },
    state: {
      data: createAtom({}),
    },
  } as unknown as AppContext

  return {
    ctx,
    setCurrentPath,
    openExternal,
    downloadFile,
    createOpenExternalTask,
    createDownloadTask,
    updateUploadTask,
    renameFile,
    uploadFile,
    inspectMediaInfo,
    refreshCatalog,
    pushNotification,
    applyCatalogEvent,
  }
}

async function captureFileCommands(run: () => Promise<void>): Promise<FileCommand[]> {
  const commands: FileCommand[] = []
  const unsubscribe = subscribeFileCommand((command) => {
    commands.push(command)
  })

  try {
    await run()
    return commands
  } finally {
    unsubscribe()
  }
}

describe('FileManagerModel open dispatcher', () => {
  beforeEach(() => {
    vi.spyOn(toastManager.toast, 'loading').mockReturnValue(vi.fn())
    vi.spyOn(toastManager.toast, 'success').mockReturnValue('toast-success')
    vi.spyOn(toastManager.toast, 'error').mockReturnValue('toast-error')
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
    resetRuntimeCapabilities()
    vi.restoreAllMocks()
  })

  it('opens folders via navigation', async () => {
    const {ctx, setCurrentPath} = createContext()
    const model = new FileManagerModel(ctx)

    await model.handleOpen({
      id: 1,
      path: '/Docs',
      name: 'Docs',
      isDir: true,
    })

    expect(setCurrentPath).toHaveBeenCalledWith('/Docs/')
  })

  it.each([
    [{name: 'photo.png', mimeType: 'image/png'}, {kind: 'gallery', fileId: 7}],
    [{name: 'video.mp4', mimeType: 'video/mp4'}, {kind: 'video', fileId: 7, fileName: 'video.mp4'}],
    [{name: 'track.mp3', mimeType: 'audio/mpeg'}, {kind: 'audio', fileId: 7, fileName: 'track.mp3'}],
    [{name: 'readme.md', mimeType: 'text/markdown'}, {kind: 'document', mode: 'markdown', fileId: 7}],
    [{name: 'scan.heic', mimeType: 'image/heic'}, {kind: 'gallery', fileId: 7}],
  ])('dispatches %s through %o', async (partialItem, expectedCommand) => {
    const {ctx} = createContext()
    const model = new FileManagerModel(ctx)

    const commands = await captureFileCommands(async () => {
      await model.handleOpen({
        id: 7,
        path: `/${partialItem.name}`,
        isDir: false,
        ...partialItem,
      } as FileItemData)
    })

    expect(commands).toEqual([expectedCommand])
  })

  it('inspects ISO-BMFF media before opening and routes audio-only MP4 to audio', async () => {
    const mediaInfo = {
      kind: 'audio' as const,
      audioTracks: 1,
      videoTracks: 0,
      playbackMimeType: 'audio/mp4',
    }
    const {ctx, inspectMediaInfo} = createContext({
      children: [
        {
          nodeId: 7,
          id: 7,
          path: '/podcast.mp4',
          name: 'podcast.mp4',
          isDir: false,
          mimeType: 'video/mp4',
          sourceRevision: 41,
        },
      ],
      inspectMediaInfoImpl: (nodeId) =>
        Promise.resolve({
          nodeId,
          mediaInfo,
          sourceRevision: 41,
          mediaInspectedRevision: 41,
        }),
    })
    const model = new FileManagerModel(ctx)

    const commands = await captureFileCommands(async () => {
      await model.handleOpen({
        id: 7,
        path: '/podcast.mp4',
        name: 'podcast.mp4',
        isDir: false,
        mimeType: 'video/mp4',
        sourceRevision: 41,
      })
    })

    expect(inspectMediaInfo).toHaveBeenCalledWith(7)
    expect(commands).toEqual([{kind: 'audio', fileId: 7, fileName: 'podcast.mp4'}])
  })

  it('keeps Android on-demand ISO-BMFF inspection while visible inspection is optimized out', async () => {
    setRuntimeCapabilities({platform: 'android', mobile: true})
    const mediaInfo = {
      kind: 'audio' as const,
      audioTracks: 1,
      videoTracks: 0,
      playbackMimeType: 'audio/mp4',
    }
    const {ctx, inspectMediaInfo} = createContext({
      children: [
        {
          nodeId: 7,
          id: 7,
          path: '/podcast.mp4',
          name: 'podcast.mp4',
          isDir: false,
          mimeType: 'video/mp4',
          sourceRevision: 41,
        },
      ],
      inspectMediaInfoImpl: (nodeId) =>
        Promise.resolve({
          nodeId,
          mediaInfo,
          sourceRevision: 41,
          mediaInspectedRevision: 41,
        }),
    })
    const model = new FileManagerModel(ctx)

    const commands = await captureFileCommands(async () => {
      await model.handleOpen({
        id: 7,
        path: '/podcast.mp4',
        name: 'podcast.mp4',
        isDir: false,
        mimeType: 'video/mp4',
        sourceRevision: 41,
      })
    })

    expect(inspectMediaInfo).toHaveBeenCalledWith(7)
    expect(commands).toEqual([{kind: 'audio', fileId: 7, fileName: 'podcast.mp4'}])
  })

  it('dedupes completed media inspection misses by source revision', async () => {
    let revision = 41
    const {ctx, inspectMediaInfo, applyCatalogEvent} = createContext({
      children: [
        {
          nodeId: 7,
          id: 7,
          path: '/unknown.mp4',
          name: 'unknown.mp4',
          isDir: false,
          mimeType: 'video/mp4',
          sourceRevision: revision,
        },
      ],
      inspectMediaInfoImpl: (nodeId) =>
        Promise.resolve({
          nodeId,
          mediaInfo: null,
          sourceRevision: revision,
          mediaInspectedRevision: revision,
        }),
    })
    const model = new FileManagerModel(ctx)
    model.connect()

    try {
      model.fileItems()
      await vi.waitFor(() => {
        expect(inspectMediaInfo).toHaveBeenCalledTimes(1)
      })

      model.fileItems()
      await Promise.resolve()
      await Promise.resolve()
      expect(inspectMediaInfo).toHaveBeenCalledTimes(1)

      revision = 42
      applyCatalogEvent({
        type: CatalogEventType.NODE_UPDATED,
        nodeId: 7,
        timestamp: Date.now(),
        version: 0,
        metadata: {sourceRevision: revision},
      })
      model.fileItems()

      await vi.waitFor(() => {
        expect(inspectMediaInfo).toHaveBeenCalledTimes(2)
      })
    } finally {
      model.cleanup()
    }
  })

  it('does not start visible media inspections from a plain fileItems read', async () => {
    const {ctx, inspectMediaInfo} = createContext({
      children: [
        {
          nodeId: 7,
          id: 7,
          path: '/unknown.mp4',
          name: 'unknown.mp4',
          isDir: false,
          mimeType: 'video/mp4',
          sourceRevision: 41,
        },
      ],
    })
    const model = new FileManagerModel(ctx)

    expect(model.fileItems()).toHaveLength(1)
    await Promise.resolve()
    expect(inspectMediaInfo).not.toHaveBeenCalled()
  })

  it('dedupes in-flight visible media inspections for the same source revision', async () => {
    let resolveInspection:
      | ((value: {
          nodeId: number
          mediaInfo: null
          sourceRevision: number
          mediaInspectedRevision: number
        }) => void)
      | undefined
    const {ctx, inspectMediaInfo} = createContext({
      children: [
        {
          nodeId: 7,
          id: 7,
          path: '/unknown.mp4',
          name: 'unknown.mp4',
          isDir: false,
          mimeType: 'video/mp4',
          sourceRevision: 41,
        },
      ],
      inspectMediaInfoImpl: (nodeId) =>
        new Promise((resolve) => {
          resolveInspection = resolve
        }).then(() => ({
          nodeId,
          mediaInfo: null,
          sourceRevision: 41,
          mediaInspectedRevision: 41,
        })),
    })
    const model = new FileManagerModel(ctx)
    model.connect()

    try {
      model.fileItems()
      model.fileItems()

      expect(inspectMediaInfo).toHaveBeenCalledTimes(1)
      resolveInspection?.({nodeId: 7, mediaInfo: null, sourceRevision: 41, mediaInspectedRevision: 41})
      await vi.waitFor(() => {
        expect(inspectMediaInfo).toHaveBeenCalledTimes(1)
      })
    } finally {
      model.cleanup()
    }
  })

  it('records failed media inspections as misses without blocking file open', async () => {
    const {ctx, inspectMediaInfo} = createContext({
      children: [
        {
          nodeId: 7,
          id: 7,
          path: '/clip.mp4',
          name: 'clip.mp4',
          isDir: false,
          mimeType: 'video/mp4',
          sourceRevision: 41,
        },
      ],
      inspectMediaInfoImpl: () => Promise.reject(new Error('probe failed')),
    })
    const model = new FileManagerModel(ctx)

    const firstCommands = await captureFileCommands(async () => {
      await model.handleOpen({
        id: 7,
        path: '/clip.mp4',
        name: 'clip.mp4',
        isDir: false,
        mimeType: 'video/mp4',
        sourceRevision: 41,
      })
    })
    const secondCommands = await captureFileCommands(async () => {
      await model.handleOpen({
        id: 7,
        path: '/clip.mp4',
        name: 'clip.mp4',
        isDir: false,
        mimeType: 'video/mp4',
        sourceRevision: 41,
      })
    })

    expect(inspectMediaInfo).toHaveBeenCalledTimes(1)
    expect(firstCommands).toEqual([{kind: 'video', fileId: 7, fileName: 'clip.mp4'}])
    expect(secondCommands).toEqual([{kind: 'video', fileId: 7, fileName: 'clip.mp4'}])
  })

  it('prepares Markdown document return viewport from the current file list snapshot', async () => {
    const {ctx} = createContext()
    const model = new FileManagerModel(ctx)

    model.saveFileListViewportSnapshot({
      path: '/',
      viewMode: 'list',
      scrollTop: 640,
      activeItemId: 5,
      focusItemId: 5,
    })

    await model.handleOpen({
      id: 7,
      path: '/readme.md',
      name: 'readme.md',
      mimeType: 'text/markdown',
      isDir: false,
    })

    expect(model.fileListViewportRestore()).toBeNull()

    model.activatePendingDocumentReturnViewport()

    expect(model.fileListViewportRestore()).toMatchObject({
      path: '/',
      viewMode: 'list',
      scrollTop: 640,
      activeItemId: 7,
      focusItemId: 7,
      revision: 1,
    })
  })

  it('drops a pending Markdown document return viewport when the parent path changed', async () => {
    const {ctx} = createContext()
    const model = new FileManagerModel(ctx)

    model.saveFileListViewportSnapshot({
      path: '/',
      viewMode: 'list',
      scrollTop: 640,
      activeItemId: 5,
      focusItemId: 5,
    })

    await model.handleOpen({
      id: 7,
      path: '/readme.md',
      name: 'readme.md',
      mimeType: 'text/markdown',
      isDir: false,
    })

    ctx.store.currentPath.set('/Docs')
    model.activatePendingDocumentReturnViewport()

    expect(model.fileListViewportRestore()).toBeNull()
  })

  it('normalizes Markdown return viewport paths and clears only the matching revision', async () => {
    const {ctx} = createContext()
    const model = new FileManagerModel(ctx)
    ctx.store.currentPath.set('/Docs')

    model.saveFileListViewportSnapshot({
      path: '/Docs///',
      viewMode: 'list',
      scrollTop: -12,
      activeItemId: 5,
      focusItemId: 5,
    })

    await model.handleOpen({
      id: 7,
      path: '/Docs/readme.md',
      name: 'readme.md',
      mimeType: 'text/markdown',
      isDir: false,
    })

    model.activatePendingDocumentReturnViewport()

    expect(model.fileListViewportRestore()).toMatchObject({
      path: '/Docs',
      scrollTop: 0,
      activeItemId: 7,
      focusItemId: 7,
      revision: 1,
    })

    model.clearFileListViewportRestore(2)
    expect(model.fileListViewportRestore()).not.toBeNull()

    model.clearFileListViewportRestore(1)
    expect(model.fileListViewportRestore()).toBeNull()
  })

  it.each([
    ['macos', {desktop: true}],
    ['android', {mobile: true}],
  ] as const)('opens fallback files through the system on %s', async (platform, flags) => {
    setRuntimeCapabilities({
      platform,
      supports_open_external: true,
      ...flags,
    })

    const {ctx, openExternal, createOpenExternalTask, updateUploadTask} = createContext()
    const model = new FileManagerModel(ctx)

    await model.handleOpen({
      id: 11,
      path: '/report.pdf',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      isDir: false,
    })

    expect(openExternal).toHaveBeenCalledWith(11, expect.objectContaining({openId: expect.any(String)}))
    expect(createOpenExternalTask).not.toHaveBeenCalled()
    expect(updateUploadTask).not.toHaveBeenCalled()
  })

  it('keeps fallback preview routing on non-target desktop platforms', async () => {
    setRuntimeCapabilities({
      platform: 'linux',
      desktop: true,
      supports_open_external: true,
    })

    const {ctx, openExternal} = createContext()
    const model = new FileManagerModel(ctx)

    const commands = await captureFileCommands(async () => {
      await model.handleOpen({
        id: 12,
        path: '/report.pdf',
        name: 'report.pdf',
        mimeType: 'application/pdf',
        isDir: false,
      })
    })

    expect(commands).toEqual([{kind: 'preview', fileId: 12}])
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('uses the native external opener on Android instead of Web Share fallback', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_open_external: true,
    })

    const {ctx, openExternal, createOpenExternalTask, updateUploadTask} = createContext()
    const model = new FileManagerModel(ctx)
    const shareSpy = vi.spyOn(shareService, 'shareFile').mockResolvedValue()

    await model.handleOpenExternal({
      id: 13,
      path: '/report.pdf',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      isDir: false,
    })

    expect(openExternal).toHaveBeenCalledWith(13, expect.objectContaining({openId: expect.any(String)}))
    expect(createOpenExternalTask).not.toHaveBeenCalled()
    expect(updateUploadTask).not.toHaveBeenCalled()
    expect(shareSpy).not.toHaveBeenCalled()
  })

  it('tracks pending state and ignores duplicate external open requests for the same file', async () => {
    vi.useFakeTimers()
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_open_external: true})
    let resolveOpen: ((value: {path: string}) => void) | undefined
    const {ctx, openExternal, createOpenExternalTask, updateUploadTask} = createContext({
      openExternalImpl: () =>
        new Promise<{path: string}>((resolve) => {
          resolveOpen = resolve
        }),
    })
    const model = new FileManagerModel(ctx)
    const item = {
      id: 21,
      path: '/report.pdf',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      size: 4096,
      isDir: false,
    } satisfies FileItemData

    const firstOpen = model.handleOpenExternal(item)

    expect(model.isExternalOpenPending(21)).toBe(true)
    expect(createOpenExternalTask).not.toHaveBeenCalled()
    expect(openExternal).toHaveBeenCalledTimes(1)

    await model.handleOpenExternal(item)
    expect(openExternal).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(OPEN_EXTERNAL_HUD_DELAY_MS - 1)
    expect(createOpenExternalTask).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(createOpenExternalTask).toHaveBeenCalledWith('report.pdf', 4096)

    resolveOpen?.({path: '/tmp/report.pdf'})
    await firstOpen

    expect(updateUploadTask).toHaveBeenLastCalledWith('open-task-1', {status: 'done'})
    expect(model.isExternalOpenPending(21)).toBe(false)
  })

  it('replays external open progress received before the delayed HUD task exists', async () => {
    vi.useFakeTimers()
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_open_external: true})
    let resolveOpen: ((value: {path: string}) => void) | undefined
    const {ctx, createOpenExternalTask, updateUploadTask} = createContext({
      openExternalImpl: (_nodeId, opts) => {
        opts?.onProgress?.(256, 4096)
        return new Promise<{path: string}>((resolve) => {
          resolveOpen = resolve
        })
      },
    })
    const model = new FileManagerModel(ctx)
    const item = {
      id: 24,
      path: '/report.pdf',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      size: 4096,
      isDir: false,
    } satisfies FileItemData

    const openPromise = model.handleOpenExternal(item)

    expect(updateUploadTask).not.toHaveBeenCalled()
    vi.advanceTimersByTime(OPEN_EXTERNAL_HUD_DELAY_MS)

    expect(createOpenExternalTask).toHaveBeenCalledWith('report.pdf', 4096)
    expect(updateUploadTask).toHaveBeenCalledWith('open-task-1', {
      loaded: 256,
      total: 4096,
      status: 'uploading',
    })

    resolveOpen?.({path: '/tmp/report.pdf'})
    await openPromise

    expect(updateUploadTask).toHaveBeenLastCalledWith('open-task-1', {status: 'done'})
  })

  it('tracks pending state and ignores duplicate share requests for the same file', async () => {
    let resolveShare: (() => void) | undefined
    const shareSpy = vi.spyOn(shareService, 'shareFiles').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveShare = resolve
        }),
    )
    const {ctx} = createContext()
    const model = new FileManagerModel(ctx)
    const item = {
      id: 21,
      path: '/photo.jpg',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 8192,
      isDir: false,
    } satisfies FileItemData

    const firstShare = model.handleShare(item)

    expect(model.isSharePending(21)).toBe(true)
    expect(shareSpy).toHaveBeenCalledTimes(1)

    await model.handleShare(item)
    expect(model.executeFileAction('share', item)).toBe(false)
    expect(shareSpy).toHaveBeenCalledTimes(1)

    resolveShare?.()
    await firstShare

    expect(model.isSharePending(21)).toBe(false)
  })

  it('clears share pending state when sharing fails', async () => {
    const shareSpy = vi.spyOn(shareService, 'shareFiles').mockRejectedValue(new Error('share failed'))
    const {ctx} = createContext()
    const model = new FileManagerModel(ctx)
    const item = {
      id: 23,
      path: '/photo.jpg',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 8192,
      isDir: false,
    } satisfies FileItemData

    await expect(model.handleShare(item)).rejects.toThrow('share failed')

    expect(shareSpy).toHaveBeenCalledTimes(1)
    expect(model.isSharePending(23)).toBe(false)
  })

  it('keeps quick external open failures notification-only and clears pending state', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_open_external: true})
    const {ctx, createOpenExternalTask, updateUploadTask} = createContext({
      openExternalImpl: () => Promise.reject(new Error('open failed')),
    })
    const model = new FileManagerModel(ctx)

    await model.handleOpenExternal({
      id: 22,
      path: '/broken.pdf',
      name: 'broken.pdf',
      mimeType: 'application/pdf',
      size: 512,
      isDir: false,
    })

    expect(createOpenExternalTask).not.toHaveBeenCalled()
    expect(updateUploadTask).not.toHaveBeenCalled()
    expect(model.isExternalOpenPending(22)).toBe(false)
    expect(ctx.store.pushNotification).toHaveBeenCalledWith('error', 'Failed to open file: open failed')
  })

  it('marks delayed external open HUD tasks as failed on slow errors', async () => {
    vi.useFakeTimers()
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_open_external: true})
    let rejectOpen: ((error: Error) => void) | undefined
    const {ctx, createOpenExternalTask, updateUploadTask} = createContext({
      openExternalImpl: () =>
        new Promise<{path: string}>((_, reject) => {
          rejectOpen = reject
        }),
    })
    const model = new FileManagerModel(ctx)

    const openPromise = model.handleOpenExternal({
      id: 22,
      path: '/broken.pdf',
      name: 'broken.pdf',
      mimeType: 'application/pdf',
      size: 512,
      isDir: false,
    })

    vi.advanceTimersByTime(OPEN_EXTERNAL_HUD_DELAY_MS)
    expect(createOpenExternalTask).toHaveBeenCalledWith('broken.pdf', 512)

    rejectOpen?.(new Error('open failed'))
    await openPromise

    expect(updateUploadTask).toHaveBeenCalledWith('open-task-1', {status: 'error'})
    expect(model.isExternalOpenPending(22)).toBe(false)
    expect(ctx.store.pushNotification).toHaveBeenCalledWith('error', 'Failed to open file: open failed')
  })

  it('keeps context-menu open affordances aligned with registry strategies', () => {
    const {ctx} = createContext()
    const model = new FileManagerModel(ctx)

    const audioOpen = model.getActionDescriptors({
      id: 1,
      path: '/track.mp3',
      name: 'track.mp3',
      mimeType: 'audio/mpeg',
      isDir: false,
    })[0]

    const imageOpen = model.getActionDescriptors({
      id: 2,
      path: '/scan.heic',
      name: 'scan.heic',
      mimeType: 'image/heic',
      isDir: false,
    })[0]

    const fallbackOpen = model.getActionDescriptors({
      id: 3,
      path: '/report.pdf',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      isDir: false,
    })[0]

    expect(audioOpen?.icon).toBe('play-circle')
    expect(imageOpen?.icon).toBe('eye')
    expect(fallbackOpen?.icon).toBe('box-arrow-up-right')
  })

  it('disables external-open affordances while the same file is still being prepared', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_open_external: true})
    let resolveOpen: ((value: {path: string}) => void) | undefined
    const {ctx} = createContext({
      children: [
        {
          nodeId: 31,
          path: '/report.pdf',
          name: 'report.pdf',
          isDir: false,
          size: 2048,
          mimeType: 'application/pdf',
        },
      ],
      selectedNodeIds: [31],
      selectionMode: true,
      openExternalImpl: () =>
        new Promise<{path: string}>((resolve) => {
          resolveOpen = resolve
        }),
    })
    const model = new FileManagerModel(ctx)
    const item = {
      id: 31,
      path: '/report.pdf',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      isDir: false,
    } satisfies FileItemData

    const openPromise = model.handleOpenExternal(item)

    const contextItems = model.getActionDescriptors(item)
    expect(contextItems.find((entry) => entry.id === 'open')?.disabled).toBe(true)
    expect(contextItems.find((entry) => entry.id === 'open-external')?.disabled).toBe(true)
    expect(model.getMobileToolbarActions().find((action) => action.id === 'open')?.disabled).toBe(true)
    expect(model.getMobileToolbarActions().find((action) => action.id === 'open-external')?.disabled).toBe(
      true,
    )

    resolveOpen?.({path: '/tmp/report.pdf'})
    await openPromise
  })

  it('surfaces selected file actions through the mobile toolbar contract', () => {
    const {ctx} = createContext({
      children: [
        {
          nodeId: 9,
          path: '/report.pdf',
          name: 'report.pdf',
          isDir: false,
          size: 1024,
          mimeType: 'application/pdf',
        },
      ],
      selectedNodeIds: [9],
      selectionMode: true,
    })
    const model = new FileManagerModel(ctx)

    expect(model.getMobileToolbarActions().map((action) => action.id)).toEqual([
      'selection-done',
      'open',
      'open-external',
      'rename',
      'move',
      'download',
      'delete',
    ])
  })

  it('promotes share into the visible native single-selection toolbar actions', () => {
    setRuntimeCapabilities({platform: 'android', mobile: true, supports_native_share: true})
    vi.spyOn(shareService, 'canShareFiles').mockReturnValue(true)

    const {ctx} = createContext({
      children: [
        {
          nodeId: 9,
          path: '/report.pdf',
          name: 'report.pdf',
          isDir: false,
          size: 1024,
          mimeType: 'application/pdf',
        },
      ],
      selectedNodeIds: [9],
      selectionMode: true,
    })
    const model = new FileManagerModel(ctx)

    expect(model.getMobileToolbarActions().map((action) => action.id)).toEqual([
      'selection-done',
      'share',
      'open',
      'open-external',
      'rename',
      'move',
      'download',
      'delete',
    ])
  })

  it('adds native multi-selection share action and shares only files', () => {
    setRuntimeCapabilities({platform: 'ios', mobile: true, supports_native_share: true})
    vi.spyOn(shareService, 'canShareFiles').mockReturnValue(true)

    const {ctx} = createContext({
      children: [
        {
          nodeId: 9,
          path: '/report.pdf',
          name: 'report.pdf',
          isDir: false,
          size: 1024,
          mimeType: 'application/pdf',
        },
        {
          nodeId: 10,
          path: '/Docs',
          name: 'Docs',
          isDir: true,
        },
        {
          nodeId: 11,
          path: '/photo.jpg',
          name: 'photo.jpg',
          isDir: false,
          size: 2048,
          mimeType: 'image/jpeg',
        },
      ],
      selectedNodeIds: [9, 10, 11],
      selectionMode: true,
    })
    const model = new FileManagerModel(ctx)
    const shareFilesSpy = vi.spyOn(shareService, 'shareFiles').mockResolvedValue()

    expect(model.getMobileToolbarActions().map((action) => action.id)).toEqual([
      'selection-done',
      'share-selected',
      'move-selected',
      'download-selected',
      'delete-selected',
    ])
    expect(model.executeMobileCommand('share-selected')).toBe(true)
    expect(shareFilesSpy).toHaveBeenCalledWith([
      {
        fileId: 9,
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        lastModified: undefined,
      },
      {
        fileId: 11,
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        lastModified: undefined,
      },
    ])
  })

  it('executes selected move through the mobile toolbar contract', () => {
    const {ctx} = createContext({
      children: [
        {
          nodeId: 9,
          path: '/report.pdf',
          name: 'report.pdf',
          isDir: false,
          size: 1024,
          mimeType: 'application/pdf',
        },
        {
          nodeId: 10,
          path: '/Docs',
          name: 'Docs',
          isDir: true,
        },
      ],
      selectedNodeIds: [9, 10],
      selectionMode: true,
    })
    const model = new FileManagerModel(ctx)
    const moveSpy = vi.spyOn(model, 'openMoveDialogForSelectedItems').mockResolvedValue(true)

    expect(model.executeMobileCommand('move-selected')).toBe(true)
    expect(moveSpy).toHaveBeenCalledTimes(1)
  })

  it('disables native multi-selection share action when only directories are selected', () => {
    setRuntimeCapabilities({platform: 'android', mobile: true, supports_native_share: true})
    vi.spyOn(shareService, 'canShareFiles').mockReturnValue(true)

    const {ctx} = createContext({
      children: [
        {
          nodeId: 10,
          path: '/Docs',
          name: 'Docs',
          isDir: true,
        },
        {
          nodeId: 12,
          path: '/Media',
          name: 'Media',
          isDir: true,
        },
      ],
      selectedNodeIds: [10, 12],
      selectionMode: true,
    })
    const model = new FileManagerModel(ctx)

    expect(model.getMobileToolbarActions()).toEqual([
      {id: 'selection-done', icon: 'check-lg', label: 'Done'},
      {id: 'share-selected', icon: 'share-2', label: 'Share', disabled: true},
      {id: 'move-selected', icon: 'folder-symlink', label: 'Move', disabled: false},
      {id: 'download-selected', icon: 'download', label: 'Download', disabled: true},
      {id: 'delete-selected', icon: 'trash', label: 'Delete selected (2)'},
    ])
  })

  it('adds an accent reset action when files search filters are active', () => {
    const {ctx} = createContext({
      searchFilters: {
        query: 'report',
        sortBy: 'date',
        sortDirection: 'desc',
        viewMode: 'grid',
        showHidden: true,
        fileTypes: ['documents'],
      },
    })
    const model = new FileManagerModel(ctx)

    expect(model.getMobileToolbarActions()).toEqual([
      {id: 'filters-reset', icon: 'x', label: 'Reset Filters', tone: 'accent'},
      {id: 'create-note', icon: 'book-plus', label: 'Create note'},
      {id: 'create-dir', icon: 'folder-plus', label: 'Create folder'},
      {id: 'upload', icon: 'upload', label: 'Upload files'},
    ])
  })

  it('surfaces create note as the primary default mobile toolbar action', () => {
    const {ctx} = createContext()
    const model = new FileManagerModel(ctx)

    expect(model.getMobileToolbarActions()).toEqual([
      {id: 'create-note', icon: 'book-plus', label: 'Create note'},
      {id: 'create-dir', icon: 'folder-plus', label: 'Create folder'},
      {id: 'upload', icon: 'upload', label: 'Upload files'},
    ])
  })

  it('executes create note through the shared mobile toolbar command handler', () => {
    const {ctx} = createContext()
    const model = new FileManagerModel(ctx)
    const createNoteSpy = vi.spyOn(model, 'handleCreateMarkdownNote').mockResolvedValue()

    expect(model.executeMobileCommand('create-note')).toBe(true)
    expect(createNoteSpy).toHaveBeenCalledTimes(1)
  })

  it('creates a normalized empty Markdown note and opens it in the editor', async () => {
    const {ctx, uploadFile, refreshCatalog, pushNotification} = createContext()
    const model = new FileManagerModel(ctx)
    const dialogSpy = vi
      .spyOn(dialogService, 'showCreateMarkdownNoteDialog')
      .mockResolvedValue('Daily Plan.MD')

    const commands = await captureFileCommands(() => model.handleCreateMarkdownNote())
    const uploadedSource = uploadFile.mock.calls[0]?.[2] as AsyncIterable<Uint8Array>
    const uploadedChunks: Uint8Array[] = []
    for await (const chunk of uploadedSource) {
      uploadedChunks.push(chunk)
    }

    expect(dialogSpy).toHaveBeenCalledWith('root directory')
    expect(uploadFile).toHaveBeenCalledWith({parentPath: undefined, name: 'Daily Plan.md'}, 0, expect.anything(), {
      name: 'Daily Plan.md',
      type: 'text/markdown',
    })
    expect(uploadedChunks).toEqual([])
    expect(refreshCatalog).toHaveBeenCalledTimes(1)
    expect(commands).toEqual([{kind: 'document', mode: 'markdown', fileId: 77}])
    expect(pushNotification).toHaveBeenCalledWith('success', 'Note "Daily Plan.md" created')
  })

  it('executes selected item toolbar actions through the shared command handler', () => {
    const {ctx} = createContext({
      children: [
        {
          nodeId: 9,
          path: '/report.pdf',
          name: 'report.pdf',
          isDir: false,
          size: 1024,
          mimeType: 'application/pdf',
        },
      ],
      selectedNodeIds: [9],
      selectionMode: true,
    })
    const model = new FileManagerModel(ctx)
    const actionSpy = vi.spyOn(model, 'executeFileAction').mockReturnValue(true)

    expect(model.executeMobileCommand('rename')).toBe(true)
    expect(actionSpy).toHaveBeenCalledWith(
      'rename',
      expect.objectContaining({
        id: 9,
        name: 'report.pdf',
      }),
    )
  })

  it('renames a single selected image from the mobile toolbar command and patches the local list', async () => {
    const {ctx, renameFile, refreshCatalog, applyCatalogEvent} = createContext({
      children: [
        {
          nodeId: 9,
          path: '/photo.png',
          name: 'photo.png',
          isDir: false,
          size: 1024,
          mimeType: 'image/png',
        },
      ],
      selectedNodeIds: [9],
      selectionMode: true,
    })
    const model = new FileManagerModel(ctx)
    model.connect()
    const dialogSpy = vi.spyOn(dialogService, 'showRenameFileDialog').mockResolvedValue('renamed.png')

    try {
      expect(model.executeMobileCommand('rename')).toBe(true)
      for (let i = 0; i < 5; i++) {
        await Promise.resolve()
      }

      expect(dialogSpy).toHaveBeenCalledWith('photo.png', '/')
      expect(renameFile).toHaveBeenCalledWith(9, 'renamed.png')
      expect(refreshCatalog).not.toHaveBeenCalled()
      expect(applyCatalogEvent).toHaveBeenCalledWith({
        type: CatalogEventType.NODE_RENAMED,
        nodeId: 9,
        timestamp: expect.any(Number),
        version: 0,
        metadata: {newName: 'renamed.png'},
      })
      expect(model.fileItems().find((item) => item.id === 9)?.name).toBe('renamed.png')
      expect(ctx.store.selectedNodeIds()).toEqual([9])
    } finally {
      model.cleanup()
    }
  })

  it('resets files search filters through the shared mobile toolbar command handler', () => {
    const {ctx} = createContext({
      searchFilters: {
        query: 'report',
        sortBy: 'date',
        sortDirection: 'desc',
        viewMode: 'grid',
        showHidden: true,
        fileTypes: ['documents'],
      },
    })
    const model = new FileManagerModel(ctx)

    expect(model.executeMobileCommand('filters-reset')).toBe(true)
    expect(ctx.store.searchFilters()).toEqual({
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    })
  })

  it('saves gallery images through the native gallery service when supported', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_photo_library_save: true,
    })

    const {ctx} = createContext()
    const model = new FileManagerModel(ctx)
    const saveSpy = vi.spyOn(gallerySaveService, 'saveImageToGallery').mockResolvedValue({
      name: 'photo.jpg',
      uri: 'content://gallery/photo',
    })

    await model.handleSaveToGallery({
      id: 9,
      path: '/photo.jpg',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      isDir: false,
    })

    expect(saveSpy).toHaveBeenCalledWith(9, 'photo.jpg', 'image/jpeg')
    expect(toastManager.toast.loading).toHaveBeenCalledWith(
      'Saving "photo.jpg" to gallery...',
      undefined,
      {position: 'bottom-center'},
    )
    expect(toastManager.toast.success).toHaveBeenCalledWith(
      'Image "photo.jpg" saved to gallery',
      undefined,
      {position: 'bottom-center'},
    )
    expect(ctx.store.pushNotification).toHaveBeenCalledWith('success', 'Image "photo.jpg" saved to gallery')
  })

  it('routes Android image downloads through native gallery save instead of browser download', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_photo_library_save: true,
    })

    const {ctx, downloadFile, createDownloadTask, updateUploadTask} = createContext()
    const model = new FileManagerModel(ctx)
    const saveSpy = vi.spyOn(gallerySaveService, 'saveImageToGallery').mockResolvedValue({
      name: 'photo.jpg',
      uri: 'content://gallery/photo',
    })

    await model.handleDownload({
      id: 10,
      path: '/photo.jpg',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      isDir: false,
    })

    expect(saveSpy).toHaveBeenCalledWith(10, 'photo.jpg', 'image/jpeg')
    expect(downloadFile).not.toHaveBeenCalled()
    expect(createDownloadTask).not.toHaveBeenCalled()
    expect(updateUploadTask).not.toHaveBeenCalled()
    expect(ctx.store.pushNotification).toHaveBeenCalledWith('success', 'Image "photo.jpg" saved to gallery')
  })

  it('ignores save-to-gallery outside Android runtime', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
    })

    const {ctx} = createContext()
    const model = new FileManagerModel(ctx)
    const saveSpy = vi.spyOn(gallerySaveService, 'saveImageToGallery').mockResolvedValue({
      name: 'photo.jpg',
      uri: 'content://gallery/photo',
    })

    await model.handleSaveToGallery({
      id: 11,
      path: '/photo.jpg',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      isDir: false,
    })

    expect(saveSpy).not.toHaveBeenCalled()
    expect(ctx.store.pushNotification).not.toHaveBeenCalled()
  })
})
