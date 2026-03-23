import {afterEach, describe, expect, it} from 'vitest'

import {CVMenu} from './cv-menu'
import {CVMenuItem} from './cv-menu-item'

CVMenu.define()
CVMenuItem.define()

const settle = async (element: CVMenuItem | CVMenu) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

const createItem = async (attrs?: Partial<CVMenuItem>) => {
  const el = document.createElement('cv-menu-item') as CVMenuItem
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const createItemWithSlots = async (innerHTML: string, attrs?: Partial<CVMenuItem>) => {
  const el = document.createElement('cv-menu-item') as CVMenuItem
  if (attrs) Object.assign(el, attrs)
  el.innerHTML = innerHTML
  document.body.append(el)
  await settle(el)
  return el
}

/**
 * Mount an item inside a cv-menu so it gets ARIA attributes from headless contracts.
 */
async function mountItemInMenu(params: {
  itemAttrs?: string
  itemText?: string
  open?: boolean
} = {}) {
  const menu = document.createElement('cv-menu') as CVMenu
  if (params.open !== false) {
    menu.open = true
  }

  const itemText = params.itemText ?? 'Action'
  const itemAttrs = params.itemAttrs ?? 'value="action"'

  menu.innerHTML = `
    <cv-menu-item ${itemAttrs}>${itemText}</cv-menu-item>
  `

  document.body.append(menu)
  await settle(menu)

  const item = menu.querySelector('cv-menu-item') as CVMenuItem
  return {menu, item}
}

const getBase = (el: CVMenuItem) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-menu-item', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] element', async () => {
      const item = await createItem()
      const base = getBase(item)
      expect(base).not.toBeNull()
    })

    it('renders a default slot inside base for label', async () => {
      const item = await createItem()
      const slot = item.shadowRoot!.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('renders [part="base"] as the item root wrapper', async () => {
      const item = await createItem()
      const base = getBase(item)
      expect(base).not.toBeNull()
      expect(base.tagName.toLowerCase()).toBe('div')
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const item = await createItem()
      expect(item.value).toBe('')
      expect(item.disabled).toBe(false)
      expect(item.active).toBe(false)
      expect(item.selected).toBe(false)
    })
  })

  // --- Slots ---

  describe('slots', () => {
    it('default slot renders label text', async () => {
      const item = await createItemWithSlots('Cut')
      const slot = item.shadowRoot!.querySelector('slot:not([name])') as HTMLSlotElement
      expect(slot).not.toBeNull()
    })

    it('prefix slot is available for content', async () => {
      const item = await createItemWithSlots(
        '<span slot="prefix">icon</span>Label',
      )
      const prefixSlot = item.shadowRoot!.querySelector('slot[name="prefix"]')
      // prefix slot may not exist yet in current implementation (RED state expected)
      // This test defines the expected behavior from the spec
      expect(prefixSlot).not.toBeNull()
    })

    it('suffix slot is available for content', async () => {
      const item = await createItemWithSlots(
        'Label<span slot="suffix">Ctrl+X</span>',
      )
      const suffixSlot = item.shadowRoot!.querySelector('slot[name="suffix"]')
      // suffix slot may not exist yet in current implementation (RED state expected)
      expect(suffixSlot).not.toBeNull()
    })

    it('submenu slot is available for nested menu', async () => {
      const item = await createItemWithSlots(
        'Share<cv-menu slot="submenu"><cv-menu-item value="email">Email</cv-menu-item></cv-menu>',
      )
      const submenuSlot = item.shadowRoot!.querySelector('slot[name="submenu"]')
      // submenu slot may not exist yet (RED state expected)
      expect(submenuSlot).not.toBeNull()
    })
  })

  // --- Visual states ---

  describe('visual states', () => {
    it('[disabled] attribute reflects on host', async () => {
      const item = await createItem({disabled: true})
      expect(item.hasAttribute('disabled')).toBe(true)
    })

    it('[active] attribute reflects on host', async () => {
      const item = await createItem({active: true})
      expect(item.hasAttribute('active')).toBe(true)
    })

    it('[selected] attribute reflects on host', async () => {
      const item = await createItem({selected: true})
      expect(item.hasAttribute('selected')).toBe(true)
    })

    it('[checked] attribute reflects on host for checkable items', async () => {
      // checked property may not exist yet on the current implementation (RED state expected)
      const item = await createItem()
      ;(item as any).checked = true
      await settle(item)
      expect(item.hasAttribute('checked')).toBe(true)
    })

    it('[has-submenu] attribute reflects when submenu is present', async () => {
      // has-submenu may not exist yet (RED state expected)
      const item = await createItemWithSlots(
        'Share<cv-menu slot="submenu"><cv-menu-item value="email">Email</cv-menu-item></cv-menu>',
      )
      // The component should detect the submenu slot and add has-submenu
      expect(item.hasAttribute('has-submenu')).toBe(true)
    })
  })

  // --- Checkable items ---

  describe('checkable items', () => {
    it('checkbox type item has type="checkbox" property', async () => {
      // type property may not exist yet (RED state expected)
      const item = await createItem()
      ;(item as any).type = 'checkbox'
      await settle(item)
      expect((item as any).type).toBe('checkbox')
    })

    it('radio type item has type="radio" property', async () => {
      const item = await createItem()
      ;(item as any).type = 'radio'
      await settle(item)
      expect((item as any).type).toBe('radio')
    })

    it('default type is "normal"', async () => {
      const item = await createItem()
      // type may default to "normal" or "" depending on implementation
      expect((item as any).type === 'normal' || (item as any).type === undefined || (item as any).type === '').toBe(true)
    })

    it('checked property defaults to false', async () => {
      const item = await createItem()
      expect((item as any).checked === false || (item as any).checked === undefined).toBe(true)
    })

    it('checkbox type renders checkmark part when checked', async () => {
      // checkmark part may not exist yet (RED state expected)
      const item = await createItem()
      ;(item as any).type = 'checkbox'
      ;(item as any).checked = true
      await settle(item)
      const checkmark = item.shadowRoot!.querySelector('[part="checkmark"]')
      expect(checkmark).not.toBeNull()
    })
  })

  // --- Submenu ---

  describe('submenu', () => {
    it('submenu slot renders nested menu', async () => {
      const item = await createItemWithSlots(
        'Share<cv-menu slot="submenu"><cv-menu-item value="email">Email</cv-menu-item></cv-menu>',
      )
      const submenuSlot = item.shadowRoot!.querySelector('slot[name="submenu"]')
      expect(submenuSlot).not.toBeNull()
    })

    it('submenu-icon part renders when submenu is present', async () => {
      const item = await createItemWithSlots(
        'Share<cv-menu slot="submenu"><cv-menu-item value="email">Email</cv-menu-item></cv-menu>',
      )
      const submenuIcon = item.shadowRoot!.querySelector('[part="submenu-icon"]')
      // submenu-icon may not exist yet (RED state expected)
      expect(submenuIcon).not.toBeNull()
    })
  })

  // --- ARIA (when item is inside a menu and gets contract props) ---

  describe('ARIA', () => {
    it('gets role="menuitem" from headless contracts when inside menu', async () => {
      const {item} = await mountItemInMenu()
      expect(item.getAttribute('role')).toBe('menuitem')
    })

    it('gets aria-disabled from headless contracts when disabled', async () => {
      const {item} = await mountItemInMenu({itemAttrs: 'value="action" disabled'})
      expect(item.getAttribute('aria-disabled')).toBe('true')
    })

    it('gets tabindex="-1" from headless contracts', async () => {
      const {item} = await mountItemInMenu()
      expect(item.getAttribute('tabindex')).toBe('-1')
    })

    it('checkbox type item gets role="menuitemcheckbox" from headless contracts', async () => {
      // This requires headless to support type on items. RED state expected.
      const {item} = await mountItemInMenu({itemAttrs: 'value="action" type="checkbox"'})
      expect(item.getAttribute('role')).toBe('menuitemcheckbox')
    })

    it('radio type item gets role="menuitemradio" from headless contracts', async () => {
      // This requires headless to support type on items. RED state expected.
      const {item} = await mountItemInMenu({itemAttrs: 'value="action" type="radio"'})
      expect(item.getAttribute('role')).toBe('menuitemradio')
    })

    it('checkbox item gets aria-checked from headless contracts', async () => {
      const {item} = await mountItemInMenu({itemAttrs: 'value="action" type="checkbox" checked'})
      expect(item.getAttribute('aria-checked')).toBe('true')
    })

    it('submenu item gets aria-haspopup="menu" from headless contracts', async () => {
      // Submenu support needs to be wired. RED state expected.
      const menu = document.createElement('cv-menu') as CVMenu
      menu.open = true
      menu.innerHTML = `
        <cv-menu-item value="share">
          Share
          <cv-menu slot="submenu">
            <cv-menu-item value="email">Email</cv-menu-item>
          </cv-menu>
        </cv-menu-item>
      `
      document.body.append(menu)
      await settle(menu)

      const item = menu.querySelector('cv-menu-item[value="share"]') as CVMenuItem
      expect(item.getAttribute('aria-haspopup')).toBe('menu')
    })
  })
})
