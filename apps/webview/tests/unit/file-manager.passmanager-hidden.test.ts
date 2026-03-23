import {describe, expect, it, vi} from 'vitest'

import type {AppContext} from '../../src/shared/services/app-context'
import {FileManagerModel} from '../../src/features/file-manager/file-manager.model'
import type {Atom} from '../../src/core/transport/transport'

describe('FileManagerModel (system shard access)', () => {
  it('blocks navigating into /.passmanager and resets currentPath to /', () => {
    const atom = <T,>(initial: T): Atom<T> => {
      let v = initial
      const fn = (() => v) as unknown as Atom<T>
      fn.set = (next: T) => {
        v = next
      }
      fn.subscribe = () => {
        return () => {}
      }
      return fn
    }

    const currentPath = atom('/.passmanager')

    const getChildren = vi.fn().mockReturnValue([
      {
        nodeId: 1,
        name: 'meta.json',
        isDir: false,
        size: 10,
        modtime: 1700000000000,
        path: '/.passmanager/meta.json',
      },
    ])

    const ctx = {
      ws: {
        kind: 'ws',
        connected: atom(true),
        connecting: atom(false),
        lastError: atom(undefined),
      },
      store: {
        currentPath,
        setCurrentPath: (path: string) => currentPath.set(path),
        pushNotification: vi.fn(),
        searchFilters: atom({
          query: '',
          sortBy: 'name',
          sortDirection: 'asc',
          viewMode: 'list',
          showHidden: false,
          fileTypes: [],
        }),
        selectedNodeIds: atom<number[]>([]),
      },
      catalog: {
        catalog: {
          getChildren,
        },
        getEntryMeta: () => undefined,
        ensureEntryMeta: async () => {},
      },
      state: {
        data: () => ({}) as unknown,
      },
    } as unknown as AppContext

    const model = new FileManagerModel(ctx)
    const items = model.fileItems()

    expect(items).toEqual([])
    expect(currentPath()).toBe('/')
    expect(getChildren).not.toHaveBeenCalled()
  })

  it('blocks navigating into /.wallet and resets currentPath to /', () => {
    const atom = <T,>(initial: T): Atom<T> => {
      let v = initial
      const fn = (() => v) as unknown as Atom<T>
      fn.set = (next: T) => {
        v = next
      }
      fn.subscribe = () => {
        return () => {}
      }
      return fn
    }

    const currentPath = atom('/.wallet')
    const getChildren = vi.fn().mockReturnValue([])

    const ctx = {
      ws: {
        kind: 'ws',
        connected: atom(true),
        connecting: atom(false),
        lastError: atom(undefined),
      },
      store: {
        currentPath,
        setCurrentPath: (path: string) => currentPath.set(path),
        pushNotification: vi.fn(),
        searchFilters: atom({
          query: '',
          sortBy: 'name',
          sortDirection: 'asc',
          viewMode: 'list',
          showHidden: false,
          fileTypes: [],
        }),
        selectedNodeIds: atom<number[]>([]),
      },
      catalog: {
        catalog: {
          getChildren,
        },
        getEntryMeta: () => undefined,
        ensureEntryMeta: async () => {},
      },
      state: {
        data: () => ({}) as unknown,
      },
    } as unknown as AppContext

    const model = new FileManagerModel(ctx)
    const items = model.fileItems()

    expect(items).toEqual([])
    expect(currentPath()).toBe('/')
    expect(getChildren).not.toHaveBeenCalled()
  })
})
