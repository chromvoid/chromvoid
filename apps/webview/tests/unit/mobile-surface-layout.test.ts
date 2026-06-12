import {afterEach, describe, expect, it} from 'vitest'

import {MobileSurfaceLayout} from '../../src/shared/ui/mobile-surface-layout'

function ensureDefined() {
  MobileSurfaceLayout.define()
}

async function renderLayout() {
  ensureDefined()
  const element = document.createElement('mobile-surface-layout') as MobileSurfaceLayout
  element.innerHTML = `
    <h2 slot="header">Header</h2>
    <p>Main</p>
    <footer slot="footer">Footer</footer>
  `
  document.body.appendChild(element)
  await element.updateComplete
  return element
}

afterEach(() => {
  document.querySelectorAll('mobile-surface-layout').forEach((element) => element.remove())
})

describe('MobileSurfaceLayout', () => {
  it('reflects variant and scroll attributes', async () => {
    const element = await renderLayout()

    element.variant = 'nested'
    element.scrollMode = 'external'
    await element.updateComplete

    expect(element.getAttribute('variant')).toBe('nested')
    expect(element.getAttribute('scroll')).toBe('external')
  })

  it('renders header, default, and footer slots', async () => {
    const element = await renderLayout()
    const headerSlot = element.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="header"]')
    const defaultSlot = element.shadowRoot?.querySelector<HTMLSlotElement>('slot:not([name])')
    const footerSlot = element.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="footer"]')

    expect(headerSlot?.assignedElements()).toHaveLength(1)
    expect(defaultSlot?.assignedElements()).toHaveLength(1)
    expect(footerSlot?.assignedElements()).toHaveLength(1)
  })

  it('uses an internal scroll part only when scroll is owned', async () => {
    const element = await renderLayout()

    expect(element.shadowRoot?.querySelector('[part~="scroll"]')).not.toBeNull()

    element.scrollMode = 'external'
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('[part~="scroll"]')).toBeNull()
    expect(element.shadowRoot?.querySelector('[part~="content"] slot:not([name])')).not.toBeNull()
  })
})
