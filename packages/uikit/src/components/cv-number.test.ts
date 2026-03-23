import {afterEach, describe, expect, it} from 'vitest'

import {CVNumber} from './cv-number'

CVNumber.define()

const settle = async (element: CVNumber) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createNumber = async (attrs?: Partial<CVNumber>) => {
  const el = document.createElement('cv-number') as CVNumber
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVNumber) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement
const getInput = (el: CVNumber) =>
  el.shadowRoot!.querySelector('[part="input"]') as HTMLInputElement
const getPrefix = (el: CVNumber) =>
  el.shadowRoot!.querySelector('[part="prefix"]') as HTMLElement
const getSuffix = (el: CVNumber) =>
  el.shadowRoot!.querySelector('[part="suffix"]') as HTMLElement
const getLabel = (el: CVNumber) =>
  el.shadowRoot!.querySelector('[part="form-control-label"]') as HTMLElement
const getHelpText = (el: CVNumber) =>
  el.shadowRoot!.querySelector('[part="form-control-help-text"]') as HTMLElement
const getClearButton = (el: CVNumber) =>
  el.shadowRoot!.querySelector('[part="clear-button"]') as HTMLElement
const getStepper = (el: CVNumber) =>
  el.shadowRoot!.querySelector('[part="stepper"]') as HTMLElement
const getIncrement = (el: CVNumber) =>
  el.shadowRoot!.querySelector('[part="increment"]') as HTMLButtonElement
