import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import type {
  CatalogNotesListItem,
  CatalogNotesListResponse,
} from '../../src/core/catalog/local-catalog/types'
import {
  NotesQuickViewModel,
  type NotesQuickViewRow,
  type NotesQuickViewTreeItem,
} from '../../src/features/file-manager/components/notes-quick-view'

class FakeCatalogSubscription {
  readonly listeners = new Set<() => void>()
  subscribeCalls = 0
  unsubscribeCalls = 0

  subscribe(listener: () => void): () => void {
    this.subscribeCalls += 1
    this.listeners.add(listener)
    listener()
    return () => {
      this.unsubscribeCalls += 1
      this.listeners.delete(listener)
    }
  }

  emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

function note(
  nodeId: number,
  name: string,
  path: string,
  overrides: Partial<CatalogNotesListItem> = {},
): CatalogNotesListItem {
  return {
    node_id: nodeId,
    name,
    path,
    parent_path: parentPath(path),
    size: 100,
    mime_type: null,
    source_revision: 8,
    created_at: 1_717_171_700,
    updated_at: 1_717_171_717,
    ...overrides,
  }
}

function notesResponse(items: CatalogNotesListItem[], version = 1): CatalogNotesListResponse {
  return {version, items}
}

function parentPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index <= 0 ? '/' : `${path.slice(0, index)}/`
}

type CreateModelOptions = {
  response?: CatalogNotesListResponse
  listNotes?: () => Promise<CatalogNotesListResponse>
  wsConnected?: boolean
}

function createModel(options: CreateModelOptions = {}) {
  const catalog = new FakeCatalogSubscription()
  const syncing = atom(false)
  const connected = atom(Boolean(options.wsConnected ?? true))
  const listNotes = vi.fn(
    options.listNotes ??
      (async () => options.response ?? notesResponse([])),
  )
  const model = new NotesQuickViewModel({
    getContext: () =>
      ({
        catalog: {
          catalog,
          syncing,
          listNotes,
        },
        ws: {connected},
      }) as any,
  })

  return {model, catalog, connected, listNotes, syncing}
}

function createUnavailableModel() {
  const connected = atom(true)
  const model = new NotesQuickViewModel({
    getContext: () =>
      ({
        catalog: undefined,
        ws: {connected},
      }) as any,
  })

  return {model}
}

function rowNames(rows: NotesQuickViewRow[]) {
  return rows.map((row) => row.fileName)
}

function simplifyTree(items: NotesQuickViewTreeItem[]): unknown[] {
  return items.map((item) => {
    if (item.type === 'note') {
      return `note:${item.row.fileName}`
    }

    return {
      folder: item.name,
      path: item.path,
      expanded: item.expanded,
      noteCount: item.noteCount,
      children: simplifyTree(item.children),
    }
  })
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(condition()).toBe(true)
}

