import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CVInput} from '@chromvoid/uikit'
import {atom} from '@reatom/core'
import {guidanceCompletionBridge} from '../../src/core/guidance'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {dialogService} from '../../src/shared/services/dialog'
import {WelcomeSetupSection} from '../../src/routes/welcome/sections/steps'
import {WelcomeSetupModel} from '../../src/routes/welcome/welcome.model'

const welcomeRpcMocks = vi.hoisted(() => ({
  estimatePasswordStrength: vi.fn(),
  tauriRpc: vi.fn(),
}))

vi.mock('../../src/routes/welcome/welcome-rpc', async () => {
  const actual = await vi.importActual<typeof import('../../src/routes/welcome/welcome-rpc')>(
    '../../src/routes/welcome/welcome-rpc',
  )

  return {
    ...actual,
    estimatePasswordStrength: welcomeRpcMocks.estimatePasswordStrength,
    tauriRpc: welcomeRpcMocks.tauriRpc,
  }
})

vi.mock('../../src/core/runtime/runtime', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/runtime/runtime')>(
    '../../src/core/runtime/runtime',
  )

  return {
    ...actual,
    isTauriRuntime: () => true,
  }
})

describe('welcome create-master submit', () => {
  let section: WelcomeSetupSection
  let model: WelcomeSetupModel
  let pushNotification: ReturnType<typeof vi.fn>
  let stateUpdate: ReturnType<typeof vi.fn>

  const settle = async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }

  beforeEach(() => {
    CVInput.define()
    WelcomeSetupSection.define()
    pushNotification = vi.fn()
    stateUpdate = vi.fn()
    welcomeRpcMocks.estimatePasswordStrength.mockReset()
    welcomeRpcMocks.estimatePasswordStrength.mockResolvedValue({
      score: 4,
      feedback: {
        warning: '',
        suggestions: [],
      },
    })
    welcomeRpcMocks.tauriRpc.mockReset()
    welcomeRpcMocks.tauriRpc.mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        store: {
          remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
          pushNotification,
        } as never,
        state: {
          data: () => ({
            NeedUserInitialization: true,
            StorageOpened: false,
          }),
          update: stateUpdate,
        } as never,
      }),
    )

    section = document.createElement('welcome-setup-section') as WelcomeSetupSection
    section.layout = 'desktop'
    model = new WelcomeSetupModel()
    section.model = model
    document.body.append(section)
    model.setupStep.set('create-master')
    model.creationState.set({
      p1: 'correct horse battery staple',
      p2: 'correct horse battery staple',
    })
    model.passwordStrength.set({
      score: 4,
      feedback: {
        warning: '',
        suggestions: [],
      },
    })
  })

  afterEach(() => {
    section.remove()
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('requests submit on Enter in confirm input', async () => {
    const submitSpy = vi.spyOn(model, 'submitMasterSetup').mockResolvedValue()
    await section.updateComplete
    await settle()

    const form = section.shadowRoot?.querySelector('form')
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
    await settle()

    expect(enterEvent.defaultPrevented).toBe(true)
    expect(requestSubmitSpy).toHaveBeenCalledTimes(1)

    const submitEvent = new Event('submit', {bubbles: true, cancelable: true})
    form!.dispatchEvent(submitEvent)

    expect(submitEvent.defaultPrevented).toBe(true)
    expect(submitSpy).toHaveBeenCalledTimes(1)
  })

  it('creates the master vault and commits setup state after the RPC resolves', async () => {
    const markVaultCreatedSpy = vi.spyOn(guidanceCompletionBridge, 'markVaultCreated').mockImplementation(() => {})

    await model.submitMasterSetup()

    expect(welcomeRpcMocks.tauriRpc).toHaveBeenCalledWith('master:setup', {
      master_password: 'correct horse battery staple',
    })
    expect(markVaultCreatedSpy).toHaveBeenCalledTimes(1)
    expect(stateUpdate).toHaveBeenCalledWith({NeedUserInitialization: false})
    expect(pushNotification).toHaveBeenCalledWith('success', 'Storage created! Now unlock your vault.')
    expect(model.creationState()).toEqual({p1: '', p2: ''})
    expect(model.setupInProgress()).toBe(false)
    expect(model.shared.busy()).toBe(false)
  })

  it('unlocks the vault through the password dialog and commits opened state after the RPC resolves', async () => {
    vi.spyOn(dialogService, 'showInputDialog').mockResolvedValue('vault-password')

    await model.onUnlock()

    expect(welcomeRpcMocks.tauriRpc).toHaveBeenCalledWith('vault:unlock', {
      password: 'vault-password',
    })
    expect(stateUpdate).toHaveBeenCalledWith({StorageOpened: true})
    expect(pushNotification).toHaveBeenCalledWith('success', 'Vault unlocked')
    expect(model.setupInProgress()).toBe(false)
    expect(model.shared.busy()).toBe(false)
  })

  it('ignores stale password strength completions', async () => {
    section.remove()
    welcomeRpcMocks.estimatePasswordStrength.mockReset()
    let resolveFirst: ((value: {score: number; feedback: {warning: string; suggestions: string[]}}) => void) | null =
      null
    let resolveSecond: ((value: {score: number; feedback: {warning: string; suggestions: string[]}}) => void) | null =
      null

    welcomeRpcMocks.estimatePasswordStrength
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve
        }),
      )

    model.handleMasterPasswordInput(
      new CustomEvent('cv-input', {detail: {value: 'first password value'}}),
    )
    model.handleMasterPasswordInput(
      new CustomEvent('cv-input', {detail: {value: 'second password value'}}),
    )

    resolveSecond?.({score: 4, feedback: {warning: '', suggestions: ['second']}})
    await settle()
    expect(model.passwordStrength().score).toBe(4)
    expect(model.passwordStrength().feedback.suggestions).toEqual(['second'])

    resolveFirst?.({score: 1, feedback: {warning: 'first', suggestions: ['first']}})
    await settle()
    expect(model.passwordStrength().score).toBe(4)
    expect(model.passwordStrength().feedback.suggestions).toEqual(['second'])
  })
})
