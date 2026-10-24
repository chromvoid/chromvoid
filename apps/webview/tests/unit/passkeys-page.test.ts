import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {setLang as setAppLang} from '../../src/i18n'
import {PasskeysPage} from '../../src/routes/passkeys/passkeys-page'
import {groupPasskeys, passkeysPageModel, type PasskeySummary} from '../../src/routes/passkeys/passkeys.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {dialogService} from '../../src/shared/services/dialog'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  }
})

let defined = false

function ensureDefined() {
  if (defined) return
  PasskeysPage.define()
  defined = true
}

function enablePasskeysTauriRuntime(platform: 'ios' | 'macos' = 'ios') {
  const mobile = platform !== 'macos'
  vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
  setRuntimeCapabilities({
    platform,
    desktop: !mobile,
    mobile,
    supports_autofill: true,
    supports_credential_provider_passkeys_lite: true,
  })
}

function resetPasskeysState() {
  passkeysPageModel.passkeys.set([])
  passkeysPageModel.passkeysLoading.set(false)
  passkeysPageModel.passkeysError.set(null)
  passkeysPageModel.passkeyDeletingCredentialId.set(null)
  passkeysPageModel.passkeyExpandedGroupKeys.set(new Set<string>())
}

function passkey(credentialIdB64Url: string, params: Partial<PasskeySummary> = {}): PasskeySummary {
  return {
    credentialIdB64Url,
    rpId: 'github.com',
    userName: 'kaifat',
    userDisplayName: 'Kaifat',
    signCount: 0,
    createdAtEpochMs: 100,
    lastUsedEpochMs: 100,
    ...params,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

async function waitForPasskeysPage(page: PasskeysPage): Promise<void> {
  await page.updateComplete
  await Promise.resolve()
  await page.updateComplete
}

describe('Provider passkeys page', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    resetRuntimeCapabilities()
    resetPasskeysState()
    initAppContext(createMockAppContext())
    setAppLang('en')
  })

  afterEach(() => {
    document.querySelectorAll('passkeys-page').forEach((element) => element.remove())
    resetPasskeysState()
    clearAppContext()
    resetRuntimeCapabilities()
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('groups duplicate vault passkeys by rp and account label with newest credential first', () => {
    const groups = groupPasskeys([
      passkey('stale', {
        userName: 'kaifat',
        userDisplayName: 'Kaifat',
        createdAtEpochMs: 10,
        lastUsedEpochMs: 1_000,
      }),
      passkey('fresh', {
        userName: 'kaifat',
        userDisplayName: 'Kaifat',
        createdAtEpochMs: 20,
        lastUsedEpochMs: 20,
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.primary.credentialIdB64Url).toBe('fresh')
    expect(groups[0]?.duplicates.map((item) => item.credentialIdB64Url)).toEqual(['stale'])
  })

  it('keeps different accounts on the same relying party in separate groups', () => {
    const groups = groupPasskeys([
      passkey('alice', {userName: 'alice', userDisplayName: 'Alice'}),
      passkey('bob', {userName: 'bob', userDisplayName: 'Bob'}),
    ])

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.accountLabel).sort()).toEqual(['alice', 'bob'])
  })

  it('does not merge blank account labels across credentials', () => {
    const groups = groupPasskeys([
      passkey('blank-a', {userName: '', userDisplayName: ''}),
      passkey('blank-b', {userName: '', userDisplayName: ''}),
    ])

    expect(groups).toHaveLength(2)
    expect(groups.every((group) => group.duplicates.length === 0)).toBe(true)
  })

  it('loads provider passkeys only when passkeys-lite runtime is available', async () => {
    enablePasskeysTauriRuntime()
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: {passkeys: [passkey('cred-1')]},
    })

    await passkeysPageModel.refreshPasskeys()

    expect(passkeysPageModel.passkeys()).toHaveLength(1)
    expect(passkeysPageModel.passkeys()[0]?.credentialIdB64Url).toBe('cred-1')
    expect(tauriInvoke).toHaveBeenCalledWith('credential_provider_passkeys_list')

    tauriInvoke.mockClear()
    vi.unstubAllGlobals()
    setRuntimeCapabilities({platform: 'ios', mobile: true, supports_autofill: true})
    await passkeysPageModel.refreshPasskeys()

    expect(passkeysPageModel.passkeys()).toEqual([])
    expect(tauriInvoke).not.toHaveBeenCalled()

    tauriInvoke.mockResolvedValue({
      ok: true,
      result: {passkeys: [passkey('ios-cred-1')]},
    })
    enablePasskeysTauriRuntime('ios')

    await passkeysPageModel.refreshPasskeys()

    expect(passkeysPageModel.passkeys()[0]?.credentialIdB64Url).toBe('ios-cred-1')
    expect(tauriInvoke).toHaveBeenCalledWith('credential_provider_passkeys_list')
  })

  it('loads provider passkeys on supported macOS desktop runtimes', async () => {
    enablePasskeysTauriRuntime('macos')
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: {passkeys: [passkey('macos-cred-1')]},
    })

    await passkeysPageModel.refreshPasskeys()

    expect(passkeysPageModel.passkeys()[0]?.credentialIdB64Url).toBe('macos-cred-1')
    expect(tauriInvoke).toHaveBeenCalledWith('credential_provider_passkeys_list')
  })

  it('ignores stale passkey list refresh completions', async () => {
    enablePasskeysTauriRuntime()
    const firstRefresh = deferred<{ok: true; result: {passkeys: PasskeySummary[]}}>()
    let listCalls = 0
    tauriInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'unlock_debug_log') return Promise.resolve({ok: true, result: null})
      if (cmd === 'credential_provider_passkeys_list') {
        listCalls += 1
        return listCalls === 1
          ? firstRefresh.promise
          : Promise.resolve({ok: true, result: {passkeys: [passkey('fresh')]}})
      }
      throw new Error(`Unexpected command: ${cmd}`)
    })

    const first = passkeysPageModel.refreshPasskeys()
    expect(passkeysPageModel.passkeysLoading()).toBe(true)

    await passkeysPageModel.refreshPasskeys({showLoading: false})
    expect(passkeysPageModel.passkeys().map((item) => item.credentialIdB64Url)).toEqual(['fresh'])

    firstRefresh.resolve({ok: true, result: {passkeys: [passkey('stale')]}})
    await first

    expect(passkeysPageModel.passkeys().map((item) => item.credentialIdB64Url)).toEqual(['fresh'])
    expect(passkeysPageModel.passkeysLoading()).toBe(false)
  })

  it('deletes a confirmed vault-backed passkey and refreshes the list', async () => {
    enablePasskeysTauriRuntime()
    passkeysPageModel.passkeys.set([passkey('cred-1')])
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'credential_provider_passkey_delete') return {ok: true, result: {deleted: true}}
      if (cmd === 'credential_provider_passkeys_list') return {ok: true, result: {passkeys: []}}
      throw new Error(`Unexpected command: ${cmd}`)
    })

    await passkeysPageModel.deletePasskey('cred-1')

    expect(dialogService.showConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delete vault passkey?',
        message: expect.stringContaining('portable ChromVoid passkey'),
        confirmText: 'Delete from vault',
        confirmVariant: 'danger',
      }),
    )
    expect(tauriInvoke).toHaveBeenCalledWith('credential_provider_passkey_delete', {
      credentialId: 'cred-1',
    })
    expect(tauriInvoke).toHaveBeenCalledWith('credential_provider_passkeys_list')
    expect(passkeysPageModel.passkeys()).toEqual([])
  })

  it('deletes a vault duplicate with the vault delete contract', async () => {
    enablePasskeysTauriRuntime()
    passkeysPageModel.passkeys.set([
      passkey('stale', {createdAtEpochMs: 10}),
      passkey('fresh', {createdAtEpochMs: 20}),
    ])
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'credential_provider_passkey_delete') return {ok: true, result: {deleted: true}}
      if (cmd === 'credential_provider_passkeys_list')
        return {ok: true, result: {passkeys: [passkey('fresh')]}}
      throw new Error(`Unexpected command: ${cmd}`)
    })

    await passkeysPageModel.deletePasskey('stale')

    expect(dialogService.showConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({title: 'Delete vault passkey?'}),
    )
    expect(tauriInvoke).toHaveBeenCalledWith('credential_provider_passkey_delete', {
      credentialId: 'stale',
    })
    expect(passkeysPageModel.passkeys().map((item) => item.credentialIdB64Url)).toEqual(['fresh'])
  })

  it('keeps passkeys visible when vault delete fails', async () => {
    enablePasskeysTauriRuntime()
    passkeysPageModel.passkeys.set([passkey('cred-1')])
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    tauriInvoke.mockResolvedValue({
      ok: false,
      error: 'Core delete failed',
      code: 'INTERNAL',
    })

    await passkeysPageModel.deletePasskey('cred-1')

    expect(passkeysPageModel.passkeys()).toHaveLength(1)
    expect(passkeysPageModel.passkeysError()).toBe('Core delete failed')
    expect(tauriInvoke).toHaveBeenCalledWith('credential_provider_passkey_delete', {
      credentialId: 'cred-1',
    })
  })

  it('renders grouped vault passkeys and reveals duplicates', async () => {
    ensureDefined()
    enablePasskeysTauriRuntime()
    vi.spyOn(passkeysPageModel, 'load').mockResolvedValue()
    passkeysPageModel.passkeys.set([
      passkey('stale-credential-id-000001', {
        createdAtEpochMs: 10,
        lastUsedEpochMs: 1_000,
      }),
      passkey('fresh-credential-id-000002', {
        createdAtEpochMs: 20,
        lastUsedEpochMs: 20,
      }),
    ])

    const page = document.createElement('passkeys-page') as PasskeysPage
    document.body.appendChild(page)
    await waitForPasskeysPage(page)

    let text = (page.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ')
    expect(text).toContain('What is a passkey?')
    expect(text).toContain('public/private key pair')
    expect(text).toContain('Vault-backed passkeys')
    expect(text).toContain('Portable')
    expect(text).toContain('kaifat')
    expect(text).toContain('github.com')
    expect(text).toContain('1 duplicate credentials')
    expect(text).toContain('Deleting a vault passkey')
    expect(text).not.toContain('Credential stale-cr...000001')

    const toggle = [...(page.shadowRoot?.querySelectorAll('cv-button') ?? [])].find((button) =>
      button.textContent?.includes('Show duplicates'),
    ) as HTMLElement | undefined
    expect(toggle).not.toBeUndefined()
    toggle!.click()
    await waitForPasskeysPage(page)

    text = (page.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ')
    expect(text).toContain('Credential stale-cr...000001')
    expect(text).toContain('Hide duplicates')
  })

  it('renders no-passkeys state through the shared empty state component', async () => {
    ensureDefined()
    enablePasskeysTauriRuntime()
    vi.spyOn(passkeysPageModel, 'load').mockResolvedValue()
    passkeysPageModel.passkeys.set([])

    const page = document.createElement('passkeys-page') as PasskeysPage
    document.body.appendChild(page)
    await waitForPasskeysPage(page)

    const emptyState = page.shadowRoot?.querySelector('cv-empty-state')
    const text = page.shadowRoot?.textContent ?? ''

    expect(emptyState?.getAttribute('icon')).toBe('octicons:passkey-fill')
    expect(emptyState?.hasAttribute('icon-fill')).toBe(true)
    expect(emptyState?.getAttribute('headline')).toBe('No passkeys yet')
    expect(emptyState?.getAttribute('description')).toContain(
      'Start passkey creation from a supported website or app',
    )
    expect(emptyState?.getAttribute('description')).toContain(
      'choose ChromVoid in the system Credential Provider interface',
    )
    expect(page.shadowRoot?.querySelector('cv-guidance-anchor[anchor-id="passkeys.manage"]')).not.toBeNull()
    expect(text).toContain('What is a passkey?')
    expect(text).not.toContain('Deleting a vault passkey')
  })

  it('does not invoke native passkey commands without Tauri runtime', async () => {
    ensureDefined()
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_autofill: true,
    })
    passkeysPageModel.passkeys.set([passkey('cred-1')])

    const page = document.createElement('passkeys-page') as PasskeysPage
    document.body.appendChild(page)
    await waitForPasskeysPage(page)

    const text = page.shadowRoot?.textContent ?? ''
    expect(text).toContain('supported Credential Provider runtimes')
    expect(page.shadowRoot?.querySelector('cv-empty-state')).toBeNull()
    expect(tauriInvoke).not.toHaveBeenCalled()
  })

  it('renders page content without a local header', async () => {
    ensureDefined()

    const page = document.createElement('passkeys-page') as PasskeysPage
    document.body.append(page)
    await waitForPasskeysPage(page)

    expect(page.shadowRoot?.querySelector('.header')).toBeNull()
    expect(page.shadowRoot?.querySelector('.card')).not.toBeNull()
  })
})
