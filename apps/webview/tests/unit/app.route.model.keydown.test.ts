import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('root/app/bootstrap/Initialize', () => ({
  init: vi.fn(),
}))

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {ChromVoidAppModel} from '../../src/routes/app.route.model'
import {atom} from '@reatom/core'
import {clearAppContext, createMockAppContext, getAppContext, initAppContext} from '../../src/shared/services/app-context'

type RouteName = 'dashboard' | 'welcome' | 'no-connection' | 'no-license'

function setupContext() {
  navigationModel.disconnect()
  window.history.replaceState({}, '', '/dashboard?surface=files&path=%2F')

  const store = {
    showRemoteStoragePage: atom(false),
    showGatewayPage: atom(false),
    showRemotePage: atom(false),
    showSettingsPage: atom(false),
    isShowPasswordManager: atom(false),
    sidebarOpen: atom(false),
    selectedNodeIds: atom<number[]>([]),
    setSidebarOpen: vi.fn(),
    setSelectedItems: vi.fn(),
  }

  initAppContext(
    createMockAppContext({
      store: store as never,
    }),
  )

  navigationModel.reset()
  return store
}

function setRoute(route: RouteName) {
  initAppContext(
    createMockAppContext({
      ...getAppContext(),
      router: {
        route: atom(route),
      } as never,
    }),
  )
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
  afterEach(() => {
    navigationModel.disconnect()
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('does not run dashboard Tab redirect when password manager is open', () => {
    setupContext()
    setRoute('dashboard')
    navigationModel.navigateToSurface('passwords')

    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )
    const focusRedirectSpy = vi.fn(() => true)

    const event = createTabEvent()
    model.handleKeydown(event, focusRedirectSpy)

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

    const event = createTabEvent()
    model.handleKeydown(event, focusRedirectSpy)

    expect(focusRedirectSpy).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })
})
