import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const openExternalBrowserUrl = vi.hoisted(() => vi.fn((_url: string) => Promise.resolve()))

vi.mock('../../src/shared/services/external-browser', () => ({
  openExternalBrowserUrl: (url: string) => openExternalBrowserUrl(url),
}))

import {CVInput} from '@chromvoid/uikit'
import {atom} from '@reatom/core'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {setLang} from '../../src/i18n'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {WelcomeSetupSection} from '../../src/routes/welcome/sections/steps'
import {WelcomeSetupModel} from '../../src/routes/welcome/welcome.model'
import type {WelcomeSectionLayout} from '../../src/routes/welcome/welcome-section-layout'

const PRIVACY_URL = 'https://chromvoid.com/en/legal/privacy-policy/'
const TERMS_URL = 'https://chromvoid.com/en/legal/terms-of-service-eula/'

describe('welcome first-vault legal consent', () => {
  let section: WelcomeSetupSection
  let model: WelcomeSetupModel

  const renderSection = async (layout: WelcomeSectionLayout) => {
    section = document.createElement('welcome-setup-section') as WelcomeSetupSection
    section.layout = layout
    model = new WelcomeSetupModel()
    section.model = model
    document.body.append(section)
    model.setupStep.set('create-master')
    await Promise.resolve()
    await section.updateComplete
    return section.shadowRoot!
  }

  const consentLinks = (root: ShadowRoot) =>
    Array.from(root.querySelectorAll<HTMLAnchorElement>('#welcome-legal-consent a[data-legal-document]'))

  beforeEach(() => {
    resetRuntimeCapabilities()
    setLang('en')
    CVInput.define()
    WelcomeSetupSection.define()
    openExternalBrowserUrl.mockClear()
    initAppContext(
      createMockAppContext({
        store: {remoteSessionState: atom('inactive')} as never,
        state: {data: atom({NeedUserInitialization: true, StorageOpened: false})} as never,
      }),
    )
  })

  afterEach(() => {
    section?.remove()
    clearAppContext()
    resetRuntimeCapabilities()
    setLang('en')
  })

  it('tells the user which documents apply right under the desktop create action', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, mobile: false})
    const root = await renderSection('desktop')

    const consent = root.querySelector<HTMLElement>('#welcome-legal-consent')
    const createButton = root.querySelector<HTMLButtonElement>('button[type="submit"]')

    expect(consent?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'By continuing, you agree to the Terms of Service and acknowledge the Privacy Policy.',
    )
    expect(createButton?.getAttribute('aria-describedby')).toBe('welcome-legal-consent')
    expect(createButton?.nextElementSibling).toBe(consent)
    expect(root.querySelector('input[type="checkbox"]')).toBeNull()
    expect(consentLinks(root).map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Terms of Service', TERMS_URL],
      ['Privacy Policy', PRIVACY_URL],
    ])
  })

  it('opens the linked document through the external browser opener', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, mobile: false})
    const root = await renderSection('desktop')

    const click = new MouseEvent('click', {bubbles: true, cancelable: true})
    consentLinks(root)[0]!.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(openExternalBrowserUrl).toHaveBeenCalledWith(TERMS_URL)
    expect(model.effectiveStep()).toBe('create-master')
  })

  it('shows the consent line inside the mobile create-storage sheet', async () => {
    setRuntimeCapabilities({platform: 'android', desktop: false, mobile: true})
    const root = await renderSection('mobile')

    const sheet = root.querySelector('cv-bottom-sheet.create-storage-sheet')
    const links = consentLinks(root)

    expect(sheet?.querySelector('#welcome-legal-consent')).not.toBeNull()
    expect(links.map((link) => link.getAttribute('href'))).toEqual([TERMS_URL, PRIVACY_URL])

    links[1]!.click()

    expect(openExternalBrowserUrl).toHaveBeenCalledWith(PRIVACY_URL)
  })

  it('is not shown on the unlock screen of an existing vault', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, mobile: false})
    initAppContext(
      createMockAppContext({
        store: {remoteSessionState: atom('inactive')} as never,
        state: {data: atom({NeedUserInitialization: false, StorageOpened: false})} as never,
      }),
    )
    section = document.createElement('welcome-setup-section') as WelcomeSetupSection
    section.layout = 'desktop'
    model = new WelcomeSetupModel()
    section.model = model
    document.body.append(section)
    await section.updateComplete

    expect(section.shadowRoot?.querySelector('#welcome-legal-consent')).toBeNull()
  })
})
