import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  tauriInvoke: vi.fn(),
  tauriListen: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mocks.open(...args),
}))

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => mocks.tauriInvoke(...args),
  tauriListen: (...args: unknown[]) => mocks.tauriListen(...args),
}))

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {WelcomeToolsSection} from '../../src/routes/welcome/sections/tools'
import {WelcomeSharedModel, WelcomeToolsModel} from '../../src/routes/welcome/welcome.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {dialogService} from '../../src/shared/services/dialog-service'

function setTauriRuntime() {
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {invoke: vi.fn()},
  })
}

function clearTauriRuntime() {
  Reflect.deleteProperty(globalThis, '__TAURI_INTERNALS__')
}

function initToolsContext() {
  const pushNotification = vi.fn()
  initAppContext(
    createMockAppContext({
      store: {
        remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
        pushNotification,
      } as never,
      state: {
        data: () => ({
          NeedUserInitialization: false,
          StorageOpened: true,
          StorePath: '/vault/storage',
        }),
      } as never,
    }),
  )
  return {pushNotification}
}

async function mountTools(layout: 'desktop' | 'mobile') {
  const section = document.createElement('welcome-tools-section') as WelcomeToolsSection
  section.layout = layout
  section.model = new WelcomeToolsModel(new WelcomeSharedModel())
  document.body.append(section)
  await section.updateComplete
  await Promise.resolve()
  return section
}

function findButtonByText(root: ShadowRoot | null | undefined, text: string): HTMLElement | null {
  return (
    [...(root?.querySelectorAll<HTMLElement>('cv-button') ?? [])].find((button) =>
      (button.textContent ?? '').includes(text),
    ) ?? null
  )
}

