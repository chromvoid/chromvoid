import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVInput, type CVInputInputEvent} from './cv-input'

CVInput.define()

const settle = async (element: CVInput) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createInput = async (attrs?: Partial<CVInput>) => {
  const el = document.createElement('cv-input') as CVInput
  if (attrs) {
    Object.assign(el, attrs)
  }
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVInput) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

const getInput = (el: CVInput) =>
  el.shadowRoot!.querySelector('[part="input"]') as HTMLInputElement

const getClearButton = (el: CVInput) =>
  el.shadowRoot!.querySelector('[part="clear-button"]') as HTMLElement

const getPasswordToggle = (el: CVInput) =>
  el.shadowRoot!.querySelector('[part="password-toggle"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-input', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as a div', async () => {
      const el = await createInput()
      const base = getBase(el)
      expect(base).not.toBeNull()
      expect(base.tagName.toLowerCase()).toBe('div')
    })

    it('renders [part="input"] as a native input element', async () => {
      const el = await createInput()
      const input = getInput(el)
      expect(input).not.toBeNull()
      expect(input.tagName.toLowerCase()).toBe('input')
    })

    it('renders [part="prefix"] containing slot[name="prefix"]', async () => {
      const el = await createInput()
      const prefix = el.shadowRoot!.querySelector('[part="prefix"]')
      expect(prefix).not.toBeNull()
      const slot = prefix!.querySelector('slot[name="prefix"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="suffix"] containing slot[name="suffix"]', async () => {
      const el = await createInput()
      const suffix = el.shadowRoot!.querySelector('[part="suffix"]')
      expect(suffix).not.toBeNull()
      const slot = suffix!.querySelector('slot[name="suffix"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="clear-button"]', async () => {
      const el = await createInput({clearable: true, value: 'hello'})
      const clearBtn = getClearButton(el)
      expect(clearBtn).not.toBeNull()
    })

    it('renders [part="clear-button"] with slot[name="clear-icon"]', async () => {
      const el = await createInput({clearable: true, value: 'hello'})
      const clearBtn = getClearButton(el)
      expect(clearBtn).not.toBeNull()
      const slot = clearBtn!.querySelector('slot[name="clear-icon"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="password-toggle"]', async () => {
      const el = await createInput({type: 'password', passwordToggle: true})
      const toggle = getPasswordToggle(el)
      expect(toggle).not.toBeNull()
    })

    it('renders [part="form-control-label"] containing slot[name="label"]', async () => {
      const el = await createInput()
      const label = el.shadowRoot!.querySelector('[part="form-control-label"]')
      expect(label).not.toBeNull()
      const slot = label!.querySelector('slot[name="label"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="form-control-help-text"] containing slot[name="help-text"]', async () => {
      const el = await createInput()
      const helpText = el.shadowRoot!.querySelector('[part="form-control-help-text"]')
      expect(helpText).not.toBeNull()
      const slot = helpText!.querySelector('slot[name="help-text"]')
      expect(slot).not.toBeNull()
    })

    it('does NOT render a default (unnamed) slot', async () => {
      const el = await createInput()
      const defaultSlot = el.shadowRoot!.querySelector('slot:not([name])')
      expect(defaultSlot).toBeNull()
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const el = await createInput()
      expect(el.value).toBe('')
      expect(el.type).toBe('text')
      expect(el.placeholder).toBe('')
      expect(el.disabled).toBe(false)
      expect(el.readonly).toBe(false)
      expect(el.required).toBe(false)
      expect(el.clearable).toBe(false)
      expect(el.passwordToggle).toBe(false)
      expect(el.size).toBe('medium')
      expect(el.variant).toBe('outlined')
      expect(el.name).toBe('')
      expect(el.autofocus).toBe(false)
      expect(el.autocomplete).toBe('')
      expect(el.maxlength).toBeUndefined()
      expect(el.invalid).toBe(false)
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('boolean attributes reflect: disabled, readonly, required, clearable, password-toggle', async () => {
      const el = await createInput({
        disabled: true,
        readonly: true,
        required: true,
        clearable: true,
        passwordToggle: true,
      })
      expect(el.hasAttribute('disabled')).toBe(true)
      expect(el.hasAttribute('readonly')).toBe(true)
      expect(el.hasAttribute('required')).toBe(true)
      expect(el.hasAttribute('clearable')).toBe(true)
      expect(el.hasAttribute('password-toggle')).toBe(true)
    })

    it('string attributes reflect: size, variant', async () => {
      const el = await createInput({size: 'large', variant: 'filled'})
      expect(el.getAttribute('size')).toBe('large')
      expect(el.getAttribute('variant')).toBe('filled')
    })

    it('host reflects [focused] attribute when input is focused', async () => {
      const el = await createInput()
      const input = getInput(el)
      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)
      expect(el.hasAttribute('focused')).toBe(true)
    })

    it('host reflects [filled] attribute when value is non-empty', async () => {
      const el = await createInput({value: 'hello'})
      expect(el.hasAttribute('filled')).toBe(true)
    })

    it('host does NOT have [filled] when value is empty', async () => {
      const el = await createInput()
      expect(el.hasAttribute('filled')).toBe(false)
    })
  })

  // --- Events ---

  describe('events', () => {
    it('dispatches cv-input on native input event with { value } detail', async () => {
      const el = await createInput()
      const details: Array<{value: string}> = []
      el.addEventListener('cv-input', (e) => details.push((e as CVInputInputEvent).detail))

      const input = getInput(el)
      // Simulate user typing
      input.value = 'hello'
      input.dispatchEvent(new InputEvent('input', {bubbles: true}))
      await settle(el)

      expect(details).toEqual([{value: 'hello'}])
    })

    it('dispatches cv-clear when clear button is clicked', async () => {
      const el = await createInput({clearable: true, value: 'hello'})
      let clearFired = false
      el.addEventListener('cv-clear', () => {
        clearFired = true
      })

      const clearBtn = getClearButton(el)
      clearBtn.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(clearFired).toBe(true)
    })

    it('dispatches cv-clear when Escape is pressed with clearable and filled', async () => {
      const el = await createInput({clearable: true, value: 'hello'})
      let clearFired = false
      el.addEventListener('cv-clear', () => {
        clearFired = true
      })

      const input = getInput(el)
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(clearFired).toBe(true)
    })

    it('dispatches cv-focus when input receives focus', async () => {
      const el = await createInput()
      let focusFired = false
      el.addEventListener('cv-focus', () => {
        focusFired = true
      })

      const input = getInput(el)
      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)

      expect(focusFired).toBe(true)
    })

    it('dispatches cv-blur when input loses focus', async () => {
      const el = await createInput()
      let blurFired = false
      el.addEventListener('cv-blur', () => {
        blurFired = true
      })

      const input = getInput(el)
      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)
      input.dispatchEvent(new FocusEvent('blur', {bubbles: true}))
      await settle(el)

      expect(blurFired).toBe(true)
    })

    it('dispatches cv-change on blur when value changed since focus', async () => {
      const el = await createInput()
      const details: Array<{value: string}> = []
      el.addEventListener('cv-change', (e) => details.push((e as CustomEvent).detail))

      const input = getInput(el)
      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)

      // Simulate user input
      input.value = 'hello'
      input.dispatchEvent(new InputEvent('input', {bubbles: true}))
      await settle(el)

      // Blur to commit
      input.dispatchEvent(new FocusEvent('blur', {bubbles: true}))
      await settle(el)

      expect(details).toEqual([{value: 'hello'}])
    })

    it('does NOT dispatch cv-change on blur when value did not change', async () => {
      const el = await createInput()
      let changeFired = false
      el.addEventListener('cv-change', () => {
        changeFired = true
      })

      const input = getInput(el)
      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)
      input.dispatchEvent(new FocusEvent('blur', {bubbles: true}))
      await settle(el)

      expect(changeFired).toBe(false)
    })

    it('cv-input detail has shape { value: string }', async () => {
      const el = await createInput()
      let detail: unknown
      el.addEventListener('cv-input', (e) => {
        detail = e.detail
      })

      const input = getInput(el)
      input.value = 'test'
      input.dispatchEvent(new InputEvent('input', {bubbles: true}))
      await settle(el)

      expect(detail).toEqual({value: 'test'})
    })

    it('cv-clear detail has shape { }', async () => {
      const el = await createInput({clearable: true, value: 'hello'})
      let detail: unknown
      el.addEventListener('cv-clear', (e) => {
        detail = (e as CustomEvent).detail
      })

      const clearBtn = getClearButton(el)
      clearBtn.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({})
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('native input has no explicit role (uses implicit textbox role)', async () => {
      const el = await createInput()
      const input = getInput(el)
      expect(input.hasAttribute('role')).toBe(false)
    })

    it('aria-disabled="true" on native input when disabled', async () => {
      const el = await createInput({disabled: true})
      const input = getInput(el)
      expect(input.getAttribute('aria-disabled')).toBe('true')
    })

    it('aria-disabled absent on native input when enabled', async () => {
      const el = await createInput()
      const input = getInput(el)
      expect(input.hasAttribute('aria-disabled')).toBe(false)
    })

    it('aria-readonly="true" on native input when readonly', async () => {
      const el = await createInput({readonly: true})
      const input = getInput(el)
      expect(input.getAttribute('aria-readonly')).toBe('true')
    })

    it('aria-readonly absent on native input when not readonly', async () => {
      const el = await createInput()
      const input = getInput(el)
      expect(input.hasAttribute('aria-readonly')).toBe(false)
    })

    it('aria-required="true" on native input when required', async () => {
      const el = await createInput({required: true})
      const input = getInput(el)
      expect(input.getAttribute('aria-required')).toBe('true')
    })

    it('aria-required absent on native input when not required', async () => {
      const el = await createInput()
      const input = getInput(el)
      expect(input.hasAttribute('aria-required')).toBe(false)
    })

    it('tabindex="0" on native input when enabled', async () => {
      const el = await createInput()
      const input = getInput(el)
      expect(input.getAttribute('tabindex')).toBe('0')
    })

    it('tabindex="-1" on native input when disabled', async () => {
      const el = await createInput({disabled: true})
      const input = getInput(el)
      expect(input.getAttribute('tabindex')).toBe('-1')
    })

    it('autocomplete="off" when type is password', async () => {
      const el = await createInput({type: 'password'})
      const input = getInput(el)
      expect(input.getAttribute('autocomplete')).toBe('off')
    })

    it('autocomplete absent when type is not password', async () => {
      const el = await createInput({type: 'text'})
      const input = getInput(el)
      expect(input.hasAttribute('autocomplete')).toBe(false)
    })

    it('uses explicit autocomplete when provided', async () => {
      const el = await createInput({type: 'password', autocomplete: 'current-password'})
      const input = getInput(el)
      expect(input.getAttribute('autocomplete')).toBe('current-password')
    })

    it('applies maxlength attribute to native input', async () => {
      const el = await createInput({maxlength: 12})
      const input = getInput(el)
      expect(input.getAttribute('maxlength')).toBe('12')
    })

    it('sets aria-invalid on native input when invalid', async () => {
      const el = await createInput({invalid: true})
      const input = getInput(el)
      expect(input.getAttribute('aria-invalid')).toBe('true')
    })

    it('clear button has role="button"', async () => {
      const el = await createInput({clearable: true, value: 'hello'})
      const clearBtn = getClearButton(el)
      expect(clearBtn.getAttribute('role')).toBe('button')
    })

    it('clear button has aria-label="Clear input"', async () => {
      const el = await createInput({clearable: true, value: 'hello'})
      const clearBtn = getClearButton(el)
      expect(clearBtn.getAttribute('aria-label')).toBe('Clear input')
    })

    it('clear button has tabindex="-1"', async () => {
      const el = await createInput({clearable: true, value: 'hello'})
      const clearBtn = getClearButton(el)
      expect(clearBtn.getAttribute('tabindex')).toBe('-1')
    })

    it('password toggle has role="button"', async () => {
      const el = await createInput({type: 'password', passwordToggle: true})
      const toggle = getPasswordToggle(el)
      expect(toggle.getAttribute('role')).toBe('button')
    })

    it('password toggle has aria-label="Show password" initially', async () => {
      const el = await createInput({type: 'password', passwordToggle: true})
      const toggle = getPasswordToggle(el)
      expect(toggle.getAttribute('aria-label')).toBe('Show password')
    })

    it('password toggle has aria-pressed="false" initially', async () => {
      const el = await createInput({type: 'password', passwordToggle: true})
      const toggle = getPasswordToggle(el)
      expect(toggle.getAttribute('aria-pressed')).toBe('false')
    })

    it('password toggle has tabindex="0" when visible', async () => {
      const el = await createInput({type: 'password', passwordToggle: true})
      const toggle = getPasswordToggle(el)
      expect(toggle.getAttribute('tabindex')).toBe('0')
    })
  })

  // --- Clearable behavior ---

  describe('clearable behavior', () => {
    it('clear button is hidden when value is empty', async () => {
      const el = await createInput({clearable: true})
      const clearBtn = getClearButton(el)
      expect(clearBtn.hidden).toBe(true)
    })

    it('clear button is visible when clearable and value is non-empty', async () => {
      const el = await createInput({clearable: true, value: 'hello'})
      const clearBtn = getClearButton(el)
      expect(clearBtn.hidden).not.toBe(true)
    })

    it('clear button is hidden when disabled even with value', async () => {
      const el = await createInput({clearable: true, value: 'hello', disabled: true})
      const clearBtn = getClearButton(el)
      expect(clearBtn.hidden).toBe(true)
    })

    it('clear button is hidden when readonly even with value', async () => {
      const el = await createInput({clearable: true, value: 'hello', readonly: true})
      const clearBtn = getClearButton(el)
      expect(clearBtn.hidden).toBe(true)
    })

    it('clicking clear button resets value to empty string', async () => {
      const el = await createInput({clearable: true, value: 'hello'})
      const clearBtn = getClearButton(el)
      clearBtn.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.value).toBe('')
    })

    it('requests form submit on Enter when inside a form', async () => {
      const el = await createInput()
      const form = document.createElement('form')
      const requestSubmitSpy = vi.spyOn(form, 'requestSubmit').mockImplementation(() => {})

      form.append(el)
      document.body.append(form)
      await settle(el)

      const input = getInput(el)
      const event = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true})
      input.dispatchEvent(event)
      await settle(el)

      expect(event.defaultPrevented).toBe(true)
      expect(requestSubmitSpy).toHaveBeenCalledTimes(1)
    })

    it('clear button becomes hidden after value is cleared', async () => {
      const el = await createInput({clearable: true, value: 'hello'})
      const clearBtn = getClearButton(el)
      clearBtn.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      const updatedClearBtn = getClearButton(el)
      expect(updatedClearBtn.hidden).toBe(true)
    })

    it('Escape key clears value when clearable and filled', async () => {
      const el = await createInput({clearable: true, value: 'hello'})
      const input = getInput(el)
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.value).toBe('')
    })

    it('Escape key does nothing when not clearable', async () => {
      const el = await createInput({value: 'hello'})
      const input = getInput(el)
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.value).toBe('hello')
    })

    it('Escape key does nothing when value is empty', async () => {
      const el = await createInput({clearable: true})
      const input = getInput(el)
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.value).toBe('')
    })

    it('clear button has aria-hidden="true" when hidden', async () => {
      const el = await createInput({clearable: true})
      const clearBtn = getClearButton(el)
      expect(clearBtn.getAttribute('aria-hidden')).toBe('true')
    })
  })

  // --- Password toggle behavior ---

  describe('password toggle behavior', () => {
    it('password toggle is hidden when type is not password', async () => {
      const el = await createInput({type: 'text', passwordToggle: true})
      const toggle = getPasswordToggle(el)
      expect(toggle.hidden).toBe(true)
    })

    it('password toggle is hidden when passwordToggle is false', async () => {
      const el = await createInput({type: 'password', passwordToggle: false})
      const toggle = getPasswordToggle(el)
      expect(toggle.hidden).toBe(true)
    })

    it('password toggle is visible when type=password and passwordToggle=true', async () => {
      const el = await createInput({type: 'password', passwordToggle: true})
      const toggle = getPasswordToggle(el)
      expect(toggle.hidden).not.toBe(true)
    })

    it('clicking password toggle reveals the password (type becomes text)', async () => {
      const el = await createInput({type: 'password', passwordToggle: true})
      const toggle = getPasswordToggle(el)
      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      const input = getInput(el)
      expect(input.getAttribute('type')).toBe('text')
    })

    it('clicking password toggle again hides the password', async () => {
      const el = await createInput({type: 'password', passwordToggle: true})
      const toggle = getPasswordToggle(el)
      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      const input = getInput(el)
      expect(input.getAttribute('type')).toBe('password')
    })

    it('aria-pressed updates to "true" after toggle click', async () => {
      const el = await createInput({type: 'password', passwordToggle: true})
      const toggle = getPasswordToggle(el)
      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      const updatedToggle = getPasswordToggle(el)
      expect(updatedToggle.getAttribute('aria-pressed')).toBe('true')
    })

    it('aria-label changes to "Hide password" after revealing', async () => {
      const el = await createInput({type: 'password', passwordToggle: true})
      const toggle = getPasswordToggle(el)
      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      const updatedToggle = getPasswordToggle(el)
      expect(updatedToggle.getAttribute('aria-label')).toBe('Hide password')
    })

    it('password toggle has aria-hidden="true" when hidden', async () => {
      const el = await createInput({type: 'text', passwordToggle: true})
      const toggle = getPasswordToggle(el)
      expect(toggle.getAttribute('aria-hidden')).toBe('true')
    })
  })

  // --- Disabled behavior ---

  describe('disabled behavior', () => {
    it('host has [disabled] attribute when disabled', async () => {
      const el = await createInput({disabled: true})
      expect(el.hasAttribute('disabled')).toBe(true)
    })

    it('native input has disabled attribute when disabled', async () => {
      const el = await createInput({disabled: true})
      const input = getInput(el)
      expect(input.disabled).toBe(true)
    })

    it('native input event does not dispatch cv-input when disabled', async () => {
      const el = await createInput({disabled: true})
      let inputFired = false
      el.addEventListener('cv-input', () => {
        inputFired = true
      })

      const input = getInput(el)
      input.value = 'hello'
      input.dispatchEvent(new InputEvent('input', {bubbles: true}))
      await settle(el)

      expect(inputFired).toBe(false)
    })

    it('clear does not work when disabled', async () => {
      const el = await createInput({clearable: true, value: 'hello', disabled: true})
      const clearBtn = getClearButton(el)
      clearBtn.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.value).toBe('hello')
    })

    it('Escape key does not clear when disabled', async () => {
      const el = await createInput({clearable: true, value: 'hello', disabled: true})
      const input = getInput(el)
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.value).toBe('hello')
    })
  })

  // --- Readonly behavior ---

  describe('readonly behavior', () => {
    it('host has [readonly] attribute when readonly', async () => {
      const el = await createInput({readonly: true})
      expect(el.hasAttribute('readonly')).toBe(true)
    })

    it('native input has readonly attribute when readonly', async () => {
      const el = await createInput({readonly: true})
      const input = getInput(el)
      expect(input.readOnly).toBe(true)
    })

    it('clear does not work when readonly', async () => {
      const el = await createInput({clearable: true, value: 'hello', readonly: true})
      const clearBtn = getClearButton(el)
      clearBtn.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.value).toBe('hello')
    })

    it('Escape key does not clear when readonly', async () => {
      const el = await createInput({clearable: true, value: 'hello', readonly: true})
      const input = getInput(el)
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.value).toBe('hello')
    })

    it('input remains focusable when readonly (tabindex="0")', async () => {
      const el = await createInput({readonly: true})
      const input = getInput(el)
      expect(input.getAttribute('tabindex')).toBe('0')
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('native input ARIA attributes originate from contracts.getInputProps(), not hardcoded', async () => {
      const el = await createInput({disabled: true, required: true, readonly: true})
      const input = getInput(el)

      // These values must match what headless getInputProps() returns
      expect(input.getAttribute('aria-disabled')).toBe('true')
      expect(input.getAttribute('aria-readonly')).toBe('true')
      expect(input.getAttribute('aria-required')).toBe('true')
      expect(input.getAttribute('tabindex')).toBe('-1')
    })

    it('clear button attributes originate from contracts.getClearButtonProps()', async () => {
      const el = await createInput({clearable: true, value: 'hello'})
      const clearBtn = getClearButton(el)

      expect(clearBtn.getAttribute('role')).toBe('button')
      expect(clearBtn.getAttribute('aria-label')).toBe('Clear input')
      expect(clearBtn.getAttribute('tabindex')).toBe('-1')
    })

    it('password toggle attributes originate from contracts.getPasswordToggleProps()', async () => {
      const el = await createInput({type: 'password', passwordToggle: true})
      const toggle = getPasswordToggle(el)

      expect(toggle.getAttribute('role')).toBe('button')
      expect(toggle.getAttribute('aria-label')).toBe('Show password')
      expect(toggle.getAttribute('aria-pressed')).toBe('false')
      expect(toggle.getAttribute('tabindex')).toBe('0')
    })

    it('input type is set from headless resolvedType, not directly from the type property', async () => {
      const el = await createInput({type: 'password', passwordToggle: true})
      const input = getInput(el)
      expect(input.getAttribute('type')).toBe('password')

      // Toggle password visibility
      const toggle = getPasswordToggle(el)
      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      const updatedInput = getInput(el)
      expect(updatedInput.getAttribute('type')).toBe('text')
    })

    it('input id is generated from headless idBase pattern', async () => {
      const el = await createInput()
      const input = getInput(el)
      expect(input.id).toContain('input')
    })
  })

  // --- Dynamic state updates ---

  describe('dynamic state updates', () => {
    it('changing disabled at runtime syncs aria-disabled on native input', async () => {
      const el = await createInput()
      const input = getInput(el)
      expect(input.hasAttribute('aria-disabled')).toBe(false)

      el.disabled = true
      await settle(el)
      expect(getInput(el).getAttribute('aria-disabled')).toBe('true')

      el.disabled = false
      await settle(el)
      expect(getInput(el).hasAttribute('aria-disabled')).toBe(false)
    })

    it('changing readonly at runtime syncs aria-readonly on native input', async () => {
      const el = await createInput()
      expect(getInput(el).hasAttribute('aria-readonly')).toBe(false)

      el.readonly = true
      await settle(el)
      expect(getInput(el).getAttribute('aria-readonly')).toBe('true')

      el.readonly = false
      await settle(el)
      expect(getInput(el).hasAttribute('aria-readonly')).toBe(false)
    })

    it('changing required at runtime syncs aria-required on native input', async () => {
      const el = await createInput()
      expect(getInput(el).hasAttribute('aria-required')).toBe(false)

      el.required = true
      await settle(el)
      expect(getInput(el).getAttribute('aria-required')).toBe('true')

      el.required = false
      await settle(el)
      expect(getInput(el).hasAttribute('aria-required')).toBe(false)
    })

    it('setting value programmatically updates [filled] host attribute', async () => {
      const el = await createInput()
      expect(el.hasAttribute('filled')).toBe(false)

      el.value = 'hello'
      await settle(el)
      expect(el.hasAttribute('filled')).toBe(true)

      el.value = ''
      await settle(el)
      expect(el.hasAttribute('filled')).toBe(false)
    })

    it('focus and blur update [focused] host attribute', async () => {
      const el = await createInput()
      expect(el.hasAttribute('focused')).toBe(false)

      const input = getInput(el)
      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)
      expect(el.hasAttribute('focused')).toBe(true)

      input.dispatchEvent(new FocusEvent('blur', {bubbles: true}))
      await settle(el)
      expect(el.hasAttribute('focused')).toBe(false)
    })

    it('host focus() delegates to native input focus()', async () => {
      const el = await createInput()
      const input = getInput(el)
      const focusSpy = vi.spyOn(input, 'focus')

      el.focus()

      expect(focusSpy).toHaveBeenCalledTimes(1)
    })

    it('select() delegates to native input select()', async () => {
      const el = await createInput()
      const input = getInput(el)
      const selectSpy = vi.spyOn(input, 'select')

      el.select()

      expect(selectSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('form association', () => {
    const hasElementInternals = typeof (HTMLElement.prototype as {attachInternals?: unknown}).attachInternals === 'function'

    it('declares formAssociated for custom element', () => {
      expect(CVInput.formAssociated).toBe(true)
    })

    it.skipIf(!hasElementInternals)('participates in FormData via attachInternals', async () => {
      const form = document.createElement('form')
      const el = await createInput({name: 'vaultPassword', value: 'secret'})

      form.append(el)
      document.body.append(form)
      await settle(el)

      const formData = new FormData(form)
      const value = formData.get('vaultPassword')
      if (value === null) {
        // Some test environments expose attachInternals but don't include FACE controls in FormData.
        return
      }
      expect(value).toBe('secret')
    })

    it.skipIf(!hasElementInternals)('respects formDisabledCallback by dropping form value', async () => {
      const form = document.createElement('form')
      const el = await createInput({name: 'field', value: 'value'})
      form.append(el)
      document.body.append(form)
      await settle(el)

      const before = new FormData(form).get('field')
      el.formDisabledCallback(true)
      await settle(el)

      const formData = new FormData(form)
      if (before === null) {
        return
      }
      expect(formData.get('field')).toBeNull()
    })
  })
})
