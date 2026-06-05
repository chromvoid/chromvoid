import {afterEach, describe, expect, it, vi} from 'vitest'
import {render} from 'lit'

import {Entry, Group, ManagerRoot, filterValue, quickFilters} from '@project/passmanager'
import {ClientCatalogNode} from '../../src/core/catalog/local-catalog/client-model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import * as bootstrap from '../../src/app/bootstrap/Initialize'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {FileManager} from '../../src/features/file-manager/file-manager'
import {getFileManagerModel} from '../../src/features/file-manager/file-manager.model'
import {markdownDocumentRenameModel} from '../../src/features/file-manager/models/markdown-document-rename.model'
import {
  markdownPreviewModel,
  type MarkdownPreviewReadyState,
} from '../../src/features/file-manager/models/markdown-preview.model'
import {mediaPlaybackModel} from '../../src/features/media/models/media-playback.model'
import {PasswordManagerMobileLayout} from '../../src/features/passmanager/components/password-manager-layout/password-manager-mobile-layout'
import {groupBy, sortDirection, sortField} from '../../src/features/passmanager/components/list/sort-controls'
import {pmMobileChromeModel} from '../../src/features/passmanager/models/pm-mobile-chrome.model'
import {pmSelectionModeModel} from '../../src/features/passmanager/models/pm-selection-mode.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {pmModel} from '../../src/features/passmanager/password-manager.model'
import {i18n as passmanagerI18n, setPasswordManagerLang} from '@project/passmanager/i18n'
import {ChromVoidApp} from '../../src/routes/app.route'
import {ChromVoidAppModel} from '../../src/routes/app.route.model'
import {atom} from '@reatom/core'
import {i18n as appI18n, setLang as setAppLang} from '../../src/i18n'
import type {SearchFilters} from '../../src/shared/contracts/file-manager'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {remoteStorageModel} from '../../src/routes/remote-storage/remote-storage.model'

type RouteName = 'dashboard' | 'welcome' | 'no-connection' | 'no-license'

type HistoryEntry = {
  state: unknown
  url: string
}

type TestStore = {
  layoutMode: ReturnType<typeof atom<'mobile' | 'desktop'>>
  sidebarOpen: ReturnType<typeof atom<boolean>>
  dualPaneMode: ReturnType<typeof atom<boolean>>
  theme: ReturnType<typeof atom<string>>
  wsStatus: ReturnType<typeof atom<'connected' | 'connecting' | 'disconnected' | 'error'>>
  catalogStatus: ReturnType<typeof atom<'idle' | 'syncing' | 'loading' | 'error'>>
  statusMessage: ReturnType<typeof atom<string>>
  lastErrorMessage: ReturnType<typeof atom<string | null>>
  setSidebarOpen: (next: boolean) => void
  setLayoutQueryParam: (next: string) => void
  showRemoteStoragePage: ReturnType<typeof atom<boolean>>
  showRemotePage: ReturnType<typeof atom<boolean>>
  showGatewayPage: ReturnType<typeof atom<boolean>>
  showSettingsPage: ReturnType<typeof atom<boolean>>
  isShowPasswordManager: ReturnType<typeof atom<boolean>>
  detailsPanelFileId: ReturnType<typeof atom<number | null>>
  searchFilters: ReturnType<typeof atom<SearchFilters>>
  currentPath: ReturnType<typeof atom<string>>
  selectedNodeIds: ReturnType<typeof atom<number[]>>
  selectionMode: ReturnType<typeof atom<boolean>>
  uploadTasks: ReturnType<typeof atom<unknown[]>>
  remoteSessionState: ReturnType<typeof atom<'inactive' | 'ready'>>
  setSelectionMode: (enabled: boolean) => void
  setSelectedItems: (nodeIds: number[]) => void
  setSearchFilters: (next: SearchFilters) => void
  getUploadStats: () => {total: number; uploading: number; completed: number; failed: number}
  clearCompletedUploadTasks: () => void
  clearLastError: () => void
  toggleSelectionMode: () => void
  openDetailsPanel: (fileId: number) => void
  closeDetailsPanel: () => void
}

function createCatalogNode(
  overrides: Partial<{
    nodeId: number
    nodeType: number
    name: string
    size: number
    modtime: number
    isDir: boolean
    isFile: boolean
    isSymlink: boolean
    hasChildren: boolean
    path: string
    mimeType?: string
  }> = {},
) {
  return new ClientCatalogNode({
    nodeId: overrides.nodeId ?? 1,
    nodeType: overrides.nodeType ?? 1,
    name: overrides.name ?? 'file.txt',
    size: overrides.size ?? 0,
    modtime: overrides.modtime ?? Date.now(),
    isDir: overrides.isDir ?? false,
    isFile: overrides.isFile ?? !(overrides.isDir ?? false),
    isSymlink: overrides.isSymlink ?? false,
    hasChildren: overrides.hasChildren ?? false,
    path: overrides.path ?? '/file.txt',
    ...(overrides.mimeType ? {mimeType: overrides.mimeType} : {}),
  })
}

function setupContext(options?: {catalogChildren?: ClientCatalogNode[]}) {
  navigationModel.disconnect()
  window.history.replaceState({}, '', '/dashboard?surface=files&path=%2F')
  const store: TestStore = {
    layoutMode: atom<'mobile' | 'desktop'>('mobile'),
    sidebarOpen: atom(false),
    dualPaneMode: atom(false),
    theme: atom('dark'),
    wsStatus: atom<'connected' | 'connecting' | 'disconnected' | 'error'>('connected'),
    catalogStatus: atom<'idle' | 'syncing' | 'loading' | 'error'>('idle'),
    statusMessage: atom('Ready'),
    lastErrorMessage: atom<string | null>(null),
    setSidebarOpen(next: boolean) {
      store.sidebarOpen.set(next)
    },
    setLayoutQueryParam(_next: string) {},
    showRemoteStoragePage: atom(false),
    showRemotePage: atom(false),
    showGatewayPage: atom(false),
    showSettingsPage: atom(false),
    isShowPasswordManager: atom(false),
    detailsPanelFileId: atom<number | null>(null),
    searchFilters: atom<SearchFilters>({
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    }),
    currentPath: atom('/'),
    selectedNodeIds: atom<number[]>([]),
    selectionMode: atom(false),
    uploadTasks: atom<unknown[]>([]),
    remoteSessionState: atom<'inactive' | 'ready'>('inactive'),
    setSelectionMode(enabled: boolean) {
      store.selectionMode.set(enabled)
      if (!enabled) {
        store.selectedNodeIds.set([])
      }
    },
    setSelectedItems(nodeIds: number[]) {
      store.selectedNodeIds.set(nodeIds)
    },
    setSearchFilters(next: SearchFilters) {
      store.searchFilters.set(next)
    },
    getUploadStats() {
      return {total: 0, uploading: 0, completed: 0, failed: 0}
    },
    clearCompletedUploadTasks() {},
    clearLastError() {
      store.lastErrorMessage.set(null)
    },
    toggleSelectionMode() {
      store.setSelectionMode(!store.selectionMode())
    },
    openDetailsPanel(fileId: number) {
      store.detailsPanelFileId.set(fileId)
    },
    closeDetailsPanel() {
      store.detailsPanelFileId.set(null)
    },
  }

  initAppContext(
    createMockAppContext({
      ws: {
        kind: 'mock',
        connected: atom(true),
        connecting: atom(false),
        lastError: atom<string | undefined>(undefined),
      } as any,
      store: {
        ...store,
      } as any,
      catalog: {
        catalog: {
          getChildren: () => options?.catalogChildren ?? [],
        },
      } as any,
      state: {
        data: atom({}),
      } as any,
    }),
  )

  return store
}

