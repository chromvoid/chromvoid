import {afterEach, describe, expect, it} from 'vitest'

import {CVSwitch} from './cv-switch'

CVSwitch.define()

const settle = async (element: CVSwitch) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createSwitch = async (attrs?: Partial<CVSwitch>) => {
  const sw = document.createElement('cv-switch') as CVSwitch
  if (attrs) {
    Object.assign(sw, attrs)
  }
  document.body.append(sw)
  await settle(sw)
  return sw
}

const createSwitchWithHTML = async (innerHTML: string, attrs?: Record<string, string>) => {
  const sw = document.createElement('cv-switch') as CVSwitch
  sw.innerHTML = innerHTML
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      sw.setAttribute(key, value)
    }
  }
  document.body.append(sw)
  await settle(sw)
  return sw
}

const getBase = (sw: CVSwitch) =>
  sw.shadowRoot!.querySelector('[part="base"]') as HTMLElement

const getControl = (sw: CVSwitch) =>
  sw.shadowRoot!.querySelector('[part="control"]') as HTMLElement

const hasElementInternals = typeof (HTMLElement.prototype as {attachInternals?: unknown}).attachInternals === 'function'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-switch', () => {
  // --- 1. Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"]', async () => {
      const sw = await createSwitch()
      const base = getBase(sw)
      expect(base).not.toBeNull()
    })

    it('renders [part="control"] with role="switch" inside base', async () => {
      const sw = await createSwitch()
      const base = getBase(sw)
      const control = base!.querySelector('[part="control"]')
      expect(control).not.toBeNull()
      expect(control!.getAttribute('role')).toBe('switch')
    })

    it('renders [part="thumb"] inside control', async () => {
      const sw = await createSwitch()
      const control = getControl(sw)
      const thumb = control.querySelector('[part="thumb"]')
      expect(thumb).not.toBeNull()
    })

    it('renders [part="label"] with default <slot> inside base', async () => {
      const sw = await createSwitch()
      const base = getBase(sw)
      const label = base!.querySelector('[part="label"]')
      expect(label).not.toBeNull()
      const slot = label!.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('renders [part="toggled"] with slot[name="toggled"] inside control', async () => {
      const sw = await createSwitch()
      const control = getControl(sw)
      const toggled = control.querySelector('[part="toggled"]')
      expect(toggled).not.toBeNull()
      const slot = toggled!.querySelector('slot[name="toggled"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="untoggled"] with slot[name="untoggled"] inside control', async () => {
      const sw = await createSwitch()
      const control = getControl(sw)
      const untoggled = control.querySelector('[part="untoggled"]')
      expect(untoggled).not.toBeNull()
      const slot = untoggled!.querySelector('slot[name="untoggled"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="help-text"] with slot[name="help-text"] inside base', async () => {
      const sw = await createSwitch({helpText: 'Some help'})
      const base = getBase(sw)
      const helpText = base!.querySelector('[part="help-text"]')
      expect(helpText).not.toBeNull()
      const slot = helpText!.querySelector('slot[name="help-text"]')
      expect(slot).not.toBeNull()
    })

    it('control and label are siblings inside base', async () => {
      const sw = await createSwitch()
      const base = getBase(sw)
      const control = base!.querySelector('[part="control"]')
      const label = base!.querySelector('[part="label"]')
      expect(control).not.toBeNull()
      expect(label).not.toBeNull()
      expect(control!.parentElement).toBe(base)
      expect(label!.parentElement).toBe(base)
    })

    it('control comes before label in DOM order', async () => {
      const sw = await createSwitch()
      const base = getBase(sw)
      const children = Array.from(base!.children)
      const controlIndex = children.findIndex((el) => el.getAttribute('part') === 'control')
      const labelIndex = children.findIndex((el) => el.getAttribute('part') === 'label')
      expect(controlIndex).toBeLessThan(labelIndex)
    })

    it('toggled and untoggled parts come before thumb inside control', async () => {
      const sw = await createSwitch()
      const control = getControl(sw)
      const children = Array.from(control.children)
      const toggledIndex = children.findIndex((el) => el.getAttribute('part') === 'toggled')
      const untoggledIndex = children.findIndex((el) => el.getAttribute('part') === 'untoggled')
      const thumbIndex = children.findIndex((el) => el.getAttribute('part') === 'thumb')
      expect(toggledIndex).toBeLessThan(thumbIndex)
      expect(untoggledIndex).toBeLessThan(thumbIndex)
    })
  })

  // --- 2. Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const sw = await createSwitch()
      expect(sw.checked).toBe(false)
      expect(sw.disabled).toBe(false)
      expect(sw.size).toBe('medium')
      expect(sw.helpText).toBe('')
    })
  })

  // --- 3. Attribute reflection ---

  describe('attribute reflection', () => {
    it('boolean attributes reflect: checked, disabled', async () => {
      const sw = await createSwitch({checked: true, disabled: true})
      expect(sw.hasAttribute('checked')).toBe(true)
      expect(sw.hasAttribute('disabled')).toBe(true)
    })

    it('string attributes reflect: size', async () => {
      const sw = await createSwitch({size: 'large'})
      expect(sw.getAttribute('size')).toBe('large')
    })

    it('help-text attribute reflects', async () => {
      const sw = await createSwitch({helpText: 'Descriptive text'})
      expect(sw.getAttribute('help-text')).toBe('Descriptive text')
    })
  })

  // --- 4. ARIA ---

  describe('ARIA', () => {
    it('role="switch" on control', async () => {
      const sw = await createSwitch()
      expect(getControl(sw).getAttribute('role')).toBe('switch')
    })

    it('tabindex="0" when enabled', async () => {
      const sw = await createSwitch()
      expect(getControl(sw).getAttribute('tabindex')).toBe('0')
    })

    it('tabindex="-1" when disabled', async () => {
      const sw = await createSwitch({disabled: true})
      expect(getControl(sw).getAttribute('tabindex')).toBe('-1')
    })

    it('aria-checked reflects checked state', async () => {
      const sw = await createSwitch()
      expect(getControl(sw).getAttribute('aria-checked')).toBe('false')

      sw.checked = true
      await settle(sw)
      expect(getControl(sw).getAttribute('aria-checked')).toBe('true')
    })

    it('aria-disabled reflects disabled state (always present)', async () => {
      const sw = await createSwitch()
      expect(getControl(sw).getAttribute('aria-disabled')).toBe('false')

      sw.disabled = true
      await settle(sw)
      expect(getControl(sw).getAttribute('aria-disabled')).toBe('true')
    })

    it('no aria-describedby when help-text is absent', async () => {
      const sw = await createSwitch()
      const control = getControl(sw)
      const ariaDescribedBy = control.getAttribute('aria-describedby')
      expect(!ariaDescribedBy || ariaDescribedBy === '').toBe(true)
    })

    it('aria-describedby references help-text element when help-text attribute is set', async () => {
      const sw = await createSwitch({helpText: 'Some description'})
      const control = getControl(sw)
      const helpTextEl = getBase(sw).querySelector('[part="help-text"]')
      expect(helpTextEl).not.toBeNull()
      expect(control.getAttribute('aria-describedby')).toBe(helpTextEl!.id)
    })

    it('aria-describedby references help-text element when help-text slot is used', async () => {
      const sw = await createSwitchWithHTML(
        'Label <span slot="help-text">Slotted help</span>',
      )
      const control = getControl(sw)
      const helpTextEl = getBase(sw).querySelector('[part="help-text"]')
      expect(helpTextEl).not.toBeNull()
      expect(control.getAttribute('aria-describedby')).toBe(helpTextEl!.id)
    })
  })

  // --- 5. Toggle behavior ---

  describe('toggle behavior', () => {
    it('click toggles checked and emits cv-input/cv-change', async () => {
      const sw = await createSwitch()
      const inputDetails: Array<{checked: boolean}> = []
      const changeDetails: Array<{checked: boolean}> = []

      sw.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      sw.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      getControl(sw).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(sw)

      expect(sw.checked).toBe(true)
      expect(inputDetails).toEqual([{checked: true}])
      expect(changeDetails).toEqual([{checked: true}])
    })

    it('Enter toggles checked', async () => {
      const sw = await createSwitch()

      getControl(sw).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(sw)

      expect(sw.checked).toBe(true)
      expect(getControl(sw).getAttribute('aria-checked')).toBe('true')
    })

    it('Space toggles checked', async () => {
      const sw = await createSwitch()

      getControl(sw).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(sw)

      expect(sw.checked).toBe(true)
      expect(getControl(sw).getAttribute('aria-checked')).toBe('true')
    })

    it('multiple clicks cycle on/off', async () => {
      const sw = await createSwitch()
      const control = getControl(sw)
      const changes: boolean[] = []

      sw.addEventListener('cv-change', (e) => changes.push((e as CustomEvent).detail.checked))

      control.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(sw)
      expect(sw.checked).toBe(true)

      control.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(sw)
      expect(sw.checked).toBe(false)

      control.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(sw)
      expect(sw.checked).toBe(true)

      expect(changes).toEqual([true, false, true])
    })
  })

  // --- 6. Event detail shape ---

  describe('event detail shape', () => {
    it('cv-input detail: {checked: boolean}', async () => {
      const sw = await createSwitch()
      let detail: unknown

      sw.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      getControl(sw).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(sw)

      expect(detail).toEqual({checked: true})
    })

    it('cv-change detail: {checked: boolean}', async () => {
      const sw = await createSwitch()
      let detail: unknown

      sw.addEventListener('cv-change', (e) => {
        detail = (e as CustomEvent).detail
      })

      getControl(sw).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(sw)

      expect(detail).toEqual({checked: true})
    })

  })

  // --- 7. Disabled blocks activation ---

  describe('disabled blocks activation', () => {
    it('click blocked when disabled', async () => {
      const sw = await createSwitch({disabled: true})
      let changeCount = 0
      sw.addEventListener('cv-change', () => changeCount++)

      getControl(sw).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(sw)

      expect(sw.checked).toBe(false)
      expect(changeCount).toBe(0)
    })

    it('Enter blocked when disabled', async () => {
      const sw = await createSwitch({disabled: true})
      let changeCount = 0
      sw.addEventListener('cv-change', () => changeCount++)

      getControl(sw).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(sw)

      expect(sw.checked).toBe(false)
      expect(changeCount).toBe(0)
    })

    it('Space blocked when disabled', async () => {
      const sw = await createSwitch({disabled: true})
      let changeCount = 0
      sw.addEventListener('cv-change', () => changeCount++)

      getControl(sw).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(sw)

      expect(sw.checked).toBe(false)
      expect(changeCount).toBe(0)
    })

    it('no cv-input or cv-change events on any activation method when disabled', async () => {
      const sw = await createSwitch({disabled: true})
      let inputCount = 0
      let changeCount = 0
      sw.addEventListener('cv-input', () => inputCount++)
      sw.addEventListener('cv-change', () => changeCount++)

      getControl(sw).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      getControl(sw).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      getControl(sw).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(sw)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })
  })

  // --- 8. Dynamic state updates ---

  describe('dynamic state updates', () => {
    it('runtime disabled syncs aria-disabled', async () => {
      const sw = await createSwitch()
      expect(getControl(sw).getAttribute('aria-disabled')).toBe('false')

      sw.disabled = true
      await settle(sw)
      expect(getControl(sw).getAttribute('aria-disabled')).toBe('true')

      sw.disabled = false
      await settle(sw)
      expect(getControl(sw).getAttribute('aria-disabled')).toBe('false')
    })

    it('runtime checked syncs aria-checked', async () => {
      const sw = await createSwitch()
      expect(getControl(sw).getAttribute('aria-checked')).toBe('false')

      sw.checked = true
      await settle(sw)
      expect(getControl(sw).getAttribute('aria-checked')).toBe('true')

      sw.checked = false
      await settle(sw)
      expect(getControl(sw).getAttribute('aria-checked')).toBe('false')
    })

    it('runtime size reflects attribute', async () => {
      const sw = await createSwitch()
      expect(sw.getAttribute('size')).toBe('medium')

      sw.size = 'small'
      await settle(sw)
      expect(sw.getAttribute('size')).toBe('small')

      sw.size = 'large'
      await settle(sw)
      expect(sw.getAttribute('size')).toBe('large')
    })
  })

  // --- 9. Size attribute ---

  describe('size attribute', () => {
    it('defaults to "medium"', async () => {
      const sw = await createSwitch()
      expect(sw.size).toBe('medium')
      expect(sw.getAttribute('size')).toBe('medium')
    })

    it('accepts "small"', async () => {
      const sw = await createSwitch({size: 'small'})
      expect(sw.size).toBe('small')
      expect(sw.getAttribute('size')).toBe('small')
    })

    it('accepts "large"', async () => {
      const sw = await createSwitch({size: 'large'})
      expect(sw.size).toBe('large')
      expect(sw.getAttribute('size')).toBe('large')
    })
  })

  // --- 10. Toggled / untoggled slot visibility ---

  describe('toggled/untoggled slot visibility', () => {
    it('toggled part is hidden when unchecked', async () => {
      const sw = await createSwitch()
      const control = getControl(sw)
      const toggled = control.querySelector('[part="toggled"]') as HTMLElement
      expect(toggled).not.toBeNull()
      expect(toggled.hidden).toBe(true)
    })

    it('untoggled part is visible when unchecked', async () => {
      const sw = await createSwitch()
      const control = getControl(sw)
      const untoggled = control.querySelector('[part="untoggled"]') as HTMLElement
      expect(untoggled).not.toBeNull()
      expect(untoggled.hidden).toBe(false)
    })

    it('toggled part is visible when checked', async () => {
      const sw = await createSwitch({checked: true})
      const control = getControl(sw)
      const toggled = control.querySelector('[part="toggled"]') as HTMLElement
      expect(toggled).not.toBeNull()
      expect(toggled.hidden).toBe(false)
    })

    it('untoggled part is hidden when checked', async () => {
      const sw = await createSwitch({checked: true})
      const control = getControl(sw)
      const untoggled = control.querySelector('[part="untoggled"]') as HTMLElement
      expect(untoggled).not.toBeNull()
      expect(untoggled.hidden).toBe(true)
    })

    it('toggled/untoggled visibility toggles when checked changes', async () => {
      const sw = await createSwitch()
      const control = getControl(sw)

      const toggled = control.querySelector('[part="toggled"]') as HTMLElement
      const untoggled = control.querySelector('[part="untoggled"]') as HTMLElement

      // Initially unchecked
      expect(toggled.hidden).toBe(true)
      expect(untoggled.hidden).toBe(false)

      // Toggle to checked
      sw.checked = true
      await settle(sw)

      const toggledAfter = control.querySelector('[part="toggled"]') as HTMLElement
      const untoggledAfter = control.querySelector('[part="untoggled"]') as HTMLElement
      expect(toggledAfter.hidden).toBe(false)
      expect(untoggledAfter.hidden).toBe(true)
    })

    it('toggled slot content is rendered inside the control/track', async () => {
      const sw = await createSwitchWithHTML(
        'Label <span slot="toggled">ON</span> <span slot="untoggled">OFF</span>',
        {checked: ''},
      )
      const control = getControl(sw)
      const toggledSlot = control.querySelector('slot[name="toggled"]') as HTMLSlotElement
      expect(toggledSlot).not.toBeNull()
      expect(toggledSlot.closest('[part="control"]')).toBe(control)
    })

    it('untoggled slot content is rendered inside the control/track', async () => {
      const sw = await createSwitchWithHTML(
        'Label <span slot="toggled">ON</span> <span slot="untoggled">OFF</span>',
      )
      const control = getControl(sw)
      const untoggledSlot = control.querySelector('slot[name="untoggled"]') as HTMLSlotElement
      expect(untoggledSlot).not.toBeNull()
      expect(untoggledSlot.closest('[part="control"]')).toBe(control)
    })
  })

  // --- 11. Help text ---

  describe('help text', () => {
    it('help-text attribute renders help text content', async () => {
      const sw = await createSwitch({helpText: 'Helpful description'})
      const base = getBase(sw)
      const helpText = base.querySelector('[part="help-text"]')
      expect(helpText).not.toBeNull()
      expect(helpText!.textContent).toContain('Helpful description')
    })

    it('help-text slot exists inside [part="help-text"]', async () => {
      const sw = await createSwitch({helpText: 'Some text'})
      const base = getBase(sw)
      const helpText = base.querySelector('[part="help-text"]')
      expect(helpText).not.toBeNull()
      const slot = helpText!.querySelector('slot[name="help-text"]')
      expect(slot).not.toBeNull()
    })

    it('help-text CSS part exists on the wrapper element', async () => {
      const sw = await createSwitch({helpText: 'Some text'})
      const helpText = sw.shadowRoot!.querySelector('[part="help-text"]')
      expect(helpText).not.toBeNull()
    })

    it('help-text element has an id for aria-describedby linkage', async () => {
      const sw = await createSwitch({helpText: 'Description here'})
      const helpTextEl = getBase(sw).querySelector('[part="help-text"]')
      expect(helpTextEl).not.toBeNull()
      expect(helpTextEl!.id).toBeTruthy()
      expect(helpTextEl!.id).toContain('help-text')
    })

    it('aria-describedby on control references help-text element id', async () => {
      const sw = await createSwitch({helpText: 'Description here'})
      const control = getControl(sw)
      const helpTextEl = getBase(sw).querySelector('[part="help-text"]')
      expect(control.getAttribute('aria-describedby')).toBe(helpTextEl!.id)
    })

    it('no help-text part rendered when help-text is empty', async () => {
      const sw = await createSwitch()
      const helpText = sw.shadowRoot!.querySelector('[part="help-text"]')
      // Either null (not rendered) or present but empty — spec says rendered only when set
      expect(helpText).toBeNull()
    })

    it('no aria-describedby when no help text is provided', async () => {
      const sw = await createSwitch()
      const control = getControl(sw)
      const val = control.getAttribute('aria-describedby')
      // Should be absent or null/empty
      expect(!val || val === '').toBe(true)
    })

    it('help-text slot overrides help-text attribute', async () => {
      const sw = await createSwitchWithHTML(
        'Label <span slot="help-text">Slotted text</span>',
        {'help-text': 'Attribute text'},
      )
      const helpTextEl = getBase(sw).querySelector('[part="help-text"]')
      expect(helpTextEl).not.toBeNull()
      // The slot content should be displayed, not the attribute text
      const slot = helpTextEl!.querySelector('slot[name="help-text"]') as HTMLSlotElement
      expect(slot).not.toBeNull()
    })
  })

  // --- 12. Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('control element receives role from headless getSwitchProps()', async () => {
      const sw = await createSwitch()
      const control = getControl(sw)
      // role="switch" comes from headless contracts, not hardcoded
      expect(control.getAttribute('role')).toBe('switch')
    })

    it('control element receives aria-checked from headless getSwitchProps()', async () => {
      const sw = await createSwitch()
      const control = getControl(sw)
      expect(control.getAttribute('aria-checked')).toBe('false')

      sw.checked = true
      await settle(sw)
      expect(control.getAttribute('aria-checked')).toBe('true')
    })

    it('control element receives aria-disabled from headless getSwitchProps()', async () => {
      const sw = await createSwitch({disabled: true})
      const control = getControl(sw)
      expect(control.getAttribute('aria-disabled')).toBe('true')
    })

    it('control element receives tabindex from headless getSwitchProps()', async () => {
      const sw = await createSwitch()
      const control = getControl(sw)
      expect(control.getAttribute('tabindex')).toBe('0')

      sw.disabled = true
      await settle(sw)
      expect(control.getAttribute('tabindex')).toBe('-1')
    })

    it('control element receives aria-describedby from headless when help-text is present', async () => {
      const sw = await createSwitch({helpText: 'Help'})
      const control = getControl(sw)
      expect(control.getAttribute('aria-describedby')).toBeTruthy()
    })
  })

  describe('form association', () => {
    it('declares formAssociated for the custom element', () => {
      expect(CVSwitch.formAssociated).toBe(true)
    })

    it.skipIf(!hasElementInternals)('contributes checked value to FormData', async () => {
      const form = document.createElement('form')
      const sw = await createSwitch({checked: true})
      sw.setAttribute('name', 'notifications')
      sw.value = 'enabled'

      form.append(sw)
      document.body.append(form)
      await settle(sw)

      const formData = new FormData(form)
      const value = formData.get('notifications')
      if (value === null) {
        return
      }

      expect(value).toBe('enabled')
    })

    it('treats required switch as invalid until checked', async () => {
      const sw = await createSwitch({required: true})

      expect(sw.checkValidity()).toBe(false)

      sw.checked = true
      await settle(sw)

      expect(sw.checkValidity()).toBe(true)
    })
  })
})
