import {afterEach, describe, expect, it, vi} from 'vitest'

import type {Atom} from '../../src/core/transport/transport'
import {
  DEFAULT_SESSION_SETTINGS,
  sessionSettingsState,
} from '../../src/core/session/session-settings'
import {FileManagerModel} from '../../src/features/file-manager/file-manager.model'
import type {SearchFilters} from '../../src/shared/contracts/file-manager'
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

describe('FileManagerModel connect', () => {
  afterEach(() => {
    sessionSettingsState.set({...DEFAULT_SESSION_SETTINGS})
  })

  it('rebinds catalog mirror only on ws reconnect transitions', () => {
    const connected = createAtom(true)
    const unsubscribeMirror = vi.fn()
    const subscribeMirror = vi.fn(() => unsubscribeMirror)

    const ctx = {
      ws: {
        kind: 'ws',
        connected,
        connecting: createAtom(false),
        lastError: createAtom<string | undefined>(undefined),
      },
      store: {
        currentPath: createAtom('/'),
        setCurrentPath: vi.fn(),
        selectionMode: createAtom(false),
        setSelectionMode(enabled: boolean) {
          ctx.store.selectionMode.set(enabled)
          if (!enabled) {
            ctx.store.selectedNodeIds.set([])
          }
        },
        searchFilters: createAtom({
          query: '',
          sortBy: 'name',
          sortDirection: 'asc',
          viewMode: 'list',
          showHidden: false,
          fileTypes: [],
        }),
        selectedNodeIds: createAtom<number[]>([]),
        pushNotification: vi.fn(),
      },
      catalog: {
        catalog: {
          subscribe: subscribeMirror,
          getChildren: vi.fn().mockReturnValue([]),
        },
      },
      state: {
        data: createAtom({}),
      },
    } as unknown as AppContext

    const model = new FileManagerModel(ctx)

    model.connect()
    expect(subscribeMirror).toHaveBeenCalledTimes(1)

    connected.set(true)
    connected.set(true)
    expect(subscribeMirror).toHaveBeenCalledTimes(1)

    connected.set(false)
    expect(unsubscribeMirror).toHaveBeenCalledTimes(1)

    connected.set(true)
    expect(subscribeMirror).toHaveBeenCalledTimes(2)

    model.cleanup()
    expect(unsubscribeMirror).toHaveBeenCalledTimes(2)
  })

  it('hydrates visible directory metadata from the connect subscription, not from fileItems reads', async () => {
    const connected = createAtom(true)
    const unsubscribeMirror = vi.fn()
    const subscribeMirror = vi.fn(() => unsubscribeMirror)
    let title: string | undefined
    const ensureEntryMeta = vi.fn(async () => {
      title = 'Vault title'
    })
    const getEntryMeta = vi.fn(() => (title ? {title} : undefined))

    const ctx = {
      ws: {
        kind: 'ws',
        connected,
        connecting: createAtom(false),
        lastError: createAtom<string | undefined>(undefined),
      },
      store: {
        currentPath: createAtom('/'),
        setCurrentPath: vi.fn(),
        selectionMode: createAtom(false),
        setSelectionMode(enabled: boolean) {
          ctx.store.selectionMode.set(enabled)
          if (!enabled) {
            ctx.store.selectedNodeIds.set([])
          }
        },
        searchFilters: createAtom({
          query: '',
          sortBy: 'name',
          sortDirection: 'asc',
          viewMode: 'list',
          showHidden: false,
          fileTypes: [],
        }),
        selectedNodeIds: createAtom<number[]>([]),
        pushNotification: vi.fn(),
      },
      catalog: {
        catalog: {
          subscribe: subscribeMirror,
          getChildren: vi.fn().mockReturnValue([
            {
              nodeId: 9,
              path: '/vault',
              name: 'vault',
              isDir: true,
              size: 0,
              modtime: 1700000000000,
            },
          ]),
        },
        getEntryMeta,
        ensureEntryMeta,
      },
      state: {
        data: createAtom({}),
      },
    } as unknown as AppContext

    const model = new FileManagerModel(ctx)

    expect(model.fileItems()[0]?.name).toBe('vault')
    expect(ensureEntryMeta).not.toHaveBeenCalled()

    model.connect()
    await vi.waitFor(() => {
      expect(ensureEntryMeta).toHaveBeenCalledWith(9)
    })
    await vi.waitFor(() => {
      expect(model.fileItems()[0]?.name).toBe('Vault title')
    })

    model.cleanup()
  })

  it('exits selection mode locally on mobile back', () => {
    const connected = createAtom(true)

    const ctx = {
      ws: {
        kind: 'ws',
        connected,
        connecting: createAtom(false),
        lastError: createAtom<string | undefined>(undefined),
      },
      store: {
        currentPath: createAtom('/'),
        setCurrentPath: vi.fn(),
        selectionMode: createAtom(true),
        setSelectionMode(enabled: boolean) {
          ctx.store.selectionMode.set(enabled)
          if (!enabled) {
            ctx.store.selectedNodeIds.set([])
          }
        },
        searchFilters: createAtom({
          query: '',
          sortBy: 'name',
          sortDirection: 'asc',
          viewMode: 'list',
          showHidden: false,
          fileTypes: [],
        }),
        selectedNodeIds: createAtom<number[]>([7, 9]),
        pushNotification: vi.fn(),
      },
      catalog: {
        catalog: {
          subscribe: vi.fn(() => vi.fn()),
          getChildren: vi.fn().mockReturnValue([]),
        },
      },
      state: {
        data: createAtom({}),
      },
    } as unknown as AppContext

    const model = new FileManagerModel(ctx)

    expect(model.handleMobileBack()).toBe(true)
    expect(ctx.store.selectionMode()).toBe(false)
    expect(ctx.store.selectedNodeIds()).toEqual([])
    expect(model.handleMobileBack()).toBe(false)
  })

  it('uses session hidden-files preference as the filter reset default', () => {
    sessionSettingsState.set({...DEFAULT_SESSION_SETTINGS, show_hidden_files: true})
    const connected = createAtom(true)
    const searchFilters = createAtom<SearchFilters>({
      query: 'report',
      sortBy: 'date',
      sortDirection: 'desc',
      viewMode: 'grid',
      showHidden: false,
      fileTypes: ['documents'],
    })

    const ctx = {
      ws: {
        kind: 'ws',
        connected,
        connecting: createAtom(false),
        lastError: createAtom<string | undefined>(undefined),
      },
      store: {
        currentPath: createAtom('/'),
        setCurrentPath: vi.fn(),
        selectionMode: createAtom(false),
        setSelectionMode: vi.fn(),
        searchFilters,
        setSearchFilters(next: SearchFilters) {
          searchFilters.set(next)
        },
        selectedNodeIds: createAtom<number[]>([]),
        pushNotification: vi.fn(),
      },
      catalog: {
        catalog: {
          subscribe: vi.fn(() => vi.fn()),
          getChildren: vi.fn().mockReturnValue([]),
        },
      },
      state: {
        data: createAtom({}),
      },
    } as unknown as AppContext

    const model = new FileManagerModel(ctx)
    model.resetSearchFilters()

    expect(searchFilters()).toEqual({
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: true,
      fileTypes: [],
    })
  })
})
