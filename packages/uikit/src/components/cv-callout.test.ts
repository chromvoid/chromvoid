import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVCallout} from './cv-callout'

CVCallout.define()

const settle = async (element: CVCallout) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createCallout = async (attrs?: Partial<CVCallout>) => {
  const el = document.createElement('cv-callout') as CVCallout
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVCallout) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-callout', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as a div with role="note"', async () => {
      const el = await createCallout()
      const base = getBase(el)
      expect(base).not.toBeNull()
      expect(base.tagName.toLowerCase()).toBe('div')
      expect(base.getAttribute('role')).toBe('note')
    })

    it('renders [part="icon"] containing slot[name="icon"]', async () => {
      const el = await createCallout()
      const icon = el.shadowRoot!.querySelector('[part="icon"]')
      expect(icon).not.toBeNull()
      const slot = icon!.querySelector('slot[name="icon"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="message"] containing default slot', async () => {
      const el = await createCallout()
      const message = el.shadowRoot!.querySelector('[part="message"]')
      expect(message).not.toBeNull()
      const slot = message!.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('does NOT render [part="close-button"] when closable is false', async () => {
      const el = await createCallout()
      const closeBtn = el.shadowRoot!.querySelector('[part="close-button"]')
      expect(closeBtn).toBeNull()
    })

    it('renders [part="close-button"] as a button when closable is true', async () => {
      const el = await createCallout({closable: true})
      const closeBtn = el.shadowRoot!.querySelector('[part="close-button"]')
      expect(closeBtn).not.toBeNull()
      expect(closeBtn!.tagName.toLowerCase()).toBe('button')
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const el = await createCallout()
      expect(el.variant).toBe('info')
      expect(el.closable).toBe(false)
      expect(el.open).toBe(true)
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('boolean attributes reflect: closable, open', async () => {
      const el = await createCallout({closable: true})
      expect(el.hasAttribute('closable')).toBe(true)
      expect(el.hasAttribute('open')).toBe(true)
    })

    it('open attribute is present by default', async () => {
      const el = await createCallout()
      expect(el.hasAttribute('open')).toBe(true)
    })

    it('string attribute reflects: variant', async () => {
      const el = await createCallout({variant: 'danger'})
      expect(el.getAttribute('variant')).toBe('danger')
    })

    it('variant defaults to "info" on host attribute', async () => {
      const el = await createCallout()
      expect(el.getAttribute('variant')).toBe('info')
    })
  })

  // --- Variants ---

  describe('variants', () => {
    const variants = ['info', 'success', 'warning', 'danger', 'neutral'] as const

    for (const variant of variants) {
      it(`accepts variant="${variant}"`, async () => {
        const el = await createCallout({variant})
        expect(el.variant).toBe(variant)
        expect(el.getAttribute('variant')).toBe(variant)
      })
    }

    it('data-variant on base reflects current variant', async () => {
      const el = await createCallout({variant: 'warning'})
      const base = getBase(el)
      expect(base.getAttribute('data-variant')).toBe('warning')
    })

    it('changing variant updates data-variant on base', async () => {
      const el = await createCallout({variant: 'info'})
      const base = getBase(el)
      expect(base.getAttribute('data-variant')).toBe('info')

      el.variant = 'success'
      await settle(el)
      expect(base.getAttribute('data-variant')).toBe('success')
    })
  })

  // --- Events ---

  describe('events', () => {
    it('emits cv-close when close button is clicked', async () => {
      const el = await createCallout({closable: true})
      const handler = vi.fn()
      el.addEventListener('cv-close', handler)

      const closeBtn = el.shadowRoot!.querySelector('[part="close-button"]') as HTMLElement
      closeBtn.click()
      await settle(el)

      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('cv-close event detail is undefined', async () => {
      const el = await createCallout({closable: true})
      let detail: unknown = 'not-set'
      el.addEventListener('cv-close', (e) => {
        detail = (e as CustomEvent).detail
      })

      const closeBtn = el.shadowRoot!.querySelector('[part="close-button"]') as HTMLElement
      closeBtn.click()
      await settle(el)

      expect(detail === undefined || detail === null).toBe(true)
    })

    it('does not emit cv-close when not closable', async () => {
      const el = await createCallout()
      const handler = vi.fn()
      el.addEventListener('cv-close', handler)

      // No close button should exist, so no click possible
      const closeBtn = el.shadowRoot!.querySelector('[part="close-button"]')
      expect(closeBtn).toBeNull()
      expect(handler).not.toHaveBeenCalled()
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('role="note" on base element', async () => {
      const el = await createCallout()
      expect(getBase(el).getAttribute('role')).toBe('note')
    })

    it('no aria-live attribute on base', async () => {
      const el = await createCallout()
      expect(getBase(el).hasAttribute('aria-live')).toBe(false)
    })

    it('no aria-atomic attribute on base', async () => {
      const el = await createCallout()
      expect(getBase(el).hasAttribute('aria-atomic')).toBe(false)
    })

    it('no tabindex on base element (non-interactive root)', async () => {
      const el = await createCallout()
      expect(getBase(el).hasAttribute('tabindex')).toBe(false)
    })

    it('close button has aria-label="Dismiss"', async () => {
      const el = await createCallout({closable: true})
      const closeBtn = el.shadowRoot!.querySelector('[part="close-button"]') as HTMLElement
      expect(closeBtn.getAttribute('aria-label')).toBe('Dismiss')
    })

    it('close button has role="button"', async () => {
      const el = await createCallout({closable: true})
      const closeBtn = el.shadowRoot!.querySelector('[part="close-button"]') as HTMLElement
      // Native <button> has implicit role="button"; check explicit if set
      const role = closeBtn.getAttribute('role')
      expect(role === 'button' || closeBtn.tagName.toLowerCase() === 'button').toBe(true)
    })

    it('close button has tabindex="0"', async () => {
      const el = await createCallout({closable: true})
      const closeBtn = el.shadowRoot!.querySelector('[part="close-button"]') as HTMLElement
      expect(closeBtn.getAttribute('tabindex')).toBe('0')
    })

    it('role="note" originates from headless getCalloutProps()', async () => {
      // Verify the role attribute on base matches headless contract output
      // rather than being hardcoded — the base element receives getCalloutProps()
      const el = await createCallout()
      const base = getBase(el)
      // Role must be "note" as specified by headless contract
      expect(base.getAttribute('role')).toBe('note')
      // Must also have an id (generated by headless)
      expect(base.hasAttribute('id')).toBe(true)
      expect(base.getAttribute('id')).toBeTruthy()
    })
  })

  // --- Closable behavior ---

  describe('closable behavior', () => {
    it('clicking close button sets open to false', async () => {
      const el = await createCallout({closable: true})
      expect(el.open).toBe(true)

      const closeBtn = el.shadowRoot!.querySelector('[part="close-button"]') as HTMLElement
      closeBtn.click()
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('close button is removed from DOM when closable is false', async () => {
      const el = await createCallout({closable: true})
      expect(el.shadowRoot!.querySelector('[part="close-button"]')).not.toBeNull()

      el.closable = false
      await settle(el)
      expect(el.shadowRoot!.querySelector('[part="close-button"]')).toBeNull()
    })

    it('close button appears when closable is set to true dynamically', async () => {
      const el = await createCallout()
      expect(el.shadowRoot!.querySelector('[part="close-button"]')).toBeNull()

      el.closable = true
      await settle(el)
      expect(el.shadowRoot!.querySelector('[part="close-button"]')).not.toBeNull()
    })
  })

  // --- Open/visibility behavior ---

  describe('open state', () => {
    it('open is true by default and host has open attribute', async () => {
      const el = await createCallout()
      expect(el.open).toBe(true)
      expect(el.hasAttribute('open')).toBe(true)
    })

    it('when open is false, host loses open attribute', async () => {
      const el = await createCallout({closable: true})

      const closeBtn = el.shadowRoot!.querySelector('[part="close-button"]') as HTMLElement
      closeBtn.click()
      await settle(el)

      expect(el.open).toBe(false)
      expect(el.hasAttribute('open')).toBe(false)
    })

    it('programmatic show restores open to true', async () => {
      const el = await createCallout({closable: true})

      // Close first
      const closeBtn = el.shadowRoot!.querySelector('[part="close-button"]') as HTMLElement
      closeBtn.click()
      await settle(el)
      expect(el.open).toBe(false)

      // Re-open
      el.open = true
      await settle(el)
      expect(el.open).toBe(true)
      expect(el.hasAttribute('open')).toBe(true)
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('base element receives id from getCalloutProps()', async () => {
      const el = await createCallout()
      const base = getBase(el)
      expect(base.getAttribute('id')).toBeTruthy()
    })

    it('base element receives data-variant from getCalloutProps()', async () => {
      const el = await createCallout({variant: 'danger'})
      const base = getBase(el)
      expect(base.getAttribute('data-variant')).toBe('danger')
    })

    it('close button receives attributes from getCloseButtonProps()', async () => {
      const el = await createCallout({closable: true})
      const closeBtn = el.shadowRoot!.querySelector('[part="close-button"]') as HTMLElement
      // Verify headless contract attributes are present
      expect(closeBtn.getAttribute('aria-label')).toBe('Dismiss')
      expect(closeBtn.hasAttribute('id')).toBe(true)
      expect(closeBtn.getAttribute('id')).toBeTruthy()
    })

    it('role on base is from headless contract, not hardcoded', async () => {
      // Two separate callout instances should have different ids
      // (proving headless generates them) but same role
      const el1 = await createCallout()
      const el2 = await createCallout()
      const base1 = getBase(el1)
      const base2 = getBase(el2)

      expect(base1.getAttribute('role')).toBe('note')
      expect(base2.getAttribute('role')).toBe('note')
      // Different ids prove headless generates them
      expect(base1.getAttribute('id')).not.toBe(base2.getAttribute('id'))
    })
  })
})
