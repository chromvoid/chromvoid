import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'

import {i18n} from '../../src/i18n'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {WelcomeSetupModel} from '../../src/routes/welcome/welcome.model'
import {remoteSessionModel} from '../../src/routes/remote/remote-session.model'

function initWelcomeContext(needUserInitialization: boolean) {
  const remoteSessionState = atom<'inactive' | 'waiting_host_unlock' | 'waiting_phone_approval' | 'ready'>(
    'inactive',
  )
  initAppContext(
    createMockAppContext({
      store: {
        remoteSessionState,
      } as never,
      state: {
        data: () => ({
          NeedUserInitialization: needUserInitialization,
          StorageOpened: false,
        }),
      } as never,
    }),
  )
  return {remoteSessionState}
}

describe('WelcomeSetupModel', () => {
  beforeEach(() => {
    remoteSessionModel.usbRecoveryRequired.set(false)
    initWelcomeContext(true)
  })

  afterEach(() => {
    remoteSessionModel.usbRecoveryRequired.set(false)
    clearAppContext()
  })

  it('defaults to mode-select without mutating setupStep when initialization is required', () => {
    const model = new WelcomeSetupModel()

    expect(model.setupStep()).toBe(null)
    expect(model.effectiveStep()).toBe('mode-select')
  })

  it('derives hero copy from the current effective step', () => {
    const model = new WelcomeSetupModel()

    const cases = [
      {
        step: 'mode-select' as const,
        title: i18n('onboard:hero:create'),
        description: i18n('welcome:choose-storage-desc'),
        eyebrow: i18n('welcome:eyebrow-setup-path'),
        proof: i18n('welcome:proof-default'),
      },
      {
        step: 'create-master' as const,
        title: i18n('welcome:create-local-storage-title'),
        description: i18n('welcome:create-master-desc'),
        eyebrow: i18n('welcome:eyebrow-first-run'),
        proof: i18n('welcome:proof-create-master'),
      },
      {
        step: 'remote-connect' as const,
        title: i18n('welcome:remote-vault-title'),
        description: i18n('welcome:remote-vault-desc'),
        eyebrow: i18n('welcome:eyebrow-remote-host'),
        proof: i18n('welcome:proof-remote-connect'),
      },
      {
        step: 'remote-pair' as const,
        title: i18n('welcome:pair-iphone-hero-title'),
        description: i18n('welcome:pair-iphone-hero-desc'),
        eyebrow: i18n('welcome:eyebrow-remote-host'),
        proof: i18n('welcome:proof-remote-pair'),
      },
      {
        step: 'remote-wait' as const,
        title: i18n('welcome:wait-iphone-title'),
        description: i18n('welcome:wait-iphone-desc'),
        eyebrow: i18n('welcome:eyebrow-remote-host'),
        proof: i18n('welcome:proof-remote-wait'),
      },
    ]

    for (const testCase of cases) {
      model.setupStep.set(testCase.step)

      expect(model.heroTitle()).toBe(testCase.title)
      expect(model.heroDescription()).toBe(testCase.description)
      expect(model.heroEyebrow()).toBe(testCase.eyebrow)
      expect(model.heroProof()).toBe(testCase.proof)
    }
  })

  it('syncs remote setup state once on connect and then on real transitions', async () => {
    clearAppContext()
    const {remoteSessionState} = initWelcomeContext(true)
    const model = new WelcomeSetupModel()
    const syncSpy = vi.spyOn(model as any, 'syncSetupStepFromRemoteSession')

    model.connect()

    expect(syncSpy).toHaveBeenCalledTimes(1)
    expect(syncSpy).toHaveBeenLastCalledWith('inactive')

    remoteSessionState.set('waiting_host_unlock')
    await Promise.resolve()

    expect(syncSpy).toHaveBeenCalledTimes(2)
    expect(syncSpy).toHaveBeenLastCalledWith('waiting_host_unlock')
    expect(model.setupStep()).toBe('remote-wait')

    remoteSessionState.set('waiting_phone_approval')
    await Promise.resolve()

    expect(syncSpy).toHaveBeenCalledTimes(3)
    expect(syncSpy).toHaveBeenLastCalledWith('waiting_phone_approval')
    expect(model.setupStep()).toBe('remote-wait')
    expect(model.remoteWaitReason()).toBe('phone_approval')

    model.disconnect()
  })

  it('returns from wait to hosts when an observed remote transport becomes inactive', async () => {
    clearAppContext()
    const {remoteSessionState} = initWelcomeContext(true)
    const model = new WelcomeSetupModel()
    const showHosts = vi.spyOn(model.remote, 'showHosts')

    model.connect()
    expect(model.setupStep()).toBeNull()

    remoteSessionState.set('waiting_phone_approval')
    await Promise.resolve()
    expect(model.setupStep()).toBe('remote-wait')

    remoteSessionState.set('inactive')
    await Promise.resolve()

    expect(showHosts).toHaveBeenCalledTimes(1)
    expect(model.remote.view()).toBe('hosts')
    expect(model.setupStep()).toBe('remote-connect')
    model.disconnect()
  })

  it('returns a writer-locked USB handoff from wait to focused recovery', () => {
    const model = new WelcomeSetupModel()
    let onUsbRecoveryRequired: (() => void) | undefined
    vi.spyOn(model.remote, 'connect').mockImplementation((callbacks) => {
      onUsbRecoveryRequired = callbacks.onUsbRecoveryRequired
    })
    model.remote.view.set('usb-mobile')
    model.setupStep.set('remote-wait')

    model.connect()
    onUsbRecoveryRequired?.()

    expect(model.remote.view()).toBe('usb-mobile')
    expect(model.setupStep()).toBe('remote-connect')
    model.disconnect()
  })

  it('opens focused USB recovery for a cold writer-locked remote session', () => {
    clearAppContext()
    const {remoteSessionState} = initWelcomeContext(false)
    remoteSessionState.set('waiting_host_unlock')
    remoteSessionModel.usbRecoveryRequired.set(true)
    const model = new WelcomeSetupModel()
    const openUsb = vi.spyOn(model.remote, 'openUsbMobile').mockImplementation(() => {
      model.remote.view.set('usb-mobile')
      return true
    })

    model.connect()

    expect(openUsb).toHaveBeenCalledWith()
    expect(model.remote.view()).toBe('usb-mobile')
    expect(model.setupStep()).toBe('remote-connect')
    model.disconnect()
  })

  it('does not treat the initial inactive remote session as transport loss', () => {
    const model = new WelcomeSetupModel()
    const showHosts = vi.spyOn(model.remote, 'showHosts')

    model.connect()

    expect(showHosts).not.toHaveBeenCalled()
    expect(model.setupStep()).toBeNull()
    model.disconnect()
  })

  it.each(['remote-connect', 'remote-pair', 'remote-wait'] as const)(
    'closes the active %s pre-auth step when the remote vault becomes ready',
    async (step) => {
      clearAppContext()
      const {remoteSessionState} = initWelcomeContext(false)
      const model = new WelcomeSetupModel()
      vi.spyOn(model.remote, 'connect').mockImplementation(() => {})
      vi.spyOn(model.remote, 'disconnect').mockImplementation(() => {})
      model.setupStep.set(step)
      model.connect()

      remoteSessionState.set('ready')
      await Promise.resolve()

      expect(model.setupStep()).toBe(null)
      model.disconnect()
    },
  )

  it('does not reopen the wait step when the remote session becomes ready during connect', async () => {
    clearAppContext()
    const {remoteSessionState} = initWelcomeContext(false)
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    vi.spyOn(model.remote, 'connectToPeer').mockImplementation(async () => {
      remoteSessionState.set('ready')
      await Promise.resolve()
      return true
    })

    model.onConnectRemotePeer('peer-1')

    await vi.waitFor(() => expect(model.setupStep()).toBeNull())
  })

  it('closes the USB flow through its cleanup boundary before returning to hosts', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    model.remote.view.set('usb-mobile')
    const closeSpy = vi.spyOn(model.remote, 'closeUsbMobile').mockResolvedValue(true)
    const loadSpy = vi.spyOn(model.remote, 'loadPeers').mockResolvedValue()

    model.onBackFromRemoteUsb()

    await vi.waitFor(() => {
      expect(closeSpy).toHaveBeenCalledTimes(1)
      expect(loadSpy).toHaveBeenCalledTimes(1)
      expect(model.setupStep()).toBe('remote-connect')
    })
  })

  it('keeps the current remote step when its close boundary rejects a busy back action', async () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-pair')
    const closeSpy = vi.spyOn(model.remote, 'closePairIos').mockResolvedValue(false)
    const loadSpy = vi.spyOn(model.remote, 'loadPeers').mockResolvedValue()

    model.onBackFromRemotePair()
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1))

    expect(loadSpy).not.toHaveBeenCalled()
    expect(model.setupStep()).toBe('remote-pair')
  })

  it('keeps the hosts screen when a busy remote model rejects opening network pairing', () => {
    const model = new WelcomeSetupModel()
    model.setupStep.set('remote-connect')
    const openPairSpy = vi.spyOn(model.remote, 'openPairIos').mockReturnValue(false)

    model.onOpenRemotePair()

    expect(openPairSpy).toHaveBeenCalledTimes(1)
    expect(model.setupStep()).toBe('remote-connect')
  })
})
