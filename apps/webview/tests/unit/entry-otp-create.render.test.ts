import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  CVInput,
  CVNumber,
  CVRadio,
  CVRadioGroup,
  CVSelect,
  CVSelectOption,
} from '@chromvoid/uikit'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {PMEntryOTPCreate} from '../../src/features/passmanager/components/card/entry-otp-create'
import {PMEntryOTPCreateSheet} from '../../src/features/passmanager/components/card/entry-otp-create/entry-otp-create-sheet'
import {
  PMEntryOtpCreateModel,
  type PMEntryOtpDraftPreviewPort,
} from '../../src/features/passmanager/components/card/entry-otp-create/entry-otp-create.model'

async function settle(element: HTMLElement & {updateComplete: Promise<unknown>}): Promise<void> {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

function createOtpCreate(model = new PMEntryOtpCreateModel()): PMEntryOTPCreate {
  const element = document.createElement('pm-entry-otp-create') as PMEntryOTPCreate
  element.layout = 'card'
  element.model = model
  document.body.append(element)
  return element
}

function createPreviewPort(): PMEntryOtpDraftPreviewPort {
  return {
    previewOTP: vi.fn(async (data) => ({
      otp: data.digits === 8 ? '12345678' : '123456',
      period: data.period ?? 30,
      leftSeconds: 12,
    })),
  }
}

describe('PMEntryOTPCreate card layout', () => {
  beforeEach(() => {
    CVInput.define()
    CVNumber.define()
    CVRadio.define()
    CVRadioGroup.define()
    CVSelect.define()
    CVSelectOption.define()
    PMEntryOTPCreate.define()
    PMEntryOTPCreateSheet.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    resetRuntimeCapabilities()
  })

  it('hides QR action when native scan capability is unavailable', async () => {
    const element = createOtpCreate()

    await settle(element)

    const card = element.shadowRoot?.querySelector('.otp-create-card')
    const first = card?.firstElementChild

    expect(first?.classList.contains('qr-hero-button')).toBe(false)
    expect(card?.querySelector('.qr-hero-button')).toBeNull()
    expect(element.shadowRoot?.querySelector('pm-entry-otp-qr-scanner')).toBeNull()
    expect(element.shadowRoot?.querySelector('video')).toBeNull()
    expect(element.shadowRoot?.querySelector('input[type="file"]')).toBeNull()
  })

  it('renders QR hero first when native scan capability is available', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_native_otp_qr_scan: true,
    })
    const element = createOtpCreate()

    await settle(element)

    const card = element.shadowRoot?.querySelector('.otp-create-card')
    const first = card?.firstElementChild
    const topLevelSelects = Array.from(card?.children ?? []).filter((child) =>
      child.classList.contains('select-field'),
    )

    expect(first?.classList.contains('qr-hero-button')).toBe(true)
    expect(first?.querySelector('.qr-hero-icon cv-icon')?.getAttribute('name')).toBe('qr-code')
    expect(topLevelSelects).toHaveLength(0)
    expect(card?.querySelector('button.otp-advanced-link')).not.toBeNull()
    expect(card?.querySelector('cv-radio-group')).toBeNull()
  })

  it('drills into an advanced screen with radio groups and returns to the main screen', async () => {
    const model = new PMEntryOtpCreateModel()
    const element = createOtpCreate(model)

    await settle(element)
    element.shadowRoot?.querySelector<HTMLButtonElement>('.otp-advanced-link')?.click()
    await settle(element)

    const advanced = element.shadowRoot?.querySelector('[data-view="advanced"]')
    const groups = advanced?.querySelectorAll('cv-radio-group')

    expect(model.view()).toBe('advanced')
    expect(advanced).not.toBeNull()
    expect(groups).toHaveLength(2)
    expect(advanced?.querySelector('cv-select')).toBeNull()
    expect(
      Array.from(advanced?.querySelectorAll('cv-radio') ?? []).every((radio) =>
        radio.hasAttribute('aria-label'),
      ),
    ).toBe(true)

    advanced?.querySelector<HTMLElement>('cv-radio[value="custom"]')?.click()
    await settle(element)

    const custom = element.shadowRoot?.querySelector('[data-view="advanced"]')
    expect(model.preset()).toBe('custom')
    expect(custom?.querySelectorAll('cv-radio-group')).toHaveLength(5)
    expect(custom?.querySelector('.custom-controls')).not.toBeNull()
    expect(custom?.querySelectorAll('.radio-scroll cv-radio-group[orientation="horizontal"]')).toHaveLength(
      2,
    )
    expect(custom?.querySelector('cv-number.advanced-number[stepper]')).not.toBeNull()
    expect(custom?.querySelector('cv-select')).toBeNull()

    custom?.querySelector<HTMLElement>('cv-radio[value="8"]')?.click()
    await settle(element)
    expect(model.digits()).toBe(8)

    custom?.querySelector<HTMLButtonElement>('.otp-advanced-back')?.click()
    await settle(element)

    expect(model.view()).toBe('main')
    expect(element.shadowRoot?.querySelector('[data-view="advanced"]')).toBeNull()
    const advancedLink = element.shadowRoot?.querySelector('.otp-advanced-link')
    expect(advancedLink).not.toBeNull()
    await vi.waitFor(() => {
      expect(element.shadowRoot?.activeElement).toBe(advancedLink)
    })
  })

  it('renders validation and preview states from the model', async () => {
    const model = new PMEntryOtpCreateModel(undefined, undefined, createPreviewPort())
    model.reset({label: 'OpenAI'})
    const element = createOtpCreate(model)

    model.setSecret('JBSWY3DPEHPK3PXP')
    await model.validateWithCore()
    await settle(element)

    expect(element.shadowRoot?.querySelector('.otp-helper-valid')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.otp-preview')).not.toBeNull()

    model.setSecret('JBSW ???')
    await settle(element)

    const input = element.shadowRoot?.querySelector('cv-input.secret-input')
    expect(input?.hasAttribute('invalid')).toBe(true)
    expect(element.shadowRoot?.querySelector('.otp-helper-error')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.otp-preview')).toBeNull()
  })

  it('delegates secret paste to the model action', async () => {
    const model = new PMEntryOtpCreateModel()
    const pasteSpy = vi.spyOn(model.actions, 'pasteSecretFromClipboard').mockResolvedValue('')
    const element = createOtpCreate(model)

    await settle(element)
    const pasteButton = element.shadowRoot?.querySelector<HTMLButtonElement>('.secret-paste-button')
    pasteButton?.click()

    await vi.waitFor(() => {
      expect(pasteSpy).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps the sheet action available and focuses the missing secret after submit', async () => {
    const model = new PMEntryOtpCreateModel()
    const sheet = document.createElement('pm-entry-otp-create-sheet') as PMEntryOTPCreateSheet
    const primaryEvent = vi.fn()
    sheet.model = model
    sheet.open = true
    sheet.addEventListener('pm-entry-otp-create-sheet-primary', primaryEvent)
    document.body.append(sheet)
    await settle(sheet)

    const submit = sheet.shadowRoot?.querySelector('.primary-action') as HTMLElement | null
    expect(submit?.hasAttribute('disabled')).toBe(false)
    submit?.click()
    await settle(sheet)

    const form = sheet.shadowRoot?.querySelector('pm-entry-otp-create') as PMEntryOTPCreate | null
    if (form) await settle(form)
    const secretInput = form?.shadowRoot?.querySelector('.secret-input') as CVInput | null
    const nativeInput = secretInput?.shadowRoot?.querySelector('input')
    expect(model.secretError()).not.toBe('')
    expect(primaryEvent).not.toHaveBeenCalled()
    expect(secretInput?.shadowRoot?.activeElement).toBe(nativeInput)
  })

  it('keeps the OTP sheet open when returning from advanced settings', async () => {
    const model = new PMEntryOtpCreateModel()
    const sheet = document.createElement('pm-entry-otp-create-sheet') as PMEntryOTPCreateSheet
    sheet.model = model
    sheet.open = true
    document.body.append(sheet)
    await settle(sheet)

    model.actions.openAdvanced()
    await settle(sheet)

    const bottomSheet = sheet.shadowRoot?.querySelector('cv-bottom-sheet')
    const form = sheet.shadowRoot?.querySelector('pm-entry-otp-create') as PMEntryOTPCreate | null
    await form?.updateComplete

    expect(bottomSheet?.closeOnOutsideFocus).toBe(false)

    form?.shadowRoot?.querySelector<HTMLButtonElement>('.otp-advanced-back')?.click()
    await settle(sheet)
    if (form) await settle(form)

    expect(sheet.open).toBe(true)
    expect(model.view()).toBe('main')
  })
})
