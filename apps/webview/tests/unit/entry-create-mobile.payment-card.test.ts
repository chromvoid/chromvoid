import {CVButton, CVInput, CVRadio, CVRadioGroup, CVTextarea} from '@chromvoid/uikit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PMEntryCreateMobile} from '../../src/features/passmanager/components/card/entry-create/entry-create-mobile'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {MobileBottomActionFooter} from '../../src/shared/ui/mobile-bottom-action-footer'

const settle = async (component: PMEntryCreateMobile) => {
  await component.updateComplete
  await Promise.resolve()
  await component.updateComplete
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

const inputCv = async (component: PMEntryCreateMobile, name: string, value: string) => {
  const input = component.shadowRoot?.querySelector(`cv-input[name="${name}"]`)
  expect(input).not.toBeNull()
  input?.dispatchEvent(
    new CustomEvent('cv-input', {
      detail: {value},
      bubbles: true,
      composed: true,
    }),
  )
  await settle(component)
}

function setPaymentCardType(component: PMEntryCreateMobile): void {
  ;(component as PMEntryCreateMobile & {model: {setEntryType(type: 'payment_card'): void}}).model.setEntryType(
    'payment_card',
  )
}

describe('PMEntryCreateMobile payment-card layout', () => {
  beforeEach(() => {
    installRoot()
    CVInput.define()
    CVRadio.define()
    CVRadioGroup.define()
    CVTextarea.define()
    CVButton.define()
    MobileBottomActionFooter.define()
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

  it('uses the shared mobile bottom action footer clearance contract', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    const footer = component.shadowRoot?.querySelector(
      'mobile-bottom-action-footer.create-footer',
    ) as HTMLElement | null
    const scroll = component.shadowRoot?.querySelector('.create-scroll') as HTMLElement | null
    const submit = footer?.querySelector('cv-button') as CVButton | null

    expect(footer).not.toBeNull()
    expect(scroll).not.toBeNull()
    expect(footer?.hasAttribute('flow')).toBe(true)
    expect(footer?.shadowRoot?.querySelector('[part="row"]')).not.toBeNull()
    expect(scroll?.contains(footer)).toBe(false)
    expect(footer?.contains(submit)).toBe(true)
  })

  it('renders compact ordinary card fields and submits typed PAN/CVV secrets', async () => {
    const entry = {
      flushPendingPersistence: vi.fn(async () => {}),
      saveCardPan: vi.fn(async () => true),
      saveCardCvv: vi.fn(async () => true),
    }
    const createEntry = vi.fn(() => entry)
    installRoot({createEntry})

    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)
    setPaymentCardType(component)
    await settle(component)

    expect(component.shadowRoot?.querySelector('.payment-card-face')).toBeNull()
    expect(component.shadowRoot?.querySelector('.form-heading-title')?.textContent).toContain('Create card')
    expect(component.shadowRoot?.querySelector('.form-heading-subtitle')?.textContent).toContain(
      'Save payment details',
    )
    expect(component.shadowRoot?.querySelector('cv-input[name="title"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('cv-input[name="cardholderName"]')).not.toBeNull()
    const cardNumber = component.shadowRoot?.querySelector('cv-input[name="cardNumber"]') as CVInput | null
    expect(cardNumber?.type).toBe('password')
    expect(cardNumber?.hasAttribute('password-toggle')).toBe(true)
    expect(component.shadowRoot?.querySelector('cv-input[name="cardExpMonth"]')).not.toBeNull()
    const expYear = component.shadowRoot?.querySelector('cv-input[name="cardExpYear"]') as CVInput | null
    expect(expYear?.placeholder).toBe('YY')
    expect(expYear?.maxlength).toBe(2)
    const cvv = component.shadowRoot?.querySelector('cv-input[name="cardCvv"]') as CVInput | null
    expect(cvv?.type).toBe('password')
    expect(cvv?.hasAttribute('password-toggle')).toBe(true)

    await inputCv(component, 'title', 'Team Visa')
    await inputCv(component, 'cardholderName', 'Alice Doe')
    await inputCv(component, 'cardNumber', '4111 1111 1111 1111')
    await inputCv(component, 'cardExpMonth', '12')
    await inputCv(component, 'cardExpYear', '31')
    await inputCv(component, 'cardCvv', '123')

    component.shadowRoot
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
    await Promise.resolve()
    await settle(component)

    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: 'payment_card',
        title: 'Team Visa',
        paymentCard: expect.objectContaining({
          cardholderName: 'Alice Doe',
          expMonth: 12,
          expYear: 2031,
          last4: '1111',
        }),
      }),
      '',
      '',
      undefined,
    )
    expect(entry.saveCardPan).toHaveBeenCalledWith('4111111111111111')
    expect(entry.saveCardCvv).toHaveBeenCalledWith('123')
  })

  it('keeps Create enabled and exposes all submit errors while focusing the first one', async () => {
    const createEntry = vi.fn()
    installRoot({createEntry})
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)
    setPaymentCardType(component)
    await inputCv(component, 'title', 'Team Visa')

    const submitButton = component.shadowRoot?.querySelector('.create-footer cv-button') as CVButton | null
    expect(submitButton?.disabled).toBe(false)
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')

    component.shadowRoot
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
    await Promise.resolve()
    await settle(component)

    const cardholder = component.shadowRoot?.querySelector('cv-input[name="cardholderName"]') as CVInput | null
    const cardNumber = component.shadowRoot?.querySelector('cv-input[name="cardNumber"]') as CVInput | null
    const month = component.shadowRoot?.querySelector('cv-input[name="cardExpMonth"]') as CVInput | null
    const year = component.shadowRoot?.querySelector('cv-input[name="cardExpYear"]') as CVInput | null
    expect(cardholder?.invalid).toBe(true)
    expect(cardNumber?.invalid).toBe(true)
    expect(month?.invalid).toBe(true)
    expect(year?.invalid).toBe(true)
    expect(component.shadowRoot?.querySelectorAll('.field-error').length).toBeGreaterThanOrEqual(4)
    await vi.waitFor(() => expect(focusSpy).toHaveBeenCalled())
    expect(createEntry).not.toHaveBeenCalled()
  })
})
