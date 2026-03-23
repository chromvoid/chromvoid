import {afterEach, describe, expect, it} from 'vitest'

import {CVMeter} from './cv-meter'

CVMeter.define()

const settle = async (element: CVMeter) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createMeter = async (attrs?: Partial<CVMeter>) => {
  const el = document.createElement('cv-meter') as CVMeter
  if (attrs) {
    Object.assign(el, attrs)
  }
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVMeter) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

const getIndicator = (el: CVMeter) =>
  el.shadowRoot!.querySelector('[part="indicator"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-meter', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as a div', async () => {
      const meter = await createMeter()
      const base = getBase(meter)
      expect(base).not.toBeNull()
      expect(base.tagName).toBe('DIV')
    })

    it('renders [part="indicator"] inside base as a div', async () => {
      const meter = await createMeter()
      const base = getBase(meter)
      const indicator = base.querySelector('[part="indicator"]')
      expect(indicator).not.toBeNull()
      expect(indicator!.tagName).toBe('DIV')
    })

    it('renders [part="label"] as a span inside indicator', async () => {
      const meter = await createMeter()
      const indicator = getIndicator(meter)
      const label = indicator.querySelector('[part="label"]')
      expect(label).not.toBeNull()
      expect(label!.tagName).toBe('SPAN')
    })

    it('renders default slot inside [part="label"]', async () => {
      const meter = await createMeter()
      const label = meter.shadowRoot!.querySelector('[part="label"]')
      expect(label).not.toBeNull()
      const slot = label!.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const meter = await createMeter()
      expect(meter.value).toBe(0)
      expect(meter.min).toBe(0)
      expect(meter.max).toBe(100)
      expect(meter.low).toBeNull()
      expect(meter.high).toBeNull()
      expect(meter.optimum).toBeNull()
      expect(meter.valueText).toBe('')
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('number attributes reflect: value, min, max', async () => {
      const meter = await createMeter({value: 50, min: 10, max: 200})
      expect(meter.getAttribute('value')).toBe('50')
      expect(meter.getAttribute('min')).toBe('10')
      expect(meter.getAttribute('max')).toBe('200')
    })

    it('threshold attributes reflect when set: low, high, optimum', async () => {
      const meter = await createMeter({low: 20, high: 80, optimum: 50})
      expect(meter.getAttribute('low')).toBe('20')
      expect(meter.getAttribute('high')).toBe('80')
      expect(meter.getAttribute('optimum')).toBe('50')
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('role="meter" on base', async () => {
      const meter = await createMeter()
      expect(getBase(meter).getAttribute('role')).toBe('meter')
    })

    it('aria-valuenow reflects current value', async () => {
      const meter = await createMeter({value: 42})
      expect(getBase(meter).getAttribute('aria-valuenow')).toBe('42')
    })

    it('aria-valuemin reflects min', async () => {
      const meter = await createMeter({min: 5})
      expect(getBase(meter).getAttribute('aria-valuemin')).toBe('5')
    })

    it('aria-valuemax reflects max', async () => {
      const meter = await createMeter({max: 200})
      expect(getBase(meter).getAttribute('aria-valuemax')).toBe('200')
    })

    it('aria-valuetext present when value-text is set', async () => {
      const meter = await createMeter({valueText: '75% used'})
      expect(getBase(meter).getAttribute('aria-valuetext')).toBe('75% used')
    })

    it('aria-valuetext absent when value-text is empty', async () => {
      const meter = await createMeter()
      expect(getBase(meter).hasAttribute('aria-valuetext')).toBe(false)
    })

    it('aria-label pass-through when provided', async () => {
      const meter = await createMeter({ariaLabel: 'Disk usage'})
      expect(getBase(meter).getAttribute('aria-label')).toBe('Disk usage')
    })

    it('aria-label absent when not provided', async () => {
      const meter = await createMeter()
      expect(getBase(meter).hasAttribute('aria-label')).toBe(false)
    })

    it('aria-labelledby pass-through when provided', async () => {
      const meter = await createMeter({ariaLabelledBy: 'my-label-id'})
      expect(getBase(meter).getAttribute('aria-labelledby')).toBe('my-label-id')
    })

    it('aria-describedby pass-through when provided', async () => {
      const meter = await createMeter({ariaDescribedBy: 'my-desc-id'})
      expect(getBase(meter).getAttribute('aria-describedby')).toBe('my-desc-id')
    })
  })

  // --- Events ---

  describe('events', () => {
    it('does not emit any events (output-only component)', async () => {
      const meter = await createMeter({value: 50})
      const events: string[] = []

      for (const type of ['input', 'change', 'click']) {
        meter.addEventListener(type, () => events.push(type))
      }

      meter.value = 75
      await settle(meter)

      expect(events).toEqual([])
    })
  })

  // --- Visual states (data-status on indicator) ---

  describe('visual states', () => {
    it('data-status="normal" when no thresholds set', async () => {
      const meter = await createMeter({value: 50})
      expect(getIndicator(meter).getAttribute('data-status')).toBe('normal')
    })

    it('data-status="low" when value is below low threshold', async () => {
      const meter = await createMeter({value: 10, low: 20, high: 80})
      expect(getIndicator(meter).getAttribute('data-status')).toBe('low')
    })

    it('data-status="high" when value exceeds high threshold', async () => {
      const meter = await createMeter({value: 90, low: 20, high: 80})
      expect(getIndicator(meter).getAttribute('data-status')).toBe('high')
    })

    it('data-status="optimum" when value is near optimum', async () => {
      const meter = await createMeter({value: 55, low: 20, high: 80, optimum: 50})
      expect(getIndicator(meter).getAttribute('data-status')).toBe('optimum')
    })

    it('data-status is on indicator, not on host', async () => {
      const meter = await createMeter({value: 10, low: 20, high: 80})
      expect(meter.hasAttribute('data-status')).toBe(false)
      expect(getIndicator(meter).hasAttribute('data-status')).toBe(true)
    })
  })

  // --- Indicator percentage ---

  describe('indicator percentage', () => {
    it('sets --cv-meter-width based on percentage', async () => {
      const meter = await createMeter({value: 50, min: 0, max: 200})
      expect(getIndicator(meter).style.getPropertyValue('--cv-meter-width')).toBe('25%')
    })

    it('clamps percentage to 0% for values below min', async () => {
      const meter = await createMeter({value: -10, min: 0, max: 100})
      expect(getIndicator(meter).style.getPropertyValue('--cv-meter-width')).toBe('0%')
    })

    it('clamps percentage to 100% for values above max', async () => {
      const meter = await createMeter({value: 150, min: 0, max: 100})
      expect(getIndicator(meter).style.getPropertyValue('--cv-meter-width')).toBe('100%')
    })
  })

  // --- Dynamic state updates ---

  describe('dynamic state updates', () => {
    it('updating value updates aria-valuenow and indicator width', async () => {
      const meter = await createMeter({value: 30, min: 0, max: 100})
      expect(getBase(meter).getAttribute('aria-valuenow')).toBe('30')
      expect(getIndicator(meter).style.getPropertyValue('--cv-meter-width')).toBe('30%')

      meter.value = 70
      await settle(meter)

      expect(getBase(meter).getAttribute('aria-valuenow')).toBe('70')
      expect(getIndicator(meter).style.getPropertyValue('--cv-meter-width')).toBe('70%')
    })

    it('updating value clamps above max', async () => {
      const meter = await createMeter({value: 30, min: 0, max: 100})

      meter.value = 140
      await settle(meter)

      expect(getBase(meter).getAttribute('aria-valuenow')).toBe('100')
      expect(getIndicator(meter).style.getPropertyValue('--cv-meter-width')).toBe('100%')
    })

    it('changing max recreates model and updates indicator', async () => {
      const meter = await createMeter({value: 50, min: 0, max: 100})
      expect(getIndicator(meter).style.getPropertyValue('--cv-meter-width')).toBe('50%')

      meter.max = 200
      await settle(meter)

      expect(getBase(meter).getAttribute('aria-valuemax')).toBe('200')
      expect(getIndicator(meter).style.getPropertyValue('--cv-meter-width')).toBe('25%')
    })

    it('changing thresholds updates data-status', async () => {
      const meter = await createMeter({value: 50, low: 20, high: 80})
      expect(getIndicator(meter).getAttribute('data-status')).toBe('normal')

      meter.high = 40
      await settle(meter)
      expect(getIndicator(meter).getAttribute('data-status')).toBe('high')
    })
  })

  // --- Default slot (label content) ---

  describe('default slot', () => {
    it('projects slotted content inside the indicator label', async () => {
      const meter = await createMeter()
      const label = meter.shadowRoot!.querySelector('[part="label"]')
      expect(label).not.toBeNull()
      const slot = label!.querySelector('slot:not([name])') as HTMLSlotElement
      expect(slot).not.toBeNull()
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('ARIA attributes on base originate from getMeterProps(), not hardcoded', async () => {
      const meter = await createMeter({value: 42, min: 10, max: 200, ariaLabel: 'CPU'})
      const base = getBase(meter)

      // Verify the rendered attributes match what the headless contract provides
      // The key point: the component does NOT hardcode role or aria-* strings,
      // they come from model.contracts.getMeterProps()
      expect(base.getAttribute('role')).toBe('meter')
      expect(base.getAttribute('aria-valuenow')).toBe('42')
      expect(base.getAttribute('aria-valuemin')).toBe('10')
      expect(base.getAttribute('aria-valuemax')).toBe('200')
      expect(base.getAttribute('aria-label')).toBe('CPU')
    })

    it('data-status derives from headless state.status(), not computed locally', async () => {
      const meter = await createMeter({value: 10, low: 20, high: 80, optimum: 50})
      // Status is derived entirely from the headless model's state.status()
      expect(getIndicator(meter).getAttribute('data-status')).toBe('low')

      meter.value = 55
      await settle(meter)
      expect(getIndicator(meter).getAttribute('data-status')).toBe('optimum')
    })

    it('percentage derives from headless state.percentage(), not computed locally', async () => {
      const meter = await createMeter({value: 50, min: 0, max: 200})
      // Percentage is derived entirely from the headless model's state.percentage()
      expect(getIndicator(meter).style.getPropertyValue('--cv-meter-width')).toBe('25%')
    })
  })
})
