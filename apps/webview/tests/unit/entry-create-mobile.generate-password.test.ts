import {CVButton, CVInput, CVRadio, CVRadioGroup, CVTextarea} from '@chromvoid/uikit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PMEntryCreateMobile} from '../../src/features/passmanager/components/card/entry-create/entry-create-mobile'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

const settle = async (component: PMEntryCreateMobile) => {
  await component.updateComplete
  await Promise.resolve()
  await component.updateComplete
}

describe('PMEntryCreateMobile password generator', () => {
  beforeEach(() => {
    setPassmanagerRoot({
      id: 'root',
      name: 'Vault',
      entriesList: vi.fn(() => []),
      getEntry: vi.fn(() => undefined),
      getGroup: vi.fn(() => undefined),
      setShowElement: vi.fn(),
      showElement: vi.fn(() => 'createEntry'),
      isReadOnly: vi.fn(() => false),
    } as never)

    CVButton.define()
    CVInput.define()
    CVRadio.define()
    CVRadioGroup.define()
    CVTextarea.define()
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

  it('generates a password without focusing the password input', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    const username = component.shadowRoot!.querySelector('cv-input[name="username"]') as CVInput
    const usernameInput = username.shadowRoot!.querySelector('input') as HTMLInputElement
    const password = component.shadowRoot!.querySelector('cv-input[name="password"]') as CVInput
    const passwordInput = password.shadowRoot!.querySelector('input') as HTMLInputElement
    const generate = component.shadowRoot!.querySelector('.generate-button') as CVButton
    const generateButton = generate.shadowRoot!.querySelector('[part="base"]') as HTMLButtonElement

    expect(usernameInput).toBeInstanceOf(HTMLInputElement)
    expect(passwordInput).toBeInstanceOf(HTMLInputElement)
    expect(password.value).toBe('')
    expect(generateButton).toBeInstanceOf(HTMLButtonElement)

    usernameInput.focus()
    expect(username.shadowRoot!.activeElement).toBe(usernameInput)

    const pointerDown = new Event('pointerdown', {
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    generateButton.dispatchEvent(pointerDown)

    expect(pointerDown.defaultPrevented).toBe(false)
    expect(password.shadowRoot!.activeElement).not.toBe(passwordInput)

    generateButton.click()
    await settle(component)

    expect(password.value).not.toBe('')
    expect(password.shadowRoot!.activeElement).not.toBe(passwordInput)
  })
})
