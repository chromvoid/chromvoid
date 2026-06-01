import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'

import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {WelcomeSetupSection} from '../../src/routes/welcome/sections/steps'
import {WelcomeSetupModel} from '../../src/routes/welcome/welcome.model'

describe('welcome remote panels', () => {
  const mountSection = async (model: WelcomeSetupModel) => {
    const section = document.createElement('welcome-setup-section') as WelcomeSetupSection
    section.layout = 'desktop'
    section.model = model
    document.body.append(section)
    await section.updateComplete
    await Promise.resolve()
    await Promise.resolve()
    return section
  }

  beforeEach(() => {
    WelcomeSetupSection.define()
    initAppContext(
      createMockAppContext({
        store: {
          remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
        } as never,
        state: {
          data: () => ({
            NeedUserInitialization: true,
            StorageOpened: false,
          }),
        } as never,
      }),
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
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
    const backLink = section.shadowRoot?.querySelector('.back-link')
    expect(backLink?.textContent).toContain('Back to mode selection')
    backLink?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    expect(backSpy).toHaveBeenCalledTimes(1)

    const buttons = [...(section.shadowRoot?.querySelectorAll('cv-button') ?? [])]
    const pairButton = buttons.find((button) => button.textContent?.includes('Pair'))
    pairButton?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    expect(openPairSpy).toHaveBeenCalledTimes(1)
  })

  it('uses the shared remote pair panel for welcome pairing flow', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-pair')
    model.remote.pairPhase.set('idle')

    const backSpy = vi.spyOn(model, 'onBackFromRemotePair').mockImplementation(() => {})

    const section = await mountSection(model)
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
    const backLink = section.shadowRoot?.querySelector('.back-link')
    expect(backLink?.textContent).toContain('Disconnect remote transport')

    const disconnectButton = [...(section.shadowRoot?.querySelectorAll('cv-button') ?? [])].find((button) =>
      button.textContent?.includes('Disconnect'),
    )
    disconnectButton?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    expect(disconnectSpy).toHaveBeenCalledTimes(1)
  })
})
