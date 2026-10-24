import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {DEFAULT_SESSION_SETTINGS} from '../../src/core/session/session-settings'
import {setLang as setAppLang} from '../../src/i18n'
import {SettingsPage} from '../../src/routes/settings/settings-page'
import {settingsPageModel} from '../../src/routes/settings/settings.model'
import {vaultRekeyModel, type VaultRekeyProgressEvent} from '../../src/routes/settings/vault-rekey.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import type {SettingsVaultRekeyForm} from '../../src/routes/settings/settings-vault-rekey-form'

const ipc = vi.hoisted(() => ({
  tauriInvoke: vi.fn(),
  tauriListen: vi.fn(),
}))

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => ipc.tauriInvoke(...args),
  tauriListen: (...args: unknown[]) => ipc.tauriListen(...args),
}))

let defined = false

function ensureDefined() {
  if (defined) return
  SettingsPage.define()
  defined = true
}

async function renderSettingsPage() {
  ensureDefined()
  vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
  const page = document.createElement('settings-page') as SettingsPage
  document.body.append(page)
  await page.updateComplete
  const layout = page.shadowRoot?.querySelector<HTMLElement & {updateComplete: Promise<unknown>}>(
    'settings-page-desktop-layout',
  )
  await layout?.updateComplete
  return page
}

function rekeyForm(page: SettingsPage): SettingsVaultRekeyForm {
  const layout = page.shadowRoot?.querySelector('settings-page-desktop-layout')
  const form = layout?.shadowRoot?.querySelector<SettingsVaultRekeyForm>('settings-vault-rekey-form')
  if (!form?.shadowRoot) throw new Error('Vault rekey form not found')
  return form
}

function resetSettingsState() {
  settingsPageModel.settings.set({...DEFAULT_SESSION_SETTINGS})
  settingsPageModel.credentialProviderSelected.set(null)
  settingsPageModel.sshAgentStatus.set(null)
  vaultRekeyModel.reset()
}

