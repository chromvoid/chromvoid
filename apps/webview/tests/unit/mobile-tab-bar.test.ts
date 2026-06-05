import {afterEach, describe, expect, it} from 'vitest'
import {atom} from '@reatom/core'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {DEFAULT_SNAPSHOT} from '../../src/app/navigation/navigation-snapshot'
import {MobileTabBar} from '../../src/features/shell/components/mobile-tab-bar'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

function defineMobileTabBar() {
  if (!customElements.get(MobileTabBar.elementName)) {
    customElements.define(MobileTabBar.elementName, MobileTabBar as unknown as CustomElementConstructor)
  }
}

function setupContext() {
  initAppContext(
    createMockAppContext({
      store: {
        detailsPanelFileId: atom<number | null>(null),
        currentPath: atom('/'),
        showRemoteStoragePage: atom(false),
        showRemotePage: atom(false),
        showGatewayPage: atom(false),
        showSettingsPage: atom(false),
        isShowPasswordManager: atom(false),
      } as any,
    }),
  )
}

describe('mobile-tab-bar', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    navigationModel.snapshot.set(DEFAULT_SNAPSHOT)
    clearAppContext()
  })

  it('renders passwords as the active tab on the passwords navigation surface', async () => {
    defineMobileTabBar()
    navigationModel.snapshot.set({
      surface: 'passwords',
      passwords: {kind: 'root'},
      overlay: {kind: 'none'},
    })

    const element = document.createElement('mobile-tab-bar') as MobileTabBar
    document.body.append(element)
    await element.updateComplete

    const tabs = Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.tab') ?? [])
    const activeTab = element.shadowRoot?.querySelector<HTMLButtonElement>('.tab.active')

    expect(tabs).toHaveLength(4)
    expect(activeTab).toBe(tabs[2])
    expect(activeTab?.querySelector('cv-icon')?.getAttribute('name')).toBe('lock')
  })

  it('renders Notes as the active tab on the Notes navigation surface', async () => {
    defineMobileTabBar()
    navigationModel.snapshot.set({
      surface: 'notes',
      overlay: {kind: 'none'},
    })

    const element = document.createElement('mobile-tab-bar') as MobileTabBar
    document.body.append(element)
    await element.updateComplete

    const tabs = Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.tab') ?? [])
    const activeTab = element.shadowRoot?.querySelector<HTMLButtonElement>('.tab.active')

    expect(tabs).toHaveLength(4)
    expect(activeTab).toBe(tabs[1])
    expect(activeTab?.querySelector('cv-icon')?.getAttribute('name')).toBe('file-text')
    expect(activeTab?.textContent).toContain('Notes')
  })

  it('keeps Notes active for a Markdown document opened from Notes', async () => {
    defineMobileTabBar()
    navigationModel.snapshot.set({
      surface: 'files',
      files: {
        path: '/Notes/',
        document: {kind: 'markdown', fileId: 7, originSurface: 'notes'},
      },
      overlay: {kind: 'none'},
    })

    const element = document.createElement('mobile-tab-bar') as MobileTabBar
    document.body.append(element)
    await element.updateComplete

    const tabs = Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.tab') ?? [])
    const activeTab = element.shadowRoot?.querySelector<HTMLButtonElement>('.tab.active')

    expect(tabs).toHaveLength(4)
    expect(activeTab).toBe(tabs[1])
    expect(activeTab?.querySelector('cv-icon')?.getAttribute('name')).toBe('file-text')
  })

  it('renders OTPs as the active tab on the OTP quick view route', async () => {
    defineMobileTabBar()
    navigationModel.snapshot.set({
      surface: 'passwords',
      passwords: {kind: 'otp-view'},
      overlay: {kind: 'none'},
    })

    const element = document.createElement('mobile-tab-bar') as MobileTabBar
    document.body.append(element)
    await element.updateComplete

    const tabs = Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.tab') ?? [])
    const activeTab = element.shadowRoot?.querySelector<HTMLButtonElement>('.tab.active')

    expect(tabs).toHaveLength(4)
    expect(activeTab).toBe(tabs[3])
    expect(activeTab?.querySelector('cv-icon')?.getAttribute('name')).toBe('shield-check')
    expect(activeTab?.textContent).toContain('OTPs')
  })

  it('opens the OTP quick view route from the OTPs tab', async () => {
    defineMobileTabBar()
    setupContext()
    navigationModel.snapshot.set(DEFAULT_SNAPSHOT)

    const element = document.createElement('mobile-tab-bar') as MobileTabBar
    document.body.append(element)
    await element.updateComplete

    const tabs = Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.tab') ?? [])
    tabs[3]?.click()
    await element.updateComplete

    expect(navigationModel.snapshot()).toMatchObject({
      surface: 'passwords',
      passwords: {kind: 'otp-view'},
    })
  })

  it('opens the Notes view route from the Notes tab', async () => {
    defineMobileTabBar()
    setupContext()
    navigationModel.snapshot.set(DEFAULT_SNAPSHOT)

    const element = document.createElement('mobile-tab-bar') as MobileTabBar
    document.body.append(element)
    await element.updateComplete

    const tabs = Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.tab') ?? [])
    tabs[1]?.click()
    await element.updateComplete

    expect(navigationModel.snapshot()).toMatchObject({
      surface: 'notes',
    })
  })

})
