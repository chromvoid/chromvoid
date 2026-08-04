import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CVInput} from '@chromvoid/uikit'
import {atom} from '@reatom/core'
import {guidanceCompletionBridge} from '../../src/core/guidance'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {dialogService} from '../../src/shared/services/dialog'
import {WelcomeSetupSection} from '../../src/routes/welcome/sections/steps'
import {WelcomeSetupModel} from '../../src/routes/welcome/welcome.model'
import {RpcError} from '../../src/routes/welcome/welcome-rpc'
import type * as WelcomeRpcModule from '../../src/routes/welcome/welcome-rpc'
import type * as RemoteModelModule from '../../src/routes/remote/remote.model'
import type * as RuntimeModule from '../../src/core/runtime/runtime'

const welcomeRpcMocks = vi.hoisted(() => ({
  estimatePasswordStrength: vi.fn(),
  tauriRpc: vi.fn(),
}))

const remoteModelMocks = vi.hoisted(() => ({
  getModeStatus: vi.fn(),
  switchMode: vi.fn(),
}))

vi.mock('../../src/routes/welcome/welcome-rpc', async () => {
  const actual = await vi.importActual<typeof WelcomeRpcModule>(
    '../../src/routes/welcome/welcome-rpc',
  )

  return {
    ...actual,
    estimatePasswordStrength: welcomeRpcMocks.estimatePasswordStrength,
    tauriRpc: welcomeRpcMocks.tauriRpc,
  }
})

vi.mock('../../src/routes/remote/remote.model', async () => {
  const actual = await vi.importActual<typeof RemoteModelModule>(
    '../../src/routes/remote/remote.model',
  )

  return {
    ...actual,
    getModeStatus: remoteModelMocks.getModeStatus,
    switchMode: remoteModelMocks.switchMode,
  }
})

