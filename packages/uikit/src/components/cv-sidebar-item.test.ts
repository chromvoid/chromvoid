import {afterEach, describe, expect, it} from 'vitest'

import {CVSidebarItem} from './cv-sidebar-item'

CVSidebarItem.define()

const settle = async (element: CVSidebarItem) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createItem = async (attrs?: Partial<CVSidebarItem>) => {
  const el = document.createElement('cv-sidebar-item') as CVSidebarItem
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-sidebar-item', () => {
  it('renders anchor anatomy with prefix, label, and suffix parts', async () => {
    const el = await createItem({href: '#alpha'})
    const anchor = el.shadowRoot!.querySelector('[part="base"]') as HTMLAnchorElement

    expect(anchor.tagName).toBe('A')
    expect(el.shadowRoot!.querySelector('[part="prefix"]')).toBeTruthy()
    expect(el.shadowRoot!.querySelector('[part="label"]')).toBeTruthy()
    expect(el.shadowRoot!.querySelector('[part="suffix"]')).toBeTruthy()
    expect(anchor.getAttribute('href')).toBe('#alpha')
  })

  it('reflects active state as aria-current', async () => {
    const el = await createItem({href: '#alpha', active: true})
    const anchor = el.shadowRoot!.querySelector('[part="base"]') as HTMLAnchorElement

    expect(el.hasAttribute('active')).toBe(true)
    expect(anchor.getAttribute('aria-current')).toBe('location')
  })

  it('prevents interaction when disabled', async () => {
    const el = await createItem({href: '#alpha', disabled: true})
    const anchor = el.shadowRoot!.querySelector('[part="base"]') as HTMLAnchorElement
    let prevented = false

    anchor.addEventListener('click', (event) => {
      prevented = event.defaultPrevented
    })

    anchor.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, composed: true}))
    await settle(el)

    expect(el.hasAttribute('disabled')).toBe(true)
    expect(anchor.hasAttribute('href')).toBe(false)
    expect(anchor.getAttribute('aria-disabled')).toBe('true')
    expect(prevented).toBe(true)
  })

  it('keeps label content available in collapsed rail mode', async () => {
    const el = await createItem({href: '#alpha'})
    el.textContent = 'Threats'
    el.setAttribute('data-sidebar-collapsed', '')
    await settle(el)

    expect(el.textContent).toContain('Threats')
    const slot = el.shadowRoot!.querySelector('[part="label"] slot') as HTMLSlotElement | null
    expect(slot?.assignedNodes().map((node) => node.textContent).join('')).toContain('Threats')
  })
})
