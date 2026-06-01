import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  CVDisclosure,
  CVInput,
  CVNumber,
  CVSelect,
  CVSelectOption,
} from '@chromvoid/uikit'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {PMEntryOTPCreate} from '../../src/features/passmanager/components/card/entry-otp-create'
import {PMEntryOtpCreateModel} from '../../src/features/passmanager/components/card/entry-otp-create/entry-otp-create.model'

async function settle(element: PMEntryOTPCreate): Promise<void> {
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

describe('PMEntryOTPCreate card layout', () => {
  beforeEach(() => {
    CVDisclosure.define()
    CVInput.define()
    CVNumber.define()
    CVSelect.define()
    CVSelectOption.define()
    PMEntryOTPCreate.define()
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
    expect(first?.querySelector('.qr-hero-icon cv-icon')?.getAttribute('name')).toBe('qr-code-scan')
    expect(topLevelSelects).toHaveLength(0)
    expect(card?.querySelector('cv-disclosure.otp-advanced')).not.toBeNull()
    expect(card?.querySelector('.otp-advanced-body .select-field')).not.toBeNull()
  })

  it('renders validation and preview states from the model', async () => {
    const model = new PMEntryOtpCreateModel()
    model.reset({label: 'OpenAI'})
    const element = createOtpCreate(model)

    model.setSecret('JBSWY3DPEHPK3PXP')
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
})
