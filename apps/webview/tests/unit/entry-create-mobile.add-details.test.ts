import {CVInput, CVRadio, CVRadioGroup, CVTextarea} from '@chromvoid/uikit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {i18n as passmanagerI18n} from '@project/passmanager/i18n'

import {PMEntryCreateMobile} from '../../src/features/passmanager/components/card/entry-create/entry-create-mobile'
import type {PMEntryCreateDetailsSheet} from '../../src/features/passmanager/components/card/entry-create/entry-create-details-sheet'
import type {PMEntryCreateModel} from '../../src/features/passmanager/components/card/entry-create/entry-create.model'
import {
  configurePMEntryOtpDraftPreviewPort,
  PMEntryOTPCreate,
} from '../../src/features/passmanager/components/card/entry-otp-create'
import {pmCredentialTagsModel} from '../../src/features/passmanager/models/pm-credential-tags.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {dialogService} from '../../src/shared/services/dialog-service'

const settle = async (component: PMEntryCreateMobile) => {
  await component.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await component.updateComplete
}

async function settleSheet(sheet: PMEntryCreateDetailsSheet): Promise<void> {
  await sheet.updateComplete
  await Promise.resolve()
  await sheet.updateComplete
}

function installRoot(overrides: Record<string, unknown> = {}) {
  const root = {
    id: 'root',
    name: 'Vault',
    allEntries: [],
    credentialTags: vi.fn(() => []),
    credentialTagMeta: vi.fn(() => ({})),
    saveCredentialTagCatalog: vi.fn(async () => true),
    entriesList: vi.fn(() => []),
    getEntry: vi.fn(() => undefined),
    getGroup: vi.fn(() => undefined),
    setShowElement: vi.fn(),
    showElement: vi.fn(() => 'createEntry'),
    isReadOnly: vi.fn(() => false),
    ...overrides,
  }
  setPassmanagerRoot(root as never)
  return root
}

function getModel(component: PMEntryCreateMobile): PMEntryCreateModel {
  return (component as unknown as {model: PMEntryCreateModel}).model
}

function getSheet(component: PMEntryCreateMobile): PMEntryCreateDetailsSheet {
  return component.shadowRoot!.querySelector('pm-entry-create-details-sheet') as PMEntryCreateDetailsSheet
}

function getBottomSheet(sheet: PMEntryCreateDetailsSheet): HTMLElement & {showHandle: boolean} {
  return sheet.shadowRoot!.querySelector('cv-bottom-sheet') as HTMLElement & {showHandle: boolean}
}

async function createComponent(): Promise<PMEntryCreateMobile> {
  const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
  document.body.append(component)
  await settle(component)
  return component
}

