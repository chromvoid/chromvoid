import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import type {SettingsRoute} from '../../src/app/navigation/navigation.types'
import {DEFAULT_SESSION_SETTINGS} from '../../src/core/session/session-settings'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {setLang} from '../../src/i18n'
import {SettingsPage} from '../../src/routes/settings/settings-page'
import {settingsPageModel} from '../../src/routes/settings/settings.model'
import {vaultRekeyModel} from '../../src/routes/settings/vault-rekey.model'
import {passmanagerMaintenanceModel} from '../../src/features/passmanager/models/passmanager-maintenance.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

type MobileLayout = HTMLElement & {updateComplete: Promise<unknown>}
type BottomSheet = HTMLElement & {open: boolean}

function deferredVoid() {
  let resolve!: () => void
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve
  })
  return {promise, resolve}
}

let defined = false

function ensureDefined(): void {
  if (defined) return
  SettingsPage.define()
  defined = true
}

function setRoute(route: SettingsRoute): void {
  navigationModel.snapshot.set({
    surface: 'settings',
    settings: route,
    overlay: {kind: 'none'},
  })
}

async function flushLayout(layout: MobileLayout): Promise<void> {
  await Promise.resolve()
  await layout.updateComplete
  await Promise.resolve()
  await layout.updateComplete
}

async function renderMobileSettings(route: SettingsRoute = {kind: 'overview'}): Promise<{
  page: SettingsPage
  layout: MobileLayout
  root: ShadowRoot
}> {
  ensureDefined()
  setRoute(route)
  const page = document.createElement('settings-page') as SettingsPage
  document.body.append(page)
  await page.updateComplete
  const layout = page.shadowRoot?.querySelector<MobileLayout>('settings-page-mobile-layout')
  if (!layout?.shadowRoot) throw new Error('Mobile Settings layout not found')
  await flushLayout(layout)
  return {page, layout, root: layout.shadowRoot}
}

function findButton(root: ShadowRoot, text: string): HTMLButtonElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes(text),
    ) ?? null
  )
}

function findSheet(root: ShadowRoot, title: string): BottomSheet | null {
  return (
    Array.from(root.querySelectorAll<BottomSheet>('cv-bottom-sheet')).find(
      (sheet) => sheet.querySelector('[slot="title"]')?.textContent === title,
    ) ?? null
  )
}

