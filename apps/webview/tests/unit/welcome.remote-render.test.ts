import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {WelcomeSetupSection} from '../../src/routes/welcome/sections/steps'
import {WelcomePageDesktopLayout} from '../../src/routes/welcome/welcome-desktop'
import {WelcomeSetupModel} from '../../src/routes/welcome/welcome.model'

describe('welcome remote panels', () => {
  let stateData: {
    NeedUserInitialization: boolean
    StorageOpened: boolean
  }

  const mountSection = async (model: WelcomeSetupModel, layout: 'desktop' | 'mobile' = 'desktop') => {
    const section = document.createElement('welcome-setup-section') as WelcomeSetupSection
    section.layout = layout
    section.model = model
    document.body.append(section)
    await section.updateComplete
    await Promise.resolve()
    await Promise.resolve()
    return section
  }

  beforeEach(() => {
    WelcomePageDesktopLayout.define()
    WelcomeSetupSection.define()
    stateData = {
      NeedUserInitialization: true,
      StorageOpened: false,
    }
    ;(globalThis as unknown as {__TAURI_INTERNALS__?: {invoke: () => void}}).__TAURI_INTERNALS__ = {
      invoke: () => {},
    }
    initAppContext(
      createMockAppContext({
        store: {
          remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'waiting_phone_approval' | 'ready'>(
            'inactive',
          ),
        } as never,
        state: {
          data: () => stateData,
        } as never,
      }),
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
    resetRuntimeCapabilities()
    clearAppContext()
    delete (globalThis as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
  })

  it('keeps desktop remote entry available in the mobile welcome layout', async () => {
    stateData.NeedUserInitialization = false
    setRuntimeCapabilities({
      desktop: true,
      mobile: false,
      supports_network_remote: true,
      supports_mobile_usb_remote: true,
    })
    const model = new WelcomeSetupModel()
    vi.spyOn(model.remote, 'loadPeers').mockResolvedValue()
    const selectRemoteSpy = vi.spyOn(model, 'onSelectRemoteMode')

    const section = await mountSection(model, 'mobile')
    const buttons = Array.from(section.shadowRoot?.querySelectorAll<HTMLElement>('cv-button') ?? [])
    const unlockButton = buttons.find((button) => button.textContent?.includes('Unlock Vault'))
    const remoteButton = buttons.find((button) => button.textContent?.includes('Connect Remote'))

    expect(unlockButton?.getAttribute('variant')).toBe('primary')
    expect(remoteButton?.getAttribute('variant')).toBe('ghost')

    remoteButton?.click()

    await vi.waitFor(() => {
      expect(selectRemoteSpy).toHaveBeenCalledTimes(1)
      expect(model.effectiveStep()).toBe('remote-connect')
      expect(section.shadowRoot?.querySelector('.empty-remote-state')).not.toBeNull()
      expect(section.shadowRoot?.querySelector('[data-usb-entry="desktop"]')).not.toBeNull()
    })
  })

  it('does not expose the desktop remote entry on a mobile runtime', async () => {
    stateData.NeedUserInitialization = false
    setRuntimeCapabilities({
      desktop: false,
      mobile: true,
      supports_network_remote: true,
    })
    const model = new WelcomeSetupModel()

    const section = await mountSection(model, 'mobile')
    const buttons = Array.from(section.shadowRoot?.querySelectorAll<HTMLElement>('cv-button') ?? [])

    expect(buttons.some((button) => button.textContent?.includes('Unlock Vault'))).toBe(true)
    expect(buttons.some((button) => button.textContent?.includes('Connect Remote'))).toBe(false)
  })

  it('routes remote connect actions through the shared remote renderer contract', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.peers.set([
      {
        peer_id: 'peer-1',
        label: 'My iPhone',
        relay_url: 'wss://relay.chromvoid.com',
        last_seen: Date.now(),
        paired_at: Date.now(),
        platform: 'ios',
        status: 'ready',
        presence_expires_at_ms: null,
      },
    ])

    const openPairSpy = vi.spyOn(model, 'onOpenRemotePair').mockImplementation(() => {})
    const backSpy = vi.spyOn(model, 'onBackFromRemoteConnect').mockImplementation(() => {})

    const section = await mountSection(model)
    expect(section.shadowRoot?.querySelector('.remote-flow-frame[data-flow-screen="hosts"]')).not.toBeNull()
    expect(section.shadowRoot?.querySelector('.remote-flow-titlebar')).toBeNull()
    expect(section.shadowRoot?.querySelector('.remote-flow-footer')).toBeNull()

    const backLink = section.shadowRoot?.querySelector('.back-link')
    expect(backLink?.textContent).toContain('Back to mode selection')
    backLink?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    expect(backSpy).toHaveBeenCalledTimes(1)

    const buttons = [...(section.shadowRoot?.querySelectorAll('button, cv-button') ?? [])]
    const pairButton = buttons.find((button) => button.textContent?.includes('Pair'))
    pairButton?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    expect(openPairSpy).toHaveBeenCalledTimes(1)
  })

  it('renders the USB mobile flow inside welcome remote connect', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.view.set('usb-mobile')

    const section = await mountSection(model)

    expect(section.shadowRoot?.querySelector('.remote-flow-frame[data-flow-screen="usb"]')).not.toBeNull()
    expect(section.shadowRoot?.querySelector('[data-usb-flow-state="idle"]')).not.toBeNull()
    expect(section.shadowRoot?.querySelector('[data-usb-entry="desktop"]')).toBeNull()
  })

  it('uses the shared remote pair panel for welcome pairing flow', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-pair')
    model.remote.pairPhase.set('idle')

    const backSpy = vi.spyOn(model, 'onBackFromRemotePair').mockImplementation(() => {})

    const section = await mountSection(model)
    expect(section.shadowRoot?.querySelector('.remote-flow-frame[data-flow-screen="pair"]')).not.toBeNull()

    const backLink = section.shadowRoot?.querySelector('.back-link')
    expect(backLink?.textContent).toContain('Back to remote hosts')

    const cancelButton = [...(section.shadowRoot?.querySelectorAll('cv-button') ?? [])].find((button) =>
      button.textContent?.includes('Cancel'),
    )
    cancelButton?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    expect(backSpy).toHaveBeenCalledTimes(1)
  })

  it('uses the shared remote wait panel for welcome waiting flow', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-wait')
    model.remote.statusText.set('Waiting...')
    model.remote.transportConnectedPeerId.set('peer-1')
    model.remote.peers.set([
      {
        peer_id: 'peer-1',
        label: 'My iPhone',
        relay_url: 'wss://relay.chromvoid.com',
        last_seen: Date.now(),
        paired_at: Date.now(),
        platform: 'ios',
        status: 'ready',
        presence_expires_at_ms: null,
      },
    ])

    const disconnectSpy = vi.spyOn(model, 'onBackFromRemoteWait').mockImplementation(() => {})

    const section = await mountSection(model)
    expect(section.shadowRoot?.querySelector('.remote-flow-frame[data-flow-screen="wait"]')).not.toBeNull()

    const backLink = section.shadowRoot?.querySelector('.back-link')
    expect(backLink?.textContent).toContain('Disconnect remote transport')

    const disconnectButton = [...(section.shadowRoot?.querySelectorAll('cv-button') ?? [])].find((button) =>
      button.textContent?.includes('Disconnect'),
    )
    disconnectButton?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    expect(disconnectSpy).toHaveBeenCalledTimes(1)
  })

  it('renders phone approval copy while USB remote waits for Allow', async () => {
    clearAppContext()
    initAppContext(
      createMockAppContext({
        store: {
          remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'waiting_phone_approval' | 'ready'>(
            'waiting_phone_approval',
          ),
        } as never,
        state: {
          data: () => ({
            NeedUserInitialization: true,
            StorageOpened: false,
          }),
        } as never,
      }),
    )

    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-wait')
    model.remote.transportConnectedPeerId.set('usb-host-1')

    const section = await mountSection(model)
    const text = section.shadowRoot?.textContent ?? ''

    expect(text).toContain('Tap Allow on the phone')
    expect(text).toContain('waiting for phone approval')
  })

  it('omits the outer welcome hero in the desktop remote flow layout', async () => {
    const page = document.createElement('welcome-page-desktop-layout') as WelcomePageDesktopLayout
    const pageModel = (page as unknown as {model: {setup: WelcomeSetupModel}}).model
    pageModel.setup.setupStep.set('remote-connect')

    document.body.append(page)
    await page.updateComplete
    await Promise.resolve()
    await Promise.resolve()

    expect(page.shadowRoot?.querySelector('welcome-hero-section')).toBeNull()
    expect(page.shadowRoot?.querySelector('welcome-setup-section')).not.toBeNull()
  })
})
