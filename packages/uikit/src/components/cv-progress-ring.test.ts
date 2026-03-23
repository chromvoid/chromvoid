import {afterEach, describe, expect, it} from 'vitest'

import {CVProgressRing} from './cv-progress-ring'

CVProgressRing.define()

const settle = async (element: CVProgressRing) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createProgressRing = async (attrs?: Partial<CVProgressRing>) => {
  const el = document.createElement('cv-progress-ring') as CVProgressRing
  if (attrs) {
    Object.assign(el, attrs)
  }
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVProgressRing) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-progress-ring', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as a div', async () => {
      const el = await createProgressRing()
      const base = getBase(el)
      expect(base).not.toBeNull()
      expect(base.tagName).toBe('DIV')
    })

    it('renders [part="svg"] as an svg element inside base', async () => {
      const el = await createProgressRing()
      const svg = el.shadowRoot!.querySelector('[part="svg"]') as Element
      expect(svg).not.toBeNull()
      expect(svg.tagName.toLowerCase()).toBe('svg')
      expect(svg.getAttribute('viewBox')).toBe('0 0 100 100')
      expect(svg.parentElement).toBe(getBase(el))
    })

    it('renders [part="track"] as a circle inside svg', async () => {
      const el = await createProgressRing()
      const track = el.shadowRoot!.querySelector('[part="track"]') as Element
      expect(track).not.toBeNull()
      expect(track.tagName.toLowerCase()).toBe('circle')
      const svg = el.shadowRoot!.querySelector('[part="svg"]') as Element
      expect(track.parentElement).toBe(svg)
    })

    it('renders [part="indicator"] as a circle inside svg', async () => {
      const el = await createProgressRing()
      const indicator = el.shadowRoot!.querySelector('[part="indicator"]') as Element
      expect(indicator).not.toBeNull()
      expect(indicator.tagName.toLowerCase()).toBe('circle')
      const svg = el.shadowRoot!.querySelector('[part="svg"]') as Element
      expect(indicator.parentElement).toBe(svg)
    })

    it('renders [part="label"] as a span inside base', async () => {
      const el = await createProgressRing()
      const label = el.shadowRoot!.querySelector('[part="label"]') as HTMLElement
      expect(label).not.toBeNull()
      expect(label.tagName).toBe('SPAN')
      expect(label.parentElement).toBe(getBase(el))
    })

    it('renders default slot inside label part', async () => {
      const el = await createProgressRing()
      const label = el.shadowRoot!.querySelector('[part="label"]') as HTMLElement
      expect(label).not.toBeNull()
      const slot = label.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const el = await createProgressRing()
      expect(el.value).toBe(0)
      expect(el.min).toBe(0)
      expect(el.max).toBe(100)
      expect(el.indeterminate).toBe(false)
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('boolean attribute reflects: indeterminate', async () => {
      const el = await createProgressRing({indeterminate: true})
      expect(el.hasAttribute('indeterminate')).toBe(true)
    })

    it('numeric attributes reflect: value, min, max', async () => {
      const el = await createProgressRing({value: 42, min: 10, max: 200})
      expect(el.getAttribute('value')).toBe('42')
      expect(el.getAttribute('min')).toBe('10')
      expect(el.getAttribute('max')).toBe('200')
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('role="progressbar" on base', async () => {
      const el = await createProgressRing()
      expect(getBase(el).getAttribute('role')).toBe('progressbar')
    })

    it('aria-valuenow reflects current value in determinate mode', async () => {
      const el = await createProgressRing({value: 30})
      expect(getBase(el).getAttribute('aria-valuenow')).toBe('30')
    })

    it('aria-valuemin reflects min in determinate mode', async () => {
      const el = await createProgressRing({min: 5})
      expect(getBase(el).getAttribute('aria-valuemin')).toBe('5')
    })

    it('aria-valuemax reflects max in determinate mode', async () => {
      const el = await createProgressRing({max: 50})
      expect(getBase(el).getAttribute('aria-valuemax')).toBe('50')
    })

    it('aria-valuetext shows rounded percentage by default', async () => {
      const el = await createProgressRing({value: 33, min: 0, max: 100})
      expect(getBase(el).getAttribute('aria-valuetext')).toBe('33%')
    })

    it('aria-label is passed through to base', async () => {
      const el = await createProgressRing()
      el.setAttribute('aria-label', 'Upload progress')
      await settle(el)
      expect(getBase(el).getAttribute('aria-label')).toBe('Upload progress')
    })
  })

  // --- Visual states ---

  describe('visual states', () => {
    it('sets [indeterminate] attribute on host when indeterminate', async () => {
      const el = await createProgressRing({indeterminate: true})
      expect(el.hasAttribute('indeterminate')).toBe(true)
    })

    it('does not set [indeterminate] attribute on host when determinate', async () => {
      const el = await createProgressRing()
      expect(el.hasAttribute('indeterminate')).toBe(false)
    })

    it('sets [data-complete] when value >= max', async () => {
      const el = await createProgressRing({value: 100, min: 0, max: 100})
      expect(el.hasAttribute('data-complete')).toBe(true)
    })

    it('sets [data-complete] when value exceeds max', async () => {
      const el = await createProgressRing({value: 5, min: 0, max: 2})
      expect(el.hasAttribute('data-complete')).toBe(true)
    })

    it('does not set [data-complete] when value < max', async () => {
      const el = await createProgressRing({value: 50, max: 100})
      expect(el.hasAttribute('data-complete')).toBe(false)
    })

    it('does not set [data-complete] in indeterminate mode even if value >= max', async () => {
      const el = await createProgressRing({value: 100, max: 100, indeterminate: true})
      expect(el.hasAttribute('data-complete')).toBe(false)
    })

    it('dynamically adds [data-complete] when value reaches max', async () => {
      const el = await createProgressRing({value: 50, max: 100})
      expect(el.hasAttribute('data-complete')).toBe(false)

      el.value = 100
      await settle(el)
      expect(el.hasAttribute('data-complete')).toBe(true)
    })
  })

  // --- Indeterminate mode ---

  describe('indeterminate mode', () => {
    it('omits aria-valuenow in indeterminate mode', async () => {
      const el = await createProgressRing({value: 50, indeterminate: true})
      expect(getBase(el).getAttribute('aria-valuenow')).toBeNull()
    })

    it('omits aria-valuemin in indeterminate mode', async () => {
      const el = await createProgressRing({value: 50, indeterminate: true})
      expect(getBase(el).getAttribute('aria-valuemin')).toBeNull()
    })

    it('omits aria-valuemax in indeterminate mode', async () => {
      const el = await createProgressRing({value: 50, indeterminate: true})
      expect(getBase(el).getAttribute('aria-valuemax')).toBeNull()
    })

    it('omits aria-valuetext in indeterminate mode', async () => {
      const el = await createProgressRing({value: 50, indeterminate: true})
      expect(getBase(el).getAttribute('aria-valuetext')).toBeNull()
    })

    it('sets [indeterminate] host attribute', async () => {
      const el = await createProgressRing({indeterminate: true})
      expect(el.hasAttribute('indeterminate')).toBe(true)
    })

    it('switching from indeterminate to determinate restores aria attrs', async () => {
      const el = await createProgressRing({value: 50, indeterminate: true})
      expect(getBase(el).getAttribute('aria-valuenow')).toBeNull()

      el.indeterminate = false
      await settle(el)
      expect(getBase(el).getAttribute('aria-valuenow')).toBe('50')
      expect(getBase(el).getAttribute('aria-valuemin')).not.toBeNull()
      expect(getBase(el).getAttribute('aria-valuemax')).not.toBeNull()
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('ARIA attributes on base originate from headless getProgressProps()', async () => {
      const el = await createProgressRing({value: 3, min: 0, max: 10})
      const base = getBase(el)

      // These attributes should match what the headless contract produces,
      // not hardcoded values. Verify the rendered role comes from the contract.
      expect(base.getAttribute('role')).toBe('progressbar')
      expect(base.getAttribute('aria-valuenow')).toBe('3')
      expect(base.getAttribute('aria-valuemin')).toBe('0')
      expect(base.getAttribute('aria-valuemax')).toBe('10')
      expect(base.getAttribute('aria-valuetext')).toBe('30%')

      // Verify the base has an id attribute (generated by headless idBase)
      expect(base.hasAttribute('id')).toBe(true)
    })

    it('indeterminate contract omits aria value attributes from headless', async () => {
      const el = await createProgressRing({value: 50, indeterminate: true})
      const base = getBase(el)

      // Headless contract omits these in indeterminate mode
      expect(base.hasAttribute('aria-valuenow')).toBe(false)
      expect(base.hasAttribute('aria-valuemin')).toBe(false)
      expect(base.hasAttribute('aria-valuemax')).toBe(false)
      expect(base.hasAttribute('aria-valuetext')).toBe(false)

      // Role is always present
      expect(base.getAttribute('role')).toBe('progressbar')
    })
  })

  // --- Value handling ---

  describe('value handling', () => {
    it('clamps value to min when set below min', async () => {
      const el = await createProgressRing({value: -10, min: 0, max: 100})
      // Headless clamps; aria-valuenow should reflect the clamped value
      expect(getBase(el).getAttribute('aria-valuenow')).toBe('0')
    })

    it('clamps value to max when set above max', async () => {
      const el = await createProgressRing({value: 200, min: 0, max: 100})
      expect(getBase(el).getAttribute('aria-valuenow')).toBe('100')
    })

    it('percentage computation is reflected in SVG indicator stroke-dashoffset', async () => {
      const el = await createProgressRing({value: 50, min: 0, max: 100})
      const indicator = el.shadowRoot!.querySelector('[part="indicator"]') as SVGCircleElement
      expect(indicator).not.toBeNull()
      // The indicator should have a style attribute with stroke-dashoffset
      const style = indicator.getAttribute('style') ?? ''
      expect(style).toContain('stroke-dashoffset')
    })

    it('value changes update indicator stroke-dashoffset', async () => {
      const el = await createProgressRing({value: 25, min: 0, max: 100})
      const indicator = el.shadowRoot!.querySelector('[part="indicator"]') as SVGCircleElement
      const initialStyle = indicator.getAttribute('style') ?? ''

      el.value = 75
      await settle(el)
      const updatedStyle = indicator.getAttribute('style') ?? ''
      expect(updatedStyle).not.toBe(initialStyle)
    })

    it('renders correct percentage for custom range', async () => {
      const el = await createProgressRing({value: 3, min: 0, max: 10})
      expect(getBase(el).getAttribute('aria-valuetext')).toBe('30%')
    })

    it('value changes update aria-valuenow', async () => {
      const el = await createProgressRing({value: 5, max: 20})
      expect(getBase(el).getAttribute('aria-valuenow')).toBe('5')

      el.value = 10
      await settle(el)
      expect(getBase(el).getAttribute('aria-valuenow')).toBe('10')
    })
  })

  // --- Label slot ---

  describe('label slot', () => {
    it('default slot renders inside label part', async () => {
      const el = await createProgressRing()
      const label = el.shadowRoot!.querySelector('[part="label"]') as HTMLElement
      expect(label).not.toBeNull()
      const slot = label.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('label part is a span', async () => {
      const el = await createProgressRing()
      const label = el.shadowRoot!.querySelector('[part="label"]') as HTMLElement
      expect(label.tagName).toBe('SPAN')
    })
  })

  // --- value-text override ---

  describe('value-text override', () => {
    it('value-text attribute overrides default aria-valuetext percentage', async () => {
      const el = await createProgressRing({value: 3, max: 10})
      el.setAttribute('value-text', 'Step 3 of 10')
      await settle(el)
      expect(getBase(el).getAttribute('aria-valuetext')).toBe('Step 3 of 10')
    })

    it('value-text takes precedence over computed percentage', async () => {
      const el = await createProgressRing({value: 50, max: 100})
      el.setAttribute('value-text', 'Half done')
      await settle(el)
      expect(getBase(el).getAttribute('aria-valuetext')).toBe('Half done')
    })
  })
})
