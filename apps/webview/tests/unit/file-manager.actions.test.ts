import {describe, expect, it, vi} from 'vitest'

import type {Atom} from '../../src/core/transport/transport'
import {FileManagerModel} from '../../src/features/file-manager/file-manager.model'
import type {FileItemData, SearchFilters} from '../../src/shared/contracts/file-manager'
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

function createContext(): AppContext {
  const searchFilters = createAtom<SearchFilters>({
    query: '',
    sortBy: 'name',
    sortDirection: 'asc',
    viewMode: 'list',
    showHidden: false,
    fileTypes: [],
  })

  return {
    ws: {
      kind: 'ws',
      connected: createAtom(true),
      connecting: createAtom(false),
      lastError: createAtom<string | undefined>(undefined),
    },
    store: {
      currentPath: createAtom('/'),
      setCurrentPath: vi.fn(),
      searchFilters,
      setSearchFilters(next: SearchFilters) {
        searchFilters.set(next)
      },
      selectedNodeIds: createAtom<number[]>([]),
      selectionMode: createAtom(false),
      setSelectionMode: vi.fn(),
      pushNotification: vi.fn(),
    },
    catalog: {
      catalog: {
        getChildren: vi.fn().mockReturnValue([]),
        subscribe: vi.fn(() => vi.fn()),
      },
      getEntryMeta: vi.fn(),
      ensureEntryMeta: vi.fn(),
    },
    state: {
      data: createAtom({}),
    },
  } as unknown as AppContext
}

describe('FileManagerModel action descriptors', () => {
  it('exposes move after rename and executes the move dialog handler', () => {
    const model = new FileManagerModel(createContext())
    const item = {
      id: 42,
      path: '/report.pdf',
      name: 'report.pdf',
      isDir: false,
      mimeType: 'application/pdf',
    } satisfies FileItemData
    const openMoveSpy = vi.spyOn(model, 'openMoveDialogForItem').mockResolvedValue(true)

    const actions = model.getActionDescriptors(item).map((action) => action.id)

    expect(actions.slice(actions.indexOf('rename'), actions.indexOf('rename') + 2)).toEqual([
      'rename',
      'move',
    ])
    expect(model.executeFileAction('move', item)).toBe(true)
    expect(openMoveSpy).toHaveBeenCalledWith(item)
  })

  it.each(['.password', '.note', '.seed', '.private-key'])(
    'does not expose raw secret actions for %s files',
    (name) => {
      const model = new FileManagerModel(createContext())
      const item = {
        id: 42,
        path: `/${name}`,
        name,
        isDir: false,
        mimeType: 'application/octet-stream',
      } satisfies FileItemData

      expect(model.getActionDescriptors(item).map((action) => action.id)).not.toEqual(
        expect.arrayContaining(['secret-show', 'secret-copy', 'secret-sep']),
      )
    },
  )
})
