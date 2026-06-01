import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'

import {androidSystemBackModel} from '../../src/app/navigation/android-system-back.model'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {MarkdownDocumentPage} from '../../src/features/file-manager/components/markdown-document-page'
import {MarkdownPreview} from '../../src/features/file-manager/components/markdown-preview'
import type {SearchFilters} from '../../src/shared/contracts/file-manager'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {
  markdownPreviewModel,
  type MarkdownPreviewReadyState,
} from '../../src/features/file-manager/models/markdown-preview.model'
import {registerMarkdownNavigationGuard} from '../../src/routes/app.route.model'

type CatalogNode = {
  nodeId: number
  name: string
  isDir: boolean
  path?: string
  size?: number
  lastModified?: number
  modtime?: number
  sourceRevision?: number
  mimeType?: string
}

type HistoryEntry = {
  state: unknown
  url: string
}

const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
}

function createCatalogMock() {
  const syncing = atom(false)
  const listeners = new Set<() => void>()
  const nodesByPath = new Map<string, CatalogNode[]>()
  const knownPaths = new Set<string>()

  return {
    syncing,
    catalog: {
      getChildren(path: string) {
        return nodesByPath.get(path) ?? []
      },
      findByPath(path: string) {
        return knownPaths.has(path) ? {path} : undefined
      },
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    setPath(path: string, nodes: CatalogNode[]) {
      knownPaths.add(path)
      nodesByPath.set(path, nodes)
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

function setupContext(catalog: ReturnType<typeof createCatalogMock>) {
  const detailsPanelFileId = atom<number | null>(null)
  const currentPath = atom('/')
  const showRemoteStoragePage = atom(false)
  const showRemotePage = atom(false)
  const showGatewayPage = atom(false)
  const showSettingsPage = atom(false)
  const isShowPasswordManager = atom(false)
  const searchFilters = atom<SearchFilters>({...DEFAULT_SEARCH_FILTERS})

  initAppContext(
    createMockAppContext({
      store: {
        detailsPanelFileId,
        currentPath,
        showRemoteStoragePage,
        showRemotePage,
        showGatewayPage,
        showSettingsPage,
        isShowPasswordManager,
        searchFilters,
      } as any,
      catalog: {
        syncing: catalog.syncing,
        lastError: () => null,
        catalog: catalog.catalog,
      } as any,
    }),
  )
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

function installHistoryTracker() {
  const originalPushState = window.history.pushState.bind(window.history)
  const originalReplaceState = window.history.replaceState.bind(window.history)
  const entries: HistoryEntry[] = [{state: window.history.state, url: window.location.href}]
  let index = 0

  const resolveUrl = (nextUrl?: string | URL | null) =>
    new URL(nextUrl == null ? window.location.href : String(nextUrl), window.location.href).toString()

  const pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(
    (state: unknown, unused: string, nextUrl?: string | URL | null) => {
      const resolvedUrl = resolveUrl(nextUrl)
      index += 1
      entries.splice(index)
      entries[index] = {state, url: resolvedUrl}
      originalPushState(state, unused, resolvedUrl)
    },
  )

  vi.spyOn(window.history, 'replaceState').mockImplementation(
    (state: unknown, unused: string, nextUrl?: string | URL | null) => {
      const resolvedUrl = resolveUrl(nextUrl)
      entries[index] = {state, url: resolvedUrl}
      originalReplaceState(state, unused, resolvedUrl)
    },
  )

  const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
    if (index === 0) {
      return
    }

    index -= 1
    const previous = entries[index]
    originalReplaceState(previous.state, '', previous.url)
    window.dispatchEvent(new PopStateEvent('popstate', {state: previous.state as any}))
  })

  const goSpy = vi.spyOn(window.history, 'go').mockImplementation((delta?: number) => {
    const nextDelta = Number(delta ?? 0)
    if (!Number.isFinite(nextDelta) || nextDelta === 0) {
      return
    }

    const nextIndex = Math.min(entries.length - 1, Math.max(0, index + nextDelta))
    if (nextIndex === index) {
      return
    }

    index = nextIndex
    const next = entries[index]
    originalReplaceState(next.state, '', next.url)
    window.dispatchEvent(new PopStateEvent('popstate', {state: next.state as any}))
  })

  return {backSpy, goSpy, pushStateSpy}
}

function readyState(overrides: Partial<MarkdownPreviewReadyState> = {}): MarkdownPreviewReadyState {
  const source = overrides.source ?? '# Local'
  const baseline = overrides.baseline ?? '# Notes'
  return {
    kind: 'ready',
    fileId: 5,
    fileName: 'notes.md',
    size: 7,
    mimeType: 'text/markdown',
    lastModified: 123,
    source,
    baseline,
    sourceRevision: 11,
    baselineSourceRevision: 11,
    mode: 'edit',
    dirty: source !== baseline,
    saving: false,
    formatting: false,
    stale: false,
    renderedHtml: '<h1>Notes</h1>',
    errorKey: null,
    readOnlyReasonKey: null,
    lastSavedAt: null,
    autosavePending: false,
    lastAutosaveAttemptAt: null,
    ...overrides,
  }
}

function openDirtyMarkdown(fileId = 5): void {
  navigationModel.openMarkdownDocument(fileId)
  const document = navigationModel.resolvedDocument()
  expect(document).toMatchObject({
    kind: 'markdown',
    fileId,
  })
  markdownPreviewModel.state.set(readyState({fileId, dirty: true}))
}

async function mountMarkdownDocumentPage(): Promise<MarkdownDocumentPage> {
  MarkdownDocumentPage.define()
  MarkdownPreview.define()
  vi.spyOn(markdownPreviewModel, 'setPreview').mockImplementation(() => {})

  const element = document.createElement('markdown-document-page') as MarkdownDocumentPage
  element.data = {
    fileId: 5,
    fileName: 'notes.md',
    mimeType: 'text/markdown',
    sourceRevision: 11,
    mode: 'markdown',
  }
  element.addEventListener('close', () => navigationModel.closeFilesDocument())
  document.body.appendChild(element)
  await settle(element)
  markdownPreviewModel.state.set(readyState({fileId: 5, dirty: true}))
  await settle(element)
  return element
}

describe('NavigationModel Markdown dirty guard', () => {
  let catalog: ReturnType<typeof createCatalogMock>
  let unregisterGuard: (() => void) | undefined

  beforeEach(() => {
    clearAppContext()
    navigationModel.disconnect()
    window.history.replaceState({}, '', '/dashboard?layout=mobile&surface=files&path=%2F')
    catalog = createCatalogMock()
    catalog.setPath('/', [
      {
        nodeId: 5,
        name: 'notes.md',
        isDir: false,
        path: '/notes.md',
        mimeType: 'text/markdown',
        sourceRevision: 11,
      },
      {
        nodeId: 6,
        name: 'other.md',
        isDir: false,
        path: '/other.md',
        mimeType: 'text/markdown',
        sourceRevision: 21,
      },
    ])
    setupContext(catalog)
    navigationModel.connect()
    unregisterGuard = registerMarkdownNavigationGuard()
  })

  afterEach(() => {
    unregisterGuard?.()
    unregisterGuard = undefined
    markdownPreviewModel.cleanup()
    navigationModel.disconnect()
    clearAppContext()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('pauses document close until dirty changes are discarded', () => {
    openDirtyMarkdown()

    navigationModel.closeFilesDocument()

    expect(navigationModel.snapshot().files?.document).toEqual({kind: 'markdown', fileId: 5})
    expect(markdownPreviewModel.pendingCloseIntent()).toMatchObject({
      kind: 'navigation',
      navigationKind: 'close-document',
      fileId: 5,
    })

    markdownPreviewModel.discardPendingCloseIntent()

    expect(navigationModel.snapshot().files?.document).toBeUndefined()
    expect(markdownPreviewModel.pendingCloseIntent()).toBeNull()
  })

  it('routes document back button through the dirty blocker before closing the document', async () => {
    openDirtyMarkdown()
    const element = await mountMarkdownDocumentPage()

    element.shadowRoot?.querySelector<HTMLButtonElement>('.back-button')?.click()

    expect(navigationModel.snapshot().files?.document).toEqual({kind: 'markdown', fileId: 5})
    expect(markdownPreviewModel.pendingCloseIntent()).toMatchObject({
      navigationKind: 'close-document',
      fileId: 5,
    })

    markdownPreviewModel.discardPendingCloseIntent()

    expect(navigationModel.snapshot().files?.document).toBeUndefined()
  })

  it('routes Markdown Escape through the dirty blocker and resumes after save confirmation', async () => {
    const save = vi.spyOn(markdownPreviewModel, 'save').mockResolvedValue(true)
    openDirtyMarkdown()
    await mountMarkdownDocumentPage()

    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, composed: true}))

    expect(navigationModel.snapshot().files?.document).toEqual({kind: 'markdown', fileId: 5})
    expect(markdownPreviewModel.pendingCloseIntent()).toMatchObject({
      navigationKind: 'close-document',
      fileId: 5,
    })

    await markdownPreviewModel.savePendingCloseIntent()

    expect(save).toHaveBeenCalledTimes(1)
    expect(navigationModel.snapshot().files?.document).toBeUndefined()
    expect(markdownPreviewModel.pendingCloseIntent()).toBeNull()
  })

  it('pauses file switch until dirty changes are discarded', () => {
    openDirtyMarkdown(5)

    navigationModel.openMarkdownDocument(6)

    expect(navigationModel.snapshot().files?.document).toEqual({kind: 'markdown', fileId: 5})
    expect(markdownPreviewModel.pendingCloseIntent()).toMatchObject({
      navigationKind: 'open-document',
      fileId: 5,
    })

    markdownPreviewModel.discardPendingCloseIntent()

    expect(navigationModel.snapshot().files?.document).toEqual({kind: 'markdown', fileId: 6})
  })

  it('pauses path changes until dirty changes are discarded', () => {
    openDirtyMarkdown()

    navigationModel.navigateFilesPath('/archive/')

    expect(navigationModel.filesPath()).toBe('/')
    expect(navigationModel.snapshot().files?.document).toEqual({kind: 'markdown', fileId: 5})
    expect(markdownPreviewModel.pendingCloseIntent()).toMatchObject({
      navigationKind: 'path-change',
      fileId: 5,
    })

    markdownPreviewModel.discardPendingCloseIntent()

    expect(navigationModel.filesPath()).toBe('/archive/')
    expect(navigationModel.snapshot().files?.document).toBeUndefined()
  })

  it('pauses surface changes and resumes after save confirmation', async () => {
    const save = vi.spyOn(markdownPreviewModel, 'save').mockResolvedValue(true)
    openDirtyMarkdown()

    navigationModel.navigateToSurface('passwords')

    expect(navigationModel.currentSurface()).toBe('files')
    expect(markdownPreviewModel.pendingCloseIntent()).toMatchObject({
      navigationKind: 'surface-change',
      fileId: 5,
    })

    await markdownPreviewModel.savePendingCloseIntent()

    expect(save).toHaveBeenCalledTimes(1)
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(markdownPreviewModel.pendingCloseIntent()).toBeNull()
  })

  it('pauses browser back and resumes the original history traversal', () => {
    const tracker = installHistoryTracker()
    openDirtyMarkdown()

    window.history.back()

    expect(tracker.backSpy).toHaveBeenCalledTimes(1)
    expect(tracker.goSpy).toHaveBeenCalledWith(1)
    expect(navigationModel.snapshot().files?.document).toEqual({kind: 'markdown', fileId: 5})
    expect(markdownPreviewModel.pendingCloseIntent()).toMatchObject({
      navigationKind: 'history-pop',
      fileId: 5,
    })

    markdownPreviewModel.discardPendingCloseIntent()

    expect(tracker.goSpy).toHaveBeenLastCalledWith(-1)
    expect(navigationModel.snapshot().files?.document).toBeUndefined()
  })

  it('pauses mobile UI back fallback until dirty changes are discarded', () => {
    navigationModel.openMarkdownDocument(5, 'replace')
    markdownPreviewModel.state.set(readyState({fileId: 5, dirty: true}))

    expect(navigationModel.goBackFromUi()).toBe(true)

    expect(navigationModel.snapshot().files?.document).toEqual({kind: 'markdown', fileId: 5})
    expect(markdownPreviewModel.pendingCloseIntent()).toMatchObject({
      navigationKind: 'ui-back',
      fileId: 5,
    })

    markdownPreviewModel.discardPendingCloseIntent()

    expect(navigationModel.snapshot().files?.document).toBeUndefined()
  })

  it('pauses Android system back even when the Markdown editor textarea is focused', () => {
    navigationModel.openMarkdownDocument(5, 'replace')
    markdownPreviewModel.state.set(readyState({fileId: 5, dirty: true}))
    const textarea = document.createElement('textarea')
    document.body.append(textarea)
    textarea.focus()

    expect(androidSystemBackModel.handleBack()).toBe(true)

    expect(navigationModel.snapshot().files?.document).toEqual({kind: 'markdown', fileId: 5})
    expect(markdownPreviewModel.pendingCloseIntent()).toMatchObject({
      navigationKind: 'ui-back',
      fileId: 5,
    })
  })
})
