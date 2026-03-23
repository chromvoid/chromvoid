import {afterEach, describe, expect, it} from 'vitest'

import {CVBadge} from './cv-badge'

CVBadge.define()

const settle = async (element: CVBadge) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createBadge = async (attrs?: Partial<CVBadge>) => {
  const el = document.createElement('cv-badge') as CVBadge
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVBadge) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-badge', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as a <div>', async () => {
      const badge = await createBadge()
      const base = getBase(badge)
      expect(base).not.toBeNull()
      expect(base.tagName).toBe('DIV')
    })

    it('renders [part="label"] containing default slot', async () => {
      const badge = await createBadge()
      const label = badge.shadowRoot!.querySelector('[part="label"]')
      expect(label).not.toBeNull()
      expect(label!.tagName).toBe('SPAN')
      const slot = label!.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('renders [part="prefix"] containing slot[name="prefix"]', async () => {
      const badge = await createBadge()
      const prefix = badge.shadowRoot!.querySelector('[part="prefix"]')
      expect(prefix).not.toBeNull()
      expect(prefix!.tagName).toBe('SPAN')
      const slot = prefix!.querySelector('slot[name="prefix"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="suffix"] containing slot[name="suffix"]', async () => {
      const badge = await createBadge()
      const suffix = badge.shadowRoot!.querySelector('[part="suffix"]')
      expect(suffix).not.toBeNull()
      expect(suffix!.tagName).toBe('SPAN')
      const slot = suffix!.querySelector('slot[name="suffix"]')
      expect(slot).not.toBeNull()
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const badge = await createBadge()
      expect(badge.variant).toBe('neutral')
      expect(badge.size).toBe('medium')
      expect(badge.dot).toBe(false)
      expect(badge.pulse).toBe(false)
      expect(badge.pill).toBe(false)
      expect(badge.dynamic).toBe(false)
      expect(badge.decorative).toBe(false)
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('boolean attributes reflect: dot, pulse, pill, dynamic, decorative', async () => {
      const badge = await createBadge({
        dot: true,
        pulse: true,
        pill: true,
        dynamic: true,
        decorative: true,
      })
      expect(badge.hasAttribute('dot')).toBe(true)
      expect(badge.hasAttribute('pulse')).toBe(true)
      expect(badge.hasAttribute('pill')).toBe(true)
      expect(badge.hasAttribute('dynamic')).toBe(true)
      expect(badge.hasAttribute('decorative')).toBe(true)
    })

    it('boolean attributes absent when false', async () => {
      const badge = await createBadge()
      expect(badge.hasAttribute('dot')).toBe(false)
      expect(badge.hasAttribute('pulse')).toBe(false)
      expect(badge.hasAttribute('pill')).toBe(false)
      expect(badge.hasAttribute('dynamic')).toBe(false)
      expect(badge.hasAttribute('decorative')).toBe(false)
    })

    it('string attributes reflect: variant, size', async () => {
      const badge = await createBadge({variant: 'danger', size: 'large'})
      expect(badge.getAttribute('variant')).toBe('danger')
      expect(badge.getAttribute('size')).toBe('large')
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('static badge: no role, no aria-live, no aria-atomic on base', async () => {
      const badge = await createBadge()
      const base = getBase(badge)
      expect(base.hasAttribute('role')).toBe(false)
      expect(base.hasAttribute('aria-live')).toBe(false)
      expect(base.hasAttribute('aria-atomic')).toBe(false)
      expect(base.hasAttribute('aria-hidden')).toBe(false)
    })

    it('dynamic badge: role="status", aria-live="polite", aria-atomic="true"', async () => {
      const badge = await createBadge({dynamic: true})
      const base = getBase(badge)
      expect(base.getAttribute('role')).toBe('status')
      expect(base.getAttribute('aria-live')).toBe('polite')
      expect(base.getAttribute('aria-atomic')).toBe('true')
    })

    it('decorative badge: role="presentation", aria-hidden="true"', async () => {
      const badge = await createBadge({decorative: true})
      const base = getBase(badge)
      expect(base.getAttribute('role')).toBe('presentation')
      expect(base.getAttribute('aria-hidden')).toBe('true')
    })

    it('decorative takes precedence over dynamic', async () => {
      const badge = await createBadge({decorative: true, dynamic: true})
      const base = getBase(badge)
      expect(base.getAttribute('role')).toBe('presentation')
      expect(base.getAttribute('aria-hidden')).toBe('true')
      expect(base.hasAttribute('aria-live')).toBe(false)
      expect(base.hasAttribute('aria-atomic')).toBe(false)
    })

    it('badge never produces tabindex', async () => {
      const badge = await createBadge()
      const base = getBase(badge)
      expect(base.hasAttribute('tabindex')).toBe(false)
    })

    it('dynamic badge never produces tabindex', async () => {
      const badge = await createBadge({dynamic: true})
      const base = getBase(badge)
      expect(base.hasAttribute('tabindex')).toBe(false)
    })
  })

  // --- Dot mode ---

  describe('dot mode', () => {
    it('dot=true hides label, prefix, and suffix parts', async () => {
      const badge = await createBadge({dot: true})
      const label = badge.shadowRoot!.querySelector('[part="label"]') as HTMLElement
      const prefix = badge.shadowRoot!.querySelector('[part="prefix"]') as HTMLElement
      const suffix = badge.shadowRoot!.querySelector('[part="suffix"]') as HTMLElement

      // When dot is true, content parts should be hidden
      // Check via hidden attribute, display:none, or absence from DOM
      const isHidden = (el: HTMLElement | null) => {
        if (!el) return true
        return el.hidden || getComputedStyle(el).display === 'none'
      }

      expect(isHidden(label)).toBe(true)
      expect(isHidden(prefix)).toBe(true)
      expect(isHidden(suffix)).toBe(true)
    })

    it('dot=false shows label, prefix, and suffix parts', async () => {
      const badge = await createBadge()
      const label = badge.shadowRoot!.querySelector('[part="label"]') as HTMLElement
      const prefix = badge.shadowRoot!.querySelector('[part="prefix"]') as HTMLElement
      const suffix = badge.shadowRoot!.querySelector('[part="suffix"]') as HTMLElement

      expect(label).not.toBeNull()
      expect(prefix).not.toBeNull()
      expect(suffix).not.toBeNull()
    })

    it('toggling dot at runtime hides and shows content', async () => {
      const badge = await createBadge()

      badge.dot = true
      await settle(badge)
      expect(badge.hasAttribute('dot')).toBe(true)

      badge.dot = false
      await settle(badge)
      expect(badge.hasAttribute('dot')).toBe(false)
    })
  })

  // --- Variant ---

  describe('variant', () => {
    it.each(['primary', 'success', 'neutral', 'warning', 'danger'] as const)(
      'variant="%s" reflects to host attribute',
      async (v) => {
        const badge = await createBadge({variant: v})
        expect(badge.getAttribute('variant')).toBe(v)
      },
    )

    it('changing variant at runtime updates host attribute', async () => {
      const badge = await createBadge()
      expect(badge.getAttribute('variant')).toBe('neutral')

      badge.variant = 'danger'
      await settle(badge)
      expect(badge.getAttribute('variant')).toBe('danger')

      badge.variant = 'success'
      await settle(badge)
      expect(badge.getAttribute('variant')).toBe('success')
    })
  })

  // --- Size ---

  describe('size', () => {
    it.each(['small', 'medium', 'large'] as const)(
      'size="%s" reflects to host attribute',
      async (s) => {
        const badge = await createBadge({size: s})
        expect(badge.getAttribute('size')).toBe(s)
      },
    )

    it('changing size at runtime updates host attribute', async () => {
      const badge = await createBadge()
      expect(badge.getAttribute('size')).toBe('medium')

      badge.size = 'small'
      await settle(badge)
      expect(badge.getAttribute('size')).toBe('small')

      badge.size = 'large'
      await settle(badge)
      expect(badge.getAttribute('size')).toBe('large')
    })
  })

  // --- Pulse ---

  describe('pulse', () => {
    it('pulse=true sets [pulse] attribute on host', async () => {
      const badge = await createBadge({pulse: true})
      expect(badge.hasAttribute('pulse')).toBe(true)
    })

    it('pulse=false removes [pulse] attribute from host', async () => {
      const badge = await createBadge({pulse: true})
      badge.pulse = false
      await settle(badge)
      expect(badge.hasAttribute('pulse')).toBe(false)
    })
  })

  // --- Pill ---

  describe('pill', () => {
    it('pill=true sets [pill] attribute on host', async () => {
      const badge = await createBadge({pill: true})
      expect(badge.hasAttribute('pill')).toBe(true)
    })

    it('pill=false removes [pill] attribute from host', async () => {
      const badge = await createBadge({pill: true})
      badge.pill = false
      await settle(badge)
      expect(badge.hasAttribute('pill')).toBe(false)
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('static badge: getBadgeProps() attributes are on [part="base"]', async () => {
      const badge = await createBadge()
      const base = getBase(badge)
      // Static badge should not have role, aria-live, aria-atomic, or aria-hidden
      expect(base.hasAttribute('role')).toBe(false)
      expect(base.hasAttribute('aria-live')).toBe(false)
      expect(base.hasAttribute('aria-atomic')).toBe(false)
      expect(base.hasAttribute('aria-hidden')).toBe(false)
    })

    it('dynamic badge: getBadgeProps() role/aria-live/aria-atomic on [part="base"]', async () => {
      const badge = await createBadge({dynamic: true})
      const base = getBase(badge)
      expect(base.getAttribute('role')).toBe('status')
      expect(base.getAttribute('aria-live')).toBe('polite')
      expect(base.getAttribute('aria-atomic')).toBe('true')
    })

    it('decorative badge: getBadgeProps() role/aria-hidden on [part="base"]', async () => {
      const badge = await createBadge({decorative: true})
      const base = getBase(badge)
      expect(base.getAttribute('role')).toBe('presentation')
      expect(base.getAttribute('aria-hidden')).toBe('true')
    })

    it('switching from dynamic to decorative updates ARIA on base', async () => {
      const badge = await createBadge({dynamic: true})
      const base = getBase(badge)
      expect(base.getAttribute('role')).toBe('status')

      badge.decorative = true
      await settle(badge)
      expect(base.getAttribute('role')).toBe('presentation')
      expect(base.getAttribute('aria-hidden')).toBe('true')
      expect(base.hasAttribute('aria-live')).toBe(false)
    })

    it('switching from decorative to dynamic updates ARIA on base', async () => {
      const badge = await createBadge({decorative: true})
      const base = getBase(badge)
      expect(base.getAttribute('role')).toBe('presentation')

      badge.decorative = false
      badge.dynamic = true
      await settle(badge)
      expect(base.getAttribute('role')).toBe('status')
      expect(base.getAttribute('aria-live')).toBe('polite')
      expect(base.hasAttribute('aria-hidden')).toBe(false)
    })

    it('aria-label is passed through to base when set', async () => {
      const badge = await createBadge()
      badge.setAttribute('aria-label', 'New notifications')
      await settle(badge)
      const base = getBase(badge)
      expect(base.getAttribute('aria-label')).toBe('New notifications')
    })
  })

  // --- Non-interactive invariant ---

  describe('non-interactive', () => {
    it('badge emits no input or change events on click', async () => {
      const badge = await createBadge()
      let inputCount = 0
      let changeCount = 0
      badge.addEventListener('cv-input', () => inputCount++)
      badge.addEventListener('cv-change', () => changeCount++)

      getBase(badge).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(badge)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })
  })
})