describe('Settings page mobile navigation and transient UI', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      desktop: false,
      supports_autofill: true,
      supports_biometric: true,
    })
    initAppContext(createMockAppContext())
    setLang('en')
    settingsPageModel.settings.set({...DEFAULT_SESSION_SETTINGS})
    settingsPageModel.credentialProviderSelected.set(null)
    settingsPageModel.androidQuickLockTileStatus.set(null)
    settingsPageModel.failedPreference.set(null)
    passmanagerMaintenanceModel.importDialogOpen.set(false)
    passmanagerMaintenanceModel.busyAction.set(null)
    vaultRekeyModel.reset()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
  })

  afterEach(() => {
    document.querySelectorAll('settings-page').forEach((element) => element.remove())
    settingsPageModel.closePasswordImportDialog()
    settingsPageModel.failedPreference.set(null)
    passmanagerMaintenanceModel.busyAction.set(null)
    vaultRekeyModel.reset()
    clearAppContext()
    resetRuntimeCapabilities()
    setLang('en')
    vi.restoreAllMocks()
  })

  it('canonicalizes an unsupported direct Autofill route to overview with replace', async () => {
    setRuntimeCapabilities({platform: 'linux', mobile: true, desktop: false, supports_autofill: false})
    const navigateSpy = vi.spyOn(navigationModel, 'navigateToSettingsRoute')

    const {layout, root} = await renderMobileSettings({kind: 'autofill'})
    await flushLayout(layout)

    expect(navigationModel.settingsRoute()).toEqual({kind: 'overview'})
    expect(navigateSpy).toHaveBeenCalledWith({kind: 'overview'}, 'replace')
    expect(root.querySelector('.overview')).not.toBeNull()
    expect(root.querySelector('[data-settings-route="autofill"]')).toBeNull()
  })

  it('hides external Pro settings and canonicalizes a direct License route', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      desktop: false,
      supports_autofill: true,
      supports_external_pro: false,
    })
    const navigateSpy = vi.spyOn(navigationModel, 'navigateToSettingsRoute')

    const {layout, root} = await renderMobileSettings({kind: 'license'})
    await flushLayout(layout)

    expect(navigationModel.settingsRoute()).toEqual({kind: 'overview'})
    expect(navigateSpy).toHaveBeenCalledWith({kind: 'overview'}, 'replace')
    expect(root.querySelector('[data-settings-route="license"]')).toBeNull()
    expect(root.querySelector('[data-settings-route="autofill"]')).toBeNull()
    expect(root.querySelector('.license-input')).toBeNull()
  })

  it('restores focus to the source row after an unsupported Autofill redirect', async () => {
    setRuntimeCapabilities({platform: 'linux', mobile: true, desktop: false, supports_autofill: false})
    const {layout, root} = await renderMobileSettings({kind: 'security'})

    navigationModel.navigateToSettingsRoute({kind: 'autofill'})
    await flushLayout(layout)

    expect(navigationModel.settingsRoute()).toEqual({kind: 'overview'})
    expect(root.activeElement).toBe(root.querySelector('[data-settings-route="security"]'))
  })

  it('delegates switch changes to the settings model with one labelled control per row', async () => {
    const setLockOnSleep = vi.spyOn(settingsPageModel, 'setLockOnSleep').mockResolvedValue()
    const {root} = await renderMobileSettings({kind: 'security'})
    const control = root.querySelector<HTMLElement>(
      'cv-switch[aria-label="Lock when app is hidden or device sleeps"]',
    )

    expect(control).not.toBeNull()
    expect(control?.getAttribute('aria-label')).toBe('Lock when app is hidden or device sleeps')
    control?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {checked: true},
        bubbles: true,
        composed: true,
      }),
    )

    expect(setLockOnSleep).toHaveBeenCalledWith(true)
  })

  it('announces a localized preference error beside the affected row', async () => {
    settingsPageModel.failedPreference.set('show_hidden_files')
    const {root} = await renderMobileSettings({kind: 'files'})
    const error = root.querySelector('[role="status"][aria-live="polite"]')

    expect(error?.textContent).toBe('Failed to save settings')
  })

  it('keeps the auto-lock sheet open after a failed save and closes it after retry', async () => {
    const save = vi
      .spyOn(settingsPageModel, 'setAutoLockTimeout')
      .mockImplementationOnce(async () => {
        settingsPageModel.failedPreference.set('auto_lock_timeout_secs')
        return false
      })
      .mockImplementationOnce(async () => {
        settingsPageModel.failedPreference.set(null)
        return true
      })
    const {layout, root} = await renderMobileSettings({kind: 'security'})
    findButton(root, 'Auto-lock after')?.click()
    await flushLayout(layout)
    const sheet = findSheet(root, 'Auto-lock after')
    const option = sheet?.querySelector<HTMLButtonElement>('[data-value="300"]')

    expect(sheet?.open).toBe(true)
    expect(option?.getAttribute('role')).toBe('radio')
    option?.click()
    await flushLayout(layout)

    expect(save).toHaveBeenLastCalledWith('300')
    expect(sheet?.open).toBe(true)
    expect(sheet?.querySelector('[role="status"]')?.textContent?.trim()).toBe('Failed to save settings')

    option?.click()
    await flushLayout(layout)

    expect(save).toHaveBeenCalledTimes(2)
    expect(sheet?.open).toBe(false)
  })

  it('preserves the attachment-folder draft and sheet until persistence succeeds', async () => {
    const save = vi
      .spyOn(settingsPageModel, 'setMarkdownAttachmentFolderPath')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const {layout, root} = await renderMobileSettings({kind: 'files'})
    findButton(root, 'Markdown image attachments')?.click()
    await flushLayout(layout)
    const sheet = findSheet(root, 'Markdown image attachments')
    const input = sheet?.querySelector<HTMLInputElement>('#settings-attachment-folder-input')
    const saveButton = sheet?.querySelector<HTMLElement>('cv-button')

    expect(sheet?.open).toBe(true)
    expect(input).not.toBeNull()
    input!.value = '/media/screenshots'
    input!.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))
    saveButton?.click()
    await flushLayout(layout)

    expect(save).toHaveBeenLastCalledWith('/media/screenshots')
    expect(sheet?.open).toBe(true)
    expect(input?.value).toBe('/media/screenshots')

    saveButton?.click()
    await flushLayout(layout)

    expect(save).toHaveBeenCalledTimes(2)
    expect(sheet?.open).toBe(false)
  })

  it('opens task routes from Password vault and blocks departure during active rekey', async () => {
    const openImport = vi
      .spyOn(settingsPageModel, 'openPasswordImportTask')
      .mockImplementation(async () => navigationModel.navigateToSettingsRoute({kind: 'password-import'}))
    const {layout, root} = await renderMobileSettings({kind: 'passwords'})

    findButton(root, 'Import')?.click()
    await flushLayout(layout)
    expect(openImport).toHaveBeenCalledTimes(1)
    expect(navigationModel.settingsRoute()).toEqual({kind: 'password-import'})

    navigationModel.navigateToSettingsRoute({kind: 'passwords'}, 'replace')
    await flushLayout(layout)
    findButton(root, 'Vault password')?.click()
    await flushLayout(layout)
    expect(navigationModel.settingsRoute()).toEqual({kind: 'vault-rekey'})
    expect(root.querySelector('settings-vault-rekey-form')).not.toBeNull()

    vaultRekeyModel.busy.set(true)
    navigationModel.navigateToSettingsRoute({kind: 'passwords'})
    expect(navigationModel.settingsRoute()).toEqual({kind: 'vault-rekey'})

    vaultRekeyModel.busy.set(false)
    navigationModel.navigateToSettingsRoute({kind: 'passwords'})
    await flushLayout(layout)
    expect(navigationModel.settingsRoute()).toEqual({kind: 'passwords'})
  })

  it('prepares a direct import task route and exposes a polite progress state', async () => {
    const prepare = vi.spyOn(settingsPageModel, 'ensurePasswordImportTaskReady').mockResolvedValue()
    const {layout, root} = await renderMobileSettings({kind: 'password-import'})
    await flushLayout(layout)

    expect(prepare).toHaveBeenCalledTimes(1)
    expect(root.querySelector('#settings-mobile-heading')?.textContent).toBe('Import')
    expect(root.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull()
  })

  it('does not open or navigate after direct import preparation outlives the mobile page', async () => {
    const preparation = deferredVoid()
    const prepareImport = vi
      .spyOn(passmanagerMaintenanceModel, 'prepareImport')
      .mockReturnValue(preparation.promise)
    const navigate = vi.spyOn(navigationModel, 'navigateToSettingsRoute')
    const {page} = await renderMobileSettings({kind: 'password-import'})

    expect(prepareImport).toHaveBeenCalledTimes(1)

    page.remove()
    preparation.resolve()
    await preparation.promise
    await vi.waitFor(() => expect(passmanagerMaintenanceModel.busyAction()).toBeNull())

    expect(navigate).not.toHaveBeenCalled()
    expect(passmanagerMaintenanceModel.importDialogOpen()).toBe(false)
  })

  it('cancels import preparation when navigation leaves the source route', async () => {
    const preparation = deferredVoid()
    const prepareImport = vi
      .spyOn(passmanagerMaintenanceModel, 'prepareImport')
      .mockReturnValue(preparation.promise)
    const {layout, root} = await renderMobileSettings({kind: 'passwords'})

    findButton(root, 'Import')?.click()
    await vi.waitFor(() => expect(prepareImport).toHaveBeenCalledTimes(1))

    navigationModel.navigateToSettingsRoute({kind: 'overview'})
    await flushLayout(layout)
    preparation.resolve()
    await preparation.promise
    await vi.waitFor(() => expect(passmanagerMaintenanceModel.busyAction()).toBeNull())

    expect(navigationModel.settingsRoute()).toEqual({kind: 'overview'})
    expect(passmanagerMaintenanceModel.importDialogOpen()).toBe(false)
  })

  it('moves focus to the detail heading and returns it to the originating overview row', async () => {
    const {layout, root} = await renderMobileSettings()
    const origin = root.querySelector<HTMLButtonElement>('[data-settings-route="license"]')

    origin?.click()
    await flushLayout(layout)
    expect(navigationModel.settingsRoute()).toEqual({kind: 'license'})
    expect(root.activeElement).toBe(root.querySelector('#settings-mobile-heading'))

    expect(navigationModel.goBackFromUi()).toBe(true)
    await flushLayout(layout)
    expect(navigationModel.settingsRoute()).toEqual({kind: 'overview'})
    expect(root.activeElement).toBe(root.querySelector('[data-settings-route="license"]'))
  })
})