describe('Settings vault password rekey', () => {
  beforeEach(() => {
    ipc.tauriInvoke.mockReset()
    ipc.tauriListen.mockReset()
    ipc.tauriListen.mockResolvedValue(() => {})
    resetSettingsState()
    resetRuntimeCapabilities()
    setRuntimeCapabilities({platform: 'macos', desktop: true, mobile: false})
    initAppContext(createMockAppContext())
    setAppLang('en')
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
  })

  afterEach(() => {
    document.querySelectorAll('settings-page').forEach((element) => element.remove())
    clearAppContext()
    resetRuntimeCapabilities()
    resetSettingsState()
    setAppLang('en')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('validates minimum length, confirmation, and same-password policy', () => {
    vaultRekeyModel.setCurrentPassword('old-password')
    vaultRekeyModel.setNewPassword('short')
    vaultRekeyModel.setConfirmPassword('short')

    expect(vaultRekeyModel.newPasswordTooShort()).toBe(true)
    expect(vaultRekeyModel.canSubmit()).toBe(false)
    expect(vaultRekeyModel.inlineValidationMessage()).toContain('at least 8 characters')

    vaultRekeyModel.setNewPassword('new-password')
    vaultRekeyModel.setConfirmPassword('different')
    expect(vaultRekeyModel.passwordMismatch()).toBe(true)
    expect(vaultRekeyModel.canSubmit()).toBe(false)

    vaultRekeyModel.setNewPassword('old-password')
    vaultRekeyModel.setConfirmPassword('old-password')
    expect(vaultRekeyModel.samePassword()).toBe(true)
    expect(vaultRekeyModel.canSubmit()).toBe(false)

    vaultRekeyModel.setNewPassword('new-password')
    vaultRekeyModel.setConfirmPassword('new-password')
    expect(vaultRekeyModel.canSubmit()).toBe(true)
  })

  it('keeps submit available and focuses the first missing password after validation', async () => {
    const page = await renderSettingsPage()
    const form = rekeyForm(page)
    const root = form.shadowRoot!
    const submit = root.querySelector('cv-button[type="submit"]') as HTMLElement | null
    const currentInput = root.querySelector<HTMLInputElement>('#settings-vault-password-current')

    expect(submit?.hasAttribute('disabled')).toBe(false)
    root
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))

    await vi.waitFor(() => {
      expect(vaultRekeyModel.validationField()).toBe('current')
    })
    await form.updateComplete

    expect(currentInput?.getAttribute('aria-invalid')).toBe('true')
    expect(root.textContent).toContain('Enter the current vault password')
    expect(root.activeElement).toBe(currentInput)
    expect(ipc.tauriInvoke).not.toHaveBeenCalled()
  })

  it('submits rekey, tracks progress, clears secrets, and recommends backup on success', async () => {
    let progressHandler: ((event: VaultRekeyProgressEvent) => void) | null = null
    const unlisten = vi.fn()
    ipc.tauriListen.mockImplementation(
      async (_event: string, handler: (event: VaultRekeyProgressEvent) => void) => {
      progressHandler = handler
      return unlisten
    },
    )
    ipc.tauriInvoke.mockImplementation(async (command: string) => {
      expect(command).toBe('vault_rekey')
      progressHandler?.({
        phase: 'writing',
        processed_chunks: 1,
        total_chunks: 2,
        can_cancel: true,
      })
      return {ok: true, result: {backup_recommended: true}}
    })

    vaultRekeyModel.setCurrentPassword('old-password')
    vaultRekeyModel.setNewPassword('new-password')
    vaultRekeyModel.setConfirmPassword('new-password')

    await vaultRekeyModel.submit()

    expect(ipc.tauriListen).toHaveBeenCalledWith('vault:rekey:progress', expect.any(Function))
    expect(ipc.tauriInvoke).toHaveBeenCalledWith('vault_rekey', {
      currentPassword: 'old-password',
      newPassword: 'new-password',
    })
    expect(vaultRekeyModel.currentPassword()).toBe('')
    expect(vaultRekeyModel.newPassword()).toBe('')
    expect(vaultRekeyModel.confirmPassword()).toBe('')
    expect(vaultRekeyModel.successVisible()).toBe(true)
    expect(vaultRekeyModel.backupRecommendationVisible()).toBe(true)
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('maps wrong current password and cancellation commands', async () => {
    ipc.tauriInvoke.mockResolvedValueOnce({
      ok: false,
      error: 'invalid current password',
      code: 'REKEY_INVALID_CURRENT_PASSWORD',
    })

    vaultRekeyModel.setCurrentPassword('bad-password')
    vaultRekeyModel.setNewPassword('new-password')
    vaultRekeyModel.setConfirmPassword('new-password')
    await vaultRekeyModel.submit()

    expect(vaultRekeyModel.error()).toBe('The current vault password is incorrect.')

    ipc.tauriInvoke.mockResolvedValueOnce({ok: true, result: {cancelled: true, operation: 'vault_rekey'}})
    vaultRekeyModel.busy.set(true)
    vaultRekeyModel.progress.set({
      phase: 'writing',
      processed_chunks: 1,
      total_chunks: 3,
      can_cancel: true,
    })

    await vaultRekeyModel.cancel()

    expect(ipc.tauriInvoke).toHaveBeenLastCalledWith('vault_rekey_cancel')
    expect(vaultRekeyModel.isCancelling()).toBe(true)
  })

  it('renders form, progress, cancel, errors, and backup CTA', async () => {
    const page = await renderSettingsPage()
    const form = rekeyForm(page)
    const root = form.shadowRoot!

    expect(root.querySelectorAll('.vault-password-input')).toHaveLength(3)
    expect(root.textContent).toContain('Change vault password')

    vaultRekeyModel.error.set('The current vault password is incorrect.')
    vaultRekeyModel.busy.set(true)
    vaultRekeyModel.progress.set({
      phase: 'writing',
      processed_chunks: 2,
      total_chunks: 4,
      can_cancel: true,
    })
    await Promise.resolve()
    await form.updateComplete

    expect(root.textContent).toContain('Writing')
    expect(root.textContent).toContain('2 of 4 chunks')
    expect(root.textContent).toContain('Cancel')
    expect(root.textContent).toContain('The current vault password is incorrect.')

    vaultRekeyModel.busy.set(false)
    vaultRekeyModel.error.set('')
    vaultRekeyModel.success.set(true)
    vaultRekeyModel.backupRecommended.set(true)
    await Promise.resolve()
    await form.updateComplete

    expect(root.textContent).toContain('Vault password changed')
    expect(root.textContent).toContain('Create fresh backup')
  })

  it('delegates rendered form events to model methods', async () => {
    const page = await renderSettingsPage()
    const root = rekeyForm(page).shadowRoot!
    const setCurrentSpy = vi.spyOn(vaultRekeyModel, 'setCurrentPassword')
    const submitSpy = vi.spyOn(vaultRekeyModel, 'submit').mockResolvedValue(false)
    const currentInput = root.querySelector<HTMLInputElement>('#settings-vault-password-current')
    const form = root.querySelector<HTMLFormElement>('.vault-rekey-form')

    expect(currentInput).not.toBeNull()
    expect(form).not.toBeNull()

    currentInput!.value = 'old-password'
    currentInput!.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
    form!.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))

    expect(setCurrentSpy).toHaveBeenCalledWith('old-password')
    expect(submitSpy).toHaveBeenCalledTimes(1)
  })
})