async function waitForRows(model: NotesQuickViewModel, expectedNames: string[]): Promise<void> {
  await waitFor(() => JSON.stringify(rowNames(model.rows())) === JSON.stringify(expectedNames))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return {promise, resolve, reject}
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NotesQuickViewModel', () => {
  it('loads note metadata and builds flat and hierarchy projections', async () => {
    const {model, listNotes} = createModel({
      response: notesResponse([
        note(1, 'Root.md', '/Root.md', {
          mime_type: 'text/markdown',
          source_revision: 12,
        }),
        note(7, 'Plan.markdown', '/Docs/Plan.markdown', {size: 512}),
        note(8, 'MimeOnly', '/Docs/MimeOnly', {mime_type: 'text/markdown'}),
        note(11, 'Deep.md', '/Docs/Nested/Deep.md'),
      ]),
    })

    model.connect()

    await waitForRows(model, ['Deep.md', 'MimeOnly', 'Plan.markdown', 'Root.md'])
    expect(listNotes).toHaveBeenCalledTimes(1)
    expect(simplifyTree(model.visibleTree())).toEqual([
      {
        folder: 'Docs',
        path: '/Docs',
        expanded: true,
        noteCount: 3,
        children: [
          {
            folder: 'Nested',
            path: '/Docs/Nested',
            expanded: true,
            noteCount: 1,
            children: ['note:Deep.md'],
          },
          'note:MimeOnly',
          'note:Plan.markdown',
        ],
      },
      'note:Root.md',
    ])
    expect(model.rows().find((row) => row.fileName === 'Root.md')).toMatchObject({
      id: '1',
      fileId: 1,
      fileName: 'Root.md',
      path: '/Root.md',
      parentPath: '/',
      size: 100,
      lastModified: 1_717_171_717,
      sourceRevision: 12,
      mimeType: 'text/markdown',
    })
    expect(model.rows().find((row) => row.fileName === 'Plan.markdown')?.parentPath).toBe('/Docs/')
    expect(model.summary()).toEqual({total: 4, visible: 4})

    model.disconnect()
  })

  it('filters by note name and path and clears active filters', async () => {
    const {model} = createModel({
      response: notesResponse([
        note(1, 'Root.md', '/Root.md'),
        note(3, 'Retro.md', '/Projects/Retro.md'),
      ]),
    })

    model.connect()
    await waitForRows(model, ['Retro.md', 'Root.md'])
    model.setQuery('projects')

    expect(rowNames(model.visibleRows())).toEqual(['Retro.md'])
    expect(simplifyTree(model.visibleTree())).toEqual([
      {
        folder: 'Projects',
        path: '/Projects',
        expanded: true,
        noteCount: 1,
        children: ['note:Retro.md'],
      },
    ])
    expect(model.summary()).toEqual({total: 2, visible: 1})
    expect(model.hasActiveFilters()).toBe(true)

    model.clearFilters()

    expect(rowNames(model.visibleRows())).toEqual(['Retro.md', 'Root.md'])
    expect(model.hasActiveFilters()).toBe(false)

    model.disconnect()
  })

  it('loads nested notes through catalog notes projection without folder hydration', async () => {
    const {model, listNotes} = createModel({
      response: notesResponse([note(3, 'Retro.md', '/Projects/Retro.md')]),
    })

    model.connect()

    await waitForRows(model, ['Retro.md'])
    expect(listNotes).toHaveBeenCalledTimes(1)
    expect(model.isLoading()).toBe(false)

    model.disconnect()
  })

  it('ignores stale notes responses after catalog updates', async () => {
    const first = deferred<CatalogNotesListResponse>()
    const second = deferred<CatalogNotesListResponse>()
    const responses = [first.promise, second.promise]
    const {model, catalog, listNotes} = createModel({
      listNotes: () => responses.shift() ?? Promise.resolve(notesResponse([])),
    })

    model.connect()
    await waitFor(() => listNotes.mock.calls.length === 1)

    catalog.emit()
    first.resolve(notesResponse([note(1, 'First.md', '/First.md')]))

    await waitFor(() => listNotes.mock.calls.length === 2)
    expect(rowNames(model.rows())).toEqual([])

    second.resolve(notesResponse([note(2, 'Second.md', '/Second.md')]))
    await waitForRows(model, ['Second.md'])
    expect(rowNames(model.rows())).toEqual(['Second.md'])

    model.disconnect()
  })

  it('ignores stale notes failures after a newer load starts', async () => {
    const first = deferred<CatalogNotesListResponse>()
    const second = deferred<CatalogNotesListResponse>()
    const responses = [first.promise, second.promise]
    const {model, catalog, listNotes} = createModel({
      listNotes: () => responses.shift() ?? Promise.resolve(notesResponse([])),
    })

    model.connect()
    await waitFor(() => listNotes.mock.calls.length === 1)

    catalog.emit()
    first.reject(new Error('stale notes failed'))
    await waitFor(() => listNotes.mock.calls.length === 2)

    expect(rowNames(model.rows())).toEqual([])
    expect(model.isLoading()).toBe(true)

    second.resolve(notesResponse([note(2, 'Fresh.md', '/Fresh.md')]))
    await waitForRows(model, ['Fresh.md'])
    expect(model.isLoading()).toBe(false)

    model.disconnect()
  })

  it('exposes load failure state and retries notes loading explicitly', async () => {
    const {model, listNotes} = createModel({
      listNotes: vi
        .fn()
        .mockRejectedValueOnce(new Error('notes failed'))
        .mockResolvedValueOnce(notesResponse([note(2, 'Recovered.md', '/Recovered.md')])),
    })

    model.connect()
    await waitFor(() => model.state.loadErrorKey() === 'notes:quick_view:error:load_failed')

    expect(rowNames(model.rows())).toEqual([])
    expect(model.summary()).toEqual({total: 0, visible: 0})

    model.actions.retryLoad()

    await waitForRows(model, ['Recovered.md'])
    expect(model.state.loadErrorKey()).toBeNull()
    expect(listNotes).toHaveBeenCalledTimes(2)

    model.disconnect()
  })

  it('loads notes after transport reconnects', async () => {
    const {model, connected, listNotes} = createModel({
      response: notesResponse([note(1, 'Root.md', '/Root.md')]),
      wsConnected: false,
    })

    model.connect()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listNotes).not.toHaveBeenCalled()

    connected.set(true)
    await waitForRows(model, ['Root.md'])
    expect(listNotes).toHaveBeenCalledTimes(1)

    model.disconnect()
  })

  it('tracks view mode and collapses hierarchy folders without mutating search expansion', async () => {
    const {model} = createModel({
      response: notesResponse([
        note(1, 'Root.md', '/Root.md'),
        note(3, 'Retro.md', '/Projects/Retro.md'),
        note(5, 'Deep.md', '/Projects/Nested/Deep.md'),
      ]),
    })

    model.connect()
    await waitForRows(model, ['Deep.md', 'Retro.md', 'Root.md'])

    expect(model.viewMode()).toBe('flat')
    model.setViewMode('hierarchy')
    expect(model.viewMode()).toBe('hierarchy')

    model.toggleDirectory('/Projects')
    expect(simplifyTree(model.visibleTree())).toEqual([
      {
        folder: 'Projects',
        path: '/Projects',
        expanded: false,
        noteCount: 2,
        children: [],
      },
      'note:Root.md',
    ])

    model.setQuery('deep')
    expect(simplifyTree(model.visibleTree())).toEqual([
      {
        folder: 'Projects',
        path: '/Projects',
        expanded: true,
        noteCount: 2,
        children: [
          {
            folder: 'Nested',
            path: '/Projects/Nested',
            expanded: true,
            noteCount: 1,
            children: ['note:Deep.md'],
          },
        ],
      },
    ])

    model.clearFilters()
    expect(simplifyTree(model.visibleTree())).toEqual([
      {
        folder: 'Projects',
        path: '/Projects',
        expanded: false,
        noteCount: 2,
        children: [],
      },
      'note:Root.md',
    ])

    model.expandAllDirectories()
    expect(
      (model.visibleTree().find((item) => item.type === 'directory') as {expanded?: boolean} | undefined)
        ?.expanded,
    ).toBe(true)

    model.disconnect()
  })

  it('updates rows when the catalog subscription emits and tears down once', async () => {
    let response = notesResponse([note(1, 'Root.md', '/Root.md')])
    const {model, catalog, listNotes} = createModel({
      listNotes: async () => response,
    })

    model.connect()
    model.connect()
    await waitForRows(model, ['Root.md'])
    expect(catalog.subscribeCalls).toBe(1)
    expect(listNotes).toHaveBeenCalledTimes(1)

    response = notesResponse([note(1, 'Root.md', '/Root.md'), note(2, 'Next.md', '/Next.md')])
    catalog.emit()

    await waitForRows(model, ['Next.md', 'Root.md'])

    model.disconnect()
    expect(catalog.unsubscribeCalls).toBe(0)
    model.disconnect()
    expect(catalog.unsubscribeCalls).toBe(1)
  })

  it('exposes unavailable/loading state without a catalog', async () => {
    const {model} = createUnavailableModel()

    model.connect()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(model.hasCatalog()).toBe(false)
    expect(model.rows()).toEqual([])
    expect(model.summary()).toEqual({total: 0, visible: 0})

    model.disconnect()
  })

  it('opens a flat note through source-backed Markdown navigation', async () => {
    const {model} = createModel({
      response: notesResponse([note(2, 'Retro.md', '/Projects/Retro.md')]),
    })
    const openMarkdownDocument = vi.spyOn(navigationModel, 'openMarkdownDocument').mockImplementation(() => {})

    model.connect()
    await waitForRows(model, ['Retro.md'])
    model.openNoteById('2')

    expect(openMarkdownDocument).toHaveBeenCalledWith(2, 'push', {
      source: {
        path: '/Projects/Retro.md',
        fileName: 'Retro.md',
        size: 100,
        lastModified: 1_717_171_717,
        sourceRevision: 8,
      },
    })

    model.disconnect()
  })

  it('opens a hierarchy note through path-aware Markdown navigation', async () => {
    const {model} = createModel({
      response: notesResponse([note(2, 'Retro.md', '/Projects/Retro.md')]),
    })
    const openMarkdownDocument = vi.spyOn(navigationModel, 'openMarkdownDocument').mockImplementation(() => {})

    model.connect()
    await waitForRows(model, ['Retro.md'])
    model.setViewMode('hierarchy')
    model.openNoteById('2')

    expect(openMarkdownDocument).toHaveBeenCalledWith(2, 'push', '/Projects/')

    model.disconnect()
  })
})
