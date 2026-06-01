import {afterEach, describe, expect, it, vi} from 'vitest'
import {atom} from '@reatom/core'

import {CatalogMirror} from '../../src/core/catalog/local-catalog/catalog-mirror'
import {FileMoveSheet} from '../../src/features/file-manager/components/file-move'
import {openFileMoveDialog} from '../../src/features/file-manager/services/file-move-dialog'
import type {SearchFilters} from '../../src/shared/contracts/file-manager'
import {clearAppContext, initAppContext, type AppContext} from '../../src/shared/services/app-context'
import {dialogService} from '../../src/shared/services/dialog-service'
import {applyManifestFixture, catalogDir} from './helpers/catalog-manifest'

function setupContext() {
  const mirror = new CatalogMirror()
  applyManifestFixture(mirror, [
    catalogDir({id: 1, name: 'Docs', children: []}),
    catalogDir({id: 2, name: 'Archive', children: []}),
  ])
  const searchFilters = atom<SearchFilters>({
    query: '',
    sortBy: 'name',
    sortDirection: 'asc',
    viewMode: 'list',
    showHidden: false,
    fileTypes: [],
  })

  initAppContext({
    store: {
      currentPath: atom('/'),
      searchFilters,
      selectedNodeIds: atom<number[]>([]),
      selectionMode: atom(false),
      layoutMode: atom('mobile'),
      setCurrentPath: () => {},
      setSelectedItems: () => {},
      setSelectionMode: () => {},
      pushNotification: () => {},
    },
    catalog: {
      catalog: mirror,
      api: {move: async () => {}},
      refresh: async () => {},
      syncing: atom(false),
      lastError: atom(null),
      getEntryMeta: () => undefined,
    },
    ws: {connected: atom(true), connecting: atom(false)},
    state: {data: atom({})},
    router: {route: atom('dashboard'), isLoading: atom(false)},
  } as unknown as AppContext)
}

function stylesToText(styles: unknown): string {
  const values = Array.isArray(styles) ? styles : [styles]
  return values
    .map((value) => {
      if (value == null) return ''
      return typeof value === 'object' && 'cssText' in (value as object)
        ? String((value as {cssText: string}).cssText)
        : String(value)
    })
    .join('\n')
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return {promise, resolve}
}

