import {state} from '@statx/core'

import {afterEach, describe, expect, it, vi} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {ChromVoidApp} from '../../src/routes/app.route'
import {ChromVoidAppModel} from '../../src/routes/app.route.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

type RouteName = 'dashboard' | 'welcome' | 'no-connection' | 'no-license'

type HistoryEntry = {
  state: unknown
  url: string
}

type TestStore = {
  layoutMode: ReturnType<typeof state<'mobile' | 'desktop'>>
  sidebarOpen: ReturnType<typeof state<boolean>>
  setSidebarOpen: (next: boolean) => void
  showRemoteStoragePage: ReturnType<typeof state<boolean>>
  showRemotePage: ReturnType<typeof state<boolean>>
  showGatewayPage: ReturnType<typeof state<boolean>>
  showSettingsPage: ReturnType<typeof state<boolean>>
  showNetworkPairPage: ReturnType<typeof state<boolean>>
  isShowPasswordManager: ReturnType<typeof state<boolean>>
  detailsPanelFileId: ReturnType<typeof state<number | null>>
  currentPath: ReturnType<typeof state<string>>
  openDetailsPanel: (fileId: number) => void
  closeDetailsPanel: () => void
}

function setupContext() {
  navigationModel.disconnect()
  window.history.replaceState({}, '', '/dashboard?surface=files&path=%2F')
  const store: TestStore = {
    layoutMode: state<'mobile' | 'desktop'>('mobile'),
    sidebarOpen: state(false),
    setSidebarOpen(next: boolean) {
      store.sidebarOpen.set(next)
    },
    showRemoteStoragePage: state(false),
    showRemotePage: state(false),
    showGatewayPage: state(false),
    showSettingsPage: state(false),
    showNetworkPairPage: state(false),
    isShowPasswordManager: state(false),
    detailsPanelFileId: state<number | null>(null),
    currentPath: state('/'),
    openDetailsPanel(fileId: number) {
      store.detailsPanelFileId.set(fileId)
    },
    closeDetailsPanel() {
      store.detailsPanelFileId.set(null)
    },
  }

  initAppContext(
    createMockAppContext({
      store: {
        ...store,
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

  afterEach(() => {
    navigationModel.disconnect()
    clearAppContext()
    ;(window as any).router = originalRouter
    window.passmanager = originalPassmanager
    vi.restoreAllMocks()
  })

  function setRoute(route: RouteName) {
    originalRouter = (window as any).router
    ;(window as any).router = {route: () => route}
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

    expect(model.handleMobileBack(null)).toBe(true)
    expect(handleBack).toHaveBeenCalledTimes(1)
    expect(historyBackSpy).not.toHaveBeenCalled()

    historyBackSpy.mockRestore()
    unregister()
  })

  it('falls through to browser history for durable passwords routes', async () => {
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

    expect(model.handleMobileBack(null)).toBe(true)
    expect(handleBack).toHaveBeenCalledTimes(1)
    expect(historyBackSpy).toHaveBeenCalledTimes(1)

    historyBackSpy.mockRestore()
    unregister()
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
    expect(model.handleMobileBack(null)).toBe(true)
    expect(history.backSpy).toHaveBeenCalledTimes(1)
    expect(history.pushStateSpy).toHaveBeenCalled()
    expect(history.replaceStateSpy).toHaveBeenCalled()
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'group', groupPath: 'Group A'})
    expect(window.location.search).toContain('pm=group')
    expect(window.location.search).not.toContain('pm=create-entry')
  })

  it('returns to the previous durable route instead of entry-edit after saving edits', async () => {
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
    navigationModel.openPassmanagerRoute({kind: 'entry-edit', entryId: 'entry-a', groupPath: 'Group A'})

    root.isEditMode.set(false)
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
    expect(model.handleMobileBack(null)).toBe(true)
    expect(history.backSpy).toHaveBeenCalledTimes(1)
    expect(history.pushStateSpy).toHaveBeenCalled()
    expect(history.replaceStateSpy).toHaveBeenCalled()
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'group', groupPath: 'Group A'})
    expect(window.location.search).toContain('pm=group')
    expect(window.location.search).not.toContain('pm=entry-edit')
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
    expect(model.handleMobileBack(null)).toBe(true)
    expect(history.backSpy).toHaveBeenCalledTimes(1)
    expect(history.pushStateSpy).toHaveBeenCalled()
    expect(history.replaceStateSpy).toHaveBeenCalled()
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'group', groupPath: 'Group A'})
    expect(window.location.search).toContain('pm=group')
    expect(window.location.search).toContain('group=Group+A')
    expect(window.location.search).not.toContain('pm=create-group')
  })
})