function createGroup(id: string, name: string) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(parent: Group, id: string, title: string) {
  return new Entry(parent, {
    id,
    title,
    urls: [],
    username: '',
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: [],
  } as any)
}

function readyMarkdownState(overrides: Partial<MarkdownPreviewReadyState> = {}): MarkdownPreviewReadyState {
  const source = overrides.source ?? '# Notes'
  const baseline = overrides.baseline ?? '# Notes'
  return {
    kind: 'ready',
    fileId: 293,
    fileName: 'USER.md',
    size: 7,
    mimeType: 'text/markdown',
    lastModified: 123,
    source,
    baseline,
    sourceRevision: 11,
    baselineSourceRevision: 11,
    mode: 'preview',
    dirty: source !== baseline,
    saving: false,
    formatting: false,
    stale: false,
    renderedHtml: '<h1>User</h1>',
    errorKey: null,
    readOnlyReasonKey: null,
    lastSavedAt: null,
    autosavePending: false,
    lastAutosaveAttemptAt: null,
    ...overrides,
  }
}

function installClipboardInvokeSpy() {
  const invoke = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {invoke},
  })
  return invoke
}

type FakePassmanager = {
  id: string
  showElement: ReturnType<typeof atom<any>>
  isEditMode: ReturnType<typeof atom<boolean>>
  isLoading: ReturnType<typeof atom<boolean>>
  isReadOnly: ReturnType<typeof atom<boolean>>
  getCardByID: (id: string) => Entry | Group | undefined
}

function createPassmanager(initialShowElement: unknown, items: Array<Entry | Group>): FakePassmanager {
  return {
    id: 'pm-app-route-mobile-back-test',
    showElement: atom<any>(initialShowElement),
    isEditMode: atom(false),
    isLoading: atom(false),
    isReadOnly: atom(false),
    getCardByID: (id: string) => items.find((item) => item.id === id),
  }
}

function installHistoryTracker() {
  const originalPushState = window.history.pushState.bind(window.history)
  const originalReplaceState = window.history.replaceState.bind(window.history)
  const entries: HistoryEntry[] = [{state: window.history.state, url: window.location.href}]
  let index = 0

  const resolveUrl = (nextUrl?: string | URL | null) =>
    new URL(nextUrl == null ? window.location.href : String(nextUrl), window.location.href).toString()

  const pushStateSpy = vi
    .spyOn(window.history, 'pushState')
    .mockImplementation((state: unknown, unused: string, nextUrl?: string | URL | null) => {
      const resolvedUrl = resolveUrl(nextUrl)
      index += 1
      entries.splice(index)
      entries[index] = {state, url: resolvedUrl}
      originalPushState(state, unused, resolvedUrl)
    })

  const replaceStateSpy = vi
    .spyOn(window.history, 'replaceState')
    .mockImplementation((state: unknown, unused: string, nextUrl?: string | URL | null) => {
      const resolvedUrl = resolveUrl(nextUrl)
      entries[index] = {state, url: resolvedUrl}
      originalReplaceState(state, unused, resolvedUrl)
    })

  const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
    if (index === 0) {
      return
    }

    index -= 1
    const previous = entries[index]
    originalReplaceState(previous.state, '', previous.url)
    window.dispatchEvent(new PopStateEvent('popstate', {state: previous.state as any}))
  })

  return {
    backSpy,
    pushStateSpy,
    replaceStateSpy,
  }
}

