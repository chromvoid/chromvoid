import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVMenuButton} from './cv-menu-button'
import {CVMenuItem} from './cv-menu-item'

const settle = async (element: CVMenuButton) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

const initialInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
const initialInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')

async function mountMenuButton(params: {
  closeOnSelect?: boolean
  split?: boolean
  disabled?: boolean
  variant?: string
  size?: string
  content?: string
} = {}) {
  CVMenuItem.define()
  CVMenuButton.define()

  const menu = document.createElement('cv-menu-button') as CVMenuButton
  if (params.closeOnSelect === false) {
    menu.closeOnSelect = false
  }
  if (params.split) {
    menu.split = true
  }
  if (params.disabled) {
    menu.disabled = true
  }
  if (params.variant) {
    menu.variant = params.variant as CVMenuButton['variant']
  }
  if (params.size) {
    menu.size = params.size as CVMenuButton['size']
  }

  menu.innerHTML =
    params.content ??
    `
      Actions
      <cv-menu-item slot="menu" value="a">Alpha</cv-menu-item>
      <cv-menu-item slot="menu" value="b" disabled>Beta</cv-menu-item>
      <cv-menu-item slot="menu" value="c">Gamma</cv-menu-item>
    `

  document.body.append(menu)
  await settle(menu)

  const trigger = menu.shadowRoot?.querySelector('[part="trigger"]') as HTMLButtonElement | null
  const actionBtn = menu.shadowRoot?.querySelector('[part="action"]') as HTMLButtonElement | null
  const dropdownBtn = menu.shadowRoot?.querySelector('[part="dropdown"]') as HTMLButtonElement | null
  const base = menu.shadowRoot?.querySelector('[part="base"]') as HTMLElement | null
  const menuBox = menu.shadowRoot?.querySelector('[part="menu"]') as HTMLElement
  const items = Array.from(menu.querySelectorAll('cv-menu-item')) as CVMenuItem[]

  return {menu, trigger, actionBtn, dropdownBtn, base, menuBox, items}
}

function mockRect(
  element: HTMLElement,
  rect: {left: number; top: number; width: number; height: number},
) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        x: rect.left,
        y: rect.top,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        toJSON: () => rect,
      }) as DOMRect,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  if (initialInnerWidth) {
    Object.defineProperty(window, 'innerWidth', initialInnerWidth)
  }
  if (initialInnerHeight) {
    Object.defineProperty(window, 'innerHeight', initialInnerHeight)
  }
  document.body.innerHTML = ''
})

