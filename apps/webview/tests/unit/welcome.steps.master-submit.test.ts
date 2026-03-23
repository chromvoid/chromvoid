import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {render} from 'lit'

import {CVInput} from '@chromvoid/uikit'
import {renderWelcomeVaultContent} from '../../src/routes/welcome/sections/steps'

function createProps(onCreateMasterSubmit: (event: Event) => void) {
  return {
    isNeedInit: true,
    busy: false,
    setupStep: 'create-master' as const,
    creationP1: 'correct horse battery staple',
    creationP2: 'correct horse battery staple',
    passwordStrength: {
      score: 4,
      feedback: {
        warning: '',
        suggestions: [],
      },
    },
    isDesktopRemoteSupported: false,
    remotePeers: [],
    remoteLoadingPeers: false,
    remoteRemovingPeerId: null,
    remoteActivePeerId: null,
    remoteStatusText: null,
    remoteErrorText: null,
    remoteConnectedPeerLabel: 'iPhone vault',
    remotePairPhase: 'idle' as const,
    remotePairError: null,
    remotePairOffer: '',
    remotePairPin: '',
    remotePairDeviceLabel: '',
    onUnlock: vi.fn(),
    onSelectLocalMode: vi.fn(),
    onSelectRemoteMode: vi.fn(),
    onBackToModeSelect: vi.fn(),
    onOpenRemotePair: vi.fn(),
    onBackFromRemoteConnect: vi.fn(),
    onBackFromRemotePair: vi.fn(),
    onBackFromRemoteWait: vi.fn(),
    onMasterPasswordInput: vi.fn(),
    onMasterPasswordConfirmInput: vi.fn(),
    onCreateMasterSubmit,
    onRefreshRemotePeers: vi.fn(),
    onConnectRemotePeer: vi.fn(),
    onRemoveRemotePeer: vi.fn(),
    onRemoteOfferInput: vi.fn(),
    onRemotePinInput: vi.fn(),
    onRemoteDeviceLabelInput: vi.fn(),
    onSubmitRemotePair: vi.fn(),
  }
}

describe('welcome create-master submit', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    CVInput.define()
    container = document.createElement('div')
    document.body.append(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('requests submit on Enter in confirm input', async () => {
    const onCreateMasterSubmit = vi.fn((event: Event) => {
      event.preventDefault()
    })

    render(renderWelcomeVaultContent(createProps(onCreateMasterSubmit)), container)
    await Promise.resolve()

    const form = container.querySelector('form')
    expect(form).toBeInstanceOf(HTMLFormElement)

    const submitButton = form?.querySelector('cv-button')
    expect(submitButton?.getAttribute('type')).toBe('submit')

    const inputs = form?.querySelectorAll('cv-input')
    expect(inputs).toHaveLength(2)

    const confirmInput = inputs?.[1] as HTMLElement
    expect(confirmInput.getAttribute('enterkeyhint')).toBe('done')

    const nativeInput = confirmInput.shadowRoot?.querySelector('input') as HTMLInputElement
    expect(nativeInput).not.toBeNull()

    const requestSubmitSpy = vi.spyOn(form!, 'requestSubmit').mockImplementation(() => {})
    const enterEvent = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true})

    nativeInput.dispatchEvent(enterEvent)
    await Promise.resolve()

    expect(enterEvent.defaultPrevented).toBe(true)
    expect(requestSubmitSpy).toHaveBeenCalledTimes(1)

    const submitEvent = new Event('submit', {bubbles: true, cancelable: true})
    form!.dispatchEvent(submitEvent)

    expect(submitEvent.defaultPrevented).toBe(true)
    expect(onCreateMasterSubmit).toHaveBeenCalledTimes(1)
  })
})
