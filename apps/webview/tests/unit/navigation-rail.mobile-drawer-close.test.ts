import {state} from '@statx/core'

import {afterEach, describe, expect, it} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {NavigationRail} from '../../src/features/file-manager/components/navigation-rail'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

type LayoutMode = 'mobile' | 'desktop'

function setupContext(layout: LayoutMode, sidebarOpen = true) {
  const layoutMode = state<LayoutMode>(layout)
  const sidebar = state(sidebarOpen)
  const isShowPasswordManager = state(false)
  const showSettingsPage = state(false)
  const showRemoteStoragePage = state(false)
  const showGatewayPage = state(false)
  const showRemotePage = state(false)
  const showNetworkPairPage = state(false)

  initAppContext(
    createMockAppContext({
      store: {
        layoutMode,
        sidebarOpen: sidebar,
        setSidebarOpen: (next: boolean) => sidebar.set(next),
        isShowPasswordManager,
        showSettingsPage,
        setShowSettingsPage: (next: boolean) => showSettingsPage.set(next),
        showRemoteStoragePage,
        setShowRemoteStoragePage: (next: boolean) => showRemoteStoragePage.set(next),
        showGatewayPage,
        setShowGatewayPage: (next: boolean) => showGatewayPage.set(next),
        showRemotePage,
        setShowRemotePage: (next: boolean) => showRemotePage.set(next),
        showNetworkPairPage,
        setShowNetworkPairPage: (next: boolean) => showNetworkPairPage.set(next),
      } as any,
    }),
  )

  navigationModel.reset()

  return {sidebar, isShowPasswordManager, showSettingsPage}
}

describe('NavigationRail mobile drawer auto-close', () => {
  afterEach(() => {
    navigationModel.disconnect()
    clearAppContext()
    document.querySelectorAll('navigation-rail').forEach((el) => el.remove())
  })

  function createRail() {
    NavigationRail.define()
    return document.createElement('navigation-rail') as NavigationRail
  }

  it('closes sidebar after selecting Passwords and Settings on mobile', () => {
    const {sidebar, isShowPasswordManager, showSettingsPage} = setupContext('mobile', true)
    const rail = createRail()

    ;(rail as any).onPasswords()
    expect(isShowPasswordManager()).toBe(true)
    expect(sidebar()).toBe(false)

    sidebar.set(true)
    ;(rail as any).onSettings()
    expect(showSettingsPage()).toBe(true)
    expect(sidebar()).toBe(false)
  })

  it('does not change sidebar state on desktop', () => {
    const {sidebar, isShowPasswordManager, showSettingsPage} = setupContext('desktop', true)
    const rail = createRail()

    ;(rail as any).onPasswords()
    expect(isShowPasswordManager()).toBe(true)
    expect(sidebar()).toBe(true)
    ;(rail as any).onSettings()
    expect(showSettingsPage()).toBe(true)
    expect(sidebar()).toBe(true)
  })
})