describe('cv-menu-button', () => {
  it('opens and closes on trigger click', async () => {
    const {menu, trigger, menuBox} = await mountMenuButton()

    trigger!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(menu)

    expect(menu.open).toBe(true)
    expect(menuBox.hidden).toBe(false)

    trigger!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(menu)

    expect(menu.open).toBe(false)
    expect(menuBox.hidden).toBe(true)
  })

  it('supports keyboard open/navigation and selection', async () => {
    const {menu, trigger, items} = await mountMenuButton()
    const changes: Array<{value: string | null; activeId: string | null; open: boolean}> = []

    menu.addEventListener('cv-change', (event) => {
      changes.push((event as CustomEvent<{value: string | null; activeId: string | null; open: boolean}>).detail)
    })

    trigger!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
    trigger!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
    trigger!.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
    await settle(menu)

    expect(menu.value).toBe('c')
    expect(menu.open).toBe(false)
    expect(items[2]!.selected).toBe(true)
    expect(changes.at(-1)).toEqual({value: 'c', activeId: null, open: false})
  })

  it('selects item on click and emits change', async () => {
    const {menu, trigger, items} = await mountMenuButton()
    let changeCount = 0

    menu.addEventListener('cv-change', () => {
      changeCount += 1
    })

    trigger!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(menu)

    items[2]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(menu)

    expect(menu.value).toBe('c')
    expect(menu.open).toBe(false)
    expect(changeCount).toBe(1)
  })

  it('closes on outside pointer', async () => {
    const {menu, trigger} = await mountMenuButton()

    trigger!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(menu)
    expect(menu.open).toBe(true)

    document.body.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true}))
    await settle(menu)

    expect(menu.open).toBe(false)
  })

  it('keeps menu open when closeOnSelect is false', async () => {
    const {menu, trigger, items} = await mountMenuButton({closeOnSelect: false})

    trigger!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(menu)
    expect(menu.open).toBe(true)

    items[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(menu)

    expect(menu.value).toBe('a')
    expect(menu.open).toBe(true)
  })

  it('keeps fallback-positioned menu inside the viewport near the left edge', async () => {
    const {menu, trigger, base, menuBox} = await mountMenuButton()
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 320})
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 480})

    mockRect(base!, {left: 0, top: 404, width: 36, height: 36})
    mockRect(menuBox, {left: 0, top: 0, width: 180, height: 120})

    trigger!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(menu)

    expect(menuBox.style.position).toBe('absolute')
    expect(parseFloat(menuBox.style.left)).toBeCloseTo(8, 3)
    expect(parseFloat(menuBox.style.top)).toBeCloseTo(-124, 3)
  })

  it('keeps fallback-positioned menu inside the viewport near the right edge', async () => {
    const {menu, trigger, base, menuBox} = await mountMenuButton()
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 320})
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 480})

    mockRect(base!, {left: 280, top: 120, width: 36, height: 36})
    mockRect(menuBox, {left: 0, top: 0, width: 180, height: 100})

    trigger!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(menu)

    expect(menuBox.style.position).toBe('absolute')
    expect(parseFloat(menuBox.style.left)).toBeCloseTo(-148, 3)
    expect(parseFloat(menuBox.style.top)).toBeCloseTo(40, 3)
  })

  it('uses the trigger width as the floor for popup min-width without stretching to the viewport', async () => {
    const {menu, trigger, base, menuBox} = await mountMenuButton()
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 320})
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 480})

    mockRect(base!, {left: 24, top: 120, width: 240, height: 36})
    mockRect(menuBox, {left: 0, top: 0, width: 240, height: 100})

    trigger!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(menu)

    expect(menuBox.style.minWidth).toBe('240px')
    expect(parseFloat(menuBox.style.left)).toBeCloseTo(0, 3)
  })

  describe('slots', () => {
    it('renders default slot for label text', async () => {
      const {menu} = await mountMenuButton()
      const labelPart = menu.shadowRoot?.querySelector('[part="label"]')
      expect(labelPart).not.toBeNull()
      const slot = labelPart?.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('renders prefix slot', async () => {
      const {menu} = await mountMenuButton()
      const prefixPart = menu.shadowRoot?.querySelector('[part="prefix"]')
      expect(prefixPart).not.toBeNull()
      const slot = prefixPart?.querySelector('slot[name="prefix"]')
      expect(slot).not.toBeNull()
    })

    it('renders suffix slot', async () => {
      const {menu} = await mountMenuButton()
      const suffixPart = menu.shadowRoot?.querySelector('[part="suffix"]')
      expect(suffixPart).not.toBeNull()
      const slot = suffixPart?.querySelector('slot[name="suffix"]')
      expect(slot).not.toBeNull()
    })

    it('hides empty prefix and suffix parts when they have no content', async () => {
      const {menu} = await mountMenuButton()
      const prefixPart = menu.shadowRoot?.querySelector('[part="prefix"]') as HTMLElement | null
      const labelPart = menu.shadowRoot?.querySelector('[part="label"]') as HTMLElement | null
      const suffixPart = menu.shadowRoot?.querySelector('[part="suffix"]') as HTMLElement | null

      expect(prefixPart?.hidden).toBe(true)
      expect(labelPart?.hidden).toBe(false)
      expect(suffixPart?.hidden).toBe(true)
    })

    it('hides empty label and suffix parts for prefix-only content', async () => {
      const {menu} = await mountMenuButton({
        content: `
          <span slot="prefix">icon</span>
          <cv-menu-item slot="menu" value="a">Alpha</cv-menu-item>
          <cv-menu-item slot="menu" value="b" disabled>Beta</cv-menu-item>
          <cv-menu-item slot="menu" value="c">Gamma</cv-menu-item>
        `,
      })
      const prefixPart = menu.shadowRoot?.querySelector('[part="prefix"]') as HTMLElement | null
      const labelPart = menu.shadowRoot?.querySelector('[part="label"]') as HTMLElement | null
      const suffixPart = menu.shadowRoot?.querySelector('[part="suffix"]') as HTMLElement | null

      expect(prefixPart?.hidden).toBe(false)
      expect(labelPart?.hidden).toBe(true)
      expect(suffixPart?.hidden).toBe(true)
    })

    it('renders menu slot for items', async () => {
      const {menuBox} = await mountMenuButton()
      const slot = menuBox?.querySelector('slot[name="menu"]')
      expect(slot).not.toBeNull()
    })
  })

  describe('CSS parts', () => {
    it('has base part', async () => {
      const {menu} = await mountMenuButton()
      expect(menu.shadowRoot?.querySelector('[part="base"]')).not.toBeNull()
    })

    it('has trigger part in standard mode', async () => {
      const {trigger} = await mountMenuButton()
      expect(trigger).not.toBeNull()
    })

    it('has menu part', async () => {
      const {menuBox} = await mountMenuButton()
      expect(menuBox).not.toBeNull()
    })

    it('has label part', async () => {
      const {menu} = await mountMenuButton()
      expect(menu.shadowRoot?.querySelector('[part="label"]')).not.toBeNull()
    })

    it('has prefix part', async () => {
      const {menu} = await mountMenuButton()
      expect(menu.shadowRoot?.querySelector('[part="prefix"]')).not.toBeNull()
    })

    it('has suffix part', async () => {
      const {menu} = await mountMenuButton()
      expect(menu.shadowRoot?.querySelector('[part="suffix"]')).not.toBeNull()
    })

    it('has dropdown-icon part', async () => {
      const {menu} = await mountMenuButton()
      expect(menu.shadowRoot?.querySelector('[part="dropdown-icon"]')).not.toBeNull()
    })
  })

  describe('disabled', () => {
    it('reflects disabled attribute on host', async () => {
      const {menu} = await mountMenuButton({disabled: true})
      expect(menu.hasAttribute('disabled')).toBe(true)
    })

    it('disables the trigger button', async () => {
      const {trigger} = await mountMenuButton({disabled: true})
      expect(trigger!.disabled).toBe(true)
    })

    it('does not open on trigger click when disabled', async () => {
      const {menu, trigger} = await mountMenuButton({disabled: true})
      trigger!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(menu)
      expect(menu.open).toBe(false)
    })
  })

  describe('split-button mode', () => {
    it('renders action and dropdown parts instead of trigger', async () => {
      const {trigger, actionBtn, dropdownBtn} = await mountMenuButton({split: true})
      expect(trigger).toBeNull()
      expect(actionBtn).not.toBeNull()
      expect(dropdownBtn).not.toBeNull()
    })

    it('opens menu on dropdown click', async () => {
      const {menu, dropdownBtn, menuBox} = await mountMenuButton({split: true})
      dropdownBtn!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(menu)

      expect(menu.open).toBe(true)
      expect(menuBox.hidden).toBe(false)
    })

    it('dispatches cv-action on action button click', async () => {
      const {menu, actionBtn} = await mountMenuButton({split: true})
      let actionFired = false

      menu.addEventListener('cv-action', () => {
        actionFired = true
      })

      actionBtn!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(menu)

      expect(actionFired).toBe(true)
      expect(menu.open).toBe(false) // action click does NOT open menu
    })

    it('action button does not toggle menu', async () => {
      const {menu, actionBtn} = await mountMenuButton({split: true})

      actionBtn!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(menu)

      expect(menu.open).toBe(false)
    })

    it('disables both buttons when disabled', async () => {
      const {actionBtn, dropdownBtn} = await mountMenuButton({split: true, disabled: true})
      expect(actionBtn!.disabled).toBe(true)
      expect(dropdownBtn!.disabled).toBe(true)
    })

    it('has dropdown-icon in dropdown button', async () => {
      const {dropdownBtn} = await mountMenuButton({split: true})
      const icon = dropdownBtn?.querySelector('[part="dropdown-icon"]')
      expect(icon).not.toBeNull()
    })

    it('has label, prefix, suffix parts in action button', async () => {
      const {actionBtn} = await mountMenuButton({split: true})
      expect(actionBtn?.querySelector('[part="label"]')).not.toBeNull()
      expect(actionBtn?.querySelector('[part="prefix"]')).not.toBeNull()
      expect(actionBtn?.querySelector('[part="suffix"]')).not.toBeNull()
    })
  })

  describe('variants', () => {
    it('reflects variant attribute', async () => {
      const {menu} = await mountMenuButton({variant: 'primary'})
      expect(menu.getAttribute('variant')).toBe('primary')
    })

    it('defaults to default variant', async () => {
      const {menu} = await mountMenuButton()
      expect(menu.variant).toBe('default')
    })
  })

  describe('sizes', () => {
    it('reflects size attribute', async () => {
      const {menu} = await mountMenuButton({size: 'small'})
      expect(menu.getAttribute('size')).toBe('small')
    })

    it('defaults to medium size', async () => {
      const {menu} = await mountMenuButton()
      expect(menu.size).toBe('medium')
    })
  })
})
