import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVButton} from './cv-button'

CVButton.define()

const settle = async (element: CVButton) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createButton = async (attrs?: Partial<CVButton>) => {
  const button = document.createElement('cv-button') as CVButton
  if (attrs) {
    Object.assign(button, attrs)
  }
  document.body.append(button)
  await settle(button)
  return button
}

const getBase = (button: CVButton) => button.shadowRoot!.querySelector('[part="base"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-button', () => {
  // --- 2a. Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as native button with role="button"', async () => {
      const button = await createButton()
      const base = getBase(button)
      expect(base).not.toBeNull()
      expect(base.tagName.toLowerCase()).toBe('button')
      expect((base as HTMLButtonElement).type).toBe('button')
      expect(base.getAttribute('role')).toBe('button')
    })

    it('renders [part="label"] containing default slot', async () => {
      const button = await createButton()
      const label = button.shadowRoot!.querySelector('[part="label"]')
      expect(label).not.toBeNull()
      const slot = label!.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('renders [part="prefix"] containing slot[name="prefix"]', async () => {
      const button = await createButton()
      const prefix = button.shadowRoot!.querySelector('[part="prefix"]')
      expect(prefix).not.toBeNull()
      const slot = prefix!.querySelector('slot[name="prefix"]')
      expect(slot).not.toBeNull()
      expect(prefix!.hasAttribute('hidden')).toBe(true)
    })

    it('renders [part="suffix"] containing slot[name="suffix"]', async () => {
      const button = await createButton()
      const suffix = button.shadowRoot!.querySelector('[part="suffix"]')
      expect(suffix).not.toBeNull()
      const slot = suffix!.querySelector('slot[name="suffix"]')
      expect(slot).not.toBeNull()
      expect(suffix!.hasAttribute('hidden')).toBe(true)
    })

    it('shows prefix and suffix parts when slotted content is present', async () => {
      const button = document.createElement('cv-button') as CVButton
      button.innerHTML = `
        <span slot="prefix">left</span>
        Label
        <span slot="suffix">right</span>
      `
      document.body.append(button)
      await settle(button)

      const prefix = button.shadowRoot!.querySelector('[part="prefix"]')
      const suffix = button.shadowRoot!.querySelector('[part="suffix"]')

      expect(prefix!.hasAttribute('hidden')).toBe(false)
      expect(suffix!.hasAttribute('hidden')).toBe(false)
    })

    it('renders safely when children collection is unavailable', async () => {
      const button = document.createElement('cv-button') as CVButton
      Object.defineProperty(button, 'children', {
        configurable: true,
        value: undefined,
      })

      document.body.append(button)
      await settle(button)

      const base = getBase(button)
      const prefix = button.shadowRoot!.querySelector('[part="prefix"]')
      const suffix = button.shadowRoot!.querySelector('[part="suffix"]')

      expect(base).not.toBeNull()
      expect(prefix!.hasAttribute('hidden')).toBe(true)
      expect(suffix!.hasAttribute('hidden')).toBe(true)
    })

    it('does NOT render [part="spinner"] when not loading', async () => {
      const button = await createButton()
      const spinner = button.shadowRoot!.querySelector('[part="spinner"]')
      expect(spinner).toBeNull()
    })

    it('renders [part="spinner"] with aria-hidden="true" when loading', async () => {
      const button = await createButton({loading: true})
      const spinner = button.shadowRoot!.querySelector('[part="spinner"]')
      expect(spinner).not.toBeNull()
      expect(spinner!.getAttribute('aria-hidden')).toBe('true')
    })
  })

  // --- 2b. Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const button = await createButton()
      expect(button.disabled).toBe(false)
      expect(button.toggle).toBe(false)
      expect(button.pressed).toBe(false)
      expect(button.loading).toBe(false)
      expect(button.variant).toBe('default')
      expect(button.outline).toBe(false)
      expect(button.pill).toBe(false)
      expect(button.size).toBe('medium')
      expect(button.type).toBe('button')
    })
  })

  // --- 2c. Attribute reflection ---

  describe('attribute reflection', () => {
    it('boolean attributes reflect: disabled, toggle, pressed, loading, outline, pill', async () => {
      const button = await createButton({
        disabled: true,
        toggle: true,
        pressed: true,
        loading: true,
        outline: true,
        pill: true,
      })
      expect(button.hasAttribute('disabled')).toBe(true)
      expect(button.hasAttribute('toggle')).toBe(true)
      expect(button.hasAttribute('pressed')).toBe(true)
      expect(button.hasAttribute('loading')).toBe(true)
      expect(button.hasAttribute('outline')).toBe(true)
      expect(button.hasAttribute('pill')).toBe(true)
    })

    it('string attributes reflect: variant, size, type', async () => {
      const button = await createButton({variant: 'danger', size: 'large', type: 'submit'})
      expect(button.getAttribute('variant')).toBe('danger')
      expect(button.getAttribute('size')).toBe('large')
      expect(button.getAttribute('type')).toBe('submit')
    })
  })

  describe('form behavior', () => {
    it('submit button in form calls requestSubmit on click', async () => {
      const form = document.createElement('form')
      const requestSubmitSpy = vi.fn()
      Object.defineProperty(form, 'requestSubmit', {
        value: requestSubmitSpy,
        configurable: true,
      })

      const button = document.createElement('cv-button') as CVButton
      button.type = 'submit'
      form.append(button)
      document.body.append(form)
      await settle(button)

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(button)

      expect(requestSubmitSpy).toHaveBeenCalledTimes(1)
    })

    it('type="submit" keeps only native shadow button (no proxy)', async () => {
      const form = document.createElement('form')
      const button = document.createElement('cv-button') as CVButton
      button.type = 'submit'
      form.append(button)
      document.body.append(form)
      await settle(button)

      const base = getBase(button) as HTMLButtonElement
      const proxy = form.querySelector('button[data-cv-form-proxy]')

      expect(base.type).toBe('button')
      expect(proxy).toBeNull()
    })

    it('type="submit" routes Enter activation to requestSubmit', async () => {
      const form = document.createElement('form')
      const requestSubmitSpy = vi.fn()
      Object.defineProperty(form, 'requestSubmit', {
        value: requestSubmitSpy,
        configurable: true,
      })
      const button = document.createElement('cv-button') as CVButton
      button.type = 'submit'
      form.append(button)
      document.body.append(form)
      await settle(button)

      getBase(button).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(button)

      expect(requestSubmitSpy).toHaveBeenCalledTimes(1)
    })

    it('type="reset" calls form.reset on click', async () => {
      const form = document.createElement('form')
      const resetSpy = vi.fn()
      Object.defineProperty(form, 'reset', {
        value: resetSpy,
        configurable: true,
      })
      const button = document.createElement('cv-button') as CVButton
      button.type = 'reset'
      form.append(button)
      document.body.append(form)
      await settle(button)

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(button)

      expect(resetSpy).toHaveBeenCalledTimes(1)
    })

    it('type="button" does not trigger submit/reset actions', async () => {
      const form = document.createElement('form')
      const requestSubmitSpy = vi.fn()
      const resetSpy = vi.fn()
      Object.defineProperty(form, 'requestSubmit', {
        value: requestSubmitSpy,
        configurable: true,
      })
      Object.defineProperty(form, 'reset', {
        value: resetSpy,
        configurable: true,
      })

      const button = document.createElement('cv-button') as CVButton
      button.type = 'button'
      form.append(button)
      document.body.append(form)
      await settle(button)

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(button)

      expect(requestSubmitSpy).toHaveBeenCalledTimes(0)
      expect(resetSpy).toHaveBeenCalledTimes(0)
    })

    it('type="submit" supports [form] attribute targeting external form', async () => {
      const form = document.createElement('form')
      form.id = 'cv-button-form-target'
      const requestSubmitSpy = vi.fn()
      Object.defineProperty(form, 'requestSubmit', {
        value: requestSubmitSpy,
        configurable: true,
      })

      const wrapper = document.createElement('div')
      const button = document.createElement('cv-button') as CVButton
      button.type = 'submit'
      button.setAttribute('form', form.id)

      wrapper.append(button)
      document.body.append(form, wrapper)
      await settle(button)

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(button)

      expect(requestSubmitSpy).toHaveBeenCalledTimes(1)
    })

    it('disabled + type="submit" does not trigger requestSubmit', async () => {
      const form = document.createElement('form')
      const requestSubmitSpy = vi.fn()
      Object.defineProperty(form, 'requestSubmit', {
        value: requestSubmitSpy,
        configurable: true,
      })

      const button = document.createElement('cv-button') as CVButton
      button.type = 'submit'
      button.disabled = true
      form.append(button)
      document.body.append(form)
      await settle(button)

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(button)

      expect(requestSubmitSpy).toHaveBeenCalledTimes(0)
    })

    it('loading + type="reset" does not trigger form.reset', async () => {
      const form = document.createElement('form')
      const resetSpy = vi.fn()
      Object.defineProperty(form, 'reset', {
        value: resetSpy,
        configurable: true,
      })

      const button = document.createElement('cv-button') as CVButton
      button.type = 'reset'
      button.loading = true
      form.append(button)
      document.body.append(form)
      await settle(button)

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keyup', {key: ' ', bubbles: true}))
      await settle(button)

      expect(resetSpy).toHaveBeenCalledTimes(0)
    })
  })

  describe('ARIA', () => {
    it('role="button" on base', async () => {
      const button = await createButton()
      expect(getBase(button).getAttribute('role')).toBe('button')
    })

    it('tabindex="0" when enabled', async () => {
      const button = await createButton()
      expect(getBase(button).getAttribute('tabindex')).toBe('0')
    })

    it('tabindex="-1" when disabled', async () => {
      const button = await createButton({disabled: true})
      expect(getBase(button).getAttribute('tabindex')).toBe('-1')
    })

    it('tabindex="-1" when loading', async () => {
      const button = await createButton({loading: true})
      expect(getBase(button).getAttribute('tabindex')).toBe('-1')
    })

    it('aria-disabled="true" when disabled', async () => {
      const button = await createButton({disabled: true})
      expect(getBase(button).getAttribute('aria-disabled')).toBe('true')
    })

    it('aria-disabled="true" when loading', async () => {
      const button = await createButton({loading: true})
      expect(getBase(button).getAttribute('aria-disabled')).toBe('true')
    })

    it('aria-busy="true" when loading, absent when not', async () => {
      const button = await createButton({loading: true})
      expect(getBase(button).getAttribute('aria-busy')).toBe('true')

      const button2 = await createButton()
      expect(getBase(button2).hasAttribute('aria-busy')).toBe(false)
    })

    it('aria-pressed absent when toggle=false', async () => {
      const button = await createButton()
      expect(getBase(button).hasAttribute('aria-pressed')).toBe(false)
    })

    it('aria-pressed reflects pressed state when toggle=true', async () => {
      const button = await createButton({toggle: true})
      expect(getBase(button).getAttribute('aria-pressed')).toBe('false')

      button.pressed = true
      await settle(button)
      expect(getBase(button).getAttribute('aria-pressed')).toBe('true')
    })
  })

  describe('non-toggle behavior', () => {
    it('click: no input/change events, pressed stays false', async () => {
      const button = await createButton()
      let inputCount = 0
      let changeCount = 0
      button.addEventListener('cv-input', () => inputCount++)
      button.addEventListener('cv-change', () => changeCount++)

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(button)

      expect(button.pressed).toBe(false)
      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })

    it('Enter: no input/change events', async () => {
      const button = await createButton()
      let inputCount = 0
      let changeCount = 0
      button.addEventListener('cv-input', () => inputCount++)
      button.addEventListener('cv-change', () => changeCount++)

      getBase(button).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(button)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })

    it('Space: no input/change events', async () => {
      const button = await createButton()
      let inputCount = 0
      let changeCount = 0
      button.addEventListener('cv-input', () => inputCount++)
      button.addEventListener('cv-change', () => changeCount++)

      getBase(button).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keyup', {key: ' ', bubbles: true}))
      await settle(button)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })
  })

  describe('toggle behavior', () => {
    it('click toggles pressed, emits input and change', async () => {
      const button = await createButton({toggle: true})
      const inputDetails: Array<{pressed: boolean; toggle: boolean}> = []
      const changeDetails: Array<{pressed: boolean}> = []

      button.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      button.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(button)

      expect(button.pressed).toBe(true)
      expect(inputDetails).toEqual([{pressed: true, toggle: true}])
      expect(changeDetails).toEqual([{pressed: true}])
    })

    it('Enter toggles pressed, emits input and change', async () => {
      const button = await createButton({toggle: true})
      const inputDetails: Array<{pressed: boolean; toggle: boolean}> = []
      const changeDetails: Array<{pressed: boolean}> = []

      button.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      button.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      getBase(button).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(button)

      expect(button.pressed).toBe(true)
      expect(inputDetails).toEqual([{pressed: true, toggle: true}])
      expect(changeDetails).toEqual([{pressed: true}])
    })

    it('Space (keyup) toggles pressed, emits input and change', async () => {
      const button = await createButton({toggle: true})
      const inputDetails: Array<{pressed: boolean; toggle: boolean}> = []
      const changeDetails: Array<{pressed: boolean}> = []

      button.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      button.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      getBase(button).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keyup', {key: ' ', bubbles: true}))
      await settle(button)

      expect(button.pressed).toBe(true)
      expect(inputDetails).toEqual([{pressed: true, toggle: true}])
      expect(changeDetails).toEqual([{pressed: true}])
    })

    it('multiple activations toggle pressed back and forth', async () => {
      const button = await createButton({toggle: true})
      const base = getBase(button)
      const changes: boolean[] = []

      button.addEventListener('cv-change', (e) => changes.push((e as CustomEvent).detail.pressed))

      base.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(button)
      expect(button.pressed).toBe(true)

      base.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(button)
      expect(button.pressed).toBe(false)

      base.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(button)
      expect(button.pressed).toBe(true)

      expect(changes).toEqual([true, false, true])
    })

    it('input detail shape: {pressed: boolean, toggle: boolean}', async () => {
      const button = await createButton({toggle: true})
      let detail: unknown

      button.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(button)

      expect(detail).toEqual({pressed: true, toggle: true})
    })

    it('change detail shape: {pressed: boolean}', async () => {
      const button = await createButton({toggle: true})
      let detail: unknown

      button.addEventListener('cv-change', (e) => {
        detail = (e as CustomEvent).detail
      })

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(button)

      expect(detail).toEqual({pressed: true})
    })
  })

  describe('disabled state blocks activation', () => {
    it('toggle+disabled: click does not change pressed', async () => {
      const button = await createButton({toggle: true, disabled: true})
      let changeCount = 0
      button.addEventListener('cv-change', () => changeCount++)

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(button)

      expect(button.pressed).toBe(false)
      expect(changeCount).toBe(0)
    })

    it('toggle+disabled: no input/change events', async () => {
      const button = await createButton({toggle: true, disabled: true})
      let inputCount = 0
      let changeCount = 0
      button.addEventListener('cv-input', () => inputCount++)
      button.addEventListener('cv-change', () => changeCount++)

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keyup', {key: ' ', bubbles: true}))
      await settle(button)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })

    it('non-toggle+disabled: no events on click/Enter/Space', async () => {
      const button = await createButton({disabled: true})
      let inputCount = 0
      let changeCount = 0
      button.addEventListener('cv-input', () => inputCount++)
      button.addEventListener('cv-change', () => changeCount++)

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keyup', {key: ' ', bubbles: true}))
      await settle(button)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })
  })

  describe('loading state blocks activation', () => {
    it('toggle+loading: click does not change pressed', async () => {
      const button = await createButton({toggle: true, loading: true})
      let changeCount = 0
      button.addEventListener('cv-change', () => changeCount++)

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(button)

      expect(button.pressed).toBe(false)
      expect(changeCount).toBe(0)
    })

    it('toggle+loading: no input/change events', async () => {
      const button = await createButton({toggle: true, loading: true})
      let inputCount = 0
      let changeCount = 0
      button.addEventListener('cv-input', () => inputCount++)
      button.addEventListener('cv-change', () => changeCount++)

      getBase(button).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      getBase(button).dispatchEvent(new KeyboardEvent('keyup', {key: ' ', bubbles: true}))
      await settle(button)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })

    it('spinner rendered, aria-busy=true, aria-disabled=true', async () => {
      const button = await createButton({loading: true})
      const base = getBase(button)
      const spinner = button.shadowRoot!.querySelector('[part="spinner"]')

      expect(spinner).not.toBeNull()
      expect(base.getAttribute('aria-busy')).toBe('true')
      expect(base.getAttribute('aria-disabled')).toBe('true')
    })
  })

  describe('dynamic state updates', () => {
    it('changing disabled at runtime syncs aria-disabled', async () => {
      const button = await createButton()
      expect(getBase(button).hasAttribute('aria-disabled')).toBe(false)

      button.disabled = true
      await settle(button)
      expect(getBase(button).getAttribute('aria-disabled')).toBe('true')

      button.disabled = false
      await settle(button)
      expect(getBase(button).hasAttribute('aria-disabled')).toBe(false)
    })

    it('changing loading at runtime syncs aria-busy', async () => {
      const button = await createButton()
      expect(getBase(button).hasAttribute('aria-busy')).toBe(false)

      button.loading = true
      await settle(button)
      expect(getBase(button).getAttribute('aria-busy')).toBe('true')

      button.loading = false
      await settle(button)
      expect(getBase(button).hasAttribute('aria-busy')).toBe(false)
    })

    it('changing toggle at runtime recreates model', async () => {
      const button = await createButton()
      expect(getBase(button).hasAttribute('aria-pressed')).toBe(false)

      button.toggle = true
      await settle(button)
      expect(getBase(button).getAttribute('aria-pressed')).toBe('false')
    })

    it('programmatic pressed change in toggle mode updates aria-pressed', async () => {
      const button = await createButton({toggle: true})
      expect(getBase(button).getAttribute('aria-pressed')).toBe('false')

      button.pressed = true
      await settle(button)
      expect(getBase(button).getAttribute('aria-pressed')).toBe('true')

      button.pressed = false
      await settle(button)
      expect(getBase(button).getAttribute('aria-pressed')).toBe('false')
    })
  })
})