describe('PMEntryCreateMobile Details hub', () => {
  beforeEach(() => {
    installRoot()
    configurePMEntryOtpDraftPreviewPort({
      previewOTP: vi.fn(async (data) => ({
        otp: data.digits === 8 ? '12345678' : '123456',
        period: data.period ?? 30,
        leftSeconds: 12,
      })),
    })

    CVInput.define()
    CVRadio.define()
    CVRadioGroup.define()
    CVTextarea.define()
    PMEntryOTPCreate.define()
    PMEntryCreateMobile.define()

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    pmCredentialTagsModel.closeSheet()
    setPassmanagerRoot(undefined)
    vi.restoreAllMocks()
  })

  it('renders one compact summary without optional editors in the main form', async () => {
    const component = await createComponent()

    const inputs = Array.from(component.shadowRoot?.querySelectorAll('.form-surface cv-input') ?? [])
    const names = inputs.map((input) => input.getAttribute('name'))
    expect(names).toEqual(['title', 'username', 'password'])
    expect(component.shadowRoot?.querySelector('pm-entry-website-editor')).not.toBeNull()
    expect(inputs.slice(0, 3).map((input) => input.getAttribute('control-id'))).toEqual([
      'passwords.create.title',
      'passwords.create.username',
      'passwords.create.password',
    ])
    expect(
      inputs.slice(0, 3).map((input) => input.shadowRoot?.querySelector<HTMLInputElement>('input')?.id),
    ).toEqual(['passwords.create.title', 'passwords.create.username', 'passwords.create.password'])
    expect(inputs.slice(0, 3).map((input) => input.getAttribute('aria-label'))).toEqual([
      passmanagerI18n('title'),
      passmanagerI18n('username'),
      passmanagerI18n('password'),
    ])
    expect(
      inputs
        .slice(0, 3)
        .map((input) => input.shadowRoot?.querySelector<HTMLInputElement>('input')?.getAttribute('aria-label')),
    ).toEqual([passmanagerI18n('title'), passmanagerI18n('username'), passmanagerI18n('password')])
    expect(component.shadowRoot?.querySelectorAll('[control-id^="passwords.create."]')).toHaveLength(3)
    expect(component.shadowRoot?.querySelector('.location-row')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('[data-details-hub-trigger]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('[data-detail-editor]')).toBeNull()
    expect(component.shadowRoot?.querySelector('pm-icon-picker-inline')).toBeNull()
    expect(component.shadowRoot?.querySelector('cv-textarea[name="note"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('.details-count')?.textContent).toContain('0')
    expect(component.shadowRoot?.querySelector('pm-entry-ssh-create-sheet')).toBeNull()
  })

  it('opens all supported login details in canonical order without checkboxes', async () => {
    const component = await createComponent()
    component.shadowRoot?.querySelector<HTMLButtonElement>('[data-details-hub-trigger]')?.click()
    await settle(component)

    const sheet = getSheet(component)
    await settleSheet(sheet)
    const rows = Array.from(sheet.shadowRoot?.querySelectorAll('[data-details-hub] [data-detail]') ?? [])

    expect(rows.map((row) => row.getAttribute('data-detail'))).toEqual(['icon', 'tags', 'otp', 'note'])
    expect(sheet.shadowRoot?.querySelector('cv-checkbox')).toBeNull()
    expect(sheet.shadowRoot?.querySelector('[data-details-primary-action]')?.textContent?.trim()).toBe(
      passmanagerI18n('button:done'),
    )
    expect((sheet as unknown as {model: unknown}).model).toBe(getModel(component))
    expect(getModel(component).detailsSheetOpen()).toBe(true)
    expect(getBottomSheet(sheet).showHandle).toBe(false)
  })

  it('opens one editor inside the sheet and returns to the hub without growing the main form', async () => {
    const component = await createComponent()
    const model = getModel(component)
    model.openDetailsSheet()
    await settle(component)

    const sheet = getSheet(component)
    await settleSheet(sheet)
    sheet.shadowRoot?.querySelector<HTMLButtonElement>('[data-detail="note"]')?.click()
    await settleSheet(sheet)

    expect(model.detailsSheetView()).toBe('note')
    expect(sheet.shadowRoot?.querySelector('[data-detail-editor="note"] cv-textarea[name="note"]')).not.toBeNull()
    expect(sheet.shadowRoot?.querySelector('[data-details-hub]')).toBeNull()
    expect(component.shadowRoot?.querySelector('cv-textarea[name="note"]')).toBeNull()

    sheet.shadowRoot?.querySelector<HTMLButtonElement>('[data-detail-back]')?.click()
    await settleSheet(sheet)

    expect(model.detailsSheetView()).toBe('hub')
    expect(model.detailsSheetOpen()).toBe(true)
    expect(sheet.shadowRoot?.querySelector('[data-details-hub]')).not.toBeNull()
  })

  it('commits shared tag picker selection only after Apply tags', async () => {
    installRoot({
      credentialTags: vi.fn(() => ['Work', 'Rotate']),
    })
    const component = await createComponent()
    const model = getModel(component)
    model.setTags(['Work'])
    model.openDetailsSheet()
    model.openDetailsEditor('tags')
    await settle(component)

    const sheet = getSheet(component)
    await settleSheet(sheet)
    const picker = sheet.shadowRoot?.querySelector('pm-mobile-tag-picker') as
      | (HTMLElement & {shadowRoot?: ShadowRoot; updateComplete: Promise<unknown>})
      | null
    if (picker) await picker.updateComplete

    expect(picker).not.toBeNull()
    expect(picker?.shadowRoot?.querySelector('.new-tag-button')).not.toBeNull()
    expect(picker?.shadowRoot?.querySelector('.edit-toggle')).not.toBeNull()
    expect(picker?.shadowRoot?.querySelectorAll('.tag-chip-wrap')).toHaveLength(2)
    expect(picker?.shadowRoot?.querySelector('cv-bottom-sheet')).toBeNull()
    expect(sheet.shadowRoot?.querySelectorAll('cv-bottom-sheet')).toHaveLength(1)
    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(false)
    expect(getBottomSheet(sheet).showHandle).toBe(true)
    expect(sheet.shadowRoot?.querySelector('[data-details-primary-action]')?.textContent?.trim()).toBe(
      passmanagerI18n('entry:create:detail-tags-apply'),
    )

    pmCredentialTagsModel.activateTagChip('rotate')
    expect(model.tags()).toEqual(['Work'])

    sheet.shadowRoot?.querySelector<HTMLElement>('[data-details-primary-action]')?.click()
    await vi.waitFor(() => expect(model.detailsSheetView()).toBe('hub'))
    await settleSheet(sheet)

    expect(model.tags()).toEqual(['Work', 'Rotate'])
    expect(model.configuredOptionalDetails()).toContain('tags')
    expect(pmCredentialTagsModel.sheetSelectionScope()).toBe('filter')
  })

  it('cancels unconfirmed tag selection through the embedded Back action', async () => {
    installRoot({
      credentialTags: vi.fn(() => ['Work', 'Rotate']),
    })
    const component = await createComponent()
    const model = getModel(component)
    model.setTags(['Work'])
    model.openDetailsSheet()
    model.openDetailsEditor('tags')
    await settle(component)

    const sheet = getSheet(component)
    await settleSheet(sheet)
    pmCredentialTagsModel.activateTagChip('rotate')

    sheet.shadowRoot?.querySelector<HTMLButtonElement>('[data-detail-back]')?.click()
    await settleSheet(sheet)

    expect(model.tags()).toEqual(['Work'])
    expect(model.detailsSheetView()).toBe('hub')
    expect(pmCredentialTagsModel.sheetSelectionScope()).toBe('filter')
    expect(pmCredentialTagsModel.entrySelectionTagKeys()).toEqual([])
  })

  it('removes configured tags and cancels the embedded selection after confirmation', async () => {
    installRoot({
      credentialTags: vi.fn(() => ['Work', 'Rotate']),
    })
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    const component = await createComponent()
    const model = getModel(component)
    model.setTags(['Work'])
    model.openDetailsSheet()
    model.openDetailsEditor('tags')
    await settle(component)

    const sheet = getSheet(component)
    await settleSheet(sheet)
    pmCredentialTagsModel.activateTagChip('rotate')

    sheet.shadowRoot?.querySelector<HTMLElement>('[data-details-remove-action]')?.click()
    await vi.waitFor(() => expect(model.detailsSheetView()).toBe('hub'))
    await settleSheet(sheet)

    expect(model.tags()).toEqual([])
    expect(model.configuredOptionalDetails()).not.toContain('tags')
    expect(pmCredentialTagsModel.sheetSelectionScope()).toBe('filter')
    expect(pmCredentialTagsModel.entrySelectionTagKeys()).toEqual([])
  })

  it('disables the shared tag picker controls for a read-only vault', async () => {
    installRoot({
      credentialTags: vi.fn(() => ['Work']),
      isReadOnly: vi.fn(() => true),
    })
    const component = await createComponent()
    const model = getModel(component)
    model.openDetailsSheet()
    model.openDetailsEditor('tags')
    await settle(component)

    const sheet = getSheet(component)
    await settleSheet(sheet)
    const picker = sheet.shadowRoot?.querySelector('pm-mobile-tag-picker') as
      | (HTMLElement & {shadowRoot?: ShadowRoot; updateComplete: Promise<unknown>})
      | null
    if (picker) await picker.updateComplete

    expect((picker?.shadowRoot?.querySelector('.new-tag-button') as HTMLButtonElement | null)?.disabled).toBe(
      true,
    )
    expect((picker?.shadowRoot?.querySelector('.edit-toggle') as HTMLButtonElement | null)?.disabled).toBe(true)
  })

  it('renders the icon library inline without opening another dialog or sheet', async () => {
    const component = await createComponent()
    const model = getModel(component)
    model.openDetailsSheet()
    model.openDetailsEditor('icon')
    await settle(component)

    const sheet = getSheet(component)
    await settleSheet(sheet)
    const picker = sheet.shadowRoot?.querySelector('pm-icon-picker-inline') as
      | (HTMLElement & {shadowRoot?: ShadowRoot; updateComplete: Promise<unknown>})
      | null
    if (picker) await picker.updateComplete

    expect(picker).not.toBeNull()
    expect(picker?.shadowRoot?.querySelector('.dialog-actions')).not.toBeNull()
    expect(picker?.shadowRoot?.querySelector('cv-dialog')).toBeNull()
    expect(picker?.shadowRoot?.querySelector('cv-bottom-sheet')).toBeNull()
    expect(sheet.shadowRoot?.querySelector('.sheet-actions')).toBeNull()
  })

  it('shows only Remove for a configured icon and clears it through that action', async () => {
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    const component = await createComponent()
    const model = getModel(component)
    model.setIconRef('sha256:icon')
    model.openDetailsSheet()
    model.openDetailsEditor('icon')
    await settle(component)

    const sheet = getSheet(component)
    await settleSheet(sheet)

    expect(sheet.shadowRoot?.querySelector('[data-details-primary-action]')).toBeNull()
    expect(sheet.shadowRoot?.querySelectorAll('.sheet-actions cv-button')).toHaveLength(1)
    expect(sheet.shadowRoot?.querySelector('[data-details-remove-action]')?.textContent?.trim()).toBe(
      passmanagerI18n('button:remove'),
    )

    sheet.shadowRoot?.querySelector<HTMLElement>('[data-details-remove-action]')?.click()
    await vi.waitFor(() => expect(model.detailsSheetView()).toBe('hub'))
    await settleSheet(sheet)

    expect(model.iconRef()).toBeUndefined()
    expect(model.configuredOptionalDetails()).not.toContain('icon')
  })

  it('persists note draft through the hub and keeps one compact main summary row', async () => {
    const component = await createComponent()
    const model = getModel(component)
    model.openDetailsSheet()
    model.openDetailsEditor('note')
    await settle(component)

    const sheet = getSheet(component)
    await settleSheet(sheet)
    expect(sheet.shadowRoot?.querySelector('.sheet-actions')).toBeNull()

    const note = sheet.shadowRoot?.querySelector('cv-textarea[name="note"]')
    note?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'Recovery instructions'},
        bubbles: true,
        composed: true,
      }),
    )
    await settleSheet(sheet)

    expect(sheet.shadowRoot?.querySelector('[data-details-primary-action]')).toBeNull()
    expect(sheet.shadowRoot?.querySelectorAll('.sheet-actions cv-button')).toHaveLength(1)
    expect(sheet.shadowRoot?.querySelector('[data-details-remove-action]')?.textContent?.trim()).toBe(
      passmanagerI18n('button:remove'),
    )

    sheet.shadowRoot?.querySelector<HTMLElement>('[data-detail-back]')?.click()
    await settle(component)
    await settleSheet(sheet)

    expect(model.note()).toBe('Recovery instructions')
    expect(model.configuredOptionalDetails()).toEqual(['note'])
    expect(model.detailsSheetView()).toBe('hub')
    expect(component.shadowRoot?.querySelectorAll('[data-details-hub-trigger]')).toHaveLength(1)
    expect(component.shadowRoot?.querySelector('.details-count')?.textContent).toContain('1')
    expect(component.shadowRoot?.querySelector('cv-textarea[name="note"]')).toBeNull()
  })

  it('configures OTP only after Save OTP and keeps the editor inside the hub sheet', async () => {
    const component = await createComponent()
    const model = getModel(component)
    model.openDetailsSheet()
    model.openDetailsEditor('otp')
    model.otp.setSecret('JBSWY3DPEHPK3PXP')
    await settle(component)

    const sheet = getSheet(component)
    await settleSheet(sheet)
    expect(sheet.shadowRoot?.querySelector('[data-detail-editor="otp"] pm-entry-otp-create')).not.toBeNull()
    expect(sheet.shadowRoot?.querySelector('pm-entry-otp-create-sheet')).toBeNull()
    expect(sheet.shadowRoot?.querySelector('[data-details-primary-action]')?.textContent?.trim()).toBe(
      passmanagerI18n('otp:save'),
    )
    expect(getBottomSheet(sheet).showHandle).toBe(false)

    sheet.shadowRoot?.querySelector<HTMLElement>('[data-details-primary-action]')?.click()
    await vi.waitFor(() => expect(model.useOtp()).toBe(true))
    await settleSheet(sheet)

    expect(model.detailsSheetView()).toBe('hub')
    expect(model.configuredOptionalDetails()).toEqual(['otp'])
    expect(component.shadowRoot?.querySelector('[data-detail-section="otp"]')).toBeNull()
  })

  it('keeps a configured OTP editor open with one Back action across advanced navigation', async () => {
    const component = await createComponent()
    const model = getModel(component)
    model.otp.setSecret('JBSWY3DPEHPK3PXP')
    model.setUseOtp(true)
    model.openDetailsSheet()
    model.openDetailsEditor('otp')
    model.otp.actions.openAdvanced()
    await settle(component)

    const sheet = getSheet(component)
    await settleSheet(sheet)
    const otpEditor = sheet.shadowRoot?.querySelector('pm-entry-otp-create') as PMEntryOTPCreate | null
    const bottomSheet = sheet.shadowRoot?.querySelector('cv-bottom-sheet')
    await otpEditor?.updateComplete

    const getBackActionCount = () =>
      Number(Boolean(sheet.shadowRoot?.querySelector('[data-detail-back]'))) +
      Number(Boolean(otpEditor?.shadowRoot?.querySelector('.otp-advanced-back')))

    expect(model.detailsSheetView()).toBe('otp')
    expect(model.otp.view()).toBe('advanced')
    expect(sheet.shadowRoot?.querySelector('[data-detail-back]')).toBeNull()
    expect(otpEditor?.shadowRoot?.querySelector('.otp-advanced-back')).not.toBeNull()
    expect(getBackActionCount()).toBe(1)
    expect(sheet.shadowRoot?.querySelector('.sheet-actions')).toBeNull()
    expect(bottomSheet?.getAttribute('detents')).toBe('')
    expect(bottomSheet?.closeOnOutsideFocus).toBe(false)
    expect(getBottomSheet(sheet).showHandle).toBe(false)

    otpEditor?.shadowRoot?.querySelector<HTMLButtonElement>('.otp-advanced-back')?.click()
    await otpEditor?.updateComplete
    await settleSheet(sheet)

    expect(model.detailsSheetView()).toBe('otp')
    expect(model.otp.view()).toBe('main')
    expect(sheet.shadowRoot?.querySelector('[data-detail-back]')).not.toBeNull()
    expect(otpEditor?.shadowRoot?.querySelector('.otp-advanced-back')).toBeNull()
    expect(getBackActionCount()).toBe(1)
    expect(sheet.shadowRoot?.querySelector('.sheet-actions')).not.toBeNull()
    expect(sheet.shadowRoot?.querySelector('[data-details-primary-action]')?.textContent?.trim()).toBe(
      passmanagerI18n('otp:save'),
    )
    expect(bottomSheet?.getAttribute('detents')).toBe('middle expanded')
    expect(getBottomSheet(sheet).showHandle).toBe(false)
    expect(model.detailsSheetOpen()).toBe(true)

    sheet.shadowRoot?.querySelector<HTMLButtonElement>('[data-detail-back]')?.click()
    await settleSheet(sheet)

    expect(model.detailsSheetView()).toBe('hub')
  })

  it('keeps the OTP editor open when Back is consumed during native QR scanning', async () => {
    const component = await createComponent()
    const model = getModel(component)
    model.openDetailsSheet()
    model.openDetailsEditor('otp')
    model.otp.setQrScannerScanning(true)

    expect(model.consumeTransientBack()).toBe(true)
    expect(model.detailsSheetOpen()).toBe(true)
    expect(model.detailsSheetView()).toBe('otp')
  })

  it('offers only Icon and Tags for payment cards', async () => {
    const component = await createComponent()
    const model = getModel(component)
    model.setEntryType('payment_card')
    model.openDetailsSheet()
    await settle(component)

    const sheet = getSheet(component)
    await settleSheet(sheet)
    const rows = Array.from(sheet.shadowRoot?.querySelectorAll('[data-details-hub] [data-detail]') ?? [])
    expect(rows.map((row) => row.getAttribute('data-detail'))).toEqual(['icon', 'tags'])
  })
})