const getDecrement = (el: CVNumber) =>
  el.shadowRoot!.querySelector('[part="decrement"]') as HTMLButtonElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-number', () => {
  // ---------------------------------------------------------------------------
  // Shadow DOM structure
  // ---------------------------------------------------------------------------

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as a <div>', async () => {
      const el = await createNumber()
      const base = getBase(el)
      expect(base).not.toBeNull()
      expect(base.tagName.toLowerCase()).toBe('div')
    })

    it('renders [part="input"] as an <input> with role="spinbutton"', async () => {
      const el = await createNumber()
      const input = getInput(el)
      expect(input).not.toBeNull()
      expect(input.tagName.toLowerCase()).toBe('input')
      expect(input.getAttribute('role')).toBe('spinbutton')
    })

    it('renders [part="input"] with inputmode="decimal"', async () => {
      const el = await createNumber()
      const input = getInput(el)
      expect(input.getAttribute('inputmode')).toBe('decimal')
    })

    it('renders [part="prefix"] containing slot[name="prefix"]', async () => {
      const el = await createNumber()
      const prefix = getPrefix(el)
      expect(prefix).not.toBeNull()
      expect(prefix.tagName.toLowerCase()).toBe('span')
      const slot = prefix.querySelector('slot[name="prefix"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="suffix"] containing slot[name="suffix"]', async () => {
      const el = await createNumber()
      const suffix = getSuffix(el)
      expect(suffix).not.toBeNull()
      expect(suffix.tagName.toLowerCase()).toBe('span')
      const slot = suffix.querySelector('slot[name="suffix"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="form-control-label"] containing slot[name="label"]', async () => {
      const el = await createNumber()
      const label = getLabel(el)
      expect(label).not.toBeNull()
      expect(label.tagName.toLowerCase()).toBe('span')
      const slot = label.querySelector('slot[name="label"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="form-control-help-text"] containing slot[name="help-text"]', async () => {
      const el = await createNumber()
      const helpText = getHelpText(el)
      expect(helpText).not.toBeNull()
      expect(helpText.tagName.toLowerCase()).toBe('span')
      const slot = helpText.querySelector('slot[name="help-text"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="clear-button"] with role="button"', async () => {
      const el = await createNumber({clearable: true, value: 5})
      const clearBtn = getClearButton(el)
      expect(clearBtn).not.toBeNull()
      expect(clearBtn.tagName.toLowerCase()).toBe('span')
      expect(clearBtn.getAttribute('role')).toBe('button')
    })

    it('renders [part="clear-button"] with slot[name="clear-icon"]', async () => {
      const el = await createNumber({clearable: true, value: 5})
      const clearBtn = getClearButton(el)
      expect(clearBtn).not.toBeNull()
      const slot = clearBtn.querySelector('slot[name="clear-icon"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="stepper"] when stepper=true', async () => {
      const el = await createNumber({stepper: true})
      const stepperEl = getStepper(el)
      expect(stepperEl).not.toBeNull()
      expect(stepperEl.tagName.toLowerCase()).toBe('span')
    })

    it('renders [part="increment"] as a <button> when stepper=true', async () => {
      const el = await createNumber({stepper: true})
      const inc = getIncrement(el)
      expect(inc).not.toBeNull()
      expect(inc.tagName.toLowerCase()).toBe('button')
      expect(inc.getAttribute('type')).toBe('button')
    })

    it('renders [part="decrement"] as a <button> when stepper=true', async () => {
      const el = await createNumber({stepper: true})
      const dec = getDecrement(el)
      expect(dec).not.toBeNull()
      expect(dec.tagName.toLowerCase()).toBe('button')
      expect(dec.getAttribute('type')).toBe('button')
    })
  })

  // ---------------------------------------------------------------------------
  // Default property values
  // ---------------------------------------------------------------------------

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const el = await createNumber()
      expect(el.value).toBe(0)
      expect(el.step).toBe(1)
      expect(el.largeStep).toBe(10)
      expect(el.disabled).toBe(false)
      expect(el.readOnly).toBe(false)
      expect(el.required).toBe(false)
      expect(el.clearable).toBe(false)
      expect(el.stepper).toBe(false)
      expect(el.size).toBe('medium')
      expect(el.variant).toBe('outlined')
      expect(el.placeholder).toBe('')
    })

    it('defaults min and max to undefined/null (unbounded)', async () => {
      const el = await createNumber()
      expect(el.min).toBeUndefined()
      expect(el.max).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Attribute reflection
  // ---------------------------------------------------------------------------

  describe('attribute reflection', () => {
    it('reflects boolean attributes: disabled, read-only, required, clearable, stepper', async () => {
      const el = await createNumber({
        disabled: true,
        readOnly: true,
        required: true,
        clearable: true,
        stepper: true,
      })
      expect(el.hasAttribute('disabled')).toBe(true)
      expect(el.hasAttribute('read-only')).toBe(true)
      expect(el.hasAttribute('required')).toBe(true)
      expect(el.hasAttribute('clearable')).toBe(true)
      expect(el.hasAttribute('stepper')).toBe(true)
    })

    it('reflects string attributes: size, variant', async () => {
      const el = await createNumber({size: 'large', variant: 'filled'})
      expect(el.getAttribute('size')).toBe('large')
      expect(el.getAttribute('variant')).toBe('filled')
    })

    it('removes boolean attributes when set to false', async () => {
      const el = await createNumber({disabled: true})
      expect(el.hasAttribute('disabled')).toBe(true)

      el.disabled = false
      await settle(el)
      expect(el.hasAttribute('disabled')).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // ARIA
  // ---------------------------------------------------------------------------

  describe('ARIA', () => {
    it('applies role="spinbutton" on the input element', async () => {
      const el = await createNumber()
      expect(getInput(el).getAttribute('role')).toBe('spinbutton')
    })

    it('applies aria-valuenow reflecting the current value', async () => {
      const el = await createNumber({value: 42})
      expect(getInput(el).getAttribute('aria-valuenow')).toBe('42')
    })

    it('applies aria-valuemin when min is set', async () => {
      const el = await createNumber({min: 0})
      expect(getInput(el).getAttribute('aria-valuemin')).toBe('0')
    })

    it('applies aria-valuemax when max is set', async () => {
      const el = await createNumber({max: 100})
      expect(getInput(el).getAttribute('aria-valuemax')).toBe('100')
    })

    it('does not apply aria-valuemin/max when not set', async () => {
      const el = await createNumber()
      const input = getInput(el)
      expect(input.hasAttribute('aria-valuemin')).toBe(false)
      expect(input.hasAttribute('aria-valuemax')).toBe(false)
    })

    it('applies aria-disabled="true" when disabled', async () => {
      const el = await createNumber({disabled: true})
      expect(getInput(el).getAttribute('aria-disabled')).toBe('true')
    })

    it('applies aria-readonly="true" when readOnly', async () => {
      const el = await createNumber({readOnly: true})
      expect(getInput(el).getAttribute('aria-readonly')).toBe('true')
    })

    it('applies aria-required="true" when required', async () => {
      const el = await createNumber({required: true})
      expect(getInput(el).getAttribute('aria-required')).toBe('true')
    })

    it('updates aria-valuenow when value changes', async () => {
      const el = await createNumber({value: 1})
      expect(getInput(el).getAttribute('aria-valuenow')).toBe('1')

      el.value = 99
      await settle(el)
      expect(getInput(el).getAttribute('aria-valuenow')).toBe('99')
    })
  })

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  describe('events', () => {
    it('dispatches cv-change with {value: number} on stepper increment click', async () => {
      const el = await createNumber({value: 5, step: 1, stepper: true})
      const details: Array<{value: number}> = []

      el.addEventListener('cv-change', ((e: CustomEvent<{value: number}>) => {
        details.push(e.detail)
      }) as EventListener)

      getIncrement(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(details.length).toBe(1)
      expect(details[0]).toEqual({value: 6})
    })

    it('dispatches cv-change with {value: number} on stepper decrement click', async () => {
      const el = await createNumber({value: 5, step: 1, stepper: true})
      const details: Array<{value: number}> = []

      el.addEventListener('cv-change', ((e: CustomEvent<{value: number}>) => {
        details.push(e.detail)
      }) as EventListener)

      getDecrement(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(details.length).toBe(1)
      expect(details[0]).toEqual({value: 4})
    })

    it('dispatches cv-clear with {} detail when clear button is clicked', async () => {
      const el = await createNumber({value: 10, clearable: true})
      const details: unknown[] = []

      el.addEventListener('cv-clear', ((e: CustomEvent) => {
        details.push(e.detail)
      }) as EventListener)

      getClearButton(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(details.length).toBe(1)
      expect(details[0]).toEqual({})
    })

    it('dispatches cv-focus with {} detail on input focus', async () => {
      const el = await createNumber()
      const details: unknown[] = []

      el.addEventListener('cv-focus', (e) => {
        details.push((e as CustomEvent).detail)
      })

      getInput(el).dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)

      expect(details.length).toBe(1)
      expect(details[0]).toEqual({})
    })

    it('dispatches cv-blur with {} detail on input blur', async () => {
      const el = await createNumber()
      const details: unknown[] = []

      el.addEventListener('cv-blur', (e) => {
        details.push((e as CustomEvent).detail)
      })

      getInput(el).dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)
      getInput(el).dispatchEvent(new FocusEvent('blur', {bubbles: true}))
      await settle(el)

      expect(details.length).toBe(1)
      expect(details[0]).toEqual({})
    })

    it('dispatches cv-change on blur when value changed during focus', async () => {
      const el = await createNumber({value: 5, step: 1})
      const changes: Array<{value: number}> = []

      el.addEventListener('cv-change', (e) => {
        changes.push((e as CustomEvent<{value: number}>).detail)
      })

      const input = getInput(el)
      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)

      // Type a new value
      input.value = '10'
      input.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
      await settle(el)

      // Blur to commit
      input.dispatchEvent(new FocusEvent('blur', {bubbles: true}))
      await settle(el)

      expect(changes.length).toBe(1)
      expect(changes[0]).toEqual({value: 10})
    })

    it('does not dispatch cv-change from programmatic value set', async () => {
      const el = await createNumber({value: 0})
      let changeCount = 0

      el.addEventListener('cv-change', () => changeCount++)

      el.value = 99
      await settle(el)

      expect(changeCount).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Stepper buttons
  // ---------------------------------------------------------------------------

  describe('stepper buttons', () => {
    it('stepper buttons are hidden by default (stepper=false)', async () => {
      const el = await createNumber()
      const stepperEl = getStepper(el)
      // Either not rendered or hidden
      if (stepperEl) {
        expect(
          stepperEl.hidden || stepperEl.getAttribute('aria-hidden') === 'true'
        ).toBe(true)
      } else {
        expect(stepperEl).toBeNull()
      }
    })

    it('stepper buttons are visible when stepper=true', async () => {
      const el = await createNumber({stepper: true})
      const stepperEl = getStepper(el)
      expect(stepperEl).not.toBeNull()
      expect(getIncrement(el)).not.toBeNull()
      expect(getDecrement(el)).not.toBeNull()
    })

    it('increment click increases value by step', async () => {
      const el = await createNumber({value: 4, step: 2, stepper: true})

      getIncrement(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.value).toBe(6)
    })

    it('decrement click decreases value by step', async () => {
      const el = await createNumber({value: 9, step: 3, stepper: true})

      getDecrement(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.value).toBe(6)
    })

    it('increment respects max boundary', async () => {
      const el = await createNumber({value: 9, max: 10, step: 2, stepper: true})

      getIncrement(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.value).toBeLessThanOrEqual(10)
    })

    it('decrement respects min boundary', async () => {
      const el = await createNumber({value: 1, min: 0, step: 2, stepper: true})

      getDecrement(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.value).toBeGreaterThanOrEqual(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Clear button
  // ---------------------------------------------------------------------------

  describe('clear button', () => {
    it('is hidden when clearable=false', async () => {
      const el = await createNumber({value: 5})
      const clearBtn = getClearButton(el)
      if (clearBtn) {
        expect(
          clearBtn.hidden || clearBtn.getAttribute('aria-hidden') === 'true'
        ).toBe(true)
      } else {
        expect(clearBtn).toBeNull()
      }
    })

    it('is visible when clearable=true and value differs from defaultValue', async () => {
      const el = await createNumber({clearable: true, value: 42})
      const clearBtn = getClearButton(el)
      expect(clearBtn).not.toBeNull()
      expect(clearBtn.hidden).toBe(false)
    })

    it('clicking clear resets value to defaultValue', async () => {
      const el = await createNumber({clearable: true, value: 42})

      getClearButton(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      // defaultValue defaults to min ?? 0
      expect(el.value).toBe(0)
    })

    it('clicking clear dispatches cv-clear event', async () => {
      const el = await createNumber({clearable: true, value: 42})
      let cleared = false

      el.addEventListener('cv-clear', () => {
        cleared = true
      })

      getClearButton(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(cleared).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Keyboard interaction
  // ---------------------------------------------------------------------------

  describe('keyboard interaction', () => {
    it('ArrowUp increments value by step', async () => {
      const el = await createNumber({value: 5, step: 1})
      const input = getInput(el)

      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(el)

      expect(el.value).toBe(6)
    })

    it('ArrowDown decrements value by step', async () => {
      const el = await createNumber({value: 5, step: 1})
      const input = getInput(el)

      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      expect(el.value).toBe(4)
    })

    it('PageUp increments value by largeStep', async () => {
      const el = await createNumber({value: 5, largeStep: 10})
      const input = getInput(el)

      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'PageUp', bubbles: true}))
      await settle(el)

      expect(el.value).toBe(15)
    })

    it('PageDown decrements value by largeStep', async () => {
      const el = await createNumber({value: 25, largeStep: 10})
      const input = getInput(el)

      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'PageDown', bubbles: true}))
      await settle(el)

      expect(el.value).toBe(15)
    })

    it('Home sets value to min when min is defined', async () => {
      const el = await createNumber({value: 50, min: 0})
      const input = getInput(el)

      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true}))
      await settle(el)

      expect(el.value).toBe(0)
    })

    it('End sets value to max when max is defined', async () => {
      const el = await createNumber({value: 50, max: 100})
      const input = getInput(el)

      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true}))
      await settle(el)

      expect(el.value).toBe(100)
    })

    it('Enter commits the draft text', async () => {
      const el = await createNumber({value: 5})
      const input = getInput(el)

      input.value = '42'
      input.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
      await settle(el)

      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect(el.value).toBe(42)
    })

    it('Escape clears value when clearable', async () => {
      const el = await createNumber({value: 42, clearable: true})
      const input = getInput(el)
      let cleared = false

      el.addEventListener('cv-clear', () => {
        cleared = true
      })

      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.value).toBe(0)
      expect(cleared).toBe(true)
    })

    it('ArrowUp dispatches cv-change event', async () => {
      const el = await createNumber({value: 5, step: 1})
      const changes: Array<{value: number}> = []

      el.addEventListener('cv-change', (e) => {
        changes.push((e as CustomEvent<{value: number}>).detail)
      })

      getInput(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(el)

      expect(changes.length).toBe(1)
      expect(changes[0]).toEqual({value: 6})
    })
  })

  // ---------------------------------------------------------------------------
  // Disabled state blocks interaction
  // ---------------------------------------------------------------------------

  describe('disabled state blocks interaction', () => {
    it('disabled blocks stepper increment click', async () => {
      const el = await createNumber({value: 5, stepper: true, disabled: true})
      let changeCount = 0
      el.addEventListener('cv-change', () => changeCount++)

      getIncrement(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.value).toBe(5)
      expect(changeCount).toBe(0)
    })

    it('disabled blocks stepper decrement click', async () => {
      const el = await createNumber({value: 5, stepper: true, disabled: true})
      let changeCount = 0
      el.addEventListener('cv-change', () => changeCount++)

      getDecrement(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.value).toBe(5)
      expect(changeCount).toBe(0)
    })

    it('disabled blocks keyboard ArrowUp/Down', async () => {
      const el = await createNumber({value: 5, disabled: true})
      const input = getInput(el)

      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(el)
      expect(el.value).toBe(5)

      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      expect(el.value).toBe(5)
    })

    it('disabled blocks clear button click', async () => {
      const el = await createNumber({value: 10, clearable: true, disabled: true})
      let clearCount = 0
      el.addEventListener('cv-clear', () => clearCount++)

      const clearBtn = getClearButton(el)
      if (clearBtn) {
        clearBtn.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
        await settle(el)
      }

      expect(el.value).toBe(10)
      expect(clearCount).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Read-only state blocks interaction
  // ---------------------------------------------------------------------------

  describe('read-only state blocks interaction', () => {
    it('readOnly blocks stepper increment click', async () => {
      const el = await createNumber({value: 5, stepper: true, readOnly: true})
      let changeCount = 0
      el.addEventListener('cv-change', () => changeCount++)

      getIncrement(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.value).toBe(5)
      expect(changeCount).toBe(0)
    })

    it('readOnly blocks keyboard ArrowUp/Down', async () => {
      const el = await createNumber({value: 5, readOnly: true})
      const input = getInput(el)

      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(el)
      expect(el.value).toBe(5)

      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      expect(el.value).toBe(5)
    })

    it('readOnly blocks text input editing', async () => {
      const el = await createNumber({value: 5, readOnly: true})
      const input = getInput(el)

      input.value = '99'
      input.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect(el.value).toBe(5)
    })
  })

  // ---------------------------------------------------------------------------
  // Sizes
  // ---------------------------------------------------------------------------

  describe('sizes', () => {
    it('reflects size="small" on the host', async () => {
      const el = await createNumber({size: 'small'})
      expect(el.getAttribute('size')).toBe('small')
    })

    it('reflects size="medium" on the host (default)', async () => {
      const el = await createNumber()
      expect(el.getAttribute('size')).toBe('medium')
    })

    it('reflects size="large" on the host', async () => {
      const el = await createNumber({size: 'large'})
      expect(el.getAttribute('size')).toBe('large')
    })

    it('updates size attribute dynamically', async () => {
      const el = await createNumber({size: 'small'})
      expect(el.getAttribute('size')).toBe('small')

      el.size = 'large'
      await settle(el)
      expect(el.getAttribute('size')).toBe('large')
    })
  })

  // ---------------------------------------------------------------------------
  // Variants
  // ---------------------------------------------------------------------------

  describe('variants', () => {
    it('reflects variant="outlined" on the host (default)', async () => {
      const el = await createNumber()
      expect(el.getAttribute('variant')).toBe('outlined')
    })

    it('reflects variant="filled" on the host', async () => {
      const el = await createNumber({variant: 'filled'})
      expect(el.getAttribute('variant')).toBe('filled')
    })

    it('updates variant attribute dynamically', async () => {
      const el = await createNumber({variant: 'outlined'})
      expect(el.getAttribute('variant')).toBe('outlined')

      el.variant = 'filled'
      await settle(el)
      expect(el.getAttribute('variant')).toBe('filled')
    })
  })

  // ---------------------------------------------------------------------------
  // Visual state host attributes
  // ---------------------------------------------------------------------------

  describe('visual state host attributes', () => {
    it('sets [focused] attribute when input is focused', async () => {
      const el = await createNumber()

      getInput(el).dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)

      expect(el.hasAttribute('focused')).toBe(true)
    })

    it('removes [focused] attribute when input is blurred', async () => {
      const el = await createNumber()

      getInput(el).dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)
      expect(el.hasAttribute('focused')).toBe(true)

      getInput(el).dispatchEvent(new FocusEvent('blur', {bubbles: true}))
      await settle(el)
      expect(el.hasAttribute('focused')).toBe(false)
    })

    it('sets [filled] attribute when value differs from default', async () => {
      const el = await createNumber({value: 42})
      expect(el.hasAttribute('filled')).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Draft text behavior
  // ---------------------------------------------------------------------------

  describe('draft text', () => {
    it('typing in input updates the displayed text without committing', async () => {
      const el = await createNumber({value: 5})
      const input = getInput(el)

      input.value = '12'
      input.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
      await settle(el)

      // Value should not be committed yet
      expect(el.value).toBe(5)
      // But the input should show the draft text
      expect(input.value).toBe('12')
    })

    it('blur commits draft text and updates value', async () => {
      const el = await createNumber({value: 5})
      const input = getInput(el)

      input.value = '20'
      input.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
      await settle(el)

      input.dispatchEvent(new FocusEvent('blur', {bubbles: true}))
      await settle(el)

      expect(el.value).toBe(20)
    })

    it('Enter commits draft text and updates value', async () => {
      const el = await createNumber({value: 5})
      const input = getInput(el)

      input.value = '30'
      input.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
      await settle(el)

      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect(el.value).toBe(30)
    })

    it('when no draft, input displays formatted value', async () => {
      const el = await createNumber({value: 42})
      const input = getInput(el)

      // No draft active — should display the formatted value
      expect(input.value).toBe('42')
    })
  })

  // ---------------------------------------------------------------------------
  // Headless contract delegation
  // ---------------------------------------------------------------------------

  describe('headless contract delegation', () => {
    it('input element receives ARIA attributes from headless getInputProps', async () => {
      const el = await createNumber({value: 7, min: 1, max: 9, required: true})
      const input = getInput(el)

      // These attributes should originate from contracts.getInputProps()
      expect(input.getAttribute('role')).toBe('spinbutton')
      expect(input.getAttribute('aria-valuenow')).toBe('7')
      expect(input.getAttribute('aria-valuemin')).toBe('1')
      expect(input.getAttribute('aria-valuemax')).toBe('9')
      expect(input.getAttribute('aria-required')).toBe('true')
      expect(input.hasAttribute('id')).toBe(true)
    })

    it('increment button receives attributes from headless getIncrementButtonProps', async () => {
      const el = await createNumber({value: 5, stepper: true})
      const inc = getIncrement(el)

      expect(inc.hasAttribute('id')).toBe(true)
      expect(inc.hasAttribute('tabindex')).toBe(true)
      expect(inc.hasAttribute('aria-label')).toBe(true)
    })

    it('decrement button receives attributes from headless getDecrementButtonProps', async () => {
      const el = await createNumber({value: 5, stepper: true})
      const dec = getDecrement(el)

      expect(dec.hasAttribute('id')).toBe(true)
      expect(dec.hasAttribute('tabindex')).toBe(true)
      expect(dec.hasAttribute('aria-label')).toBe(true)
    })

    it('clear button receives attributes from headless getClearButtonProps', async () => {
      const el = await createNumber({value: 5, clearable: true})
      const clearBtn = getClearButton(el)

      expect(clearBtn.getAttribute('role')).toBe('button')
      expect(clearBtn.hasAttribute('aria-label')).toBe(true)
      expect(clearBtn.hasAttribute('tabindex')).toBe(true)
    })

    it('disabled state propagates through headless to ARIA on input', async () => {
      const el = await createNumber({disabled: true})
      const input = getInput(el)

      expect(input.getAttribute('aria-disabled')).toBe('true')
    })

    it('readOnly state propagates through headless to ARIA on input', async () => {
      const el = await createNumber({readOnly: true})
      const input = getInput(el)

      expect(input.getAttribute('aria-readonly')).toBe('true')
    })
  })
})
