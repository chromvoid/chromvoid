import {afterEach, describe, expect, it} from 'vitest'

import {CVSpinner} from './cv-spinner'

CVSpinner.define()

const settle = async (element: CVSpinner) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createSpinner = async (attrs?: Partial<CVSpinner>) => {
  const el = document.createElement('cv-spinner') as CVSpinner
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVSpinner) =>
  el.shadowRoot!.querySelector('[part="base"]') as SVGElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-spinner', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as an SVG element', async () => {
      const spinner = await createSpinner()
      const base = getBase(spinner)
      expect(base).not.toBeNull()
      expect(base.tagName.toLowerCase()).toBe('svg')
    })

    it('renders [part="track"] as a circle inside base', async () => {
      const spinner = await createSpinner()
      const track = spinner.shadowRoot!.querySelector('[part="track"]')
      expect(track).not.toBeNull()
      expect(track!.tagName.toLowerCase()).toBe('circle')
    })

    it('renders [part="indicator"] as a circle inside base', async () => {
      const spinner = await createSpinner()
      const indicator = spinner.shadowRoot!.querySelector('[part="indicator"]')
      expect(indicator).not.toBeNull()
      expect(indicator!.tagName.toLowerCase()).toBe('circle')
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('label defaults to "Loading"', async () => {
      const spinner = await createSpinner()
      expect(spinner.label).toBe('Loading')
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('role="progressbar" on base', async () => {
      const spinner = await createSpinner()
      expect(getBase(spinner).getAttribute('role')).toBe('progressbar')
    })

    it('aria-label is present on base', async () => {
      const spinner = await createSpinner()
      expect(getBase(spinner).hasAttribute('aria-label')).toBe(true)
      expect(getBase(spinner).getAttribute('aria-label')).toBe('Loading')
    })

    it('does NOT have aria-valuenow (indeterminate)', async () => {
      const spinner = await createSpinner()
      expect(getBase(spinner).hasAttribute('aria-valuenow')).toBe(false)
    })

    it('does NOT have aria-valuemin (indeterminate)', async () => {
      const spinner = await createSpinner()
      expect(getBase(spinner).hasAttribute('aria-valuemin')).toBe(false)
    })

    it('does NOT have aria-valuemax (indeterminate)', async () => {
      const spinner = await createSpinner()
      expect(getBase(spinner).hasAttribute('aria-valuemax')).toBe(false)
    })

    it('does NOT have aria-valuetext (indeterminate)', async () => {
      const spinner = await createSpinner()
      expect(getBase(spinner).hasAttribute('aria-valuetext')).toBe(false)
    })
  })

  // --- Label property ---

  describe('label property', () => {
    it('custom label is reflected in aria-label', async () => {
      const spinner = await createSpinner({label: 'Saving changes'})
      expect(getBase(spinner).getAttribute('aria-label')).toBe('Saving changes')
    })

    it('changing label updates aria-label on base', async () => {
      const spinner = await createSpinner()
      expect(getBase(spinner).getAttribute('aria-label')).toBe('Loading')

      spinner.label = 'Please wait'
      await settle(spinner)
      expect(getBase(spinner).getAttribute('aria-label')).toBe('Please wait')
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('ARIA attributes on base originate from headless getSpinnerProps()', async () => {
      const spinner = await createSpinner()
      const base = getBase(spinner)

      // The headless contract returns { role: 'progressbar', 'aria-label': string }
      // These must be present on the base element as rendered by the UIKit adapter
      expect(base.getAttribute('role')).toBe('progressbar')
      expect(base.getAttribute('aria-label')).toBe('Loading')
    })

    it('label update propagates through headless contract to DOM', async () => {
      const spinner = await createSpinner()
      spinner.label = 'Uploading'
      await settle(spinner)

      // After setLabel action, getSpinnerProps() should return updated aria-label
      expect(getBase(spinner).getAttribute('aria-label')).toBe('Uploading')
    })
  })
})
