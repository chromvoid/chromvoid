import {afterEach, describe, expect, it} from 'vitest'

import {CVLandmark} from './cv-landmark'

CVLandmark.define()

const settle = async (element: CVLandmark) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createLandmark = async (attrs?: Partial<CVLandmark>) => {
  const el = document.createElement('cv-landmark') as CVLandmark
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVLandmark) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-landmark', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as a <section> element', async () => {
      const el = await createLandmark()
      const base = getBase(el)
      expect(base).not.toBeNull()
      expect(base.tagName.toLowerCase()).toBe('section')
    })

    it('renders a default slot inside [part="base"]', async () => {
      const el = await createLandmark()
      const base = getBase(el)
      const slot = base.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has type="region" by default', async () => {
      const el = await createLandmark()
      expect(el.type).toBe('region')
    })

    it('has label="" by default', async () => {
      const el = await createLandmark()
      expect(el.label).toBe('')
    })

    it('has labelId="" by default', async () => {
      const el = await createLandmark()
      expect(el.labelId).toBe('')
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('reflects type attribute to DOM', async () => {
      const el = await createLandmark({type: 'navigation'})
      expect(el.getAttribute('type')).toBe('navigation')
    })

    it('reflects label attribute to DOM', async () => {
      const el = await createLandmark({label: 'Main nav'})
      expect(el.getAttribute('label')).toBe('Main nav')
    })

    it('reflects labelId as label-id attribute to DOM', async () => {
      const el = await createLandmark({labelId: 'heading-1'})
      expect(el.getAttribute('label-id')).toBe('heading-1')
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('applies role="region" on base by default', async () => {
      const el = await createLandmark()
      expect(getBase(el).getAttribute('role')).toBe('region')
    })

    it('applies aria-label when label is provided', async () => {
      const el = await createLandmark({label: 'Site navigation'})
      const base = getBase(el)
      expect(base.getAttribute('aria-label')).toBe('Site navigation')
    })

    it('does not apply aria-label or aria-labelledby when neither is provided', async () => {
      const el = await createLandmark()
      const base = getBase(el)
      expect(base.hasAttribute('aria-label')).toBe(false)
      expect(base.hasAttribute('aria-labelledby')).toBe(false)
    })

    it('applies aria-labelledby when labelId is provided', async () => {
      const el = await createLandmark({labelId: 'nav-heading'})
      const base = getBase(el)
      expect(base.getAttribute('aria-labelledby')).toBe('nav-heading')
    })
  })

  // --- Landmark type mapping ---

  describe('landmark type mapping', () => {
    const landmarkTypes = [
      'banner',
      'main',
      'navigation',
      'complementary',
      'contentinfo',
      'search',
      'form',
      'region',
    ] as const

    for (const type of landmarkTypes) {
      it(`renders role="${type}" when type="${type}"`, async () => {
        const el = await createLandmark({type})
        expect(getBase(el).getAttribute('role')).toBe(type)
      })
    }
  })

  // --- Label precedence ---

  describe('label precedence', () => {
    it('uses aria-label when only label is set', async () => {
      const el = await createLandmark({label: 'Primary nav'})
      const base = getBase(el)
      expect(base.getAttribute('aria-label')).toBe('Primary nav')
      expect(base.hasAttribute('aria-labelledby')).toBe(false)
    })

    it('uses aria-labelledby when only labelId is set', async () => {
      const el = await createLandmark({labelId: 'heading-1'})
      const base = getBase(el)
      expect(base.getAttribute('aria-labelledby')).toBe('heading-1')
      expect(base.hasAttribute('aria-label')).toBe(false)
    })

    it('uses aria-labelledby (not aria-label) when both label and labelId are set', async () => {
      const el = await createLandmark({label: 'Primary nav', labelId: 'heading-1'})
      const base = getBase(el)
      expect(base.getAttribute('aria-labelledby')).toBe('heading-1')
      expect(base.hasAttribute('aria-label')).toBe(false)
    })

    it('applies neither aria-label nor aria-labelledby when both are empty', async () => {
      const el = await createLandmark()
      const base = getBase(el)
      expect(base.hasAttribute('aria-label')).toBe(false)
      expect(base.hasAttribute('aria-labelledby')).toBe(false)
    })
  })

  // --- Dynamic state updates ---

  describe('dynamic state updates', () => {
    it('updates role when type changes at runtime', async () => {
      const el = await createLandmark({type: 'region'})
      expect(getBase(el).getAttribute('role')).toBe('region')

      el.type = 'navigation'
      await settle(el)
      expect(getBase(el).getAttribute('role')).toBe('navigation')
    })

    it('updates aria-label when label changes at runtime', async () => {
      const el = await createLandmark({label: 'Old label'})
      expect(getBase(el).getAttribute('aria-label')).toBe('Old label')

      el.label = 'New label'
      await settle(el)
      expect(getBase(el).getAttribute('aria-label')).toBe('New label')
    })

    it('updates aria-labelledby when labelId changes at runtime', async () => {
      const el = await createLandmark({labelId: 'old-id'})
      expect(getBase(el).getAttribute('aria-labelledby')).toBe('old-id')

      el.labelId = 'new-id'
      await settle(el)
      expect(getBase(el).getAttribute('aria-labelledby')).toBe('new-id')
    })

    it('switches from aria-label to aria-labelledby when labelId is added', async () => {
      const el = await createLandmark({label: 'Primary nav'})
      const base = getBase(el)
      expect(base.getAttribute('aria-label')).toBe('Primary nav')
      expect(base.hasAttribute('aria-labelledby')).toBe(false)

      el.labelId = 'nav-heading'
      await settle(el)
      expect(base.hasAttribute('aria-label')).toBe(false)
      expect(base.getAttribute('aria-labelledby')).toBe('nav-heading')
    })

    it('switches from aria-labelledby to aria-label when labelId is removed', async () => {
      const el = await createLandmark({label: 'Primary nav', labelId: 'nav-heading'})
      const base = getBase(el)
      expect(base.getAttribute('aria-labelledby')).toBe('nav-heading')
      expect(base.hasAttribute('aria-label')).toBe(false)

      el.labelId = ''
      await settle(el)
      expect(base.getAttribute('aria-label')).toBe('Primary nav')
      expect(base.hasAttribute('aria-labelledby')).toBe(false)
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('role on base originates from getLandmarkProps()', async () => {
      const el = await createLandmark({type: 'main'})
      const base = getBase(el)
      // The role attribute on the base element must match the type passed to headless
      expect(base.getAttribute('role')).toBe('main')
    })

    it('aria-label on base originates from getLandmarkProps()', async () => {
      const el = await createLandmark({type: 'navigation', label: 'Site nav'})
      const base = getBase(el)
      expect(base.getAttribute('aria-label')).toBe('Site nav')
    })

    it('aria-labelledby on base originates from getLandmarkProps()', async () => {
      const el = await createLandmark({type: 'navigation', labelId: 'nav-heading'})
      const base = getBase(el)
      expect(base.getAttribute('aria-labelledby')).toBe('nav-heading')
    })

    it('headless model is recreated when attributes change', async () => {
      const el = await createLandmark({type: 'region'})
      expect(getBase(el).getAttribute('role')).toBe('region')

      el.type = 'banner'
      await settle(el)
      expect(getBase(el).getAttribute('role')).toBe('banner')

      el.type = 'contentinfo'
      await settle(el)
      expect(getBase(el).getAttribute('role')).toBe('contentinfo')
    })
  })
})
