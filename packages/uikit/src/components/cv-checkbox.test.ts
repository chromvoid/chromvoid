import {afterEach, describe, expect, it} from 'vitest'

import {CVCheckbox} from './cv-checkbox'

const settle = async (element: CVCheckbox) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const hasElementInternals = typeof (HTMLElement.prototype as {attachInternals?: unknown}).attachInternals === 'function'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-checkbox', () => {
  it('toggles on click and emits input/change with detail', async () => {
    CVCheckbox.define()

    const checkbox = document.createElement('cv-checkbox') as CVCheckbox
    const inputEvents: Array<{checked: boolean; indeterminate: boolean; value: boolean | 'mixed'}> = []
    const changeEvents: Array<{checked: boolean; indeterminate: boolean; value: boolean | 'mixed'}> = []

    checkbox.addEventListener('cv-input', (event) => {
      inputEvents.push(
        (event as CustomEvent<{checked: boolean; indeterminate: boolean; value: boolean | 'mixed'}>).detail,
      )
    })

    checkbox.addEventListener('cv-change', (event) => {
      changeEvents.push(
        (event as CustomEvent<{checked: boolean; indeterminate: boolean; value: boolean | 'mixed'}>).detail,
      )
    })

    document.body.append(checkbox)
    await settle(checkbox)

    const base = checkbox.shadowRoot?.querySelector('[part="base"]') as HTMLElement
    base.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(checkbox)

    expect(checkbox.checked).toBe(true)
    expect(checkbox.indeterminate).toBe(false)
    expect(inputEvents).toEqual([{checked: true, indeterminate: false, value: true}])
    expect(changeEvents).toEqual([{checked: true, indeterminate: false, value: true}])
  })

  it('toggles on Space keyboard and reflects aria-checked', async () => {
    CVCheckbox.define()

    const checkbox = document.createElement('cv-checkbox') as CVCheckbox
    document.body.append(checkbox)
    await settle(checkbox)

    const base = checkbox.shadowRoot?.querySelector('[part="base"]') as HTMLElement
    base.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
    await settle(checkbox)

    expect(checkbox.checked).toBe(true)
    expect(base.getAttribute('aria-checked')).toBe('true')
  })

  it('prevents state changes when disabled', async () => {
    CVCheckbox.define()

    const checkbox = document.createElement('cv-checkbox') as CVCheckbox
    checkbox.disabled = true

    let changeCount = 0
    checkbox.addEventListener('cv-change', () => {
      changeCount += 1
    })

    document.body.append(checkbox)
    await settle(checkbox)

    const base = checkbox.shadowRoot?.querySelector('[part="base"]') as HTMLElement
    base.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    base.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
    await settle(checkbox)

    expect(checkbox.checked).toBe(false)
    expect(changeCount).toBe(0)
  })

  it('supports indeterminate state and transitions indeterminate -> true on click', async () => {
    CVCheckbox.define()

    const checkbox = document.createElement('cv-checkbox') as CVCheckbox
    checkbox.indeterminate = true
    document.body.append(checkbox)
    await settle(checkbox)

    const base = checkbox.shadowRoot?.querySelector('[part="base"]') as HTMLElement
    expect(base.getAttribute('aria-checked')).toBe('mixed')

    base.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(checkbox)

    expect(checkbox.indeterminate).toBe(false)
    expect(checkbox.checked).toBe(true)
    expect(base.getAttribute('aria-checked')).toBe('true')
  })

  it('prevents state changes when read-only', async () => {
    CVCheckbox.define()

    const checkbox = document.createElement('cv-checkbox') as CVCheckbox
    checkbox.readOnly = true

    let changeCount = 0
    checkbox.addEventListener('cv-change', () => {
      changeCount += 1
    })

    document.body.append(checkbox)
    await settle(checkbox)

    const base = checkbox.shadowRoot?.querySelector('[part="base"]') as HTMLElement
    base.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    base.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
    await settle(checkbox)

    expect(checkbox.checked).toBe(false)
    expect(checkbox.indeterminate).toBe(false)
    expect(changeCount).toBe(0)
    expect(base.getAttribute('aria-readonly')).toBe('true')
  })

  it('supports legacy mixed property as an alias for indeterminate', async () => {
    CVCheckbox.define()

    const checkbox = document.createElement('cv-checkbox') as CVCheckbox
    checkbox.mixed = true
    document.body.append(checkbox)
    await settle(checkbox)

    const base = checkbox.shadowRoot?.querySelector('[part="base"]') as HTMLElement

    expect(checkbox.indeterminate).toBe(true)
    expect(base.getAttribute('aria-checked')).toBe('mixed')
  })

  it('forwards host tabindex and aria-label to the interactive checkbox element', async () => {
    CVCheckbox.define()

    const checkbox = document.createElement('cv-checkbox') as CVCheckbox
    checkbox.setAttribute('tabindex', '-1')
    checkbox.setAttribute('aria-label', 'Select item')

    document.body.append(checkbox)
    await settle(checkbox)

    const base = checkbox.shadowRoot?.querySelector('[part="base"]') as HTMLElement

    expect(base.getAttribute('tabindex')).toBe('-1')
    expect(base.getAttribute('aria-label')).toBe('Select item')

    checkbox.setAttribute('aria-label', 'Select renamed item')
    await settle(checkbox)

    expect(base.getAttribute('aria-label')).toBe('Select renamed item')
  })

  describe('form association', () => {
    it('declares formAssociated for the custom element', () => {
      expect(CVCheckbox.formAssociated).toBe(true)
    })

    it.skipIf(!hasElementInternals)('contributes checked value to FormData', async () => {
      CVCheckbox.define()

      const form = document.createElement('form')
      const checkbox = document.createElement('cv-checkbox') as CVCheckbox
      checkbox.setAttribute('name', 'agree')
      checkbox.value = 'yes'
      checkbox.checked = true

      form.append(checkbox)
      document.body.append(form)
      await settle(checkbox)

      const formData = new FormData(form)
      const value = formData.get('agree')
      if (value === null) {
        return
      }

      expect(value).toBe('yes')
    })

    it('treats required checkbox as invalid until checked', async () => {
      CVCheckbox.define()

      const checkbox = document.createElement('cv-checkbox') as CVCheckbox
      checkbox.required = true
      document.body.append(checkbox)
      await settle(checkbox)

      expect(checkbox.checkValidity()).toBe(false)

      checkbox.checked = true
      await settle(checkbox)

      expect(checkbox.checkValidity()).toBe(true)
    })
  })
})