describe('welcome tools section', () => {
  let context: ReturnType<typeof initToolsContext>

  beforeEach(() => {
    WelcomeToolsSection.define()
    resetRuntimeCapabilities()
    context = initToolsContext()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
    clearTauriRuntime()
    resetRuntimeCapabilities()
    vi.restoreAllMocks()
    mocks.open.mockReset()
    mocks.tauriInvoke.mockReset()
    mocks.tauriListen.mockReset()
  })

  it('renders desktop utilities footer and opens the device utilities drawer', async () => {
    const section = await mountTools('desktop')

    expect(section.shadowRoot?.querySelectorAll('.desktop-utility-button')).toHaveLength(2)
    const drawer = section.shadowRoot?.querySelector('cv-drawer.utilities-drawer') as
      | (HTMLElement & {open?: boolean; placement?: string})
      | null
    expect(drawer).not.toBeNull()
    expect(drawer?.placement).toBe('end')
    expect(section.shadowRoot?.querySelector('cv-bottom-sheet.utilities-sheet')).toBeNull()

    section.shadowRoot?.querySelector<HTMLButtonElement>('.desktop-utility-button')?.click()
    await section.updateComplete

    const text = (section.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ')
    expect(section.model?.deviceUtilitiesOpen()).toBe(true)
    await expect.poll(() => drawer?.open).toBe(true)
    expect(section.model?.deviceUtilitiesScreen()).toBe('list')
    expect(text).toContain('Device utilities')
    expect(text).toContain('Backup')
    expect(text).toContain('Restore')
    expect(text).toContain('Change master password')
    expect(text).toContain('Erase')
    expect(text).toContain('System')
  })

  it('renders only the desktop utility actions in the footer', async () => {
    const section = await mountTools('desktop')
    const footer = section.shadowRoot?.querySelector('.desktop-utilities')
    const text = (footer?.textContent ?? '').replace(/\s+/g, ' ')

    expect(footer?.children).toHaveLength(1)
    expect(footer?.querySelectorAll('.desktop-utility-button')).toHaveLength(2)
    expect(text).toContain('Device utilities')
    expect(text).toContain('System')
    expect(text).not.toContain('SECONDARY')
  })

  it('renders mobile device utilities without the storage location panel', async () => {
    const section = await mountTools('mobile')
    const text = (section.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ')

    expect(section.shadowRoot?.querySelectorAll('.mobile-utilities-button')).toHaveLength(1)
    expect(section.shadowRoot?.querySelectorAll('cv-bottom-sheet.utilities-sheet')).toHaveLength(1)
    expect(section.shadowRoot?.querySelector('cv-drawer.utilities-drawer')).toBeNull()
    expect(text).toContain('Device utilities')
    expect(text).toContain('Change master password')
    expect(text).not.toContain('Storage location')
  })

  it('keeps mobile device utilities inside the same bottom sheet when opening restore', async () => {
    const confirmDialog = vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    const passwordDialog = vi.spyOn(dialogService, 'showInputDialog').mockResolvedValue('secret-password')
    const section = await mountTools('mobile')

    section.shadowRoot?.querySelector<HTMLElement>('.mobile-utilities-button')?.click()
    await section.updateComplete

    const sheet = section.shadowRoot?.querySelector('cv-bottom-sheet.utilities-sheet') as
      | (HTMLElement & {open?: boolean})
      | null
    await expect.poll(() => sheet?.open).toBe(true)

    const restoreRow = [
      ...(section.shadowRoot?.querySelectorAll<HTMLButtonElement>('.utilities-row') ?? []),
    ].find((row) => (row.textContent ?? '').includes('Restore device'))
    restoreRow?.click()
    await section.updateComplete

    expect(section.model?.deviceUtilitiesScreen()).toBe('restore')
    expect(sheet?.open).toBe(true)
    await expect
      .poll(() => (section.shadowRoot?.textContent ?? '').replace(/\s+/g, ' '))
      .toContain('I understand this restore will replace')
    const updatedText = (section.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ')
    expect(updatedText).toContain('Restore device')
    expect(confirmDialog).not.toHaveBeenCalled()
    expect(passwordDialog).not.toHaveBeenCalled()
  })

  it('shows live storage controls only when root selection is supported', async () => {
    setTauriRuntime()
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_storage_root_selection: true,
    })

    const section = await mountTools('desktop')
    const systemButton = [
      ...(section.shadowRoot?.querySelectorAll<HTMLButtonElement>('.desktop-utility-button') ?? []),
    ].find((button) => (button.textContent ?? '').includes('System'))
    systemButton?.click()
    await section.updateComplete

    expect(section.model?.supportsStorageRootSelection()).toBe(true)
    expect(section.model?.deviceUtilitiesOpen()).toBe(true)
    expect(section.model?.deviceUtilitiesScreen()).toBe('system')
    await expect.poll(() => section.shadowRoot?.querySelector('.utilities-system-panel')).not.toBeNull()
    await expect
      .poll(() => (section.shadowRoot?.textContent ?? '').replace(/\s+/g, ' '))
      .toContain('Change Location')
    const updatedText = (section.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ')
    expect(updatedText).toContain('Use Default Location')
  })

  it('keeps mobile backup mode separate from live storage root selection', async () => {
    setTauriRuntime()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_mobile_backup_restore: true,
      supports_storage_root_selection: false,
    })

    const section = await mountTools('mobile')
    const text = (section.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ')

    expect(section.model?.supportsMobileBackupRestore()).toBe(true)
    expect(section.model?.supportsAndroidSafBackupRestore()).toBe(true)
    expect(section.model?.supportsStorageRootSelection()).toBe(false)
    expect(text).not.toContain('Change Location')
    expect(text).not.toContain('Use Default Location')
  })

  it('starts mobile backup without opening a path picker', async () => {
    setTauriRuntime()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_mobile_backup_restore: true,
      supports_storage_root_selection: false,
    })
    vi.spyOn(dialogService, 'showInputDialog').mockResolvedValue('secret-password')
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {backup_dir: 'Android backup folder/backup-123'},
    })

    const model = new WelcomeToolsModel(new WelcomeSharedModel())
    await model.onBackupClick()

    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.tauriInvoke).toHaveBeenCalledWith('backup_local_create', {
      masterPassword: 'secret-password',
    })
    expect(context.pushNotification).toHaveBeenCalledWith(
      'success',
      'Backup created at: Android backup folder/backup-123',
    )
  })

  it('submits mobile backup from the utilities sub-screen without opening a password dialog', async () => {
    setTauriRuntime()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_mobile_backup_restore: true,
      supports_storage_root_selection: false,
    })
    const passwordDialog = vi.spyOn(dialogService, 'showInputDialog').mockResolvedValue('secret-password')
    mocks.tauriListen.mockResolvedValue(() => {})
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {backup_dir: 'Android backup folder/backup-123'},
    })

    const model = new WelcomeToolsModel(new WelcomeSharedModel())
    model.openDeviceUtilities()
    model.onBackupFromDeviceUtilities()
    model.handleDeviceUtilitiesMasterPasswordInput(
      new CustomEvent('cv-input', {
        detail: {value: 'secret-password'},
      }),
    )
    model.handleDeviceUtilitiesBackupSubmit(new Event('submit', {cancelable: true}))

    await vi.waitFor(() => {
      expect(mocks.tauriInvoke).toHaveBeenCalledWith('backup_local_create', {
        masterPassword: 'secret-password',
      })
    })
    expect(passwordDialog).not.toHaveBeenCalled()
    expect(mocks.open).not.toHaveBeenCalled()
    expect(model.deviceUtilitiesOpen()).toBe(true)
    expect(model.deviceUtilitiesScreen()).toBe('list')
  })

  it('keeps backup submit available and explains a missing master password', async () => {
    setTauriRuntime()
    const model = new WelcomeToolsModel(new WelcomeSharedModel())
    model.openDeviceUtilities()
    model.onBackupFromDeviceUtilities()

    expect(model.deviceUtilitiesSubmitDisabled()).toBe(false)

    model.handleDeviceUtilitiesBackupSubmit(new Event('submit', {cancelable: true}))

    await vi.waitFor(() => {
      expect(model.deviceUtilitiesForm().error).toBe('Master Password is required')
    })
    expect(mocks.tauriInvoke).not.toHaveBeenCalled()
  })

  it('does not start backup when the password prompt is cancelled', async () => {
    setTauriRuntime()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_mobile_backup_restore: true,
      supports_storage_root_selection: false,
    })
    vi.spyOn(dialogService, 'showInputDialog').mockResolvedValue(null)

    const model = new WelcomeToolsModel(new WelcomeSharedModel())
    await model.onBackupClick()

    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.tauriInvoke).not.toHaveBeenCalled()
    expect(model.busy()).toBe(false)
  })

  it('changes the master password from the welcome tools dialog result', async () => {
    setTauriRuntime()
    vi.spyOn(dialogService, 'showCustomDialog').mockResolvedValue({
      currentPassword: 'old master password',
      newMasterPassword: 'new master password',
    })
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        rewrapped_artifacts: ['master.verify'],
        backup_recommended: true,
      },
    })

    const model = new WelcomeToolsModel(new WelcomeSharedModel())
    await model.onMasterPasswordChangeClick()

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('master_rekey', {
      currentPassword: 'old master password',
      newMasterPassword: 'new master password',
    })
    expect(context.pushNotification).toHaveBeenCalledWith(
      'success',
      'Master password changed. Create a new backup when you can.',
    )
  })

  it('skips master password migration when the dialog is cancelled', async () => {
    setTauriRuntime()
    vi.spyOn(dialogService, 'showCustomDialog').mockResolvedValue(null)

    const model = new WelcomeToolsModel(new WelcomeSharedModel())
    await model.onMasterPasswordChangeClick()

    expect(mocks.tauriInvoke).not.toHaveBeenCalled()
    expect(model.masterRekeyInProgress()).toBe(false)
  })

  it('does not open master password migration outside Tauri runtime', async () => {
    const dialog = vi.spyOn(dialogService, 'showCustomDialog').mockResolvedValue({
      currentPassword: 'old master password',
      newMasterPassword: 'new master password',
    })

    const model = new WelcomeToolsModel(new WelcomeSharedModel())
    await model.onMasterPasswordChangeClick()

    expect(dialog).not.toHaveBeenCalled()
    expect(mocks.tauriInvoke).not.toHaveBeenCalled()
  })

  it('sets and resets busy and loading state while device utilities master password migration is pending', async () => {
    setTauriRuntime()
    let finishRekey!: (value: unknown) => void
    mocks.tauriInvoke.mockReturnValue(
      new Promise((resolve) => {
        finishRekey = resolve
      }),
    )

    const section = await mountTools('desktop')
    section.model?.openDeviceUtilities()
    section.model?.onMasterPasswordChangeFromDeviceUtilities()
    section.model?.handleDeviceUtilitiesCurrentPasswordInput(
      new CustomEvent('cv-input', {detail: {value: 'old master password'}}),
    )
    section.model?.handleDeviceUtilitiesNewMasterPasswordInput(
      new CustomEvent('cv-input', {detail: {value: 'new master password'}}),
    )
    section.model?.handleDeviceUtilitiesConfirmPasswordInput(
      new CustomEvent('cv-input', {detail: {value: 'new master password'}}),
    )
    section.model?.handleDeviceUtilitiesMasterPasswordSubmit(new Event('submit', {cancelable: true}))

    await vi.waitFor(() => {
      expect(section.model?.masterRekeyInProgress()).toBe(true)
      expect(section.model?.busy()).toBe(true)
    })
    await section.updateComplete
    const button = findButtonByText(section.shadowRoot, 'Change master password') as
      | (HTMLElement & {loading?: boolean})
      | null
    expect(button?.hasAttribute('disabled')).toBe(true)
    expect(button?.loading).toBe(true)

    finishRekey({
      ok: true,
      result: {
        rewrapped_artifacts: ['master.verify'],
        backup_recommended: true,
      },
    })
    await vi.waitFor(() => {
      expect(section.model?.masterRekeyInProgress()).toBe(false)
      expect(section.model?.busy()).toBe(false)
    })

    await section.updateComplete
    expect(section.model?.deviceUtilitiesScreen()).toBe('list')
    expect(section.shadowRoot?.querySelector('.utilities-form-submit')).toBeNull()
  })

  it('maps invalid current master password errors to user-facing copy', async () => {
    setTauriRuntime()
    vi.spyOn(dialogService, 'showCustomDialog').mockResolvedValue({
      currentPassword: 'wrong master password',
      newMasterPassword: 'new master password',
    })
    mocks.tauriInvoke.mockResolvedValue({
      ok: false,
      error: 'Current master password is invalid',
      code: 'MASTER_REKEY_INVALID_CURRENT_PASSWORD',
    })

    const model = new WelcomeToolsModel(new WelcomeSharedModel())
    await model.onMasterPasswordChangeClick()

    expect(context.pushNotification).toHaveBeenCalledWith('error', 'Current master password is incorrect')
  })

  it('shows backend master password migration errors when no copy mapping exists', async () => {
    setTauriRuntime()
    vi.spyOn(dialogService, 'showCustomDialog').mockResolvedValue({
      currentPassword: 'old master password',
      newMasterPassword: 'new master password',
    })
    mocks.tauriInvoke.mockResolvedValue({
      ok: false,
      error: 'Master rekey transaction artifact registry mismatch',
      code: 'MASTER_REKEY_INTEGRITY_FAILED',
    })

    const model = new WelcomeToolsModel(new WelcomeSharedModel())
    await model.onMasterPasswordChangeClick()

    expect(context.pushNotification).toHaveBeenCalledWith(
      'error',
      'Master rekey transaction artifact registry mismatch',
    )
    expect(model.masterRekeyInProgress()).toBe(false)
  })

  it('selects mobile restore source before asking for the master password', async () => {
    setTauriRuntime()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_mobile_backup_restore: true,
      supports_storage_root_selection: false,
    })
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    const passwordDialog = vi.spyOn(dialogService, 'showInputDialog').mockResolvedValue('secret-password')
    mocks.tauriListen.mockResolvedValue(() => {})
    mocks.tauriInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'restore_local_select_source') {
        return Promise.resolve({
          ok: true,
          result: {
            backup_path: 'content://chromvoid-backup',
            display_name: 'Android restore folder',
          },
        })
      }
      if (command === 'restore_local_from_folder') {
        return Promise.resolve({ok: true, result: {args}})
      }
      return Promise.reject(new Error(`unexpected command: ${command}`))
    })

    const model = new WelcomeToolsModel(new WelcomeSharedModel())
    await model.onRestoreClick()

    expect(mocks.open).not.toHaveBeenCalled()
    expect(passwordDialog).toHaveBeenCalledTimes(1)
    expect(mocks.tauriInvoke.mock.calls[0]?.[0]).toBe('restore_local_select_source')
    expect(mocks.tauriInvoke).toHaveBeenCalledWith('restore_local_from_folder', {
      masterPassword: 'secret-password',
      backupPath: 'content://chromvoid-backup',
    })
  })

  it('does not start restore when the confirmation dialog is cancelled', async () => {
    setTauriRuntime()
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(false)
    const passwordDialog = vi.spyOn(dialogService, 'showInputDialog').mockResolvedValue('secret-password')

    const model = new WelcomeToolsModel(new WelcomeSharedModel())
    await model.onRestoreClick()

    expect(mocks.open).not.toHaveBeenCalled()
    expect(passwordDialog).not.toHaveBeenCalled()
    expect(mocks.tauriInvoke).not.toHaveBeenCalled()
    expect(model.busy()).toBe(false)
  })

  it('does not start restore when the password prompt is cancelled', async () => {
    setTauriRuntime()
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
    })
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    vi.spyOn(dialogService, 'showInputDialog').mockResolvedValue(null)
    mocks.open.mockResolvedValue('/backup/path')

    const model = new WelcomeToolsModel(new WelcomeSharedModel())
    await model.onRestoreClick()

    expect(mocks.open).toHaveBeenCalledTimes(1)
    expect(mocks.tauriInvoke).not.toHaveBeenCalled()
    expect(model.busy()).toBe(false)
  })

  it('does not erase the device when the erase password prompt is cancelled', async () => {
    setTauriRuntime()
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    vi.spyOn(dialogService, 'showInputDialog').mockResolvedValue(null)

    const model = new WelcomeToolsModel(new WelcomeSharedModel())
    await model.onEraseClick()

    expect(mocks.tauriInvoke).not.toHaveBeenCalled()
    expect(model.busy()).toBe(false)
  })

  it('renders restore progress events while restore is running', async () => {
    setTauriRuntime()
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
    })
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    vi.spyOn(dialogService, 'showInputDialog').mockResolvedValue('secret-password')
    mocks.open.mockResolvedValue('/backup/path')
    mocks.tauriListen.mockResolvedValue(() => {})

    let finishRestore!: (value: unknown) => void
    mocks.tauriInvoke.mockReturnValue(
      new Promise((resolve) => {
        finishRestore = resolve
      }),
    )

    const section = await mountTools('desktop')
    const restorePromise = section.model?.onRestoreClick()

    await expect.poll(() => mocks.tauriListen.mock.calls.length).toBe(1)
    const [, onProgress] = mocks.tauriListen.mock.calls[0] as [
      string,
      (payload: {
        restore_id: string
        phase: 'chunks'
        chunk_index: number
        chunk_count: number
        bytes_written: number
        estimated_size: number
      }) => void,
    ]
    onProgress({
      restore_id: 'restore-1',
      phase: 'chunks',
      chunk_index: 3,
      chunk_count: 10,
      bytes_written: 3072,
      estimated_size: 10240,
    })
    await expect
      .poll(() => (section.shadowRoot?.textContent ?? '').replace(/\s+/g, ' '))
      .toContain('Restoring data')
    const text = (section.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ')
    expect(text).toContain('30%')
    expect(text).toContain('Block 3 of 10')

    finishRestore({ok: true, result: {}})
    await restorePromise
  })
})
