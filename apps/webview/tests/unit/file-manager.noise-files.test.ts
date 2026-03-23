import {describe, expect, it} from 'vitest'

import type {AppContext} from '../../src/shared/services/app-context'
import {FileManagerModel} from '../../src/features/file-manager/file-manager.model'
import type {Atom} from '../../src/core/transport/transport'

describe('FileManagerModel (noise files)', () => {
  it('hides AppleDouble (._*) and .DS_Store from WebView listing', () => {
    const children = [
      {
        nodeId: 1,
        name: 'Screenshot 2026-01-23 at 21.31.47.png',
        isDir: false,
        size: 10,
        modtime: 1700000000000,
        path: '/Screenshot 2026-01-23 at 21.31.47.png',
      },
      {
        nodeId: 2,
        name: '._Screenshot 2026-01-23 at 21.31.47.png',
        isDir: false,
        size: 10,
        modtime: 1700000000001,
        path: '/._Screenshot 2026-01-23 at 21.31.47.png',
      },
      {
        nodeId: 3,
        name: '.DS_Store',
        isDir: false,
        size: 10,
        modtime: 1700000000002,
        path: '/.DS_Store',
      },
      {
        nodeId: 4,
        name: '.passmanager',
        isDir: true,
        size: 0,
        modtime: 1700000000003,
        path: '/.passmanager',
      },
      {
        nodeId: 5,
        name: '.wallet',
        isDir: true,
        size: 0,
        modtime: 1700000000004,
        path: '/.wallet',
      },
    ]

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

    const ctx = {
      ws: {
        kind: 'ws',
        connected: atom(true),
        connecting: atom(false),
        lastError: atom(undefined),
      },
      store: {
        currentPath: atom('/'),
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
          getChildren: () => children,
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

    expect(items.map((i) => i.name)).toEqual(['Screenshot 2026-01-23 at 21.31.47.png'])
  })
})
