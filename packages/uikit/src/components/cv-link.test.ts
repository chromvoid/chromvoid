import {afterEach, describe, expect, it} from 'vitest'

import {CVLink} from './cv-link'

CVLink.define()

const settle = async (element: CVLink) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createLink = async (attrs?: Partial<CVLink>) => {
  const el = document.createElement('cv-link') as CVLink
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVLink) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLAnchorElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-link', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as an <a> element', async () => {
      const link = await createLink()
      const base = getBase(link)
      expect(base).not.toBeNull()
      expect(base.tagName).toBe('A')
    })

    it('renders [part="label"] containing the default slot', async () => {
      const link = await createLink()
      const label = link.shadowRoot!.querySelector('[part="label"]')
      expect(label).not.toBeNull()
      expect(label!.tagName).toBe('SPAN')
      const slot = label!.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('renders [part="prefix"] containing slot[name="prefix"]', async () => {
      const link = await createLink()
      const prefix = link.shadowRoot!.querySelector('[part="prefix"]')
      expect(prefix).not.toBeNull()
      expect(prefix!.tagName).toBe('SPAN')
      const slot = prefix!.querySelector('slot[name="prefix"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="suffix"] containing slot[name="suffix"]', async () => {
      const link = await createLink()
      const suffix = link.shadowRoot!.querySelector('[part="suffix"]')
      expect(suffix).not.toBeNull()
      expect(suffix!.tagName).toBe('SPAN')
      const slot = suffix!.querySelector('slot[name="suffix"]')
      expect(slot).not.toBeNull()
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('href defaults to empty string', async () => {
      const link = await createLink()
      expect(link.href).toBe('')
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('href attribute reflects to the DOM', async () => {
      const link = await createLink({href: '/about'})
      expect(link.getAttribute('href')).toBe('/about')
    })

    it('changing href updates the attribute', async () => {
      const link = await createLink({href: '/old'})
      link.href = '/new'
      await settle(link)
      expect(link.getAttribute('href')).toBe('/new')
    })
  })

  // --- Events ---

  describe('events', () => {
    it('fires "press" event with {href} detail on click', async () => {
      const link = await createLink({href: '/docs'})
      let detail: unknown

      link.addEventListener('press', (e) => {
        detail = (e as CustomEvent).detail
      })

      getBase(link).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(link)

      expect(detail).toEqual({href: '/docs'})
    })

    it('fires "press" event with {href} detail on Enter keydown', async () => {
      const link = await createLink({href: '/settings'})
      let detail: unknown

      link.addEventListener('press', (e) => {
        detail = (e as CustomEvent).detail
      })

      getBase(link).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(link)

      expect(detail).toEqual({href: '/settings'})
    })

    it('press event detail shape is {href: string}', async () => {
      const link = await createLink({href: '/home'})
      let detail: unknown

      link.addEventListener('press', (e) => {
        detail = (e as CustomEvent).detail
      })

      getBase(link).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(link)

      expect(detail).toHaveProperty('href')
      expect(typeof (detail as {href: string}).href).toBe('string')
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('base element is a native <a>, so role is not explicitly set by contract', async () => {
      const link = await createLink({href: '/test'})
      const base = getBase(link)
      // isSemanticHost: true means the contract omits role — the native <a> provides it
      expect(base.getAttribute('role')).toBeNull()
    })

    it('base element is a native <a>, so tabindex is not explicitly set by contract', async () => {
      const link = await createLink({href: '/test'})
      const base = getBase(link)
      // isSemanticHost: true means the contract omits tabindex — the native <a> provides it
      expect(base.getAttribute('tabindex')).toBeNull()
    })

    it('href is forwarded to the inner anchor element', async () => {
      const link = await createLink({href: '/about'})
      const base = getBase(link)
      expect(base.getAttribute('href')).toBe('/about')
    })

    it('no aria-disabled attribute exists (link has no disabled state)', async () => {
      const link = await createLink({href: '/test'})
      const base = getBase(link)
      expect(base.hasAttribute('aria-disabled')).toBe(false)
    })
  })

  // --- Behavior ---

  describe('behavior', () => {
    it('click activates the link (fires press)', async () => {
      const link = await createLink({href: '/click'})
      let pressCount = 0
      link.addEventListener('press', () => pressCount++)

      getBase(link).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(link)

      expect(pressCount).toBe(1)
    })

    it('Enter key activates the link (fires press)', async () => {
      const link = await createLink({href: '/enter'})
      let pressCount = 0
      link.addEventListener('press', () => pressCount++)

      getBase(link).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(link)

      expect(pressCount).toBe(1)
    })

    it('Space key does NOT activate the link', async () => {
      const link = await createLink({href: '/space'})
      let pressCount = 0
      link.addEventListener('press', () => pressCount++)

      getBase(link).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      getBase(link).dispatchEvent(new KeyboardEvent('keyup', {key: ' ', bubbles: true}))
      await settle(link)

      expect(pressCount).toBe(0)
    })

    it('non-Enter keys do not activate the link', async () => {
      const link = await createLink({href: '/keys'})
      let pressCount = 0
      link.addEventListener('press', () => pressCount++)

      getBase(link).dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true}))
      getBase(link).dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      getBase(link).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(link)

      expect(pressCount).toBe(0)
    })

    it('changing href updates the inner anchor', async () => {
      const link = await createLink({href: '/old'})
      expect(getBase(link).getAttribute('href')).toBe('/old')

      link.href = '/new'
      await settle(link)
      expect(getBase(link).getAttribute('href')).toBe('/new')
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('ARIA attributes on base originate from headless getLinkProps(), not hardcoded', async () => {
      const link = await createLink({href: '/delegated'})
      const base = getBase(link)
      // The base element should have an id generated by the headless contract
      expect(base.hasAttribute('id')).toBe(true)
      expect(base.getAttribute('id')).toMatch(/^cv-link-\d+-root$/)
    })

    it('href on base comes from headless contract', async () => {
      const link = await createLink({href: '/contracted'})
      const base = getBase(link)
      expect(base.getAttribute('href')).toBe('/contracted')
    })

    it('event handlers are wired through headless contract', async () => {
      const link = await createLink({href: '/wired'})
      let pressCount = 0
      link.addEventListener('press', () => pressCount++)

      // Click goes through headless handleClick -> press -> onPress
      getBase(link).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      // Enter goes through headless handleKeyDown -> press -> onPress
      getBase(link).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(link)

      expect(pressCount).toBe(2)
    })
  })

  // --- Slots ---

  describe('slots', () => {
    it('prefix slot exists in shadow DOM', async () => {
      const link = await createLink()
      const slot = link.shadowRoot!.querySelector('slot[name="prefix"]')
      expect(slot).not.toBeNull()
    })

    it('suffix slot exists in shadow DOM', async () => {
      const link = await createLink()
      const slot = link.shadowRoot!.querySelector('slot[name="suffix"]')
      expect(slot).not.toBeNull()
    })

    it('default slot exists in shadow DOM', async () => {
      const link = await createLink()
      const slot = link.shadowRoot!.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })
  })

  // --- No disabled support ---

  describe('no disabled support', () => {
    it('component does not expose a disabled property', async () => {
      const link = await createLink()
      expect('disabled' in link).toBe(false)
    })

    it('component does not reflect a disabled attribute', async () => {
      const link = await createLink()
      expect(link.hasAttribute('disabled')).toBe(false)
    })
  })
})
