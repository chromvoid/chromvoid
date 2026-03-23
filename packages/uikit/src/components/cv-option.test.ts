import {afterEach, describe, expect, it} from 'vitest'

import {CVOption} from './cv-option'

CVOption.define()

const settle = async (element: CVOption) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createOption = async (attrs?: Partial<CVOption>) => {
  const el = document.createElement('cv-option') as CVOption
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVOption) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-option', () => {
  // --- 1. Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"]', async () => {
      const el = await createOption()
      const base = getBase(el)
      expect(base).not.toBeNull()
    })

    it('renders [part="prefix"]', async () => {
      const el = await createOption()
      const prefix = el.shadowRoot!.querySelector('[part="prefix"]')
      expect(prefix).not.toBeNull()
    })

    it('renders [part="suffix"]', async () => {
      const el = await createOption()
      const suffix = el.shadowRoot!.querySelector('[part="suffix"]')
      expect(suffix).not.toBeNull()
    })

    it('renders default slot inside [part="base"]', async () => {
      const el = await createOption()
      const slot = el.shadowRoot!.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('renders slot[name="prefix"] inside [part="prefix"]', async () => {
      const el = await createOption()
      const prefix = el.shadowRoot!.querySelector('[part="prefix"]')
      expect(prefix).not.toBeNull()
      const slot = prefix!.querySelector('slot[name="prefix"]')
      expect(slot).not.toBeNull()
    })

    it('renders slot[name="suffix"] inside [part="suffix"]', async () => {
      const el = await createOption()
      const suffix = el.shadowRoot!.querySelector('[part="suffix"]')
      expect(suffix).not.toBeNull()
      const slot = suffix!.querySelector('slot[name="suffix"]')
      expect(slot).not.toBeNull()
    })

    it('does NOT render [part="checked-icon"] in shadow DOM', async () => {
      const el = await createOption()
      const checkedIcon = el.shadowRoot!.querySelector('[part="checked-icon"]')
      expect(checkedIcon).toBeNull()
    })
  })

  // --- 2. Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const el = await createOption()
      expect(el.value).toBe('')
      expect(el.disabled).toBe(false)
      expect(el.selected).toBe(false)
      expect(el.active).toBe(false)
    })
  })

  // --- 3. Attribute reflection ---

  describe('attribute reflection', () => {
    it('value reflects to attribute', async () => {
      const el = await createOption({value: 'apple'})
      expect(el.getAttribute('value')).toBe('apple')
    })

    it('disabled reflects as boolean attribute', async () => {
      const el = await createOption({disabled: true})
      expect(el.hasAttribute('disabled')).toBe(true)
    })

    it('disabled false does not set attribute', async () => {
      const el = await createOption({disabled: false})
      expect(el.hasAttribute('disabled')).toBe(false)
    })

    it('selected reflects as boolean attribute', async () => {
      const el = await createOption({selected: true})
      expect(el.hasAttribute('selected')).toBe(true)
    })

    it('selected false does not set attribute', async () => {
      const el = await createOption({selected: false})
      expect(el.hasAttribute('selected')).toBe(false)
    })

    it('active reflects as boolean attribute', async () => {
      const el = await createOption({active: true})
      expect(el.hasAttribute('active')).toBe(true)
    })

    it('active false does not set attribute', async () => {
      const el = await createOption({active: false})
      expect(el.hasAttribute('active')).toBe(false)
    })
  })

  // --- 4. Visual states ---

  describe('visual states', () => {
    it(':host([selected]) is applied when selected attribute is present', async () => {
      const el = await createOption({selected: true})
      expect(el.hasAttribute('selected')).toBe(true)
    })

    it(':host([active]) is applied when active attribute is present', async () => {
      const el = await createOption({active: true})
      expect(el.hasAttribute('active')).toBe(true)
    })

    it(':host([disabled]) is applied when disabled attribute is present', async () => {
      const el = await createOption({disabled: true})
      expect(el.hasAttribute('disabled')).toBe(true)
    })

    it(':host([hidden]) hides the element via setAttribute', async () => {
      const el = await createOption()
      el.setAttribute('hidden', '')
      await settle(el)
      expect(el.hasAttribute('hidden')).toBe(true)
    })

    it('removing selected attribute clears :host([selected])', async () => {
      const el = await createOption({selected: true})
      expect(el.hasAttribute('selected')).toBe(true)
      el.selected = false
      await settle(el)
      expect(el.hasAttribute('selected')).toBe(false)
    })

    it('removing active attribute clears :host([active])', async () => {
      const el = await createOption({active: true})
      expect(el.hasAttribute('active')).toBe(true)
      el.active = false
      await settle(el)
      expect(el.hasAttribute('active')).toBe(false)
    })
  })

  // --- 5. Disabled behavior ---

  describe('disabled behavior', () => {
    it('when disabled, aria-disabled can be set externally (simulating parent)', async () => {
      const el = await createOption({disabled: true})
      el.setAttribute('aria-disabled', 'true')
      await settle(el)
      expect(el.getAttribute('aria-disabled')).toBe('true')
    })

    it('cv-option does not block external aria-disabled attribute setting', async () => {
      const el = await createOption()
      el.setAttribute('aria-disabled', 'true')
      expect(el.getAttribute('aria-disabled')).toBe('true')
    })
  })

  // --- 6. ARIA managed by parent ---

  describe('ARIA managed by parent', () => {
    it('cv-option does NOT set role on its base in initial render', async () => {
      const el = await createOption()
      const base = getBase(el)
      expect(base.hasAttribute('role')).toBe(false)
    })

    it('cv-option does NOT set role on host in initial render', async () => {
      const el = await createOption()
      expect(el.hasAttribute('role')).toBe(false)
    })

    it('setting role="option" externally on host is respected', async () => {
      const el = await createOption()
      el.setAttribute('role', 'option')
      expect(el.getAttribute('role')).toBe('option')
    })

    it('setting aria-selected externally on host is respected', async () => {
      const el = await createOption()
      el.setAttribute('aria-selected', 'true')
      expect(el.getAttribute('aria-selected')).toBe('true')
    })

    it('setting aria-selected="false" externally on host is respected', async () => {
      const el = await createOption()
      el.setAttribute('aria-selected', 'false')
      expect(el.getAttribute('aria-selected')).toBe('false')
    })

    it('data-active attribute can be set externally', async () => {
      const el = await createOption()
      el.setAttribute('data-active', '')
      expect(el.hasAttribute('data-active')).toBe(true)
    })

    it('aria-setsize can be set externally', async () => {
      const el = await createOption()
      el.setAttribute('aria-setsize', '5')
      expect(el.getAttribute('aria-setsize')).toBe('5')
    })

    it('aria-posinset can be set externally', async () => {
      const el = await createOption()
      el.setAttribute('aria-posinset', '2')
      expect(el.getAttribute('aria-posinset')).toBe('2')
    })

    it('tabindex can be set externally', async () => {
      const el = await createOption()
      el.setAttribute('tabindex', '0')
      expect(el.getAttribute('tabindex')).toBe('0')
    })
  })

  // --- 7. Slot content ---

  describe('slot content', () => {
    it('default slot renders text content', async () => {
      const el = document.createElement('cv-option') as CVOption
      el.textContent = 'Apple'
      document.body.append(el)
      await settle(el)
      expect(el.textContent).toBe('Apple')
    })

    it('prefix slot accepts slotted content', async () => {
      const el = document.createElement('cv-option') as CVOption
      const icon = document.createElement('span')
      icon.setAttribute('slot', 'prefix')
      icon.textContent = 'icon'
      el.append(icon)
      document.body.append(el)
      await settle(el)
      const slotted = el.querySelector('[slot="prefix"]')
      expect(slotted).not.toBeNull()
      expect(slotted!.textContent).toBe('icon')
    })

    it('suffix slot accepts slotted content', async () => {
      const el = document.createElement('cv-option') as CVOption
      const badge = document.createElement('span')
      badge.setAttribute('slot', 'suffix')
      badge.textContent = 'badge'
      el.append(badge)
      document.body.append(el)
      await settle(el)
      const slotted = el.querySelector('[slot="suffix"]')
      expect(slotted).not.toBeNull()
      expect(slotted!.textContent).toBe('badge')
    })
  })

  // --- 8. Events ---

  describe('events', () => {
    it('cv-option emits no custom events on creation', async () => {
      const events: string[] = []
      const handler = (e: Event) => events.push(e.type)

      document.body.addEventListener('cv-input', handler, true)
      document.body.addEventListener('cv-change', handler, true)
      document.body.addEventListener('cv-select', handler, true)
      document.body.addEventListener('cv-option-select', handler, true)

      await createOption({value: 'apple'})

      document.body.removeEventListener('cv-input', handler, true)
      document.body.removeEventListener('cv-change', handler, true)
      document.body.removeEventListener('cv-select', handler, true)
      document.body.removeEventListener('cv-option-select', handler, true)

      expect(events).toEqual([])
    })

    it('cv-option emits no custom events when properties change', async () => {
      const el = await createOption()
      const events: string[] = []
      el.addEventListener('cv-input', (e) => events.push(e.type))
      el.addEventListener('cv-change', (e) => events.push(e.type))

      el.selected = true
      await settle(el)
      el.active = true
      await settle(el)
      el.disabled = true
      await settle(el)

      expect(events).toEqual([])
    })
  })
})
