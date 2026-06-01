import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {DEFAULT_SESSION_SETTINGS} from '../../src/core/session/session-settings'
import {setLang as setAppLang} from '../../src/i18n'
import {passmanagerMaintenanceModel} from '../../src/features/passmanager/models/passmanager-maintenance.model'
import {SettingsPage} from '../../src/routes/settings/settings-page'
import {settingsPageModel} from '../../src/routes/settings/settings.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

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
  await Promise.resolve()
  await page.updateComplete
  return page
}

function findButton(page: SettingsPage, label: string): HTMLElement {
  const button = Array.from(page.shadowRoot?.querySelectorAll('cv-button') ?? []).find((candidate) =>
    candidate.textContent?.includes(label),
  ) as HTMLElement | undefined
  if (!button) throw new Error(`Button not found: ${label}`)
  return button
}

describe('Settings passmanager maintenance', () => {
  beforeEach(() => {
    initAppContext(createMockAppContext())
    setAppLang('en')
    settingsPageModel.settings.set({...DEFAULT_SESSION_SETTINGS})
    settingsPageModel.vaultRekey.reset()
    passmanagerMaintenanceModel.importDialogOpen.set(false)
    passmanagerMaintenanceModel.importCompletedSuccessfully.set(false)
    passmanagerMaintenanceModel.busyAction.set(null)
    passmanagerMaintenanceModel.error.set('')
  })

  afterEach(() => {
    document.querySelectorAll('settings-page').forEach((element) => element.remove())
    clearAppContext()
    setAppLang('en')
    settingsPageModel.vaultRekey.reset()
    passmanagerMaintenanceModel.importDialogOpen.set(false)
    passmanagerMaintenanceModel.importCompletedSuccessfully.set(false)
    passmanagerMaintenanceModel.busyAction.set(null)
    passmanagerMaintenanceModel.error.set('')
    vi.restoreAllMocks()
  })

  it('renders Passwords maintenance actions in Settings', async () => {
    const page = await renderSettingsPage()

    expect(page.shadowRoot?.textContent).toContain('Passwords')
    expect(page.shadowRoot?.textContent).toContain('Import, export, or clear password vault data.')
    expect(findButton(page, 'Import')).toBeTruthy()
    expect(findButton(page, 'Export')).toBeTruthy()
    expect(findButton(page, 'Clear')).toBeTruthy()
  })

  it('delegates maintenance buttons to the Settings model', async () => {
    const openSpy = vi.spyOn(settingsPageModel, 'openPasswordImport').mockResolvedValue()
    const exportSpy = vi.spyOn(settingsPageModel, 'exportPasswords').mockResolvedValue()
    const cleanSpy = vi.spyOn(settingsPageModel, 'cleanPasswords').mockResolvedValue()
    const page = await renderSettingsPage()

    findButton(page, 'Import').click()
    findButton(page, 'Export').click()
    findButton(page, 'Clear').click()

    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(exportSpy).toHaveBeenCalledTimes(1)
    expect(cleanSpy).toHaveBeenCalledTimes(1)
  })

  it('renders the import dialog only while the maintenance model is open', async () => {
    const page = await renderSettingsPage()
    expect(page.shadowRoot?.querySelector('pm-import-dialog')).toBeNull()

    passmanagerMaintenanceModel.importDialogOpen.set(true)
    await Promise.resolve()
    await page.updateComplete

    const completeSpy = vi.spyOn(settingsPageModel, 'handlePasswordImportComplete').mockResolvedValue()
    const closeSpy = vi.spyOn(settingsPageModel, 'closePasswordImportDialog').mockImplementation(() => {})
    const dialog = page.shadowRoot?.querySelector('pm-import-dialog')

    expect(dialog).not.toBeNull()

    dialog?.dispatchEvent(new CustomEvent('import-complete'))
    dialog?.dispatchEvent(new CustomEvent('import-close'))

    expect(completeSpy).toHaveBeenCalledTimes(1)
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps successful Settings import visible until Close', async () => {
    passmanagerMaintenanceModel.importDialogOpen.set(true)
    passmanagerMaintenanceModel.importCompletedSuccessfully.set(true)
    const closeSpy = vi.spyOn(settingsPageModel, 'closePasswordImportDialog').mockImplementation(() => {})
    const page = await renderSettingsPage()

    expect(page.shadowRoot?.querySelector('pm-import-dialog')).toBeNull()
    expect(page.shadowRoot?.textContent).toContain('Import complete')
    expect(page.shadowRoot?.textContent).toContain('Passwords were imported successfully.')

    findButton(page, 'Close').click()

    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})
