import {CVInput, CVRadio, CVRadioGroup, CVTextarea} from '@chromvoid/uikit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PMEntryCreateMobile} from '../../src/features/passmanager/components/card/entry-create/entry-create-mobile'
import type {PMEntryCreateDetailsSheet} from '../../src/features/passmanager/components/card/entry-create/entry-create-details-sheet'
import type {PMEntryCreateModel} from '../../src/features/passmanager/components/card/entry-create/entry-create.model'
import {
  configurePMEntryOtpDraftPreviewPort,
  PMEntryOTPCreate,
} from '../../src/features/passmanager/components/card/entry-otp-create'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

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
    setPassmanagerRoot(undefined)
    vi.restoreAllMocks()
  })

  it('renders one compact summary without optional editors in the main form', async () => {
    const component = await createComponent()

    const names = Array.from(component.shadowRoot?.querySelectorAll('.form-surface cv-input') ?? []).map(
      (input) => input.getAttribute('name'),
    )
    expect(names).toEqual(['title', 'username', 'password', 'urls'])
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
    expect((sheet as unknown as {model: unknown}).model).toBe(getModel(component))
    expect(getModel(component).detailsSheetOpen()).toBe(true)
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
  })

  it('persists note draft through the hub and keeps one compact main summary row', async () => {
    const component = await createComponent()
    const model = getModel(component)
    model.openDetailsSheet()
    model.openDetailsEditor('note')
    await settle(component)

    const sheet = getSheet(component)
    await settleSheet(sheet)
    const note = sheet.shadowRoot?.querySelector('cv-textarea[name="note"]')
    note?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'Recovery instructions'},
        bubbles: true,
        composed: true,
      }),
    )
    await settleSheet(sheet)

    sheet.shadowRoot?.querySelector<HTMLElement>('.sheet-actions cv-button:last-child')?.click()
    await settle(component)
    await settleSheet(sheet)

    expect(model.note()).toBe('Recovery instructions')
    expect(model.configuredOptionalDetails()).toEqual(['note'])
    expect(model.detailsSheetView()).toBe('hub')
    expect(component.shadowRoot?.querySelectorAll('[data-details-hub-trigger]')).toHaveLength(1)
    expect(component.shadowRoot?.querySelector('.details-count')?.textContent).toContain('1')
    expect(component.shadowRoot?.querySelector('cv-textarea[name="note"]')).toBeNull()
  })

  it('configures OTP only after valid Done and keeps the editor inside the hub sheet', async () => {
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

    sheet.shadowRoot?.querySelector<HTMLElement>('.sheet-actions cv-button:last-child')?.click()
    await vi.waitFor(() => expect(model.useOtp()).toBe(true))
    await settleSheet(sheet)

    expect(model.detailsSheetView()).toBe('hub')
    expect(model.configuredOptionalDetails()).toEqual(['otp'])
    expect(component.shadowRoot?.querySelector('[data-detail-section="otp"]')).toBeNull()
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
