import {CVButton, CVInput, CVRadio, CVRadioGroup, CVTextarea} from '@chromvoid/uikit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {i18n as passmanagerI18n} from '@project/passmanager/i18n'

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
    presentCreatedEntry: vi.fn(),
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
  ;(
    component as PMEntryCreateMobile & {model: {setEntryType(type: 'payment_card'): void}}
  ).model.setEntryType('payment_card')
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
    const submit = footer?.querySelector('#passwords\\.create\\.submit') as HTMLButtonElement | null

    expect(footer).not.toBeNull()
    expect(scroll).not.toBeNull()
    expect(footer?.hasAttribute('flow')).toBe(true)
    expect(footer?.shadowRoot?.querySelector('[part="row"]')).not.toBeNull()
    expect(scroll?.contains(footer)).toBe(false)
    expect(footer?.contains(submit)).toBe(true)
    expect(submit).toBeInstanceOf(HTMLButtonElement)
    expect(submit?.type).toBe('submit')
    expect(submit?.disabled).toBe(false)
    expect(submit?.getAttribute('aria-label')).toBe(passmanagerI18n('button:create_entry'))
    expect(submit?.hasAttribute('aria-busy')).toBe(false)
    expect((component.shadowRoot?.querySelector('form') as HTMLFormElement | null)?.noValidate).toBe(true)
  })

  it('renders compact ordinary card fields and submits typed PAN/CVV secrets', async () => {
    const entry = {
      id: 'mobile-payment-card-created',
      flushPendingPersistence: vi.fn(async () => {}),
    }
    const createEntry = vi.fn(() => entry)
    installRoot({
      createEntry,
      getEntry: vi.fn((id: string) => (id === entry.id ? entry : undefined)),
    })

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
      ?.querySelector<HTMLButtonElement>('#passwords\\.create\\.submit')
      ?.click()
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
      {
        cardPan: '4111111111111111',
        cardCvv: '123',
      },
    )
  })

  it('keeps Create enabled and exposes all submit errors while focusing the first one', async () => {
    const createEntry = vi.fn()
    installRoot({createEntry})
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)
    setPaymentCardType(component)
    await inputCv(component, 'title', 'Team Visa')

    const submitButton = component.shadowRoot?.querySelector(
      '#passwords\\.create\\.submit',
    ) as HTMLButtonElement | null
    expect(submitButton?.disabled).toBe(false)
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')

    submitButton?.click()
    await Promise.resolve()
    await settle(component)

    const cardholder = component.shadowRoot?.querySelector(
      'cv-input[name="cardholderName"]',
    ) as CVInput | null
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

  it('routes an invalid login submit through the model and focuses the missing password', async () => {
    const createEntry = vi.fn()
    installRoot({createEntry})
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    await inputCv(component, 'title', 'AWS Console')
    await inputCv(component, 'username', 'alice')

    const form = component.shadowRoot?.querySelector('form') as HTMLFormElement | null
    const submitButton = component.shadowRoot?.querySelector(
      '#passwords\\.create\\.submit',
    ) as HTMLButtonElement | null
    expect(form?.noValidate).toBe(true)
    expect(submitButton?.disabled).toBe(false)

    submitButton?.click()
    await settle(component)

    const passwordInput = component.shadowRoot?.querySelector('cv-input[name="password"]') as CVInput | null
    const nativePasswordInput = passwordInput?.shadowRoot?.querySelector('input')
    expect(passwordInput?.invalid).toBe(true)
    await vi.waitFor(() => expect(passwordInput?.shadowRoot?.activeElement).toBe(nativePasswordInput))
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('keeps the native Create action disabled for a read-only vault', async () => {
    installRoot({isReadOnly: vi.fn(() => true)})
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    const submitButton = component.shadowRoot?.querySelector(
      '#passwords\\.create\\.submit',
    ) as HTMLButtonElement | null
    expect(submitButton).toBeInstanceOf(HTMLButtonElement)
    expect(submitButton?.disabled).toBe(true)
  })
})
