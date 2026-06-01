import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {CatalogMirror} from '../../src/core/catalog/local-catalog/catalog-mirror'
import {FileMoveModel} from '../../src/features/file-manager/models/file-move.model'
import type {FileItemData, SearchFilters} from '../../src/shared/contracts/file-manager'
import type {AppContext} from '../../src/shared/services/app-context'
import {toast} from '../../src/shared/services/toast-manager'
import {i18n} from '../../src/i18n'
import {applyManifestFixture, catalogDir, catalogFile} from './helpers/catalog-manifest'

function fileItem(input: {
  id: number
  path: string
  name: string
  isDir: boolean
  size?: number
  mimeType?: string
}): FileItemData {
  return {
    id: input.id,
    path: input.path,
    name: input.name,
    isDir: input.isDir,
    size: input.size,
    mimeType: input.mimeType,
  }
}

function createTransfer() {
  const values = new Map<string, string>()
  return {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: vi.fn((type: string, value: string) => {
      values.set(type, value)
    }),
    getData: vi.fn((type: string) => values.get(type) ?? ''),
  } as unknown as DataTransfer
}

function createMobileDropTarget(targetPath: string): HTMLElement {
  const target = document.createElement('div')
  target.setAttribute('data-mobile-dnd-target-id', targetPath)
  target.getBoundingClientRect = vi.fn(
    () =>
      ({
        left: 0,
        top: 0,
        right: 120,
        bottom: 120,
        width: 120,
        height: 120,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  )
  document.body.append(target)
  return target
}

function createHarness(options: {selectedIds?: number[]} = {}) {
  const mirror = new CatalogMirror()
  applyManifestFixture(mirror, [
    catalogDir({
      id: 1,
      name: 'Docs',
      hasChildren: true,
      children: [
        catalogFile({id: 3, name: 'report.pdf', size: 120, mimeType: 'application/pdf'}),
        catalogDir({id: 4, name: 'Sub', children: []}),
      ],
    }),
    catalogDir({id: 2, name: 'Archive', children: []}),
    catalogDir({id: 5, name: '.passmanager', children: []}),
  ])

  const selectedNodeIds = atom<number[]>(options.selectedIds ?? [])
  const selectionMode = atom((options.selectedIds ?? []).length > 0)
  const currentPath = atom('/Docs')
  const searchFilters = atom<SearchFilters>({
    query: '',
    sortBy: 'name',
    sortDirection: 'asc',
    viewMode: 'list',
    showHidden: false,
    fileTypes: [],
  })

  const move = vi.fn(async () => {})
  const refresh = vi.fn(async () => {})
  const setSelectedItems = vi.fn((ids: number[]) => selectedNodeIds.set(ids))
  const setSelectionMode = vi.fn((enabled: boolean) => selectionMode.set(enabled))
  const setCurrentPath = vi.fn((path: string) => currentPath.set(path))
  const isLoading = {set: vi.fn()}
  const ensureVisibleRangeLoaded = vi.fn()

  const items = [
    fileItem({id: 1, path: '/Docs', name: 'Docs', isDir: true}),
    fileItem({id: 2, path: '/Archive', name: 'Archive', isDir: true}),
    fileItem({
      id: 3,
      path: '/Docs/report.pdf',
      name: 'report.pdf',
      isDir: false,
      size: 120,
      mimeType: 'application/pdf',
    }),
    fileItem({id: 4, path: '/Docs/Sub', name: 'Sub', isDir: true}),
  ]

  const ctx = {
    store: {
      currentPath,
      selectedNodeIds,
      selectionMode,
      setCurrentPath,
      setSelectedItems,
      setSelectionMode,
      searchFilters,
      pushNotification: vi.fn(),
    },
    catalog: {
      catalog: mirror,
      api: {move},
      refresh,
    },
    ws: {connected: atom(true), connecting: atom(false)},
    state: {data: atom({})},
  } as unknown as AppContext

  const model = new FileMoveModel(ctx, {
    fileList: {
      getFileItemById: (id) => items.find((item) => item.id === id) ?? null,
      getSelectedFileItems: () => {
        const selected = new Set(selectedNodeIds())
        return items.filter((item) => selected.has(item.id))
      },
    },
    isLoading,
    ensureVisibleRangeLoaded,
  })

  return {
    model,
    move,
    refresh,
    setSelectedItems,
    setSelectionMode,
    setCurrentPath,
    isLoading,
    ensureVisibleRangeLoaded,
    items,
    report: items.find((item) => item.id === 3)!,
    docs: items.find((item) => item.id === 1)!,
    archive: items.find((item) => item.id === 2)!,
    nested: items.find((item) => item.id === 4)!,
  }
}

describe('FileMoveModel', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('moves one file, refreshes, clears selection, remembers target, and exposes toast actions', async () => {
    const harness = createHarness({selectedIds: [3]})
    const toastSpy = vi.spyOn(toast, 'show').mockReturnValue('toast-1')

    await expect(harness.model.moveItems([harness.report], '/Archive')).resolves.toBe(true)

    expect(harness.move).toHaveBeenCalledWith(3, '/Archive')
    expect(harness.refresh).toHaveBeenCalledTimes(1)
    expect(harness.setSelectedItems).toHaveBeenCalledWith([])
    expect(harness.setSelectionMode).toHaveBeenCalledWith(false)
    expect(harness.model.listRecentTargets().map((target) => target.path)).toEqual(['/Archive'])
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'success',
        actions: expect.arrayContaining([
          expect.objectContaining({label: i18n('file-manager:move:undo')}),
          expect.objectContaining({label: i18n('file-manager:move:open-folder')}),
        ]),
      }),
    )
  })

  it('undo moves the last single item back to its source parent', async () => {
    const harness = createHarness()
    vi.spyOn(toast, 'show').mockReturnValue('toast-undo')

    await harness.model.moveItems([harness.report], '/Archive')
    await expect(harness.model.undoLastMove()).resolves.toBe(true)

    expect(harness.move).toHaveBeenLastCalledWith(3, '/Docs')
  })

  it('blocks same-parent and descendant folder moves before catalog mutation', async () => {
    const harness = createHarness()
    vi.spyOn(toast, 'show').mockReturnValue('toast-blocked')

    await expect(harness.model.moveItems([harness.report], '/Docs')).resolves.toBe(false)
    await expect(harness.model.moveItems([harness.docs], '/Docs/Sub')).resolves.toBe(false)

    expect(harness.move).not.toHaveBeenCalled()
  })

  it('excludes system shard targets and rejects direct system target paths', async () => {
    const harness = createHarness()
    vi.spyOn(toast, 'show').mockReturnValue('toast-system')

    expect(harness.model.listTargets().map((target) => target.path)).not.toContain('/.passmanager')
    await expect(harness.model.moveItems([harness.report], '/.passmanager')).resolves.toBe(false)
    expect(harness.move).not.toHaveBeenCalled()
  })

  it('moves selected items sequentially and clears multi-selection', async () => {
    const harness = createHarness({selectedIds: [3, 4]})
    vi.spyOn(toast, 'show').mockReturnValue('toast-many')

    await expect(harness.model.moveItemsByIds([3, 4], '/Archive')).resolves.toBe(true)

    expect(harness.move).toHaveBeenNthCalledWith(1, 3, '/Archive')
    expect(harness.move).toHaveBeenNthCalledWith(2, 4, '/Archive')
    expect(harness.model.lastMove()).toBeNull()
    expect(harness.setSelectedItems).toHaveBeenCalledWith([])
    expect(harness.setSelectionMode).toHaveBeenCalledWith(false)
  })

  it('shows backend error messages when catalog move fails', async () => {
    const harness = createHarness()
    harness.move.mockRejectedValueOnce(new Error('Name already exists'))
    const toastSpy = vi.spyOn(toast, 'show').mockReturnValue('toast-error')

    await expect(harness.model.moveItems([harness.report], '/Archive')).resolves.toBe(false)

    expect(harness.model.lastMove()).toBeNull()
    expect(harness.isLoading.set).toHaveBeenLastCalledWith(false)
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Name already exists'),
        variant: 'error',
      }),
    )
  })

  it('keeps last move when undo fails', async () => {
    const harness = createHarness()
    const toastSpy = vi.spyOn(toast, 'show').mockReturnValue('toast-undo-error')

    await harness.model.moveItems([harness.report], '/Archive')
    harness.move.mockRejectedValueOnce(new Error('restore failed'))

    await expect(harness.model.undoLastMove()).resolves.toBe(false)

    expect(harness.model.lastMove()).toMatchObject({
      itemId: harness.report.id,
      sourceParentPath: '/Docs',
      targetPath: '/Archive',
    })
    expect(harness.isLoading.set).toHaveBeenLastCalledWith(false)
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('restore failed'),
        variant: 'error',
      }),
    )
  })

  it('reads desktop file drag payloads and falls back to legacy JSON item payloads', () => {
    const harness = createHarness()
    const transfer = createTransfer()

    harness.model.setDragData({dataTransfer: transfer} as DragEvent, harness.report.id)

    expect(harness.model.readDragPayload(transfer)).toEqual({domain: 'files', kind: 'item', id: 3})

    const legacyTransfer = createTransfer()
    legacyTransfer.setData('application/json', JSON.stringify(harness.report))
    expect(harness.model.readDragPayload(legacyTransfer)).toEqual({domain: 'files', kind: 'item', id: 3})
  })

  it('builds selected mobile payloads and commits through the same move path', async () => {
    const harness = createHarness({selectedIds: [3, 4]})
    vi.spyOn(toast, 'show').mockReturnValue('toast-mobile')
    const target = createMobileDropTarget('/Archive')

    harness.model.registerMobileDropZone(document)
    const payload = harness.model.createMobileDragPayload(3)

    expect(payload).toMatchObject({domain: 'files', kind: 'selection', anchorId: 3, ids: [3, 4]})
    expect(harness.model.canDropToTarget('/Archive', payload)).toBe(true)

    expect(harness.model.beginMobileDrag(3, {x: 1, y: 1})).toBe(true)
    expect(harness.model.moveMobileDrag({x: 30, y: 30})).toBe(true)
    await expect(harness.model.commitMobileDrag({x: 30, y: 30})).resolves.toBe(true)

    expect(harness.move).toHaveBeenCalledWith(3, '/Archive')
    expect(harness.move).toHaveBeenCalledWith(4, '/Archive')
    expect(harness.setSelectedItems).toHaveBeenCalledWith([])
    expect(harness.setSelectionMode).toHaveBeenCalledWith(false)
    expect(target.isConnected).toBe(true)
  })

  it('has localized move keys', () => {
    expect(i18n('file-manager:move:title')).toBe('Move')
    expect(i18n('file-manager:move:root-label')).toBe('Files root')
    expect(i18n('file-manager:move:open-folder')).toBe('Open folder')
  })
})
