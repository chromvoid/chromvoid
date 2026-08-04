import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {WelcomeSetupSection} from '../../src/routes/welcome/sections/steps'
import {RemoteDesktopPreauth} from '../../src/routes/welcome/remote-desktop-preauth.render'
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

  const getDesktopRemote = async (section: WelcomeSetupSection) => {
    const remote = section.shadowRoot?.querySelector<RemoteDesktopPreauth>('remote-desktop-preauth')
    expect(remote).toBeInstanceOf(RemoteDesktopPreauth)
    await remote!.updateComplete
    return remote!
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
    const unlockButton = section.shadowRoot?.querySelector('#welcome\\.unlock-submit')
    const remoteButton = buttons.find((button) => button.textContent?.includes('Connect Remote'))

    expect(unlockButton).toBeInstanceOf(HTMLElement)
    expect(remoteButton?.getAttribute('variant')).toBe('ghost')

    remoteButton?.click()

    await vi.waitFor(() => {
      expect(selectRemoteSpy).toHaveBeenCalledTimes(1)
      expect(model.effectiveStep()).toBe('remote-connect')
      expect(section.shadowRoot?.querySelector('.empty-remote-state')).not.toBeNull()
      expect(section.shadowRoot?.querySelector('[data-usb-entry="desktop"]')).not.toBeNull()
    })
  })

  it('prevents native form navigation when mobile welcome submits network pairing', async () => {
    setRuntimeCapabilities({desktop: true, mobile: false, supports_network_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-pair')
    const submitSpy = vi.spyOn(model, 'onSubmitRemotePair')
    const section = await mountSection(model, 'mobile')
    const form = section.shadowRoot?.querySelector<HTMLFormElement>('form.step')
    const offer = section.shadowRoot?.querySelector<HTMLElement>('#remote-pairing-offer')
    const focusSpy = vi.spyOn(offer!, 'focus')
    const event = new SubmitEvent('submit', {bubbles: true, cancelable: true})

    expect(form).not.toBeNull()
    form?.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    await vi.waitFor(() => {
      expect(submitSpy).toHaveBeenCalledTimes(1)
      expect(focusSpy).toHaveBeenCalledTimes(1)
      expect(offer?.getAttribute('aria-describedby')).toBe('remote-pairing-offer-error')
      expect(section.shadowRoot?.querySelector('#remote-pairing-offer-error')).not.toBeNull()
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

    expect(section.shadowRoot?.querySelector('#welcome\\.unlock-submit')).toBeInstanceOf(HTMLElement)
    expect(buttons.some((button) => button.textContent?.includes('Connect Remote'))).toBe(false)
  })

  it('starts mobile first-run setup with one create-storage action and opens its sheet', async () => {
    setRuntimeCapabilities({
      desktop: false,
      mobile: true,
      supports_network_remote: true,
    })
    const model = new WelcomeSetupModel()
    const section = await mountSection(model, 'mobile')

    const createButton = section.shadowRoot?.querySelector<HTMLElement>('[data-create-storage]')
    expect(createButton?.textContent).toContain('Create Storage')
    expect(section.shadowRoot?.querySelector('.mode-card-local')).toBeNull()
    expect(section.shadowRoot?.querySelector('.mode-card-remote')).toBeNull()
    expect(section.shadowRoot?.textContent).not.toContain('Connect Remote')
    expect(section.shadowRoot?.querySelector('form.master-password-form')).toBeNull()

    createButton?.click()

    await vi.waitFor(() => {
      expect(model.effectiveStep()).toBe('create-master')
      expect(section.shadowRoot?.querySelector('cv-bottom-sheet[open]')).not.toBeNull()
      expect(section.shadowRoot?.querySelector('form.master-password-form')).not.toBeNull()
    })
  })

  it('renders the dedicated desktop hosts flow and routes its native controls', async () => {
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
    model.remote.peerListLoaded.set(true)

    const openPairSpy = vi.spyOn(model, 'onOpenRemotePair').mockImplementation(() => {})
    const backSpy = vi.spyOn(model, 'onBackFromRemoteConnect').mockImplementation(() => {})

    const section = await mountSection(model)
    const remote = await getDesktopRemote(section)
    expect(remote.shadowRoot?.querySelector('[data-remote-preauth-screen="hosts"]')).not.toBeNull()
    expect(remote.shadowRoot?.querySelector('[data-peer-id="peer-1"]')).not.toBeNull()
    const forget = remote.shadowRoot?.querySelector('[data-remove-peer-id="peer-1"]')
    expect(forget?.textContent).toContain('Forget phone')
    expect(forget?.closest('cv-disclosure')).toBeNull()
    expect(remote.shadowRoot?.querySelector('[data-peer-details="peer-1"] [data-remove-peer-id]')).toBeNull()
    expect(remote.shadowRoot?.querySelector('.remote-flow-frame')).toBeNull()
    expect(section.shadowRoot?.querySelector('.remote-flow-frame')).toBeNull()

    const backButton = remote.shadowRoot?.querySelector<HTMLButtonElement>('button.back-button')
    expect(backButton?.textContent).toContain('Back to mode selection')
    backButton?.click()
    expect(backSpy).toHaveBeenCalledTimes(1)

    const pairButton = remote.shadowRoot?.querySelector<HTMLButtonElement>('.option-button')
    expect(pairButton?.textContent).toContain('Pair over network')
    pairButton?.click()
    expect(openPairSpy).toHaveBeenCalledTimes(1)
  })

  it('returns focus to the hosts heading when polling removes the focused phone row', async () => {
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
    model.remote.peerListLoaded.set(true)

    const remote = await getDesktopRemote(await mountSection(model))
    remote.shadowRoot?.querySelector<HTMLButtonElement>('[data-remove-peer-id="peer-1"]')?.focus()
    model.remote.peers.set([])

    await vi.waitFor(() => {
      expect(remote.shadowRoot?.activeElement).toBe(remote.shadowRoot?.querySelector('[data-screen-heading]'))
    })
  })

  it('does not steal focus from outside Remote when polling removes a phone row', async () => {
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
    model.remote.peerListLoaded.set(true)

    const remote = await getDesktopRemote(await mountSection(model))
    const outsideButton = document.createElement('button')
    document.body.append(outsideButton)
    outsideButton.focus()
    model.remote.peers.set([])

    await remote.updateComplete
    expect(document.activeElement).toBe(outsideButton)
  })

  it('shows a human network action error, keeps raw details closed, and disables conflicting paths', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.peerListLoaded.set(true)
    model.remote.errorText.set('ERR_NETWORK_CONNECT: relay unavailable')
    model.remote.desktopActionErrorKind.set('connect')
    model.remote.activePeerId.set('peer-in-flight')

    const remote = await getDesktopRemote(await mountSection(model))
    const alert = remote.shadowRoot?.querySelector<HTMLElement>('[role="alert"]')
    const details = remote.shadowRoot?.querySelector<HTMLElement>('[data-error-context="network"]')
    const optionButtons = [
      ...(remote.shadowRoot?.querySelectorAll<HTMLButtonElement>('.option-button') ?? []),
    ]

    expect(alert?.textContent).toContain('Couldn’t connect to this phone')
    expect(details?.hasAttribute('open')).toBe(false)
    expect(details?.textContent).toContain('ERR_NETWORK_CONNECT: relay unavailable')
    expect(optionButtons).toHaveLength(2)
    expect(optionButtons.every((button) => button.disabled)).toBe(true)
  })

  it('uses operation-specific human copy for a failed phone removal', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.peerListLoaded.set(true)
    model.remote.errorText.set('ERR_REMOVE_PEER: storage unavailable')
    model.remote.desktopActionErrorKind.set('remove')

    const remote = await getDesktopRemote(await mountSection(model))
    const alert = remote.shadowRoot?.querySelector<HTMLElement>('[role="alert"]')

    expect(alert?.textContent).toContain('Couldn’t forget this phone')
    expect(alert?.textContent).not.toContain('ERR_REMOVE_PEER')
    expect(remote.shadowRoot?.querySelector('[data-error-context="network"]')?.textContent).toContain(
      'ERR_REMOVE_PEER: storage unavailable',
    )
  })

  it('keeps connection-status failures outside the saved Network phones section', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.peerListLoaded.set(true)
    model.remote.errorText.set('Adapter mutex poisoned')
    model.remote.desktopActionErrorKind.set('status')

    const remote = await getDesktopRemote(await mountSection(model))
    const savedPhonesSection = remote.shadowRoot
      ?.querySelector('#remote-preauth-saved-title')
      ?.closest('section')

    expect(remote.shadowRoot?.querySelector('[data-error-context="connection"]')).not.toBeNull()
    expect(remote.shadowRoot?.querySelector('[data-error-context="network"]')).toBeNull()
    expect(savedPhonesSection?.querySelector('[role="alert"]')).toBeNull()
  })

  it('distinguishes an initial saved-phone load failure from a stale refresh', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.peerListLoaded.set(true)
    model.remote.peerListError.set('relay unavailable')
    model.remote.peerListErrorKind.set('initial')
    model.remote.errorText.set('relay unavailable')

    const remote = await getDesktopRemote(await mountSection(model))
    const alert = remote.shadowRoot?.querySelector<HTMLElement>('[role="alert"]')

    expect(alert?.textContent).toContain('Couldn’t load saved phones')
    expect(alert?.textContent).not.toContain('last known status')
    expect(remote.shadowRoot?.querySelector('[data-network-empty]')).toBeNull()
  })

  it('renders the wait task when the shared remote model discovers an existing transport', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.view.set('wait')
    model.remote.transportConnectedHost.set({type: 'tauri_remote_wss', peer_id: 'peer-1'})

    const remote = await getDesktopRemote(await mountSection(model))

    expect(remote.shadowRoot?.querySelector('[data-remote-preauth-screen="wait"]')).not.toBeNull()
    expect(remote.shadowRoot?.querySelector('[data-remote-preauth-screen="hosts"]')).toBeNull()
  })

  it('raises a passively detected USB phone without starting a connection action', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.peerListLoaded.set(true)
    model.remote.usb.detectedDevices.set([
      {
        scan: {
          platform: 'android',
          bridge_kind: 'android_aoa',
          usb_hint: {manufacturer: 'Google', model: 'Pixel 9'},
          label: 'Pixel 9',
        },
        accessory_mode: false,
        paired_match: null,
      },
    ])
    const scanSpy = vi.spyOn(model.remote.usb, 'scan')
    const connectSpy = vi.spyOn(model.remote.usb, 'connectSingleScannedHost')

    const remote = await getDesktopRemote(await mountSection(model))

    expect(remote.shadowRoot?.querySelector('[data-usb-summary="single"]')?.textContent).toContain('Pixel 9')
    expect(remote.shadowRoot?.querySelector('.detected-copy p bdi')?.textContent).toBe('Pixel 9')
    expect(remote.shadowRoot?.querySelector('[data-forget-usb-host-id]')).toBeNull()
    expect(scanSpy).not.toHaveBeenCalled()
    expect(connectSpy).not.toHaveBeenCalled()
  })

  it('shows Forget beside Continue for a passively detected paired USB phone', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.peerListLoaded.set(true)
    model.remote.usb.detectedDevices.set([
      {
        scan: {
          platform: 'android',
          bridge_kind: 'android_aoa',
          usb_hint: {manufacturer: 'Google', model: 'Pixel 9'},
          label: 'Pixel 9',
        },
        accessory_mode: true,
        paired_match: {host_id: 'usb-host-1', label: 'Pixel 9', pairing_state: 'confirmed'},
      },
    ])

    const remote = await getDesktopRemote(await mountSection(model))
    const panel = remote.shadowRoot?.querySelector('[data-usb-summary="single"]')

    expect(panel?.querySelector('[data-forget-usb-host-id="usb-host-1"]')?.textContent).toContain(
      'Forget phone',
    )
    expect(panel?.textContent).toContain('Continue')
  })

  it('moves focus to the replacement detected-phone action when hotplug changes the panel shape', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.peerListLoaded.set(true)
    const detected = (label: string) => ({
      scan: {
        platform: 'android' as const,
        bridge_kind: 'android_aoa' as const,
        usb_hint: {manufacturer: 'Google', model: label},
        label,
      },
      accessory_mode: false,
      paired_match: null,
    })
    model.remote.usb.detectedDevices.set([detected('Pixel 9'), detected('Pixel 10')])
    const remote = await getDesktopRemote(await mountSection(model))
    const previousAction = remote.shadowRoot?.querySelector<HTMLElement>('[data-usb-summary] cv-button')
    await (previousAction as HTMLElement & {updateComplete: Promise<unknown>}).updateComplete
    previousAction?.focus()

    model.remote.usb.detectedDevices.set([detected('Pixel 9')])

    await vi.waitFor(() => {
      const nextAction = remote.shadowRoot?.querySelector<HTMLElement>('[data-usb-summary] cv-button')
      expect(nextAction).not.toBe(previousAction)
      expect(remote.shadowRoot?.activeElement).toBe(nextAction)
    })
  })

  it('renders the USB mobile flow inside welcome remote connect', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.view.set('usb-mobile')

    const section = await mountSection(model)
    const remote = await getDesktopRemote(section)

    expect(remote.shadowRoot?.querySelector('[data-remote-preauth-screen="usb"]')).not.toBeNull()
    expect(remote.shadowRoot?.querySelector('[data-usb-flow-state="idle"]')).not.toBeNull()
    expect(remote.shadowRoot?.querySelector('.remote-flow-frame')).toBeNull()
  })

  it('isolates a detected USB device label inside task copy', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.view.set('usb-mobile')
    model.remote.usb.scanResults.set([
      {
        scan: {
          platform: 'android',
          bridge_kind: 'android_aoa',
          usb_hint: {manufacturer: 'Google', model: 'Pixel هاتف'},
          label: 'Pixel هاتف',
        },
        classification: 'unpaired',
      },
    ])

    const remote = await getDesktopRemote(await mountSection(model))

    expect(remote.shadowRoot?.querySelector('#remote-preauth-usb-task-title bdi')?.textContent).toBe(
      'Pixel هاتف',
    )
  })

  it('asks the user to choose when a USB scan returns multiple phones', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.view.set('usb-mobile')
    model.remote.usb.scanResults.set([
      {
        scan: {
          platform: 'android',
          bridge_kind: 'android_aoa',
          usb_hint: {manufacturer: 'Google', model: 'Pixel 9'},
          label: 'Pixel 9',
        },
        classification: 'unpaired',
      },
      {
        scan: {
          platform: 'android',
          bridge_kind: 'android_aoa',
          usb_hint: {manufacturer: 'OnePlus', model: 'OnePlus 13'},
          label: 'OnePlus 13',
        },
        classification: 'unpaired',
      },
    ])

    const remote = await getDesktopRemote(await mountSection(model))
    const heading = remote.shadowRoot?.querySelector('#remote-preauth-usb-task-title')

    expect(heading?.textContent).toContain('Choose phone')
    expect(heading?.querySelector('bdi')).toBeNull()
    expect(remote.shadowRoot?.querySelectorAll('[data-usb-scan-index]')).toHaveLength(2)
  })

  it('deduplicates a scanned paired USB phone and renders one visible connect action', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.view.set('usb-mobile')
    model.remote.usb.scanResults.set([
      {
        scan: {
          platform: 'android',
          bridge_kind: 'android_aoa',
          usb_hint: {manufacturer: 'Google', model: 'Pixel 9'},
          label: 'Pixel 9',
        },
        classification: {paired: {host_id: 'usb-host-1'}},
      },
    ])
    model.remote.usb.pairedHosts.set([
      {
        host_id: 'usb-host-1',
        label: 'Pixel 9',
        platform: 'android',
        bridge_kind: 'android_aoa',
        pairing_state: 'paired',
        last_seen: null,
      },
    ])

    const remote = await getDesktopRemote(await mountSection(model))

    expect(remote.shadowRoot?.querySelectorAll('[data-usb-scan-index]')).toHaveLength(1)
    expect(remote.shadowRoot?.querySelectorAll('[data-usb-host-id]')).toHaveLength(0)
    expect(remote.shadowRoot?.querySelectorAll('[data-usb-connect-host-id]')).toHaveLength(1)
    expect(remote.shadowRoot?.querySelector('.task-panel > .usb-actions')).toBeNull()
  })

  it('shows one destructive recovery CTA for one broken USB pairing', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.view.set('usb-mobile')
    model.remote.usb.scanResults.set([
      {
        scan: {
          platform: 'android',
          bridge_kind: 'android_aoa',
          usb_hint: {manufacturer: 'Google', model: 'Pixel 9'},
          label: 'Pixel 9',
        },
        classification: {broken_local_state: {host_id: 'usb-host-1'}},
      },
    ])
    model.remote.usb.pairedHosts.set([
      {
        host_id: 'usb-host-1',
        label: 'Pixel 9',
        platform: 'android',
        bridge_kind: 'android_aoa',
        pairing_state: 'broken_local_state',
        last_seen: null,
      },
    ])

    const remote = await getDesktopRemote(await mountSection(model))
    const primary = remote.shadowRoot?.querySelector<HTMLElement>('.task-panel > .usb-actions cv-button')

    expect(primary?.getAttribute('variant')).toBe('danger')
    expect(primary?.textContent).toContain('Forget phone')
    expect(remote.shadowRoot?.querySelector('.task-description')?.textContent).toContain(
      'Pairing record is broken',
    )
    expect(remote.shadowRoot?.querySelector('.task-description')?.textContent).not.toContain(
      'Reconnect the cable',
    )
    expect(remote.shadowRoot?.querySelectorAll('cv-disclosure.technical-details')).toHaveLength(1)
    expect(remote.shadowRoot?.querySelectorAll('.task-panel [data-usb-remove-host-id]')).toHaveLength(0)
    expect(remote.shadowRoot?.querySelectorAll('.technical-details [data-usb-remove-host-id]')).toHaveLength(
      1,
    )
  })

  it('keeps confirmed removal for a healthy saved USB pairing inside Technical details', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.view.set('usb-mobile')
    model.remote.usb.pairedHosts.set([
      {
        host_id: 'usb-host-healthy',
        label: 'Pixel 9',
        platform: 'android',
        bridge_kind: 'android_aoa',
        pairing_state: 'paired',
        last_seen: null,
      },
    ])

    const remote = await getDesktopRemote(await mountSection(model))
    const details = remote.shadowRoot?.querySelector<HTMLElement>('[data-usb-technical-details]')
    const remove = details?.querySelector<HTMLElement>('[data-usb-remove-host-id="usb-host-healthy"]')

    expect(details?.hasAttribute('open')).toBe(false)
    expect(remove?.getAttribute('variant')).toBe('danger')
    expect(remove?.getAttribute('aria-label')).toBe('Forget Pixel 9')
    expect(remove?.textContent).toContain('Forget phone')
  })

  it('keeps explicit destructive row actions when multiple broken USB pairings need a choice', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.view.set('usb-mobile')
    model.remote.usb.scanResults.set(
      ['usb-host-1', 'usb-host-2'].map((hostId, index) => ({
        scan: {
          platform: 'android' as const,
          bridge_kind: 'android_aoa' as const,
          usb_hint: {manufacturer: 'Google', model: `Pixel ${index + 8}`},
          label: `Pixel ${index + 8}`,
        },
        classification: {broken_local_state: {host_id: hostId}},
      })),
    )
    model.remote.usb.pairedHosts.set(
      ['usb-host-1', 'usb-host-2'].map((hostId, index) => ({
        host_id: hostId,
        label: `Pixel ${index + 8}`,
        platform: 'android' as const,
        bridge_kind: 'android_aoa' as const,
        pairing_state: 'broken_local_state' as const,
        last_seen: null,
      })),
    )

    const remote = await getDesktopRemote(await mountSection(model))
    const removeButtons = [
      ...(remote.shadowRoot?.querySelectorAll<HTMLElement>('.task-panel [data-usb-remove-host-id]') ?? []),
    ]

    expect(remote.shadowRoot?.querySelector('.task-panel > .usb-actions')).toBeNull()
    expect(removeButtons).toHaveLength(2)
    expect(removeButtons.every((button) => button.getAttribute('variant') === 'danger')).toBe(true)
    expect(remote.shadowRoot?.querySelectorAll('.technical-details [data-usb-remove-host-id]')).toHaveLength(
      2,
    )
  })

  it('recovers focus to the remaining USB action when a focused phone disappears', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.view.set('usb-mobile')
    const scanResults = ['usb-host-1', 'usb-host-2'].map((hostId, index) => ({
      scan: {
        platform: 'android' as const,
        bridge_kind: 'android_aoa' as const,
        usb_hint: {manufacturer: 'Google', model: `Pixel ${index + 8}`},
        label: `Pixel ${index + 8}`,
      },
      classification: {broken_local_state: {host_id: hostId}},
    }))
    const pairedHosts = ['usb-host-1', 'usb-host-2'].map((hostId, index) => ({
      host_id: hostId,
      label: `Pixel ${index + 8}`,
      platform: 'android' as const,
      bridge_kind: 'android_aoa' as const,
      pairing_state: 'broken_local_state' as const,
      last_seen: null,
    }))
    model.remote.usb.scanResults.set(scanResults)
    model.remote.usb.pairedHosts.set(pairedHosts)
    const remote = await getDesktopRemote(await mountSection(model))
    const focusedRemove = remote.shadowRoot?.querySelector<HTMLElement>(
      '.task-panel [data-usb-remove-host-id="usb-host-1"]',
    )
    await (focusedRemove as HTMLElement & {updateComplete: Promise<unknown>}).updateComplete
    focusedRemove?.focus()

    model.remote.usb.scanResults.set(scanResults.slice(1))
    model.remote.usb.pairedHosts.set(pairedHosts.slice(1))

    await vi.waitFor(() => {
      const remainingAction = remote.shadowRoot?.querySelector<HTMLElement>(
        '.task-panel [data-usb-primary-action]',
      )
      expect(remote.shadowRoot?.activeElement).toBe(remainingAction)
    })
  })

  it('recovers focus across USB progress and focuses a new pairing PIN request', async () => {
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.view.set('usb-mobile')
    const remote = await getDesktopRemote(await mountSection(model))
    const primary = remote.shadowRoot?.querySelector<HTMLElement>('[data-usb-primary-action]')
    await (primary as HTMLElement & {updateComplete: Promise<unknown>}).updateComplete
    primary?.focus()

    model.remote.usb.pendingAction.set('scan')

    await vi.waitFor(() => {
      expect(remote.shadowRoot?.activeElement).toBe(
        remote.shadowRoot?.querySelector('#remote-preauth-usb-task-title'),
      )
    })

    model.remote.usb.pendingAction.set(null)
    model.remote.usb.applyStatusEvent({
      transport_family: 'usb_mobile',
      available_transports: ['usb_mobile'],
      selected_transport: 'usb_mobile',
      session_state: 'pairing_approval_required',
      fallback_allowed: false,
      active_host: null,
      paired_hosts: [],
      pairing_approval: {
        attempt_id: 'attempt-1',
        peer_label: 'Pixel 9',
        peer_fingerprint: 'abcdef12',
        attempts_left: 5,
        locked_until_ms: null,
        expires_at_ms: Date.now() + 300_000,
      },
      in_flight: null,
      error_code: null,
    })

    await vi.waitFor(() => {
      const pin = remote.shadowRoot?.querySelector<HTMLElement>('#remote-preauth-usb-pin')
      expect(pin?.shadowRoot?.activeElement).toBe(pin?.shadowRoot?.querySelector('input'))
    })
  })

  it('uses a real form with enabled submit for desktop network pairing', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-pair')
    model.remote.pairPhase.set('idle')

    const backSpy = vi.spyOn(model, 'onBackFromRemotePair').mockImplementation(() => {})

    const section = await mountSection(model)
    const remote = await getDesktopRemote(section)
    expect(remote.shadowRoot?.querySelector('[data-remote-preauth-screen="pair"]')).not.toBeNull()
    expect(remote.shadowRoot?.querySelector('form.pair-form')).not.toBeNull()
    expect(remote.shadowRoot?.querySelectorAll('cv-field')).toHaveLength(3)
    expect(remote.shadowRoot?.querySelector('cv-button[type="submit"]')?.hasAttribute('disabled')).toBe(false)

    const backButton = remote.shadowRoot?.querySelector<HTMLButtonElement>('button.back-button')
    expect(backButton?.textContent).toContain('Back to phones')
    backButton?.click()
    expect(backSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps pair navigation and submit disabled through the model-owned handoff', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-pair')
    model.remote.desktopPairingOperationBusy.set(true)

    const remote = await getDesktopRemote(await mountSection(model))
    const backButton = remote.shadowRoot?.querySelector<HTMLButtonElement>('button.back-button')
    const submitButton = remote.shadowRoot?.querySelector<HTMLElement>('cv-button[type="submit"]')

    expect(backButton?.disabled).toBe(true)
    expect(submitButton?.hasAttribute('disabled')).toBe(true)
    expect((submitButton as HTMLElement & {loading?: boolean})?.loading).toBe(true)
  })

  it('keeps a raw pairing backend error inside closed Technical details', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-pair')
    model.remote.desktopPairing.backendError.set('ERR_PAIR_REJECTED: expired secret')

    const remote = await getDesktopRemote(await mountSection(model))
    const alert = remote.shadowRoot?.querySelector<HTMLElement>('.form-error[role="alert"]')
    const details = remote.shadowRoot?.querySelector<HTMLElement>('[data-error-context="pair"]')

    expect(alert?.textContent).toContain('Couldn’t pair this phone')
    expect(alert?.textContent).not.toContain('ERR_PAIR_REJECTED')
    expect(details?.hasAttribute('open')).toBe(false)
    expect(details?.textContent).toContain('ERR_PAIR_REJECTED: expired secret')
  })

  it('submits an empty pairing form and focuses the first invalid control', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-pair')
    const remote = await getDesktopRemote(await mountSection(model))
    const form = remote.shadowRoot?.querySelector<HTMLFormElement>('form.pair-form')
    const offer = remote.shadowRoot?.querySelector<HTMLElement>('#remote-preauth-pair-link')
    const focusSpy = vi.spyOn(offer!, 'focus')

    expect(form).not.toBeNull()
    expect(offer?.getAttribute('enter-behavior')).toBe('submit')
    form?.dispatchEvent(new SubmitEvent('submit', {bubbles: true, cancelable: true}))

    await vi.waitFor(() => {
      expect(model.remote.desktopPairing.submitAttempted()).toBe(true)
      expect(focusSpy).toHaveBeenCalled()
      expect(remote.shadowRoot?.querySelector('cv-field[invalid]')).not.toBeNull()
    })
  })

  it('renders one focused wait task with one disconnect action', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-wait')
    model.remote.statusText.set('Waiting...')
    model.remote.transportConnectedHost.set({type: 'tauri_remote_wss', peer_id: 'peer-1'})
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
    const remote = await getDesktopRemote(section)
    expect(remote.shadowRoot?.querySelector('[data-remote-preauth-screen="wait"]')).not.toBeNull()
    expect(remote.shadowRoot?.querySelector('button.back-button')).toBeNull()
    const disconnectButtons = [
      ...(remote.shadowRoot?.querySelectorAll<HTMLElement>('.wait-actions cv-button') ?? []),
    ]
    expect(disconnectButtons).toHaveLength(1)
    expect(disconnectButtons[0]?.textContent).toContain('Disconnect')
    disconnectButtons[0]?.click()
    expect(disconnectSpy).toHaveBeenCalledTimes(1)
  })

  it('surfaces a failed wait-screen disconnect without exposing the raw error', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-wait')
    model.remote.transportConnectedHost.set({type: 'tauri_remote_wss', peer_id: 'peer-1'})
    model.remote.desktopActionErrorKind.set('disconnect')
    model.remote.errorText.set('ERR_MODE_SWITCH: local switch failed')

    const remote = await getDesktopRemote(await mountSection(model))
    const alert = remote.shadowRoot?.querySelector<HTMLElement>('.wait-task [role="alert"]')
    const details = remote.shadowRoot?.querySelector<HTMLElement>('.technical-details')

    expect(alert?.textContent).toContain('Couldn’t update the connection')
    expect(alert?.textContent).not.toContain('ERR_MODE_SWITCH')
    expect(details?.hasAttribute('open')).toBe(false)
    expect(details?.textContent).toContain('ERR_MODE_SWITCH: local switch failed')
    expect(remote.shadowRoot?.querySelector('[data-remote-preauth-screen="wait"]')).not.toBeNull()
  })

  it('surfaces a failed wait-screen mode-status read without leaving the task', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-wait')
    model.remote.transportConnectedHost.set({type: 'tauri_remote_wss', peer_id: 'peer-1'})
    model.remote.desktopActionErrorKind.set('status')
    model.remote.errorText.set('ERR_MODE_STATUS: unavailable')

    const remote = await getDesktopRemote(await mountSection(model))
    const alert = remote.shadowRoot?.querySelector<HTMLElement>('.wait-task [role="alert"]')
    const details = remote.shadowRoot?.querySelector<HTMLElement>('.technical-details')

    expect(alert?.textContent).toContain('Couldn’t update the connection')
    expect(alert?.textContent).not.toContain('ERR_MODE_STATUS')
    expect(details?.textContent).toContain('ERR_MODE_STATUS: unavailable')
    expect(remote.shadowRoot?.querySelector('[data-remote-preauth-screen="wait"]')).not.toBeNull()
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
    model.remote.transportConnectedHost.set({
      type: 'mobile_usb',
      host_id: 'usb-host-1',
      label: 'OnePlus 13',
      platform: 'android',
    })

    const section = await mountSection(model)
    const remote = await getDesktopRemote(section)
    const text = remote.shadowRoot?.textContent ?? ''

    expect(text).toContain('Tap Allow')
    expect(text).toContain('OnePlus 13')
    expect(remote.shadowRoot?.querySelector('.wait-task .screen-description bdi')?.textContent).toBe(
      'OnePlus 13',
    )
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
