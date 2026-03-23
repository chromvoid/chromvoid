import {state} from '@statx/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

function setupContext() {
  const detailsPanelFileId = state<number | null>(null)
  const currentPath = state('/')
  const showRemoteStoragePage = state(false)
  const showRemotePage = state(false)
  const showGatewayPage = state(false)
  const showSettingsPage = state(false)
  const showNetworkPairPage = state(false)
  const isShowPasswordManager = state(false)

  initAppContext(
    createMockAppContext({
      store: {
        detailsPanelFileId,
        currentPath,
        showRemoteStoragePage,
        showRemotePage,
        showGatewayPage,
        showSettingsPage,
        showNetworkPairPage,
        isShowPasswordManager,
      } as any,
    }),
  )

  return {
    currentPath,
    showRemoteStoragePage,
    showRemotePage,
    showGatewayPage,
    showSettingsPage,
    showNetworkPairPage,
    isShowPasswordManager,
  }
}

describe('NavigationModel back behavior', () => {
  let ctx: ReturnType<typeof setupContext>

  beforeEach(() => {
    clearAppContext()
    navigationModel.disconnect()
    window.history.replaceState({}, '', '/dashboard?layout=mobile&surface=files&path=%2F')
    ctx = setupContext()
    navigationModel.connect()
  })

  afterEach(() => {
    navigationModel.disconnect()
    clearAppContext()
  })

  it('falls back to the parent files path when there is no browser history entry', () => {
    navigationModel.navigateFilesPath('/vault/inner/', 'replace')

    expect(navigationModel.goBack()).toBe(true)
    expect(navigationModel.filesPath()).toBe('/vault/')
  })

  it('updates surface adapter flags when navigating to secondary surfaces', () => {
    navigationModel.navigateToSurface('settings')
    expect(navigationModel.currentSurface()).toBe('settings')
    expect(ctx.showSettingsPage()).toBe(true)

    navigationModel.navigateToSurface('remote')
    expect(navigationModel.currentSurface()).toBe('remote')
    expect(ctx.showRemotePage()).toBe(true)
    expect(ctx.showSettingsPage()).toBe(false)
  })

  it('keeps transient surfaces active when their back handler consumes the event', () => {
    navigationModel.navigateToSurface('remote-storage')
    const handled = vi.fn(() => true)
    const unregister = navigationModel.registerSurfaceBackHandler('remote-storage', handled)

    expect(navigationModel.goBack()).toBe(true)
    expect(handled).toHaveBeenCalledTimes(1)
    expect(navigationModel.currentSurface()).toBe('remote-storage')

    unregister()
  })

  it('returns false on the root files surface when nothing can handle back', () => {
    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.goBack()).toBe(false)
  })
})
