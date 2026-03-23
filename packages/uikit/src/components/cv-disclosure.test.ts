import {afterEach, describe, expect, it} from 'vitest'

import {CVDisclosure} from './cv-disclosure'

CVDisclosure.define()

const settle = async (element: CVDisclosure) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createDisclosure = async (attrs?: Partial<CVDisclosure>) => {
  const el = document.createElement('cv-disclosure') as CVDisclosure
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVDisclosure) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

const getTrigger = (el: CVDisclosure) =>
  el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

const getPanel = (el: CVDisclosure) =>
  el.shadowRoot!.querySelector('[part="panel"]') as HTMLElement

const getTriggerIcon = (el: CVDisclosure) =>
  el.shadowRoot!.querySelector('[part="trigger-icon"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-disclosure', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"]', async () => {
      const el = await createDisclosure()
      expect(getBase(el)).not.toBeNull()
    })

    it('renders [part="trigger"] with role="button"', async () => {
      const el = await createDisclosure()
      const trigger = getTrigger(el)
      expect(trigger).not.toBeNull()
      expect(trigger.getAttribute('role')).toBe('button')
    })

    it('renders [part="trigger-icon"] with aria-hidden="true"', async () => {
      const el = await createDisclosure()
      const icon = getTriggerIcon(el)
      expect(icon).not.toBeNull()
      expect(icon.getAttribute('aria-hidden')).toBe('true')
    })

    it('renders [part="panel"]', async () => {
      const el = await createDisclosure()
      expect(getPanel(el)).not.toBeNull()
    })

    it('renders slot[name="trigger"] inside trigger', async () => {
      const el = await createDisclosure()
      const trigger = getTrigger(el)
      const slot = trigger.querySelector('slot[name="trigger"]')
      expect(slot).not.toBeNull()
    })

    it('renders default slot inside panel', async () => {
      const el = await createDisclosure()
      const panel = getPanel(el)
      const slot = panel.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const el = await createDisclosure()
      expect(el.open).toBe(false)
      expect(el.disabled).toBe(false)
    })

    it('name defaults to empty string or undefined', async () => {
      const el = await createDisclosure()
      // name attribute should not be set by default
      expect(el.name === '' || el.name === undefined || el.name === null).toBe(true)
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('open boolean attribute reflects to DOM', async () => {
      const el = await createDisclosure({open: true})
      expect(el.hasAttribute('open')).toBe(true)

      el.open = false
      await settle(el)
      expect(el.hasAttribute('open')).toBe(false)
    })

    it('disabled boolean attribute reflects to DOM', async () => {
      const el = await createDisclosure({disabled: true})
      expect(el.hasAttribute('disabled')).toBe(true)

      el.disabled = false
      await settle(el)
      expect(el.hasAttribute('disabled')).toBe(false)
    })

    it('name attribute reflects to DOM when set', async () => {
      const el = await createDisclosure({name: 'group-a'} as Partial<CVDisclosure>)
      expect(el.getAttribute('name')).toBe('group-a')
    })
  })

  // --- Events ---

  describe('events', () => {
    it('fires input event with {open: boolean} detail on toggle open', async () => {
      const el = await createDisclosure()
      let detail: unknown

      el.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      getTrigger(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({open: true})
    })

    it('fires change event with {open: boolean} detail on toggle open', async () => {
      const el = await createDisclosure()
      let detail: unknown

      el.addEventListener('cv-change', (e) => {
        detail = (e as CustomEvent).detail
      })

      getTrigger(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({open: true})
    })

    it('fires input and change with {open: false} on toggle close', async () => {
      const el = await createDisclosure({open: true})
      const inputDetails: unknown[] = []
      const changeDetails: unknown[] = []

      el.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      el.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      getTrigger(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(inputDetails).toEqual([{open: false}])
      expect(changeDetails).toEqual([{open: false}])
    })

    it('does not fire events on programmatic show()/hide()', async () => {
      const el = await createDisclosure()
      let inputCount = 0
      let changeCount = 0

      el.addEventListener('cv-input', () => inputCount++)
      el.addEventListener('cv-change', () => changeCount++)

      el.show()
      await settle(el)
      el.hide()
      await settle(el)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })

    it('does not fire events on programmatic open attribute change', async () => {
      const el = await createDisclosure()
      let inputCount = 0
      let changeCount = 0

      el.addEventListener('cv-input', () => inputCount++)
      el.addEventListener('cv-change', () => changeCount++)

      el.open = true
      await settle(el)
      el.open = false
      await settle(el)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('trigger has role="button"', async () => {
      const el = await createDisclosure()
      expect(getTrigger(el).getAttribute('role')).toBe('button')
    })

    it('trigger has aria-expanded="false" when closed', async () => {
      const el = await createDisclosure()
      expect(getTrigger(el).getAttribute('aria-expanded')).toBe('false')
    })

    it('trigger has aria-expanded="true" when open', async () => {
      const el = await createDisclosure({open: true})
      expect(getTrigger(el).getAttribute('aria-expanded')).toBe('true')
    })

    it('trigger has aria-controls pointing to panel id', async () => {
      const el = await createDisclosure()
      const trigger = getTrigger(el)
      const panel = getPanel(el)
      expect(trigger.getAttribute('aria-controls')).toBe(panel.id)
    })

    it('panel has aria-labelledby pointing to trigger id', async () => {
      const el = await createDisclosure()
      const trigger = getTrigger(el)
      const panel = getPanel(el)
      expect(panel.getAttribute('aria-labelledby')).toBe(trigger.id)
    })

    it('panel has hidden attribute when closed', async () => {
      const el = await createDisclosure()
      expect(getPanel(el).hasAttribute('hidden')).toBe(true)
    })

    it('panel does not have hidden attribute when open', async () => {
      const el = await createDisclosure({open: true})
      expect(getPanel(el).hasAttribute('hidden')).toBe(false)
    })

    it('trigger has tabindex="0" when enabled', async () => {
      const el = await createDisclosure()
      expect(getTrigger(el).getAttribute('tabindex')).toBe('0')
    })

    it('trigger has tabindex="-1" when disabled', async () => {
      const el = await createDisclosure({disabled: true})
      expect(getTrigger(el).getAttribute('tabindex')).toBe('-1')
    })

    it('trigger has aria-disabled="true" when disabled', async () => {
      const el = await createDisclosure({disabled: true})
      expect(getTrigger(el).getAttribute('aria-disabled')).toBe('true')
    })

    it('trigger does not have aria-disabled when enabled', async () => {
      const el = await createDisclosure()
      expect(getTrigger(el).hasAttribute('aria-disabled')).toBe(false)
    })
  })

  // --- Click interaction ---

  describe('click interaction', () => {
    it('click toggles from closed to open', async () => {
      const el = await createDisclosure()
      getTrigger(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)
    })

    it('click toggles from open to closed', async () => {
      const el = await createDisclosure({open: true})
      getTrigger(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('click emits input and change events', async () => {
      const el = await createDisclosure()
      const inputValues: boolean[] = []
      const changeValues: boolean[] = []

      el.addEventListener('cv-input', (e) => inputValues.push((e as CustomEvent<{open: boolean}>).detail.open))
      el.addEventListener('cv-change', (e) => changeValues.push((e as CustomEvent<{open: boolean}>).detail.open))

      getTrigger(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(inputValues).toEqual([true])
      expect(changeValues).toEqual([true])
    })

    it('click does not toggle when disabled', async () => {
      const el = await createDisclosure({disabled: true})
      let eventCount = 0
      el.addEventListener('cv-input', () => eventCount++)
      el.addEventListener('cv-change', () => eventCount++)

      getTrigger(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.open).toBe(false)
      expect(eventCount).toBe(0)
    })
  })

  // --- Keyboard interaction ---

  describe('keyboard interaction', () => {
    it('Enter toggles from closed to open', async () => {
      const el = await createDisclosure()
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(true)
    })

    it('Enter toggles from open to closed', async () => {
      const el = await createDisclosure({open: true})
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('Space toggles from closed to open', async () => {
      const el = await createDisclosure()
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(true)
    })

    it('Space toggles from open to closed', async () => {
      const el = await createDisclosure({open: true})
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('Enter emits input and change events', async () => {
      const el = await createDisclosure()
      const inputDetails: unknown[] = []
      const changeDetails: unknown[] = []

      el.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      el.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect(inputDetails).toEqual([{open: true}])
      expect(changeDetails).toEqual([{open: true}])
    })

    it('Enter does not toggle when disabled', async () => {
      const el = await createDisclosure({disabled: true})
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('Space does not toggle when disabled', async () => {
      const el = await createDisclosure({disabled: true})
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })
  })

  // --- Arrow key interaction ---

  describe('arrow key interaction', () => {
    it('ArrowDown opens a closed disclosure', async () => {
      const el = await createDisclosure()
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(true)
    })

    it('ArrowRight opens a closed disclosure', async () => {
      const el = await createDisclosure()
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(true)
    })

    it('ArrowDown is a no-op on an already open disclosure', async () => {
      const el = await createDisclosure({open: true})
      let eventCount = 0
      el.addEventListener('cv-input', () => eventCount++)

      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
      expect(eventCount).toBe(0)
    })

    it('ArrowRight is a no-op on an already open disclosure', async () => {
      const el = await createDisclosure({open: true})
      let eventCount = 0
      el.addEventListener('cv-input', () => eventCount++)

      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
      expect(eventCount).toBe(0)
    })

    it('ArrowUp closes an open disclosure', async () => {
      const el = await createDisclosure({open: true})
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('ArrowLeft closes an open disclosure', async () => {
      const el = await createDisclosure({open: true})
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('ArrowUp is a no-op on an already closed disclosure', async () => {
      const el = await createDisclosure()
      let eventCount = 0
      el.addEventListener('cv-input', () => eventCount++)

      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
      expect(eventCount).toBe(0)
    })

    it('ArrowLeft is a no-op on an already closed disclosure', async () => {
      const el = await createDisclosure()
      let eventCount = 0
      el.addEventListener('cv-input', () => eventCount++)

      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
      expect(eventCount).toBe(0)
    })

    it('arrow keys do not toggle when disabled', async () => {
      const el = await createDisclosure({disabled: true})

      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)

      // Also test close arrows when disabled+open (set open programmatically)
      el.open = true
      await settle(el)
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(true)
    })
  })

  // --- Imperative methods ---

  describe('imperative methods', () => {
    it('show() opens the disclosure', async () => {
      const el = await createDisclosure()
      expect(el.open).toBe(false)

      el.show()
      await settle(el)
      expect(el.open).toBe(true)
    })

    it('hide() closes the disclosure', async () => {
      const el = await createDisclosure({open: true})
      expect(el.open).toBe(true)

      el.hide()
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('show() on an already open disclosure is a no-op', async () => {
      const el = await createDisclosure({open: true})
      let eventCount = 0
      el.addEventListener('cv-input', () => eventCount++)

      el.show()
      await settle(el)
      expect(el.open).toBe(true)
      expect(eventCount).toBe(0)
    })

    it('hide() on an already closed disclosure is a no-op', async () => {
      const el = await createDisclosure()
      let eventCount = 0
      el.addEventListener('cv-input', () => eventCount++)

      el.hide()
      await settle(el)
      expect(el.open).toBe(false)
      expect(eventCount).toBe(0)
    })

    it('show() and hide() do not fire input/change events', async () => {
      const el = await createDisclosure()
      let inputCount = 0
      let changeCount = 0
      el.addEventListener('cv-input', () => inputCount++)
      el.addEventListener('cv-change', () => changeCount++)

      el.show()
      await settle(el)
      el.hide()
      await settle(el)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })
  })

  // --- Name-based grouping ---

  describe('name-based grouping', () => {
    it('opening one named disclosure closes others with the same name', async () => {
      const el1 = await createDisclosure({name: 'faq', open: true} as Partial<CVDisclosure>)
      const el2 = await createDisclosure({name: 'faq'} as Partial<CVDisclosure>)
      const el3 = await createDisclosure({name: 'faq'} as Partial<CVDisclosure>)

      // Open el2 — el1 should close
      getTrigger(el2).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el2)
      await settle(el1)

      expect(el2.open).toBe(true)
      expect(el1.open).toBe(false)
      expect(el3.open).toBe(false)
    })

    it('disclosures with different names are independent', async () => {
      const el1 = await createDisclosure({name: 'group-a', open: true} as Partial<CVDisclosure>)
      const el2 = await createDisclosure({name: 'group-b'} as Partial<CVDisclosure>)

      getTrigger(el2).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el2)
      await settle(el1)

      expect(el1.open).toBe(true)
      expect(el2.open).toBe(true)
    })

    it('ungrouped disclosures are not affected by grouped ones', async () => {
      const grouped = await createDisclosure({name: 'faq', open: true} as Partial<CVDisclosure>)
      const ungrouped = await createDisclosure({open: true})

      const grouped2 = await createDisclosure({name: 'faq'} as Partial<CVDisclosure>)
      getTrigger(grouped2).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(grouped2)
      await settle(grouped)
      await settle(ungrouped)

      expect(grouped2.open).toBe(true)
      expect(grouped.open).toBe(false)
      expect(ungrouped.open).toBe(true)
    })

    it('closing a named disclosure does not open any other in the group', async () => {
      const el1 = await createDisclosure({name: 'faq', open: true} as Partial<CVDisclosure>)
      const el2 = await createDisclosure({name: 'faq'} as Partial<CVDisclosure>)

      // Close el1
      getTrigger(el1).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el1)
      await settle(el2)

      expect(el1.open).toBe(false)
      expect(el2.open).toBe(false)
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('trigger ARIA attributes originate from getTriggerProps()', async () => {
      const el = await createDisclosure()
      const trigger = getTrigger(el)

      // The trigger must have id, role, tabindex, aria-expanded, aria-controls
      // These are set by spreading headless contracts
      expect(trigger.id).toBeTruthy()
      expect(trigger.getAttribute('role')).toBe('button')
      expect(trigger.getAttribute('tabindex')).toBeTruthy()
      expect(trigger.getAttribute('aria-expanded')).toBeTruthy()
      expect(trigger.getAttribute('aria-controls')).toBeTruthy()
    })

    it('panel ARIA attributes originate from getPanelProps()', async () => {
      const el = await createDisclosure()
      const panel = getPanel(el)

      // The panel must have id, aria-labelledby, hidden
      expect(panel.id).toBeTruthy()
      expect(panel.getAttribute('aria-labelledby')).toBeTruthy()
      expect(panel.hasAttribute('hidden')).toBe(true)
    })

    it('trigger aria-controls value matches panel id', async () => {
      const el = await createDisclosure()
      const trigger = getTrigger(el)
      const panel = getPanel(el)
      expect(trigger.getAttribute('aria-controls')).toBe(panel.id)
    })

    it('panel aria-labelledby value matches trigger id', async () => {
      const el = await createDisclosure()
      const trigger = getTrigger(el)
      const panel = getPanel(el)
      expect(panel.getAttribute('aria-labelledby')).toBe(trigger.id)
    })

    it('aria-expanded updates when open state changes', async () => {
      const el = await createDisclosure()
      const trigger = getTrigger(el)

      expect(trigger.getAttribute('aria-expanded')).toBe('false')

      el.open = true
      await settle(el)
      expect(trigger.getAttribute('aria-expanded')).toBe('true')

      el.open = false
      await settle(el)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })

    it('panel hidden attribute updates when open state changes', async () => {
      const el = await createDisclosure()
      const panel = getPanel(el)

      expect(panel.hasAttribute('hidden')).toBe(true)

      el.open = true
      await settle(el)
      expect(panel.hasAttribute('hidden')).toBe(false)

      el.open = false
      await settle(el)
      expect(panel.hasAttribute('hidden')).toBe(true)
    })
  })

  // --- Disabled state blocks all interaction ---

  describe('disabled state blocks all interaction', () => {
    it('click does not toggle when disabled', async () => {
      const el = await createDisclosure({disabled: true})
      getTrigger(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('Enter does not toggle when disabled', async () => {
      const el = await createDisclosure({disabled: true})
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('Space does not toggle when disabled', async () => {
      const el = await createDisclosure({disabled: true})
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('no input/change events fire when disabled', async () => {
      const el = await createDisclosure({disabled: true})
      let inputCount = 0
      let changeCount = 0
      el.addEventListener('cv-input', () => inputCount++)
      el.addEventListener('cv-change', () => changeCount++)

      getTrigger(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(el)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })

    it('trigger has aria-disabled="true" and tabindex="-1" when disabled', async () => {
      const el = await createDisclosure({disabled: true})
      const trigger = getTrigger(el)
      expect(trigger.getAttribute('aria-disabled')).toBe('true')
      expect(trigger.getAttribute('tabindex')).toBe('-1')
    })

    it('dynamic disable/enable syncs ARIA attributes', async () => {
      const el = await createDisclosure()
      const trigger = getTrigger(el)

      expect(trigger.hasAttribute('aria-disabled')).toBe(false)
      expect(trigger.getAttribute('tabindex')).toBe('0')

      el.disabled = true
      await settle(el)
      expect(trigger.getAttribute('aria-disabled')).toBe('true')
      expect(trigger.getAttribute('tabindex')).toBe('-1')

      el.disabled = false
      await settle(el)
      expect(trigger.hasAttribute('aria-disabled')).toBe(false)
      expect(trigger.getAttribute('tabindex')).toBe('0')
    })
  })
})
