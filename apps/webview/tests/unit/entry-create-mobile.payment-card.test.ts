import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CVButton, CVInput, CVTextarea} from '@chromvoid/uikit'
import {PMEntryCreateMobile} from '../../src/features/passmanager/components/card/entry-create/entry-create-mobile'

const settle = async (component: PMEntryCreateMobile) => {
  await component.updateComplete
  await Promise.resolve()
  await component.updateComplete
}

const inputNative = async (component: PMEntryCreateMobile, name: string, value: string) => {
  const input = component.shadowRoot?.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  expect(input).not.toBeNull()

  input!.value = value
  input!.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
  await settle(component)
}

const inputCv = async (component: PMEntryCreateMobile, name: string, value: string) => {
  component.shadowRoot?.querySelector(`cv-input[name="${name}"]`)?.dispatchEvent(
    new CustomEvent('cv-input', {
      detail: {value},
      bubbles: true,
      composed: true,
    }),
  )
  await settle(component)
}

describe('PMEntryCreateMobile payment-card layout', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
    window.passmanager = {
      isReadOnly: vi.fn(() => false),
      showElement: () => null,
    } as unknown as typeof window.passmanager

    CVInput.define()
    CVTextarea.define()
    CVButton.define()
    PMEntryCreateMobile.define()

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.passmanager = previousPassmanager
    vi.restoreAllMocks()
  })

  it('renders mobile payment-card fields inside the card face and submits the draft', async () => {
    const entry = {
      flushPendingPersistence: vi.fn(async () => {}),
      saveCardPan: vi.fn(async () => true),
      saveCardCvv: vi.fn(async () => true),
    }
    const createEntry = vi.fn(() => entry)
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
      showElement: () => null,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    const paymentCardTab = component.shadowRoot?.querySelectorAll('.entry-type-option')[1] as HTMLElement | undefined
    expect(paymentCardTab).not.toBeUndefined()
    paymentCardTab!.click()
    await settle(component)

    expect(component.shadowRoot?.querySelector('.payment-card-face')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('input[name="payment-card-title"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('input[name="payment-card-cardholder"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('input[name="payment-card-number"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('input[name="payment-card-exp-month"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('input[name="payment-card-exp-year"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('input[name="payment-card-cvv"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('cv-input[name="cardholderName"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('cv-input[name="cardNumber"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('cv-input[name="cardExpMonth"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('cv-input[name="cardExpYear"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('cv-input[name="cardCvv"]')).toBeNull()

    await inputCv(component, 'title', 'Team Visa')
    expect(component.shadowRoot?.querySelector('.payment-card-issuer')?.textContent?.trim()).toBe('Team Visa')

    await inputNative(component, 'payment-card-cardholder', 'Alice Doe')
    await inputNative(component, 'payment-card-number', '4111 1111 1111 1111')
    await inputNative(component, 'payment-card-exp-month', '12')
    await inputNative(component, 'payment-card-exp-year', '2031')
    await inputNative(component, 'payment-card-cvv', '123')

    const form = component.shadowRoot?.querySelector('form') as HTMLFormElement | null
    expect(form).not.toBeNull()
    form!.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
    await Promise.resolve()
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

  it('keeps create enabled for incomplete card data and marks the failing card-face field', async () => {
    const createEntry = vi.fn()
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
      showElement: () => null,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    const paymentCardTab = component.shadowRoot?.querySelectorAll('.entry-type-option')[1] as HTMLElement | undefined
    expect(paymentCardTab).not.toBeUndefined()
    paymentCardTab!.click()
    await settle(component)

    await inputCv(component, 'title', 'Team Visa')

    const submitButton = component.shadowRoot?.querySelector('.create-footer cv-button') as CVButton | null
    expect(submitButton?.disabled).toBe(false)

    const initialCardholderInput = component.shadowRoot?.querySelector<HTMLInputElement>(
      'input[name="payment-card-cardholder"]',
    )
    expect(initialCardholderInput).not.toBeNull()
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
    const submitSpy = vi.spyOn((component as any).model, 'submit')

    const form = component.shadowRoot?.querySelector('form') as HTMLFormElement | null
    form?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
    await Promise.resolve()
    await Promise.resolve()
    await settle(component)

    expect(submitSpy).toHaveBeenCalled()
    await expect(submitSpy.mock.results[0]?.value).resolves.toEqual(
      expect.objectContaining({ok: false, reason: 'invalid_payment_card', field: 'cardholderName'}),
    )
    expect(focusSpy).toHaveBeenCalled()
    const cardholderInput = component.shadowRoot?.querySelector<HTMLInputElement>('input[name="payment-card-cardholder"]')
    expect(cardholderInput).not.toBeNull()
    expect(cardholderInput?.getAttribute('aria-invalid')).toBe('true')
    expect(cardholderInput?.classList.contains('is-invalid')).toBe(true)

    const error = component.shadowRoot?.querySelector('.payment-card-create-error')
    expect(error?.textContent?.trim()).not.toBe('')
    expect(createEntry).not.toHaveBeenCalled()
  })
})
