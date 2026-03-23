import {state} from '@statx/core'

import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('root/app/bootstrap/Initialize', () => ({
  init: vi.fn(),
}))

import {ChromVoidAppModel} from '../../src/routes/app.route.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

type RouteName = 'dashboard' | 'welcome' | 'no-connection' | 'no-license'

function setupContext() {
  const store = {
    showRemoteStoragePage: state(false),
    showGatewayPage: state(false),
    showRemotePage: state(false),
    showSettingsPage: state(false),
    showNetworkPairPage: state(false),
    isShowPasswordManager: state(false),
    sidebarOpen: state(false),
    selectedNodeIds: state<number[]>([]),
    setSidebarOpen: vi.fn(),
    setSelectedItems: vi.fn(),
  }

  initAppContext(
    createMockAppContext({
      store: store as never,
    }),
  )

  return store
}

function setRoute(route: RouteName) {
  ;(window as unknown as {router: {route: () => RouteName}}).router = {
    route: () => route,
  }
}

function createTabEvent() {
  return {
    key: 'Tab',
    defaultPrevented: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent
}

describe('ChromVoidAppModel handleKeydown Tab redirect guard', () => {
  const originalRouter = (window as unknown as {router?: unknown}).router

  afterEach(() => {
    clearAppContext()
    ;(window as unknown as {router?: unknown}).router = originalRouter
    vi.restoreAllMocks()
  })

  it('does not run dashboard Tab redirect when password manager is open', () => {
    const store = setupContext()
    setRoute('dashboard')
    store.isShowPasswordManager.set(true)

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )
    const focusRedirectSpy = vi.fn(() => true)
    ;(
      model as unknown as {focusDashboardNewFolderButton: (root: Document) => boolean}
    ).focusDashboardNewFolderButton = focusRedirectSpy

    const event = createTabEvent()
    model.handleKeydown(event, document.body)

    expect(focusRedirectSpy).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('keeps initial Tab redirect on dashboard file-manager context', () => {
    setupContext()
    setRoute('dashboard')

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )
    const focusRedirectSpy = vi.fn(() => true)
    ;(
      model as unknown as {focusDashboardNewFolderButton: (root: Document) => boolean}
    ).focusDashboardNewFolderButton = focusRedirectSpy

    const event = createTabEvent()
    model.handleKeydown(event, document.body)

    expect(focusRedirectSpy).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })
})