vi.mock('../../src/core/runtime/runtime', async () => {
  const actual = await vi.importActual<typeof RuntimeModule>(
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
  let resetRemoteSession: ReturnType<typeof vi.fn>
  let stateData: ReturnType<typeof atom<{
    NeedUserInitialization: boolean
    StorageOpened: boolean
  }>>

  const settle = async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }

  const prepareLockedVault = () => {
    stateData.set({...stateData(), NeedUserInitialization: false})
    model.setupStep.set(null)
  }

  beforeEach(() => {
    resetRuntimeCapabilities()
    setRuntimeCapabilities({platform: 'macos', desktop: true, mobile: false})
    CVInput.define()
    WelcomeSetupSection.define()
    pushNotification = vi.fn()
    stateUpdate = vi.fn()
    resetRemoteSession = vi.fn()
    stateData = atom({
      NeedUserInitialization: true,
      StorageOpened: false,
    })
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
    remoteModelMocks.getModeStatus.mockReset()
    remoteModelMocks.getModeStatus.mockResolvedValue({
      mode: 'local',
      connection_state: 'disconnected',
      transport_type: null,
      remote_core_features: [],
    })
    remoteModelMocks.switchMode.mockReset()
    remoteModelMocks.switchMode.mockResolvedValue({
      previous_mode: {
        remote: {
          host: {
            type: 'tauri_remote_wss',
            peer_id: 'iphone-1',
          },
        },
      },
      current_mode: 'local',
      remote_core_features: [],
      auto_locked: false,
      drain_completed: true,
    })
    initAppContext(
      createMockAppContext({
        store: {
          remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
          pushNotification,
          resetRemoteSession,
        } as never,
        state: {
          data: stateData,
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
    resetRuntimeCapabilities()
    vi.restoreAllMocks()
  })

  it('requests submit on Enter in confirm input', async () => {
    const submitSpy = vi.spyOn(model, 'submitMasterSetup').mockResolvedValue()
    await section.updateComplete
    await settle()

    const form = section.shadowRoot?.querySelector('form')
    expect(form).toBeInstanceOf(HTMLFormElement)

    const submitButton = form?.querySelector('#welcome\\.create-storage')
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

    submitSpy.mockClear()
    ;(submitButton as HTMLButtonElement).click()
    expect(submitSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps mobile creation available and focuses the first invalid field after submit', async () => {
    section.layout = 'mobile'
    model.creationState.set({p1: '', p2: ''})
    await section.updateComplete

    const form = section.shadowRoot?.querySelector<HTMLFormElement>('form.master-password-form')
    const submit = form?.querySelector<HTMLElement>('#welcome\\.create-storage')
    expect(form).toBeInstanceOf(HTMLFormElement)
    expect(submit?.hasAttribute('disabled')).toBe(false)

    form?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))

    await vi.waitFor(() => {
      expect(model.masterPasswordError()).toBe('Master Password is required')
    })
    await section.updateComplete

    const passwordInput = form?.querySelector<CVInput>('#welcome-create-master-password')
    const nativeInput = passwordInput?.shadowRoot?.querySelector('input')
    expect(passwordInput?.hasAttribute('invalid')).toBe(true)
    expect(passwordInput?.getAttribute('aria-describedby')).toBe('welcome-create-master-password-error')
    expect(form?.querySelector('[role="alert"]')?.textContent).toContain('Master Password is required')
    expect(passwordInput?.shadowRoot?.activeElement).toBe(nativeInput)
    expect(welcomeRpcMocks.tauriRpc).not.toHaveBeenCalled()
  })

  it('associates a password mismatch with confirmation and clears it while editing', async () => {
    section.layout = 'mobile'
    model.creationState.set({
      p1: 'correct horse battery staple',
      p2: 'different horse battery staple',
    })
    await section.updateComplete

    const form = section.shadowRoot?.querySelector<HTMLFormElement>('form.master-password-form')
    form?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))

    await vi.waitFor(() => {
      expect(model.masterPasswordConfirmError()).toBe('Master Passwords do not match')
    })
    expect(welcomeRpcMocks.tauriRpc).not.toHaveBeenCalled()

    const confirmInput = form?.querySelector<CVInput>('#welcome-confirm-master-password')
    confirmInput?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'correct horse battery staple'},
        bubbles: true,
        composed: true,
      }),
    )

    expect(model.masterPasswordConfirmError()).toBe('')
  })

  it('creates the master vault and commits setup state after the RPC resolves', async () => {
    const markVaultCreatedSpy = vi.spyOn(guidanceCompletionBridge, 'markVaultCreated').mockImplementation(() => {})

    await model.submitMasterSetup()

    expect(welcomeRpcMocks.tauriRpc).toHaveBeenCalledWith('master:setup', {
      master_password: 'correct horse battery staple',
    })
    expect(remoteModelMocks.switchMode).not.toHaveBeenCalled()
    expect(markVaultCreatedSpy).toHaveBeenCalledTimes(1)
    expect(stateUpdate).toHaveBeenCalledWith({NeedUserInitialization: false})
    expect(pushNotification).toHaveBeenCalledWith('success', 'Storage created! Now unlock your vault.')
    expect(model.creationState()).toEqual({p1: '', p2: ''})
    expect(model.setupInProgress()).toBe(false)
    expect(model.shared.busy()).toBe(false)
  })

  it('skips desktop mode commands when creating local storage on mobile', async () => {
    setRuntimeCapabilities({platform: 'ios', desktop: false, mobile: true})

    await model.submitMasterSetup()

    expect(remoteModelMocks.getModeStatus).not.toHaveBeenCalled()
    expect(remoteModelMocks.switchMode).not.toHaveBeenCalled()
    expect(welcomeRpcMocks.tauriRpc).toHaveBeenCalledWith('master:setup', {
      master_password: 'correct horse battery staple',
    })
  })

  it('switches back to local mode before creating local storage from a remote adapter', async () => {
    remoteModelMocks.getModeStatus.mockResolvedValueOnce({
      mode: {
        remote: {
          host: {
            type: 'tauri_remote_wss',
            peer_id: 'iphone-1',
          },
        },
      },
      connection_state: 'disconnected',
      transport_type: 'wss',
      remote_core_features: [],
    })

    await model.submitMasterSetup()

    expect(remoteModelMocks.switchMode).toHaveBeenCalledWith('local')
    expect(resetRemoteSession).toHaveBeenCalledTimes(1)
    expect(welcomeRpcMocks.tauriRpc).toHaveBeenCalledWith('master:setup', {
      master_password: 'correct horse battery staple',
    })
    expect(remoteModelMocks.switchMode.mock.invocationCallOrder[0]).toBeLessThan(
      welcomeRpcMocks.tauriRpc.mock.invocationCallOrder[0],
    )
  })

  it('creates first-run mobile storage without invoking desktop mode commands', async () => {
    setRuntimeCapabilities({platform: 'android', desktop: false, mobile: true})
    remoteModelMocks.getModeStatus.mockRejectedValueOnce(new Error('Command mode_status not found'))

    await model.submitMasterSetup()

    expect(remoteModelMocks.getModeStatus).not.toHaveBeenCalled()
    expect(remoteModelMocks.switchMode).not.toHaveBeenCalled()
    expect(welcomeRpcMocks.tauriRpc).toHaveBeenCalledWith('master:setup', {
      master_password: 'correct horse battery staple',
    })
  })

  it('unlocks the vault from the inline form without normalizing the password', async () => {
    const passwordDialog = vi.spyOn(dialogService, 'showInputDialog')
    prepareLockedVault()

    expect(passwordDialog).not.toHaveBeenCalled()
    model.unlockPassword.set('  vault-password  ')
    await model.submitUnlock()

    expect(welcomeRpcMocks.tauriRpc).toHaveBeenCalledWith('vault:unlock', {
      password: '  vault-password  ',
    })
    expect(stateUpdate).toHaveBeenCalledWith({StorageOpened: true})
    expect(pushNotification).not.toHaveBeenCalled()
    expect(model.unlockPassword()).toBe('')
    expect(model.setupInProgress()).toBe(false)
    expect(model.shared.busy()).toBe(false)
  })

  it('uses the empty string as a valid passwordless-vault identity', async () => {
    prepareLockedVault()
    model.shared.setError('Previous technical error')
    await model.submitUnlock()

    expect(welcomeRpcMocks.tauriRpc).toHaveBeenCalledWith('vault:unlock', {
      password: '',
    })
    expect(stateUpdate).toHaveBeenCalledWith({StorageOpened: true})
    expect(model.shared.errorText()).toBeNull()
  })

  it('exposes unlock pending state until the vault RPC settles', async () => {
    prepareLockedVault()
    let resolveUnlock: (() => void) | undefined
    welcomeRpcMocks.tauriRpc.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveUnlock = resolve
        }),
    )
    model.unlockPassword.set('vault-password')

    const unlockPromise = model.submitUnlock()

    await vi.waitFor(() => {
      expect(welcomeRpcMocks.tauriRpc).toHaveBeenCalledWith('vault:unlock', {
        password: 'vault-password',
      })
      expect(model.unlockInProgress()).toBe(true)
    })
    expect(model.unlockPassword()).toBe('vault-password')
    expect(model.shared.busy()).toBe(true)
    expect(model.icon.state()).toBe('active')

    await model.submitUnlock()
    expect(welcomeRpcMocks.tauriRpc).toHaveBeenCalledTimes(1)

    resolveUnlock?.()
    await unlockPromise

    expect(model.unlockInProgress()).toBe(false)
    expect(model.shared.busy()).toBe(false)
    expect(model.icon.state()).toBe('active')
  })

  it('preserves the masked password and separates technical errors from field validation', async () => {
    prepareLockedVault()
    model.unlockPassword.set('vault-password')
    welcomeRpcMocks.tauriRpc.mockRejectedValueOnce(
      new RpcError('keystore unavailable', 'KEYSTORE_UNAVAILABLE'),
    )

    await model.submitUnlock()

    expect(model.unlockPassword()).toBe('vault-password')
    expect(model.shared.errorText()).not.toBe('')
    expect(model.unlockInProgress()).toBe(false)
    expect(model.icon.state()).toBe('idle')
    expect(stateUpdate).not.toHaveBeenCalledWith({StorageOpened: true})
  })

  it('renders desktop unlock as an inline password form', async () => {
    section.remove()
    clearAppContext()
    initAppContext(
      createMockAppContext({
        store: {
          remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
          pushNotification,
          resetRemoteSession,
        } as never,
        state: {
          data: () => ({
            NeedUserInitialization: false,
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
    await section.updateComplete

    const root = section.shadowRoot
    expect(root).not.toBeNull()
    if (!root) throw new Error('welcome setup shadow root missing')

    const form = root.querySelector('form.unlock-inline-form')
    expect(form).toBeInstanceOf(HTMLFormElement)

    const unlockForm = form as HTMLFormElement
    const input = unlockForm.querySelector('cv-input#welcome-unlock-password-desktop')
    expect(input).not.toBeNull()

    const unlockInput = input as HTMLElement
    const submitButton = unlockForm.querySelector<HTMLButtonElement>('#welcome\\.unlock-submit')
    expect(submitButton).toBeInstanceOf(HTMLButtonElement)
    expect(submitButton?.textContent).toContain('Unlock Vault')

    const submitSpy = vi.spyOn(model, 'submitUnlock').mockResolvedValue()
    unlockInput.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'vault-password'},
        bubbles: true,
        composed: true,
      }),
    )
    const submitEvent = new Event('submit', {bubbles: true, cancelable: true})
    unlockForm.dispatchEvent(submitEvent)

    expect(submitEvent.defaultPrevented).toBe(true)
    expect(model.unlockPassword()).toBe('vault-password')
    expect(submitSpy).toHaveBeenCalledTimes(1)

    submitSpy.mockClear()
    submitButton?.click()
    await vi.waitFor(() => {
      expect(submitSpy).toHaveBeenCalledTimes(1)
    })
  })

  it('dismisses the mobile keyboard when unlock is submitted with Enter or the button', async () => {
    prepareLockedVault()
    section.layout = 'mobile'
    await section.updateComplete

    const unlockForm = section.shadowRoot?.querySelector<HTMLFormElement>('form.unlock-inline-form')
    const unlockInput = unlockForm?.querySelector<CVInput>('#welcome-unlock-password')
    const nativeInput = unlockInput?.shadowRoot?.querySelector<HTMLInputElement>('input')
    const submitButton = unlockForm?.querySelector<HTMLButtonElement>('#welcome\\.unlock-submit')
    expect(unlockForm).toBeInstanceOf(HTMLFormElement)
    expect(nativeInput).toBeInstanceOf(HTMLInputElement)
    expect(submitButton).toBeInstanceOf(HTMLButtonElement)

    const submitSpy = vi.spyOn(model, 'submitUnlock').mockResolvedValue()

    nativeInput?.focus()
    expect(unlockInput?.shadowRoot?.activeElement).toBe(nativeInput)
    nativeInput?.dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}),
    )

    await vi.waitFor(() => {
      expect(submitSpy).toHaveBeenCalledTimes(1)
    })
    expect(unlockInput?.shadowRoot?.activeElement).toBeNull()

    submitSpy.mockClear()
    nativeInput?.focus()
    expect(unlockInput?.shadowRoot?.activeElement).toBe(nativeInput)
    submitButton?.click()

    await vi.waitFor(() => {
      expect(submitSpy).toHaveBeenCalledTimes(1)
    })
    expect(unlockInput?.shadowRoot?.activeElement).toBeNull()
  })

  it('diagnoses and applies confirmed catalog repair during unlock', async () => {
    prepareLockedVault()
    const confirmSpy = vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    model.unlockPassword.set('vault-password')
    welcomeRpcMocks.tauriRpc.mockImplementation(async (command: string) => {
      if (command === 'vault:unlock') {
        throw new RpcError('repair required', 'CATALOG_REPAIR_REQUIRED')
      }
      if (command === 'vault:repair:diagnose') {
        return {
          repair_id: 'repair-1',
          status: 'lossy_required',
          lossy_requires_confirm: true,
          issues: [
            {
              shard_id: 'docs',
              snapshot_seq: 0,
              base_version: 418,
              last_delta_seq: 419,
              safe_through_seq: 418,
              failure: {
                seq: 419,
                path: '/Банк_amd_.txt',
                node_id: 2,
                op: 'move',
                reason: 'missing_target_parent',
              },
            },
          ],
        }
      }
      if (command === 'vault:repair:apply') {
        return {
          unlocked: true,
          repair: {
            repair_id: 'repair-1',
            status: 'lossy_required',
            issues: [],
            lossy_applied: true,
          },
        }
      }
      return undefined
    })

    await model.submitUnlock()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(welcomeRpcMocks.tauriRpc).toHaveBeenCalledWith('vault:repair:diagnose', {
      password: 'vault-password',
    })
    expect(welcomeRpcMocks.tauriRpc).toHaveBeenCalledWith('vault:repair:apply', {
      password: 'vault-password',
      repair_id: 'repair-1',
      allow_lossy: true,
    })
    expect(stateUpdate).toHaveBeenCalledWith({StorageOpened: true})
  })

  it('does not apply lossy catalog repair when the user cancels confirmation', async () => {
    prepareLockedVault()
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(false)
    model.unlockPassword.set('vault-password')
    welcomeRpcMocks.tauriRpc.mockImplementation(async (command: string) => {
      if (command === 'vault:unlock') {
        throw new RpcError('repair required', 'CATALOG_REPAIR_REQUIRED')
      }
      if (command === 'vault:repair:diagnose') {
        return {
          repair_id: 'repair-1',
          status: 'lossy_required',
          lossy_requires_confirm: true,
          issues: [],
        }
      }
      return undefined
    })

    await model.submitUnlock()

    expect(welcomeRpcMocks.tauriRpc).not.toHaveBeenCalledWith(
      'vault:repair:apply',
      expect.anything(),
    )
    expect(stateUpdate).not.toHaveBeenCalledWith({StorageOpened: true})
    expect(model.unlockPassword()).toBe('vault-password')
    expect(model.unlockInProgress()).toBe(false)
    expect(model.icon.state()).toBe('idle')
  })

  it('maps catalog repair diagnose failures into unlock errors', async () => {
    prepareLockedVault()
    model.unlockPassword.set('vault-password')
    welcomeRpcMocks.tauriRpc.mockImplementation(async (command: string) => {
      if (command === 'vault:unlock') {
        throw new RpcError('repair required', 'CATALOG_REPAIR_REQUIRED')
      }
      if (command === 'vault:repair:diagnose') {
        throw new RpcError('stale repair', 'CATALOG_REPAIR_STALE')
      }
      return undefined
    })

    await model.submitUnlock()

    expect(model.shared.errorText()).toBe('Vault catalog repair state changed. Try unlocking again.')
    expect(model.unlockPassword()).toBe('vault-password')
    expect(stateUpdate).not.toHaveBeenCalledWith({StorageOpened: true})
    expect(model.unlockInProgress()).toBe(false)
    expect(model.icon.state()).toBe('idle')
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
