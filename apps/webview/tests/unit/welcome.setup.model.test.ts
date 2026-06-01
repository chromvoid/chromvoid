import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'

import {i18n} from '../../src/i18n'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {WelcomeSetupModel} from '../../src/routes/welcome/welcome.model'

function initWelcomeContext(needUserInitialization: boolean) {
  const remoteSessionState = atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive')
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
    initWelcomeContext(true)
  })

  afterEach(() => {
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

    model.disconnect()
  })
})