async function flushNavigationSync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('ChromVoidApp mobile toolbar resolver', () => {
  let originalRouter: unknown
  let originalPassmanager: typeof window.passmanager
  let defined = false

  afterEach(async () => {
    navigationModel.disconnect()
    await mediaPlaybackModel.stopSession()
    pmModel.alive.set(false)
    pmSelectionModeModel.exit()
    filterValue.set('')
    quickFilters.set([])
    sortField.set('name')
    sortDirection.set('asc')
    groupBy.set('none')
    pmMobileChromeModel.closeSortGroupSheet()
    remoteStorageModel.cancelWizard()
    remoteStorageModel.transferStep.set('idle')
    markdownDocumentRenameModel.reset()
    markdownPreviewModel.cleanup()
    resetRuntimeCapabilities()
    setAppLang('en')
    setPasswordManagerLang('en')
    document.body.innerHTML = ''
    clearAppContext()
    setPassmanagerRoot(undefined)
    delete (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
    ;(window as any).router = originalRouter
    window.passmanager = originalPassmanager
    vi.restoreAllMocks()
  })

  function setRoute(route: RouteName) {
    originalRouter = (window as any).router
    const routeAccessor = Object.assign(() => route, {
      subscribe: () => () => {},
    })
    ;(window as any).router = {route: routeAccessor}
  }

  function createApp() {
    if (!defined) {
      ChromVoidApp.define()
      defined = true
    }
    return document.createElement('chromvoid-app') as ChromVoidApp
  }

  it('hides toolbar on non-dashboard routes', () => {
    setupContext()
    setRoute('welcome')
    const app = createApp()

    const state = (app as any).getMobileToolbarState('welcome')
    expect(state.show).toBe(false)
    expect(state.leading).toBe('none')
  })

  it('prioritizes route pages over password manager when both flags are set', () => {
    const store = setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('settings')
    store.isShowPasswordManager.set(true)

    const app = createApp()
    const state = (app as any).getMobileToolbarState('dashboard')

    expect(state.show).toBe(true)
    expect(state.title).toBe('Settings')
    expect(state.leading).toBe('menu')
    expect(state.showCommand).toBe(false)
  })

  it('localizes route surface titles in the mobile toolbar', () => {
    setupContext()
    setRoute('dashboard')
    setAppLang('ru')
    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    navigationModel.navigateToSurface('remote')
    expect(model.getMobileToolbarState('dashboard').title).toBe('Удалённый доступ')

    navigationModel.navigateToSurface('settings')
    expect(model.getMobileToolbarState('dashboard').title).toBe('Настройки')

    navigationModel.navigateToSurface('gateway')
    expect(model.getMobileToolbarState('dashboard').title).toBe('Расширения')
  })

  it('localizes Pro access state copy', () => {
    setupContext()
    setRoute('dashboard')
    setAppLang('ru')

    const app = createApp()
    const host = document.createElement('div')
    render(
      (app as any).renderModuleAccessState('remote', {
        feature_key: 'remote',
        status: 'locked_pro',
        denial_code: 'PRO_REQUIRED',
      }),
      host,
    )

    expect(host.textContent).toContain('Требуется Pro-лицензия')
    expect(host.textContent).toContain('Активируйте Pro-лицензию в настройках')
    expect(host.textContent).toContain('Настройки')
  })

  it('shows files toolbar actions even before file manager provider is mounted', () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('files')

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    const state = model.getMobileToolbarState('dashboard')

    expect(state.title).toBe('Files')
    expect(state.maxVisible).toBe(3)
    expect(state.overflowFromIndex).toBe(0)
    expect(state.actions).toEqual([
      {id: 'create-note', icon: 'book-plus', label: 'Create note'},
      {id: 'create-dir', icon: 'folder-plus', label: 'Create folder'},
      {id: 'upload', icon: 'upload', label: 'Upload files'},
    ])
  })

  it('uses the Notes surface as a mobile toolbar context with create note action', () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('notes')
    const fileManagerModel = getFileManagerModel()
    const executeMobileCommand = vi.spyOn(fileManagerModel, 'executeMobileCommand').mockReturnValue(true)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    const state = model.getMobileToolbarState('dashboard')

    expect(state.title).toBe('Notes')
    expect(state.subtitle).toBe('Markdown files across Files')
    expect(state.leading).toBe('menu')
    expect(state.showCommand).toBe(true)
    expect(state.actions).toEqual([
      {id: 'create-note', icon: 'book-plus', label: 'Create note'},
    ])
    expect(state.executeAction?.('create-note')).toBe(true)
    expect(executeMobileCommand).toHaveBeenCalledWith('create-note')
  })

  it('uses surface-owned mobile shell scrolling on the Notes surface', async () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('notes')

    const app = createApp()
    document.body.append(app)
    await app.updateComplete

    const shell = app.shadowRoot?.querySelector('file-app-shell') as
      | (HTMLElement & {contentScrollMode?: string; updateComplete?: Promise<unknown>})
      | null
    await shell?.updateComplete

    const layout = shell?.shadowRoot?.querySelector('file-app-shell-mobile-layout') as
      | (HTMLElement & {contentScrollMode?: string})
      | null

    expect(shell?.contentScrollMode).toBe('surface')
    expect(layout?.contentScrollMode).toBe('surface')
  })

  it('uses surface-owned mobile shell scrolling on the Passkeys surface', async () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('passkeys')

    const app = createApp()
    document.body.append(app)
    await app.updateComplete

    const shell = app.shadowRoot?.querySelector('file-app-shell') as
      | (HTMLElement & {contentScrollMode?: string; updateComplete?: Promise<unknown>})
      | null
    await shell?.updateComplete

    const layout = shell?.shadowRoot?.querySelector('file-app-shell-mobile-layout') as
      | (HTMLElement & {contentScrollMode?: string})
      | null

    expect(shell?.contentScrollMode).toBe('surface')
    expect(layout?.contentScrollMode).toBe('surface')
  })

  it('renders Markdown document page instead of the file manager for Markdown document routes', async () => {
    vi.spyOn(bootstrap, 'init').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    setupContext({
      catalogChildren: [
        createCatalogNode({
          nodeId: 7,
          name: 'notes.md',
          path: '/notes.md',
          mimeType: 'text/markdown',
        }),
      ],
    })
    const app = createApp()
    document.body.append(app)
    await flushNavigationSync()

    navigationModel.openMarkdownDocument(7, 'replace')
    await flushNavigationSync()
    await app.updateComplete

    expect(app.shadowRoot?.querySelector('markdown-document-page')).not.toBeNull()
    expect(app.shadowRoot?.querySelector('chromvoid-file-manager')).toBeNull()
  })

  it('uses the current Markdown document as the mobile toolbar context', async () => {
    setRuntimeCapabilities({platform: 'android', mobile: true, supports_native_share: true})
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      writable: true,
      value: {invoke: vi.fn()},
    })
    setupContext({
      catalogChildren: [
        createCatalogNode({
          nodeId: 293,
          name: 'USER.md',
          path: '/USER.md',
          mimeType: 'text/markdown',
          modtime: 123,
        }),
      ],
    })
    setRoute('dashboard')
    navigationModel.openMarkdownDocument(293, 'replace')
    markdownPreviewModel.state.set(
      readyMarkdownState({
        source: '# Changed',
        baseline: '# Notes',
        dirty: true,
      }),
    )

    const fileManagerModel = getFileManagerModel()
    const format = vi.spyOn(markdownPreviewModel, 'formatDocument').mockResolvedValue(true)
    const undo = vi.spyOn(markdownPreviewModel, 'undo').mockReturnValue(true)
    const redo = vi.spyOn(markdownPreviewModel, 'redo').mockReturnValue(false)
    const requestImagePicker = vi.spyOn(markdownPreviewModel, 'requestImagePicker').mockReturnValue(true)
    vi.spyOn(markdownPreviewModel, 'canUndo').mockReturnValue(true)
    vi.spyOn(markdownPreviewModel, 'canRedo').mockReturnValue(false)
    const rename = vi.spyOn(markdownDocumentRenameModel, 'openRenameDialog').mockResolvedValue(true)
    const share = vi.spyOn(fileManagerModel, 'shareFileById').mockResolvedValue()
    const model = new ChromVoidAppModel()

    const state = model.getMobileToolbarState('dashboard')

    expect(state.title).toBe('USER.md')
    expect(state.leading).toBe('back')
    expect(state.showCommand).toBe(false)
    expect(state.overflowFromIndex).toBe(2)
    expect(state.actions.map((action) => action.id)).toEqual([
      'markdown-insert-image',
      'markdown-undo',
      'markdown-redo',
      'markdown-format',
      'markdown-rename',
      'markdown-share',
    ])
    expect(state.actions.find((action) => action.id === 'markdown-insert-image')?.disabled).toBe(false)
    expect(state.actions.find((action) => action.id === 'markdown-insert-image')?.active).toBe(false)
    expect(state.actions.find((action) => action.id === 'markdown-undo')?.disabled).toBe(false)
    expect(state.actions.find((action) => action.id === 'markdown-redo')?.disabled).toBe(true)
    expect(state.actions.find((action) => action.id === 'markdown-rename')?.disabled).toBe(false)
    expect(state.actions.map((action) => action.id)).not.toContain('create-dir')
    expect(state.actions.map((action) => action.id)).not.toContain('create-note')
    expect(state.actions.map((action) => action.id)).not.toContain('upload')

    expect(state.executeAction?.('markdown-insert-image')).toBe(true)
    expect(state.executeAction?.('markdown-undo')).toBe(true)
    expect(state.executeAction?.('markdown-redo')).toBe(false)
    expect(state.executeAction?.('markdown-format')).toBe(true)
    expect(state.executeAction?.('markdown-rename')).toBe(true)
    expect(state.executeAction?.('markdown-share')).toBe(true)

    expect(requestImagePicker).toHaveBeenCalledTimes(1)
    expect(undo).toHaveBeenCalledTimes(1)
    expect(redo).toHaveBeenCalledTimes(1)
    expect(format).toHaveBeenCalledTimes(1)
    expect(rename).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 293,
        fileName: 'USER.md',
      }),
    )
    expect(share).toHaveBeenCalledWith({
      fileId: 293,
      fileName: 'USER.md',
      mimeType: 'text/markdown',
      lastModified: 123,
    })
  })

  it('disables Markdown mobile note actions while image insertion is unavailable', () => {
    setRuntimeCapabilities({platform: 'android', mobile: true})
    setupContext({
      catalogChildren: [
        createCatalogNode({
          nodeId: 293,
          name: 'USER.md',
          path: '/USER.md',
          mimeType: 'text/markdown',
          modtime: 123,
        }),
      ],
    })
    setRoute('dashboard')
    navigationModel.openMarkdownDocument(293, 'replace')
    markdownPreviewModel.state.set(
      readyMarkdownState({
        saving: true,
      }),
    )

    const state = new ChromVoidAppModel().getMobileToolbarState('dashboard')

    expect(state.actions.find((action) => action.id === 'markdown-insert-image')?.disabled).toBe(true)
    expect(state.actions.find((action) => action.id === 'markdown-rename')?.disabled).toBe(true)

    markdownPreviewModel.state.set(
      readyMarkdownState({
        readOnlyReasonKey: 'markdown:read-only:save-unavailable',
      }),
    )
    const readOnlyState = new ChromVoidAppModel().getMobileToolbarState('dashboard')
    expect(readOnlyState.actions.find((action) => action.id === 'markdown-insert-image')?.disabled).toBe(
      true,
    )

    markdownPreviewModel.state.set(readyMarkdownState())
    markdownPreviewModel.imageAttaching.set(true)
    const attachingState = new ChromVoidAppModel().getMobileToolbarState('dashboard')
    const insertImage = attachingState.actions.find((action) => action.id === 'markdown-insert-image')
    expect(insertImage?.disabled).toBe(true)
    expect(insertImage?.active).toBe(true)
    expect(insertImage?.label).toBe('Attaching image')
  })

  it('localizes passwords fallback title and section labels as Credentials / Пароли', () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('passwords')
    pmModel.alive.set(false)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    setAppLang('en')
    setPasswordManagerLang('en')
    expect(appI18n('navigation:passwords')).toBe('Credentials')
    expect(appI18n('command-bar:go-to-passwords')).toBe('Go to Credentials')
    expect(passmanagerI18n('root:title')).toBe('Credentials')
    expect(model.getMobileToolbarState('dashboard').title).toBe('Credentials')

    setAppLang('ru')
    setPasswordManagerLang('ru')
    expect(appI18n('navigation:passwords')).toBe('Пароли')
    expect(appI18n('command-bar:go-to-passwords')).toBe('Перейти к паролям')
    expect(passmanagerI18n('root:title')).toBe('Пароли')
    expect(model.getMobileToolbarState('dashboard').title).toBe('Пароли')
  })

  it('shows a reset action in the files toolbar when search filters are active', () => {
    const store = setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('files')
    store.searchFilters.set({
      query: 'report',
      sortBy: 'date',
      sortDirection: 'desc',
      viewMode: 'grid',
      showHidden: true,
      fileTypes: ['documents'],
    })

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    const state = model.getMobileToolbarState('dashboard')

    expect(state.overflowFromIndex).toBe(0)
    expect(state.actions).toEqual([
      {id: 'filters-reset', icon: 'x', label: 'Reset Filters', tone: 'accent'},
      {id: 'create-note', icon: 'book-plus', label: 'Create note'},
      {id: 'create-dir', icon: 'folder-plus', label: 'Create folder'},
      {id: 'upload', icon: 'upload', label: 'Upload files'},
    ])
  })

  it('switches files mobile toolbar into selection context', () => {
    const store = setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('files')
    store.setSelectionMode(true)
    store.selectedNodeIds.set([7])

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    const state = model.getMobileToolbarState('dashboard')

    expect(state.title).toBe('Selected: 1')
    expect(state.leading).toBe('back')
    expect(state.showCommand).toBe(false)
    expect(state.maxVisible).toBe(4)
    expect(state.overflowFromIndex).toBeUndefined()
    expect(state.actions.map((action) => action.id)).toEqual(['selection-done'])
  })

  it('shows passwords toolbar actions even before password manager provider is mounted', () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('passwords')

    const root = new ManagerRoot({} as any)
    pmModel.alive.set(true)
    setPassmanagerRoot(root)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    const state = model.getMobileToolbarState('dashboard')

    expect(state.show).toBe(true)
    expect(state.showCommand).toBe(false)
    expect(state.overflowFromIndex).toBeUndefined()
    expect(state.actions.map((action) => action.id)).toEqual([
      'pm-create-group',
      'pm-create-entry',
    ])
  })

  it('keeps password import toolbar chrome without extra actions', () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('passwords')

    const root = new ManagerRoot({} as any)
    root.showElement.set('importDialog' as any)
    pmModel.alive.set(true)
    setPassmanagerRoot(root)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    const state = model.getMobileToolbarState('dashboard')

    expect(state.show).toBe(true)
    expect(state.title).toBe(passmanagerI18n('import:dialog:title' as never))
    expect(state.leading).toBe('back')
    expect(state.showCommand).toBe(false)
    expect(state.actions).toEqual([])
  })

  it('shows password create-entry toolbar chrome without extra actions', () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('passwords')

    const root = new ManagerRoot({} as any)
    root.showElement.set('createEntry' as any)
    pmModel.alive.set(true)
    setPassmanagerRoot(root)
    navigationModel.openPassmanagerRoute({kind: 'create-entry'})

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    const state = model.getMobileToolbarState('dashboard')

    expect(state.show).toBe(true)
    expect(state.title).toBe(passmanagerI18n('entry:create:title'))
    expect(state.leading).toBe('back')
    expect(state.showCommand).toBe(false)
    expect(state.actions).toEqual([])
  })

  it('shows password create-group toolbar chrome without extra actions', () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('passwords')

    const root = new ManagerRoot({} as any)
    root.showElement.set('createGroup' as any)
    pmModel.alive.set(true)
    setPassmanagerRoot(root)
    navigationModel.openPassmanagerRoute({kind: 'create-group'})

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    const state = model.getMobileToolbarState('dashboard')

    expect(state.show).toBe(true)
    expect(state.title).toBe(passmanagerI18n('group:create:title'))
    expect(state.leading).toBe('back')
    expect(state.showCommand).toBe(false)
    expect(state.actions).toEqual([])
  })

  it('uses the root toolbar chrome on the OTP quick view', () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('passwords')

    const root = new ManagerRoot({} as any)
    root.showElement.set('otpView' as any)
    pmModel.alive.set(true)
    setPassmanagerRoot(root)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    const state = model.getMobileToolbarState('dashboard')

    expect(state.title).toBe(passmanagerI18n('otp:quick_view:title' as never))
    expect(state.leading).toBe('menu')
    expect(state.actions).toEqual([])
  })

  it('shows passwords entry toolbar actions without search and executes copy-all', async () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('passwords')

    const root = new ManagerRoot({
      readEntryPassword: vi.fn().mockResolvedValue('toolbar-password'),
      readEntryNote: vi.fn().mockResolvedValue('toolbar-note'),
    } as any)
    const group = createGroup('entry-toolbar-group', 'Entry Toolbar Group')
    const entry = createEntry(group, 'entry-toolbar-entry', 'Entry Toolbar')
    const invoke = installClipboardInvokeSpy()
    group.entries.set([entry])
    root.entries.set([group])
    root.showElement.set(entry)
    pmModel.alive.set(true)
    setPassmanagerRoot(root)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    const state = model.getMobileToolbarState('dashboard')

    expect(state.leading).toBe('back')
    expect(state.showCommand).toBe(false)
    expect(state.maxVisible).toBe(3)
    expect(state.overflowFromIndex).toBe(2)
    expect(state.actions.map((action) => action.id)).toEqual([
      'pm-entry-copy-all',
      'pm-entry-delete',
      'pm-entry-move',
    ])

    expect(state.executeAction?.('pm-entry-copy-all')).toBe(true)
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'plugin:clipboard-manager|write_text',
        expect.objectContaining({text: expect.stringContaining('Entry Toolbar')}),
      )
    })
  })

  it('returns shell details data for a file details overlay', () => {
    setupContext({
      catalogChildren: [
        createCatalogNode({
          nodeId: 5,
          name: 'notes.md',
          size: 128,
          modtime: 1_717_171_717,
          path: '/notes.md',
          mimeType: 'text/markdown',
        }),
      ],
    })
    setRoute('dashboard')
    navigationModel.navigateToSurface('files', 'replace')
    navigationModel.openDetails(5, 'replace')

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    expect(model.getShellDetailsData()).toEqual({
      id: 5,
      name: 'notes.md',
      size: 128,
      path: '/notes.md',
      lastModified: 1_717_171_717,
      mimeType: 'text/markdown',
    })
  })

  it('closes the details overlay when the selected catalog node is a directory', () => {
    setupContext({
      catalogChildren: [
        createCatalogNode({
          nodeId: 7,
          nodeType: 0,
          name: 'Documents',
          path: '/Documents',
          isDir: true,
          isFile: false,
          hasChildren: true,
        }),
      ],
    })
    setRoute('dashboard')
    navigationModel.navigateToSurface('files', 'replace')
    navigationModel.openDetails(7, 'replace')

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    expect(model.getShellDetailsData()).toBeNull()
    expect(navigationModel.detailsFileId()).toBeNull()
  })

  it('minimizes fullscreen audio and closes an active audio overlay', () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('files')
    navigationModel.openAudio(91)
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([{id: 91, name: 'track.mp3', path: '/track.mp3', mimeType: 'audio/mpeg'}])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.fullPlayerOpen.set(true)

    const closeOverlaySpy = vi.spyOn(navigationModel, 'closeOverlay')

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    model.closeAudioPlayer()

    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(false)
    expect(closeOverlaySpy).toHaveBeenCalledTimes(1)
    expect(navigationModel.snapshot().overlay?.kind).toBe('none')

    closeOverlaySpy.mockRestore()
  })

  it('minimizes fullscreen audio opened outside the audio overlay without navigating', () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('passwords')
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([{id: 91, name: 'track.mp3', path: '/track.mp3', mimeType: 'audio/mpeg'}])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.fullPlayerOpen.set(true)
    const closeOverlaySpy = vi.spyOn(navigationModel, 'closeOverlay')

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    model.closeAudioPlayer()

    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(false)
    expect(closeOverlaySpy).not.toHaveBeenCalled()
    expect(navigationModel.snapshot().surface).toBe('passwords')

    closeOverlaySpy.mockRestore()
  })

  it('mounts the audio bottom sheet when a minimized audio session opens the full player', async () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('files')
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([{id: 91, name: 'track.mp3', path: '/track.mp3', mimeType: 'audio/mpeg'}])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.fullPlayerOpen.set(false)

    const app = createApp()
    document.body.append(app)
    await app.updateComplete

    expect(app.shadowRoot?.querySelector('audio-player')).toBeNull()

    mediaPlaybackModel.openFullPlayer()
    await Promise.resolve()
    await app.updateComplete

    expect(app.shadowRoot?.querySelector('audio-player')).not.toBeNull()

    app.remove()
    await Promise.resolve()
  })

  it('minimizes the audio bottom sheet when the active audio route overlay closes', () => {
    setupContext({
      catalogChildren: [
        createCatalogNode({
          nodeId: 91,
          name: 'track.mp3',
          path: '/track.mp3',
          mimeType: 'audio/mpeg',
        }),
      ],
    })
    setRoute('dashboard')
    navigationModel.navigateToSurface('files')
    navigationModel.openAudio(91, 'replace')
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([{id: 91, name: 'track.mp3', path: '/track.mp3', mimeType: 'audio/mpeg'}])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.fullPlayerOpen.set(true)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    ;(model as any).syncAudioOverlaySession()
    navigationModel.closeOverlay('replace')
    ;(model as any).syncAudioOverlaySession()

    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(false)
  })

  it('keeps the audio route overlay aligned with player track changes', () => {
    setupContext({
      catalogChildren: [
        createCatalogNode({
          nodeId: 91,
          name: 'one.mp3',
          path: '/one.mp3',
          mimeType: 'audio/mpeg',
        }),
        createCatalogNode({
          nodeId: 92,
          name: 'two.mp3',
          path: '/two.mp3',
          mimeType: 'audio/mpeg',
        }),
      ],
    })
    setRoute('dashboard')
    navigationModel.navigateToSurface('files', 'replace')
    navigationModel.openAudio(91, 'replace')
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([
      {id: 91, name: 'one.mp3', path: '/one.mp3', mimeType: 'audio/mpeg'},
      {id: 92, name: 'two.mp3', path: '/two.mp3', mimeType: 'audio/mpeg'},
    ])
    mediaPlaybackModel.currentIndex.set(0)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    mediaPlaybackModel.currentIndex.set(1)
    ;(model as any).syncAudioOverlayFromPlayback()

    expect(navigationModel.snapshot().overlay).toEqual({kind: 'audio', fileId: 92})
    expect(navigationModel.resolvedOverlay()).toMatchObject({
      kind: 'audio',
      fileId: 92,
      index: 1,
    })
  })

  it('keeps an overlay-driven audio switch from bouncing back to the stale player track', async () => {
    setupContext({
      catalogChildren: [
        createCatalogNode({
          nodeId: 22,
          name: 'old.mp3',
          path: '/old.mp3',
          mimeType: 'audio/mpeg',
        }),
        createCatalogNode({
          nodeId: 41,
          name: 'new.mp3',
          path: '/new.mp3',
          mimeType: 'audio/mpeg',
        }),
      ],
    })
    setRoute('dashboard')
    navigationModel.navigateToSurface('files', 'replace')
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([
      {id: 22, name: 'old.mp3', path: '/old.mp3', mimeType: 'audio/mpeg'},
      {id: 41, name: 'new.mp3', path: '/new.mp3', mimeType: 'audio/mpeg'},
    ])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.fullPlayerOpen.set(false)
    navigationModel.openAudio(41, 'replace')

    let resolveStart!: () => void
    const startAudioSession = vi
      .spyOn(mediaPlaybackModel, 'startAudioSession')
      .mockReturnValue(new Promise<void>((resolve) => {
        resolveStart = resolve
      }))
    const openAudio = vi.spyOn(navigationModel, 'openAudio')
    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    ;(model as any).syncAudioOverlaySession()
    ;(model as any).syncAudioOverlayFromPlayback()

    expect(startAudioSession).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({id: 22}),
        expect.objectContaining({id: 41}),
      ]),
      1,
      {autoplay: true},
    )
    expect(openAudio).not.toHaveBeenCalled()
    expect(navigationModel.snapshot().overlay).toEqual({kind: 'audio', fileId: 41})

    resolveStart()
    await flushNavigationSync()
  })

  it('starts a newly opened audio overlay with autoplay intent', () => {
    setupContext({
      catalogChildren: [
        createCatalogNode({
          nodeId: 91,
          name: 'track.mp3',
          path: '/track.mp3',
          mimeType: 'audio/mpeg',
        }),
      ],
    })
    setRoute('dashboard')
    navigationModel.navigateToSurface('files', 'replace')
    navigationModel.openAudio(91, 'replace')

    const startAudioSession = vi.spyOn(mediaPlaybackModel, 'startAudioSession').mockResolvedValue(undefined)
    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    ;(model as any).syncAudioOverlaySession()

    expect(startAudioSession).toHaveBeenCalledWith(
      [expect.objectContaining({id: 91, name: 'track.mp3'})],
      0,
      {autoplay: true},
    )
  })

  it('switches a minimized playing audio session without reopening the audio overlay', () => {
    setupContext({
      catalogChildren: [
        createCatalogNode({
          nodeId: 22,
          name: 'old.mp3',
          path: '/old.mp3',
          mimeType: 'audio/mpeg',
        }),
        createCatalogNode({
          nodeId: 41,
          name: 'new.mp3',
          path: '/new.mp3',
          mimeType: 'audio/mpeg',
        }),
      ],
    })
    setRoute('dashboard')
    navigationModel.navigateToSurface('files', 'replace')
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([
      {id: 22, name: 'old.mp3', path: '/old.mp3', mimeType: 'audio/mpeg'},
      {id: 41, name: 'new.mp3', path: '/new.mp3', mimeType: 'audio/mpeg'},
    ])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.playbackIntent.set('play')
    mediaPlaybackModel.playbackState.set('playing')
    mediaPlaybackModel.fullPlayerOpen.set(false)

    const startAudioSession = vi.spyOn(mediaPlaybackModel, 'startAudioSession').mockResolvedValue(undefined)
    const openAudio = vi.spyOn(navigationModel, 'openAudio')
    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    model.openAudioPlayer(41, 'new.mp3')

    expect(startAudioSession).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({id: 22}),
        expect.objectContaining({id: 41}),
      ]),
      1,
      {autoplay: true, showFullPlayer: false},
    )
    expect(openAudio).not.toHaveBeenCalled()
    expect(navigationModel.snapshot().overlay).toEqual({kind: 'none'})
  })

  it('keeps a minimized audio session while navigating passwords and gallery', () => {
    setupContext({
      catalogChildren: [
        createCatalogNode({
          nodeId: 7,
          name: 'photo.png',
          path: '/photo.png',
          mimeType: 'image/png',
        }),
      ],
    })
    setRoute('dashboard')
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([{id: 91, name: 'track.mp3', path: '/track.mp3', mimeType: 'audio/mpeg'}])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.fullPlayerOpen.set(false)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    navigationModel.navigateToSurface('passwords')
    expect(mediaPlaybackModel.sessionKind()).toBe('audio')

    model.openGallery({fileId: 7})
    expect(mediaPlaybackModel.sessionKind()).toBe('audio')
    expect(navigationModel.snapshot().overlay?.kind).toBe('gallery')
  })

  it('disables shell edge-back while the gallery overlay is open', async () => {
    setupContext({
      catalogChildren: [
        createCatalogNode({
          nodeId: 7,
          name: 'photo.png',
          path: '/photo.png',
          mimeType: 'image/png',
        }),
      ],
    })
    setRoute('dashboard')
    const app = createApp()
    document.body.append(app)
    await app.updateComplete

    const getShell = () =>
      app.shadowRoot?.querySelector('file-app-shell') as
        | (HTMLElement & {edgeBackDisabled?: boolean})
        | null

    expect(getShell()?.edgeBackDisabled).toBe(false)

    navigationModel.openGallery(7)
    await flushNavigationSync()
    await app.updateComplete

    expect(getShell()?.edgeBackDisabled).toBe(true)

    navigationModel.closeOverlay('replace')
    await flushNavigationSync()
    await app.updateComplete

    expect(getShell()?.edgeBackDisabled).toBe(false)
  })

  it('keeps swipe-closing gallery inside the current files path after entering files from another surface', () => {
    setupContext({
      catalogChildren: [
        createCatalogNode({
          nodeId: 7,
          name: 'photo.png',
          path: '/vault/inner/photo.png',
          mimeType: 'image/png',
        }),
      ],
    })
    setRoute('dashboard')
    const history = installHistoryTracker()
    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    navigationModel.navigateToSurface('settings')
    navigationModel.navigateFilesPath('/vault/inner/')
    model.openGallery({fileId: 7})

    expect(navigationModel.snapshot().overlay).toEqual({kind: 'gallery', fileId: 7})

    model.closeGallery({preserveHistoryEntry: true})
    window.history.back()

    expect(history.backSpy).toHaveBeenCalledTimes(1)
    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.filesPath()).toBe('/vault/inner/')
    expect(navigationModel.snapshot().overlay).toEqual({kind: 'none'})
  })

  it('pauses audio when opening video without stopping the session', () => {
    setupContext()
    setRoute('dashboard')
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([{id: 91, name: 'track.mp3', path: '/track.mp3', mimeType: 'audio/mpeg'}])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.playbackIntent.set('play')
    mediaPlaybackModel.playbackState.set('playing')

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    model.openVideoPlayer(15, 'clip.mp4')

    expect(mediaPlaybackModel.sessionKind()).toBe('audio')
    expect(mediaPlaybackModel.playbackIntent()).toBe('pause')
    expect(navigationModel.snapshot().overlay?.kind).toBe('video')
  })

  it('marks passwords search active and keeps sort/group inactive when only search is applied', () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('passwords')

    const root = new ManagerRoot({} as any)
    pmModel.alive.set(true)
    filterValue.set('bank')
    setPassmanagerRoot(root)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    const state = model.getMobileToolbarState('dashboard')

    expect(state.commandActive).toBe(true)
    expect(state.maxVisible).toBe(4)
    expect(state.actions.map((action) => action.id)).toEqual([
      'pm-create-group',
      'pm-create-entry',
      'pm-search-clear-query',
    ])
    expect(state.actions.find((action) => action.id === 'pm-sort-group')).toBeUndefined()
  })

  it('keeps passwords sort/group executable but out of the mobile toolbar', () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('passwords')

    const root = new ManagerRoot({} as any)
    pmModel.alive.set(true)
    groupBy.set('website')
    setPassmanagerRoot(root)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    const state = model.getMobileToolbarState('dashboard')

    expect(state.actions.map((action) => action.id)).toEqual([
      'pm-create-group',
      'pm-create-entry',
      'pm-search-clear-query',
    ])
    expect(state.actions.find((action) => action.id === 'pm-sort-group')).toBeUndefined()
    expect(state.executeAction?.('pm-sort-group')).toBe(true)
    expect(pmMobileChromeModel.sortGroupSheetOpen()).toBe(true)
  })

  it('connect is idempotent for a mounted app model', () => {
    setupContext()
    setRoute('dashboard')

    const initSpy = vi.spyOn(bootstrap, 'init').mockImplementation(() => {})
    const connectSpy = vi.spyOn(navigationModel, 'connect').mockImplementation(() => {})
    vi.spyOn(ChromVoidAppModel.prototype as any, 'setupComponentPreload').mockImplementation(() => {})
    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    model.connect()
    model.connect()

    expect(initSpy).toHaveBeenCalledTimes(1)
    expect(connectSpy).toHaveBeenCalledTimes(1)

    model.disconnect()
  })

  it('does not subscribe to mobileToolbarState just to force rerenders', () => {
    setupContext()
    setRoute('dashboard')

    vi.spyOn(ChromVoidAppModel.prototype as any, 'setupComponentPreload').mockImplementation(() => {})
    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )
    const subscribeSpy = vi.spyOn(model.mobileToolbarState, 'subscribe')

    model.connect()

    expect(subscribeSpy).not.toHaveBeenCalled()

    model.disconnect()
  })

  it('opens search mode from the mobile toolbar command button', () => {
    setupContext()
    setRoute('dashboard')

    const app = createApp()
    const openSpy = vi.fn()
    window.addEventListener('command-bar:open', openSpy as EventListener)

    try {
      ;(app as any).onMobileToolbarCommand()
      expect(openSpy).toHaveBeenCalledTimes(1)
      expect((openSpy.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
        mode: 'search',
        source: 'mobile-toolbar',
      })
    } finally {
      window.removeEventListener('command-bar:open', openSpy as EventListener)
    }
  })

  it('executes files toolbar actions through the shared file-manager model contract', async () => {
    const store = setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('files')
    const model = getFileManagerModel()
    const createNoteSpy = vi.spyOn(model, 'handleCreateMarkdownNote').mockResolvedValue()
    const createDirSpy = vi.spyOn(model, 'handleCreateDir').mockResolvedValue()
    const uploadTrigger = vi.fn()
    const unregisterUploadTrigger = model.registerToolbarUploadTrigger(uploadTrigger)
    const appModel = new ChromVoidAppModel(
      () => {},
      async () => {},
    )
    const state = appModel.getMobileToolbarState('dashboard')

    try {
      expect(state.executeAction?.('create-note')).toBe(true)
      expect(createNoteSpy).toHaveBeenCalledTimes(1)

      expect(state.executeAction?.('create-dir')).toBe(true)
      expect(createDirSpy).toHaveBeenCalledTimes(1)

      expect(state.executeAction?.('upload')).toBe(true)
      expect(uploadTrigger).toHaveBeenCalledTimes(1)

      store.searchFilters.set({
        query: 'report',
        sortBy: 'date',
        sortDirection: 'desc',
        viewMode: 'grid',
        showHidden: true,
        fileTypes: ['documents'],
      })
      expect(state.executeAction?.('filters-reset')).toBe(true)
      expect(store.searchFilters()).toEqual({
        query: '',
        sortBy: 'name',
        sortDirection: 'asc',
        viewMode: 'list',
        showHidden: false,
        fileTypes: [],
      })
    } finally {
      unregisterUploadTrigger()
    }
  })

  it('executes files selection toolbar actions through the shared file-manager model contract', () => {
    const store = setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('files')
    store.setSelectionMode(true)
    store.selectedNodeIds.set([7])

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )
    const state = model.getMobileToolbarState('dashboard')

    expect(state.executeAction?.('selection-done')).toBe(true)
    expect(store.selectionMode()).toBe(false)
    expect(store.selectedNodeIds()).toEqual([])
  })

  it('updates mounted shell toolbar when remote-storage model state changes', async () => {
    setupContext()
    setRoute('dashboard')
    setRuntimeCapabilities({
      supports_volume: true,
      supports_network_remote: true,
    })
    navigationModel.navigateToSurface('remote-storage')
    const app = createApp()
    document.body.append(app)
    await app.updateComplete

    const getToolbar = () =>
      app.shadowRoot?.querySelector('file-app-shell')?.querySelector('mobile-top-toolbar') as
        | (HTMLElement & {title?: string; backDisabled?: boolean})
        | null

    expect(getToolbar()?.title).toBe('Storage')
    expect(getToolbar()?.backDisabled).toBe(false)

    remoteStorageModel.transferStep.set('progress')
    await Promise.resolve()
    await app.updateComplete
    await (getToolbar() as (HTMLElement & {updateComplete?: Promise<unknown>}) | null)?.updateComplete

    expect(getToolbar()?.title).toBe('Export in Progress')
    expect(getToolbar()?.backDisabled).toBe(true)
  })

  it('executes handled passwords toolbar actions without imperative surface invalidation', async () => {
    setupContext()
    setRoute('dashboard')
    vi.spyOn(ChromVoidAppModel.prototype as any, 'connect').mockImplementation(() => {})
    vi.spyOn(ChromVoidAppModel.prototype as any, 'disconnect').mockImplementation(() => {})
    const app = createApp()
    document.body.append(app)
    await app.updateComplete

    navigationModel.navigateToSurface('passwords')

    const shell = app.shadowRoot?.querySelector('file-app-shell')
    expect(shell).not.toBeNull()

    const passwordSurface = document.createElement('password-manager') as HTMLElement & {
      requestUpdate: ReturnType<typeof vi.fn>
    }
    passwordSurface.requestUpdate = vi.fn()

    const layoutSurface = document.createElement('password-manager-mobile-layout') as HTMLElement & {
      requestUpdate: ReturnType<typeof vi.fn>
    }
    layoutSurface.requestUpdate = vi.fn()

    const groupSurface = document.createElement('pm-group-mobile') as HTMLElement & {
      requestUpdate: ReturnType<typeof vi.fn>
    }
    groupSurface.requestUpdate = vi.fn()

    layoutSurface.attachShadow({mode: 'open'}).append(groupSurface)
    passwordSurface.attachShadow({mode: 'open'}).append(layoutSurface)
    shell?.append(passwordSurface)

    const executeAction = vi.fn(() => true)
    vi.spyOn(app as any, 'getMobileToolbarState').mockReturnValue({
      executeAction,
    })
    const appRequestUpdateSpy = vi.spyOn(app, 'requestUpdate')

    ;(app as any).onMobileToolbarAction(
      new CustomEvent('mobile-toolbar-action', {
        detail: {actionId: 'pm-search-clear-query'},
      }),
    )

    expect(executeAction).toHaveBeenCalledWith('pm-search-clear-query')
    expect(appRequestUpdateSpy).not.toHaveBeenCalled()
    expect(passwordSurface.requestUpdate).not.toHaveBeenCalled()
    expect(layoutSurface.requestUpdate).not.toHaveBeenCalled()
    expect(groupSurface.requestUpdate).not.toHaveBeenCalled()
  })

  it('toggles sidebar when menu leading action is triggered twice', () => {
    const store = setupContext()
    setRoute('dashboard')
    const app = createApp()

    expect(store.sidebarOpen()).toBe(false)
    ;(app as any).onMobileToolbarLeading(new CustomEvent('mobile-toolbar-leading', {detail: {mode: 'menu'}}))
    expect(store.sidebarOpen()).toBe(true)
    ;(app as any).onMobileToolbarLeading(new CustomEvent('mobile-toolbar-leading', {detail: {mode: 'menu'}}))
    expect(store.sidebarOpen()).toBe(false)
  })

  it('keeps files selection back handling local through the shared file-manager model contract', async () => {
    const store = setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('files')
    store.setSelectionMode(true)
    store.selectedNodeIds.set([7])

    const fileManagerModel = getFileManagerModel()
    const unregister = navigationModel.registerSurfaceBackHandler('files', () => {
      if (navigationModel.resolvedOverlay().kind !== 'closed') {
        return false
      }

      return fileManagerModel.handleMobileBack()
    })
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    expect(model.handleMobileBack()).toBe(true)
    expect(historyBackSpy).not.toHaveBeenCalled()
    expect(store.selectionMode()).toBe(false)
    expect(store.selectedNodeIds()).toEqual([])

    historyBackSpy.mockRestore()
    unregister()
  })

  it('keeps transient passwords back handling local', async () => {
    setupContext()
    setRoute('dashboard')
    originalPassmanager = window.passmanager
    navigationModel.navigateToSurface('passwords')
    const handleBack = vi.fn(() => true)
    const unregister = navigationModel.registerSurfaceBackHandler('passwords', handleBack)
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    expect(model.handleMobileBack()).toBe(true)
    expect(handleBack).toHaveBeenCalledTimes(1)
    expect(historyBackSpy).not.toHaveBeenCalled()

    historyBackSpy.mockRestore()
    unregister()
  })

  it('does not traverse sibling surface history for mobile UI back at passwords root', async () => {
    setupContext()
    setRoute('dashboard')
    originalPassmanager = window.passmanager
    navigationModel.navigateToSurface('settings')
    navigationModel.navigateToSurface('passwords')
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    expect(model.handleMobileBack()).toBe(false)
    expect(historyBackSpy).not.toHaveBeenCalled()
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'root'})

    historyBackSpy.mockRestore()
  })

  it('uses local hierarchy fallback for durable passwords routes', async () => {
    setupContext()
    setRoute('dashboard')
    originalPassmanager = window.passmanager
    navigationModel.navigateToSurface('passwords')
    navigationModel.openPassmanagerRoute({kind: 'entry', entryId: 'entry-1', groupPath: 'Group A'})
    const handleBack = vi.fn(() => false)
    const unregister = navigationModel.registerSurfaceBackHandler('passwords', handleBack)
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    expect(model.handleMobileBack()).toBe(true)
    expect(handleBack).toHaveBeenCalledTimes(1)
    expect(historyBackSpy).not.toHaveBeenCalled()
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'group', groupPath: 'Group A'})

    historyBackSpy.mockRestore()
    unregister()
  })

  it('keeps passwords selection back handling local through the mounted mobile layout handler', async () => {
    setupContext()
    setRoute('dashboard')
    originalPassmanager = window.passmanager
    navigationModel.navigateToSurface('remote')
    navigationModel.navigateToSurface('passwords')
    navigationModel.openPassmanagerRoute({kind: 'group', groupPath: 'Selection Group'})

    if (!customElements.get('password-manager-mobile-layout')) {
      PasswordManagerMobileLayout.define()
    }

    const group = createGroup('selection-group', 'Selection Group')
    window.passmanager = createPassmanager(group, [group]) as typeof window.passmanager

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.append(layout)
    await layout.updateComplete

    pmSelectionModeModel.enterWithGroup(group.id)
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    expect(pmSelectionModeModel.active()).toBe(true)
    expect(model.handleMobileBack()).toBe(true)
    expect(pmSelectionModeModel.active()).toBe(false)
    expect(window.passmanager?.showElement()).toBe(group)
    expect(historyBackSpy).not.toHaveBeenCalled()

    historyBackSpy.mockRestore()
  })

  it('returns to the previous durable route instead of create-entry after saving a new entry', async () => {
    setupContext()
    setRoute('dashboard')
    originalPassmanager = window.passmanager
    navigationModel.connect()

    const root = new ManagerRoot({} as any)
    const group = createGroup('group-a', 'Group A')
    const entry = createEntry(group, 'entry-a', 'Entry A')

    group.entries.set([entry])
    root.entries.set([group])
    window.passmanager = root
    navigationModel.attachPassmanager(root)

    const history = installHistoryTracker()

    navigationModel.navigateToSurface('passwords')
    navigationModel.openPassmanagerRoute({kind: 'group', groupPath: 'Group A'})
    navigationModel.openPassmanagerRoute({kind: 'create-entry', targetGroupPath: 'Group A'})

    root.showElement.set(entry)
    await flushNavigationSync()

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    expect(navigationModel.snapshot().passwords).toEqual({
      kind: 'entry',
      entryId: 'entry-a',
      groupPath: 'Group A',
    })
    expect(model.handleMobileBack()).toBe(true)
    expect(history.backSpy).not.toHaveBeenCalled()
    expect(history.pushStateSpy).toHaveBeenCalled()
    expect(history.replaceStateSpy).toHaveBeenCalled()
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'group', groupPath: 'Group A'})
    expect(window.location.search).toContain('pm=group')
    expect(window.location.search).not.toContain('pm=create-entry')
  })

  it('returns to the previous durable route instead of create-group after saving a subgroup', async () => {
    setupContext()
    setRoute('dashboard')
    originalPassmanager = window.passmanager
    navigationModel.connect()

    const root = new ManagerRoot({} as any)
    const parentGroup = createGroup('group-parent', 'Group A')
    const childGroup = createGroup('group-child', 'Group A/Subgroup')

    root.entries.set([parentGroup, childGroup])
    window.passmanager = root
    navigationModel.attachPassmanager(root)

    const history = installHistoryTracker()

    navigationModel.navigateToSurface('passwords')
    navigationModel.openPassmanagerRoute({kind: 'group', groupPath: 'Group A'})
    navigationModel.openPassmanagerRoute({kind: 'create-group'})

    root.showElement.set(childGroup)
    await flushNavigationSync()

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )

    expect(navigationModel.snapshot().passwords).toEqual({
      kind: 'group',
      groupPath: 'Group A/Subgroup',
    })
    expect(model.handleMobileBack()).toBe(true)
    expect(history.backSpy).not.toHaveBeenCalled()
    expect(history.pushStateSpy).toHaveBeenCalled()
    expect(history.replaceStateSpy).toHaveBeenCalled()
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'group', groupPath: 'Group A'})
    expect(window.location.search).toContain('pm=group')
    expect(window.location.search).toContain('group=Group+A')
    expect(window.location.search).not.toContain('pm=create-group')
  })

  it('activates a pending Markdown return viewport after returning to the remounted file manager', async () => {
    vi.spyOn(bootstrap, 'init').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    const nodes = Array.from({length: 30}, (_, index) => {
      const id = index + 1
      const label = String(id).padStart(2, '0')
      return createCatalogNode({
        nodeId: id,
        name: `file-${label}.md`,
        path: `/file-${label}.md`,
        mimeType: 'text/markdown',
      })
    })
    setupContext({catalogChildren: nodes})
    setRoute('dashboard')
    FileManager.define()
    const fileManagerModel = getFileManagerModel()
    const clearRestoreSpy = vi.spyOn(fileManagerModel, 'clearFileListViewportRestore')
    const app = createApp()
    document.body.append(app)
    await flushNavigationSync()
    await app.updateComplete

    fileManagerModel.saveFileListViewportSnapshot({
      path: '/',
      viewMode: 'list',
      scrollTop: 1680,
      activeItemId: 1,
      focusItemId: 1,
    })

    await fileManagerModel.handleOpen({
      id: 22,
      path: '/file-22.md',
      name: 'file-22.md',
      mimeType: 'text/markdown',
      isDir: false,
    })
    await flushNavigationSync()
    await app.updateComplete

    expect(app.shadowRoot?.querySelector('markdown-document-page')).not.toBeNull()
    expect(app.shadowRoot?.querySelector('chromvoid-file-manager')).toBeNull()
    expect(fileManagerModel.fileListViewportRestore()).toBeNull()

    navigationModel.closeFilesDocument('replace')
    await flushNavigationSync()
    await app.updateComplete

    expect(app.shadowRoot?.querySelector('chromvoid-file-manager')).not.toBeNull()
    const restore = fileManagerModel.fileListViewportRestore()
    if (restore) {
      expect(restore).toMatchObject({
        path: '/',
        viewMode: 'list',
        scrollTop: 1680,
        activeItemId: 22,
        focusItemId: 22,
        revision: 1,
      })
    } else {
      expect(clearRestoreSpy).toHaveBeenCalledWith(1)
    }
  })
})
