import {afterEach, describe, expect, it, vi} from 'vitest'

import type {Atom} from '../../src/core/transport/transport'
import {FileManager} from '../../src/features/file-manager/file-manager'
import {getFileManagerModel} from '../../src/features/file-manager/file-manager.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import type {AppContext} from '../../src/shared/services/app-context'

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

const DEFAULT_CHILDREN = [
  {
    nodeId: 9,
    path: '/photo.jpg',
    name: 'photo.jpg',
    isDir: false,
    size: 1024,
    mimeType: 'image/jpeg',
  },
]

function initFileManagerContext(options?: {
  children?: Array<Record<string, unknown>>
  nodeById?: Record<number, Record<string, unknown> | null>
}): AppContext {
  const currentPath = createAtom('/')
  const children = options?.children ?? DEFAULT_CHILDREN

  const context = createMockAppContext({
    ws: {
      connected: createAtom(true),
      connecting: createAtom(false),
      lastError: createAtom<string | undefined>(undefined),
    } as any,
    store: {
      currentPath,
      setCurrentPath: vi.fn(),
      searchFilters: createAtom({
        query: '',
        sortBy: 'name',
        sortDirection: 'asc',
        viewMode: 'list',
        showHidden: false,
        fileTypes: [],
      }),
      setSearchFilters: vi.fn(),
      selectedNodeIds: createAtom<number[]>([]),
      selectionMode: createAtom(false),
      setSelectionMode: vi.fn(),
      pushNotification: vi.fn(),
    } as any,
    catalog: {
      catalog: {
        getChildren: vi.fn().mockReturnValue(children),
        getNode: vi.fn((nodeId: number) => {
          if (options?.nodeById && nodeId in options.nodeById) {
            return options.nodeById[nodeId]
          }
          return children.find((node) => node['nodeId'] === nodeId)
        }),
      },
      getEntryMeta: vi.fn(),
      ensureEntryMeta: vi.fn(),
    } as any,
  })

  initAppContext(context)
  return context
}

describe('FileManager global file actions', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('routes save-to-gallery through FileManagerModel', () => {
    const ctx = initFileManagerContext()
    FileManager.define()

    const model = getFileManagerModel(ctx)
    const actionSpy = vi.spyOn(model, 'executeFileAction').mockReturnValue(true)

    const element = document.createElement('chromvoid-file-manager') as FileManager
    ;(element as any).handleGlobalFileAction(
      new CustomEvent('file-action', {
        detail: {action: 'save-to-gallery', fileId: 9},
      }),
    )

    expect(actionSpy).toHaveBeenCalledWith(
      'save-to-gallery',
      expect.objectContaining({
        id: 9,
        name: 'photo.jpg',
      }),
    )
  })

  it('routes delete through FileManagerModel', () => {
    const ctx = initFileManagerContext()
    FileManager.define()

    const model = getFileManagerModel(ctx)
    const actionSpy = vi.spyOn(model, 'executeFileAction').mockReturnValue(true)

    const element = document.createElement('chromvoid-file-manager') as FileManager
    ;(element as any).handleGlobalFileAction(
      new CustomEvent('file-action', {
        detail: {action: 'delete', fileId: 9},
      }),
    )

    expect(actionSpy).toHaveBeenCalledWith(
      'delete',
      expect.objectContaining({
        id: 9,
        name: 'photo.jpg',
      }),
    )
  })

  it('routes download through catalog node fallback when the item is not in the rendered list', () => {
    const ctx = initFileManagerContext({
      children: [],
      nodeById: {
        9: {
          nodeId: 9,
          path: '/photo.jpg',
          name: 'photo.jpg',
          isDir: false,
          size: 1024,
          mimeType: 'image/jpeg',
        },
      },
    })
    FileManager.define()

    const model = getFileManagerModel(ctx)
    const actionSpy = vi.spyOn(model, 'executeFileAction').mockReturnValue(true)

    const element = document.createElement('chromvoid-file-manager') as FileManager
    ;(element as any).handleGlobalFileAction(
      new CustomEvent('file-action', {
        detail: {action: 'download', fileId: 9},
      }),
    )

    expect(actionSpy).toHaveBeenCalledWith(
      'download',
      expect.objectContaining({
        id: 9,
        name: 'photo.jpg',
      }),
    )
  })

  it('notifies when a global file action target is no longer available', () => {
    const ctx = initFileManagerContext({children: []})
    FileManager.define()

    const model = getFileManagerModel(ctx)
    const actionSpy = vi.spyOn(model, 'executeFileAction').mockReturnValue(true)

    const element = document.createElement('chromvoid-file-manager') as FileManager
    ;(element as any).handleGlobalFileAction(
      new CustomEvent('file-action', {
        detail: {action: 'download', fileId: 404},
      }),
    )

    expect(actionSpy).not.toHaveBeenCalled()
    expect(ctx.store.pushNotification).toHaveBeenCalledWith('warning', 'File is no longer available')
  })
})
