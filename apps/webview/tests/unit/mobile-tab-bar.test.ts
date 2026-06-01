import {afterEach, describe, expect, it} from 'vitest'
import {atom} from '@reatom/core'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {DEFAULT_SNAPSHOT} from '../../src/app/navigation/navigation-snapshot'
import {MobileTabBar} from '../../src/features/shell/components/mobile-tab-bar'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

function stylesToText(styles: unknown): string {
  const values = Array.isArray(styles) ? styles : [styles]
  return values
    .map((value) => {
      if (value == null) return ''
      return typeof value === 'object' && 'cssText' in (value as object) ? String((value as {cssText: string}).cssText) : String(value)
    })
    .join('\n')
}

function lastStyleText(styles: unknown): string {
  const values = Array.isArray(styles) ? styles : [styles]
  const last = values.at(-1)
  return stylesToText(last)
}

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

  it('uses the compact 64px tab bar sizing', () => {
    const cssText = lastStyleText(MobileTabBar.styles)

    expect(cssText).toContain('height: 64px;')
    expect(cssText).toContain('font-size: 20px;')
    expect(cssText).toContain('font-size: 9px;')
    expect(cssText).toContain('text-overflow: ellipsis;')
    expect(cssText).not.toContain('height: 72px;')
    expect(cssText).not.toContain('font-size: 22px;')
    expect(cssText).not.toContain('font-size: 10px;')
  })

  it('hides while the mobile keyboard is visible', () => {
    const cssText = lastStyleText(MobileTabBar.styles)

    expect(cssText).toContain('display: var(--mobile-tab-bar-keyboard-aware-display, block);')
  })

  it('uses theme-aware muted text for inactive tabs', () => {
    const cssText = lastStyleText(MobileTabBar.styles)

    expect(cssText).toContain('color: var(--cv-color-text-muted);')
    expect(cssText).not.toContain('var(--cv-alpha-white-50)')
  })

  it('keeps the active tab visually distinguishable without a heavy filled pill', () => {
    const cssText = lastStyleText(MobileTabBar.styles)

    expect(cssText).toContain('.tab.active')
    expect(cssText).toContain('color: var(--cv-color-accent);')
    expect(cssText).toContain('.tab.active::before')
    expect(cssText).toContain('.tab.active::after')
    expect(cssText).toContain('inset-block-start: 0;')
    expect(cssText).toContain('inset-block-end: 6px;')
    expect(cssText).not.toContain('border-top: 1px solid')
    expect(cssText).not.toContain('background: var(--cv-color-surface-2);')
    expect(cssText).not.toContain('box-shadow: inset 0 0 0 1px var(--cv-color-accent-border);')
    expect(cssText).not.toContain('background: var(--cv-color-accent-surface);')
    expect(cssText).not.toContain('color-mix(')
  })
})
