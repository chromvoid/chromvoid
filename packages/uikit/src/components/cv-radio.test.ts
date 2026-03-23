import {afterEach, describe, expect, it} from 'vitest'

import {CVRadio} from './cv-radio'

CVRadio.define()

const settle = async (element: CVRadio) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createRadio = async (attrs?: Partial<CVRadio>) => {
  const el = document.createElement('cv-radio') as CVRadio
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVRadio) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-radio', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as root wrapper', async () => {
      const radio = await createRadio()
      const base = getBase(radio)
      expect(base).not.toBeNull()
      expect(base.tagName.toLowerCase()).toBe('div')
    })

    it('renders [part="indicator"] inside base', async () => {
      const radio = await createRadio()
      const indicator = radio.shadowRoot!.querySelector('[part="indicator"]')
      expect(indicator).not.toBeNull()
      expect(indicator!.tagName.toLowerCase()).toBe('span')
    })

    it('renders [part="dot"] inside indicator', async () => {
      const radio = await createRadio()
      const indicator = radio.shadowRoot!.querySelector('[part="indicator"]')
      const dot = indicator!.querySelector('[part="dot"]')
      expect(dot).not.toBeNull()
      expect(dot!.tagName.toLowerCase()).toBe('span')
    })

    it('renders [part="label"] containing default slot', async () => {
      const radio = await createRadio()
      const label = radio.shadowRoot!.querySelector('[part="label"]')
      expect(label).not.toBeNull()
      expect(label!.tagName.toLowerCase()).toBe('span')
      const slot = label!.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('renders [part="description"] containing slot[name="description"]', async () => {
      const radio = await createRadio()
      const description = radio.shadowRoot!.querySelector('[part="description"]')
      expect(description).not.toBeNull()
      expect(description!.tagName.toLowerCase()).toBe('span')
      const slot = description!.querySelector('slot[name="description"]')
      expect(slot).not.toBeNull()
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const radio = await createRadio()
      expect(radio.value).toBe('')
      expect(radio.disabled).toBe(false)
      expect(radio.checked).toBe(false)
      expect(radio.active).toBe(false)
      expect(radio.size).toBe('medium')
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('boolean attributes reflect: disabled, checked, active', async () => {
      const radio = await createRadio({
        disabled: true,
        checked: true,
        active: true,
      })
      expect(radio.hasAttribute('disabled')).toBe(true)
      expect(radio.hasAttribute('checked')).toBe(true)
      expect(radio.hasAttribute('active')).toBe(true)
    })

    it('string attributes reflect: value, size', async () => {
      const radio = await createRadio({value: 'opt-1', size: 'large'})
      expect(radio.getAttribute('value')).toBe('opt-1')
      expect(radio.getAttribute('size')).toBe('large')
    })

    it('boolean attributes absent when false', async () => {
      const radio = await createRadio()
      expect(radio.hasAttribute('disabled')).toBe(false)
      expect(radio.hasAttribute('checked')).toBe(false)
      expect(radio.hasAttribute('active')).toBe(false)
    })
  })

  // --- Sizes ---

  describe('sizes', () => {
    it('defaults to size="medium"', async () => {
      const radio = await createRadio()
      expect(radio.size).toBe('medium')
      expect(radio.getAttribute('size')).toBe('medium')
    })

    it('reflects size="small"', async () => {
      const radio = await createRadio({size: 'small'})
      expect(radio.getAttribute('size')).toBe('small')
    })

    it('reflects size="large"', async () => {
      const radio = await createRadio({size: 'large'})
      expect(radio.getAttribute('size')).toBe('large')
    })

    it('indicator scales per size via CSS custom properties', async () => {
      const smallRadio = await createRadio({size: 'small'})
      const mediumRadio = await createRadio({size: 'medium'})
      const largeRadio = await createRadio({size: 'large'})

      // Verify size attribute is set correctly on host for CSS targeting
      expect(smallRadio.getAttribute('size')).toBe('small')
      expect(mediumRadio.getAttribute('size')).toBe('medium')
      expect(largeRadio.getAttribute('size')).toBe('large')
    })
  })

  // --- Slots ---

  describe('slots', () => {
    it('has a default slot for label text', async () => {
      const radio = await createRadio()
      const defaultSlot = radio.shadowRoot!.querySelector('slot:not([name])')
      expect(defaultSlot).not.toBeNull()
    })

    it('has a named "description" slot for secondary text', async () => {
      const radio = await createRadio()
      const descSlot = radio.shadowRoot!.querySelector('slot[name="description"]')
      expect(descSlot).not.toBeNull()
    })
  })

  // --- Visual states ---

  describe('visual states', () => {
    it('checked attribute present on host when checked=true', async () => {
      const radio = await createRadio({checked: true})
      expect(radio.hasAttribute('checked')).toBe(true)
    })

    it('disabled attribute present on host when disabled=true', async () => {
      const radio = await createRadio({disabled: true})
      expect(radio.hasAttribute('disabled')).toBe(true)
    })

    it('active attribute present on host when active=true', async () => {
      const radio = await createRadio({active: true})
      expect(radio.hasAttribute('active')).toBe(true)
    })

    it('disabled state: host has reduced opacity styling target', async () => {
      const radio = await createRadio({disabled: true})
      // The :host([disabled]) selector targets this — verify attribute is present
      expect(radio.hasAttribute('disabled')).toBe(true)
    })
  })

  // --- Dynamic state updates ---

  describe('dynamic state updates', () => {
    it('toggling checked updates attribute', async () => {
      const radio = await createRadio()
      expect(radio.hasAttribute('checked')).toBe(false)

      radio.checked = true
      await settle(radio)
      expect(radio.hasAttribute('checked')).toBe(true)

      radio.checked = false
      await settle(radio)
      expect(radio.hasAttribute('checked')).toBe(false)
    })

    it('toggling disabled updates attribute', async () => {
      const radio = await createRadio()
      expect(radio.hasAttribute('disabled')).toBe(false)

      radio.disabled = true
      await settle(radio)
      expect(radio.hasAttribute('disabled')).toBe(true)

      radio.disabled = false
      await settle(radio)
      expect(radio.hasAttribute('disabled')).toBe(false)
    })

    it('toggling active updates attribute', async () => {
      const radio = await createRadio()
      expect(radio.hasAttribute('active')).toBe(false)

      radio.active = true
      await settle(radio)
      expect(radio.hasAttribute('active')).toBe(true)

      radio.active = false
      await settle(radio)
      expect(radio.hasAttribute('active')).toBe(false)
    })

    it('changing size at runtime updates attribute', async () => {
      const radio = await createRadio()
      expect(radio.getAttribute('size')).toBe('medium')

      radio.size = 'small'
      await settle(radio)
      expect(radio.getAttribute('size')).toBe('small')

      radio.size = 'large'
      await settle(radio)
      expect(radio.getAttribute('size')).toBe('large')
    })
  })
})