describe('openFileMoveDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('confirms move with the latest desktop picker selection', async () => {
    const onConfirm = vi.fn(async (targetPath: string) => targetPath === '/Archive')

    vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(async (_options, attach) => {
      const dialog = document.createElement('div')
      const picker = document.createElement('file-move') as HTMLElement & {selectedPath?: string}
      picker.selectedPath = '/Docs'
      const confirmBtn = document.createElement('button')
      confirmBtn.id = 'move-confirm-btn'
      const cancelBtn = document.createElement('button')
      cancelBtn.id = 'move-cancel-btn'
      dialog.append(picker, confirmBtn, cancelBtn)

      return new Promise<string | null>((resolve) => {
        attach(dialog, resolve)
        picker.selectedPath = '/Archive'
        picker.dispatchEvent(
          new CustomEvent('move-selected', {
            detail: {path: '/Archive'},
            bubbles: true,
            composed: true,
          }),
        )
        confirmBtn.click()
      })
    })

    await expect(
      openFileMoveDialog({
        itemId: 3,
        onConfirm,
        selectedPath: '/Docs',
        useMobilePicker: false,
      }),
    ).resolves.toBe('/Archive')

    expect(onConfirm).toHaveBeenCalledWith('/Archive')
  })

  it('returns null when the desktop dialog is cancelled', async () => {
    const onConfirm = vi.fn(() => true)

    vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(async (_options, attach) => {
      const dialog = document.createElement('div')
      const picker = document.createElement('file-move') as HTMLElement & {selectedPath?: string}
      picker.selectedPath = '/Docs'
      const confirmBtn = document.createElement('button')
      confirmBtn.id = 'move-confirm-btn'
      const cancelBtn = document.createElement('button')
      cancelBtn.id = 'move-cancel-btn'
      dialog.append(picker, confirmBtn, cancelBtn)

      return new Promise<string | null>((resolve) => {
        attach(dialog, resolve)
        cancelBtn.click()
      })
    })

    await expect(
      openFileMoveDialog({
        onConfirm,
        selectedPath: '/Docs',
        useMobilePicker: false,
      }),
    ).resolves.toBeNull()

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('ignores duplicate desktop confirms while confirmation is pending', async () => {
    const deferred = createDeferred<boolean>()
    const onConfirm = vi.fn(() => deferred.promise)

    vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(async (_options, attach) => {
      const dialog = document.createElement('div')
      const picker = document.createElement('file-move') as HTMLElement & {selectedPath?: string}
      picker.selectedPath = '/Archive'
      const confirmBtn = document.createElement('button')
      confirmBtn.id = 'move-confirm-btn'
      const cancelBtn = document.createElement('button')
      cancelBtn.id = 'move-cancel-btn'
      dialog.append(picker, confirmBtn, cancelBtn)

      return new Promise<string | null>((resolve) => {
        attach(dialog, resolve)
        confirmBtn.click()
        confirmBtn.click()
        deferred.resolve(true)
      })
    })

    await expect(
      openFileMoveDialog({
        onConfirm,
        selectedPath: '/Archive',
        useMobilePicker: false,
      }),
    ).resolves.toBe('/Archive')

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('confirms through the mobile move sheet and removes it', async () => {
    setupContext()
    const onConfirm = vi.fn(async () => true)

    const promise = openFileMoveDialog({
      disabledPaths: ['/Docs'],
      onConfirm,
      selectedPath: '/Archive',
      useMobilePicker: true,
    })

    await Promise.resolve()
    const sheet = document.querySelector('file-move-sheet') as FileMoveSheet | null
    expect(sheet).not.toBeNull()
    expect(sheet?.disabledPaths).toEqual(['/Docs'])

    sheet?.dispatchEvent(
      new CustomEvent('file-move-sheet-confirm', {
        detail: {targetPath: '/Archive'},
        bubbles: true,
        composed: true,
      }),
    )

    await expect(promise).resolves.toBe('/Archive')
    expect(onConfirm).toHaveBeenCalledWith('/Archive')
    expect(document.querySelector('file-move-sheet')).toBeNull()
  })

  it('keeps the mobile sheet open when confirmation returns false', async () => {
    setupContext()
    const onConfirm = vi.fn(() => false)
    let settled = false

    const promise = openFileMoveDialog({
      onConfirm,
      selectedPath: '/Docs',
      useMobilePicker: true,
    }).then((value) => {
      settled = true
      return value
    })

    await Promise.resolve()
    const sheet = document.querySelector('file-move-sheet') as FileMoveSheet | null
    expect(sheet).not.toBeNull()

    sheet?.dispatchEvent(
      new CustomEvent('file-move-sheet-confirm', {
        detail: {targetPath: '/Docs'},
        bubbles: true,
        composed: true,
      }),
    )

    await Promise.resolve()
    await Promise.resolve()

    expect(onConfirm).toHaveBeenCalledWith('/Docs')
    expect(settled).toBe(false)
    expect(document.querySelector('file-move-sheet')).toBe(sheet)

    sheet?.dispatchEvent(new CustomEvent('file-move-sheet-cancel', {bubbles: true, composed: true}))
    await expect(promise).resolves.toBeNull()
  })

  it('ignores a stale mobile confirmation after the sheet is cancelled', async () => {
    setupContext()
    const deferred = createDeferred<boolean>()
    const onConfirm = vi.fn(() => deferred.promise)

    const promise = openFileMoveDialog({
      onConfirm,
      selectedPath: '/Docs',
      useMobilePicker: true,
    })

    await Promise.resolve()
    const sheet = document.querySelector('file-move-sheet') as FileMoveSheet | null
    expect(sheet).not.toBeNull()

    sheet?.dispatchEvent(
      new CustomEvent('file-move-sheet-confirm', {
        detail: {targetPath: '/Docs'},
        bubbles: true,
        composed: true,
      }),
    )
    sheet?.dispatchEvent(new CustomEvent('file-move-sheet-cancel', {bubbles: true, composed: true}))

    await expect(promise).resolves.toBeNull()
    deferred.resolve(true)
    await Promise.resolve()

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(document.querySelector('file-move-sheet')).toBeNull()
  })

  it('ignores duplicate mobile confirms while confirmation is pending', async () => {
    setupContext()
    const deferred = createDeferred<boolean>()
    const onConfirm = vi.fn(() => deferred.promise)

    const promise = openFileMoveDialog({
      onConfirm,
      selectedPath: '/Archive',
      useMobilePicker: true,
    })

    await Promise.resolve()
    const sheet = document.querySelector('file-move-sheet') as FileMoveSheet | null
    expect(sheet).not.toBeNull()

    const event = () =>
      new CustomEvent('file-move-sheet-confirm', {
        detail: {targetPath: '/Archive'},
        bubbles: true,
        composed: true,
      })
    sheet?.dispatchEvent(event())
    sheet?.dispatchEvent(event())
    deferred.resolve(true)

    await expect(promise).resolves.toBe('/Archive')
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('keeps the mobile sheet chrome light and spacing-driven', () => {
    const styleText = stylesToText(FileMoveSheet.styles)

    expect(styleText).toContain('--adaptive-modal-sheet-max-height: 100dvh;')
    expect(styleText).toContain('--cv-bottom-sheet-expanded-height: 100dvh;')
    expect(styleText).toContain('--cv-bottom-sheet-middle-height: min(72dvh, 560px);')
    expect(styleText).toContain('grid-template-rows: auto auto minmax(0, 1fr) auto;')
    expect(styleText).toContain(
      'block-size: min(var(--adaptive-modal-sheet-max-height), calc(100dvh - var(--cv-bottom-sheet-safe-top)));',
    )
    expect(styleText).toContain('block-size: 100%;')
    expect(styleText).toContain('overflow: hidden;')
    expect(styleText).toContain('padding: var(--cv-space-5) var(--cv-space-5) var(--cv-space-2);')
    expect(styleText).toContain(
      'padding: var(--cv-space-2) var(--cv-space-5) max(var(--cv-space-5), env(safe-area-inset-bottom));',
    )
    expect(styleText).not.toContain(
      'border-color: color-mix(in srgb, var(--cv-color-primary) 26%, var(--cv-color-border));',
    )
    expect(styleText).not.toContain('border-block-end: 1px solid var(--cv-color-border);')
    expect(styleText).not.toContain('border-block-start: 1px solid var(--cv-color-border);')
  })

  it('opens the mobile move sheet as a full-height bottom sheet without detents', async () => {
    setupContext()
    FileMoveSheet.define()
    const sheet = document.createElement('file-move-sheet') as FileMoveSheet
    sheet.open = true
    document.body.append(sheet)

    await sheet.updateComplete

    const surface = sheet.shadowRoot?.querySelector('adaptive-modal-surface') as HTMLElement & {
      detents?: string
      detent?: string
    }

    expect(surface.detents).toBe('')
    expect(surface.detent).toBe('expanded')
  })
})
