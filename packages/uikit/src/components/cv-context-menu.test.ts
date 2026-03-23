import {afterEach, describe, expect, it} from 'vitest'

import {CVContextMenu} from './cv-context-menu'
import {CVMenuItem} from './cv-menu-item'

CVMenuItem.define()
CVContextMenu.define()

const settle = async (element: CVContextMenu) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

// --- mount helpers ---

async function mountContextMenu(params: {
  closeOnSelect?: boolean
  closeOnOutsidePointer?: boolean
  ariaLabel?: string
} = {}) {
  const menu = document.createElement('cv-context-menu') as CVContextMenu
  if (params.closeOnSelect === false) {
    menu.closeOnSelect = false
  }
  if (params.closeOnOutsidePointer === false) {
    menu.closeOnOutsidePointer = false
  }
  if (params.ariaLabel) {
    menu.ariaLabel = params.ariaLabel
  }

  menu.innerHTML = `
    <div slot="target">Right-click here</div>
    <cv-menu-item value="copy">Copy</cv-menu-item>
    <cv-menu-item value="paste">Paste</cv-menu-item>
    <cv-menu-item value="delete" disabled>Delete</cv-menu-item>
  `

  document.body.append(menu)
  await settle(menu)

  const target = menu.shadowRoot?.querySelector('[part="target"]') as HTMLElement
  const menuBox = menu.shadowRoot?.querySelector('[part="menu"]') as HTMLElement
  const items = Array.from(menu.querySelectorAll('cv-menu-item')) as CVMenuItem[]

  return {menu, target, menuBox, items}
}

async function mountWithSeparator() {
  const menu = document.createElement('cv-context-menu') as CVContextMenu

  menu.innerHTML = `
    <div slot="target">Right-click here</div>
    <cv-menu-item value="cut">Cut</cv-menu-item>
    <cv-menu-item value="copy">Copy</cv-menu-item>
    <cv-menu-item value="paste">Paste</cv-menu-item>
  `

  document.body.append(menu)
  await settle(menu)

  const target = menu.shadowRoot?.querySelector('[part="target"]') as HTMLElement
  const menuBox = menu.shadowRoot?.querySelector('[part="menu"]') as HTMLElement
  const items = Array.from(menu.querySelectorAll('cv-menu-item')) as CVMenuItem[]

  return {menu, target, menuBox, items}
}

// shadow DOM helpers

const getTarget = (el: CVContextMenu) =>
  el.shadowRoot!.querySelector('[part="target"]') as HTMLElement

const getMenuBox = (el: CVContextMenu) =>
  el.shadowRoot!.querySelector('[part="menu"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-context-menu', () => {
  // --- shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="target"] with tabindex="0"', async () => {
      const {target} = await mountContextMenu()
      expect(target).not.toBeNull()
      expect(target.getAttribute('tabindex')).toBe('0')
    })

    it('renders slot[name="target"] inside [part="target"]', async () => {
      const {menu} = await mountContextMenu()
      const target = getTarget(menu)
      const slot = target.querySelector('slot[name="target"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="menu"] with role="menu"', async () => {
      const {menuBox} = await mountContextMenu()
      expect(menuBox).not.toBeNull()
      expect(menuBox.getAttribute('role')).toBe('menu')
    })

    it('renders [part="menu"] with tabindex="-1"', async () => {
      const {menuBox} = await mountContextMenu()
      expect(menuBox.getAttribute('tabindex')).toBe('-1')
    })

    it('renders default slot inside [part="menu"]', async () => {
      const {menu} = await mountContextMenu()
      const menuBox = getMenuBox(menu)
      const slot = menuBox.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('[part="menu"] is hidden when not open', async () => {
      const {menuBox} = await mountContextMenu()
      expect(menuBox.hidden).toBe(true)
    })

    it('[part="menu"] is visible when open', async () => {
      const {menu, target, menuBox} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 50, clientY: 50}))
      await settle(menu)

      expect(menuBox.hidden).toBe(false)
    })
  })

  // --- default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const {menu} = await mountContextMenu()
      expect(menu.value).toBe('')
      expect(menu.open).toBe(false)
      expect(menu.anchorX).toBe(0)
      expect(menu.anchorY).toBe(0)
      expect(menu.closeOnSelect).toBe(true)
      expect(menu.closeOnOutsidePointer).toBe(true)
    })
  })

  // --- attribute reflection ---

  describe('attribute reflection', () => {
    it('open attribute reflects to DOM', async () => {
      const {menu, target} = await mountContextMenu()
      expect(menu.hasAttribute('open')).toBe(false)

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 50, clientY: 50}))
      await settle(menu)

      expect(menu.hasAttribute('open')).toBe(true)
    })

    it('value attribute reflects to DOM', async () => {
      const {menu, target, menuBox} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(menu)

      expect(menu.getAttribute('value')).toBeTruthy()
    })

    it('anchor-x and anchor-y reflect to DOM', async () => {
      const {menu, target} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 120, clientY: 70}))
      await settle(menu)

      expect(menu.getAttribute('anchor-x')).toBe('120')
      expect(menu.getAttribute('anchor-y')).toBe('70')
    })

    it('close-on-select attribute reflects to DOM', async () => {
      const {menu} = await mountContextMenu()
      expect(menu.hasAttribute('close-on-select')).toBe(true)
    })

    it('close-on-outside-pointer attribute reflects to DOM', async () => {
      const {menu} = await mountContextMenu()
      expect(menu.hasAttribute('close-on-outside-pointer')).toBe(true)
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('menu part has role="menu"', async () => {
      const {menuBox} = await mountContextMenu()
      expect(menuBox.getAttribute('role')).toBe('menu')
    })

    it('menu part has tabindex="-1"', async () => {
      const {menuBox} = await mountContextMenu()
      expect(menuBox.getAttribute('tabindex')).toBe('-1')
    })

    it('menu part has aria-label when provided', async () => {
      const {menuBox} = await mountContextMenu({ariaLabel: 'File actions'})
      expect(menuBox.getAttribute('aria-label')).toBe('File actions')
    })

    it('menu part has hidden when not open', async () => {
      const {menuBox} = await mountContextMenu()
      expect(menuBox.hidden).toBe(true)
    })

    it('menu part has data-anchor-x and data-anchor-y', async () => {
      const {menu, target, menuBox} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 200, clientY: 150}))
      await settle(menu)

      expect(menuBox.getAttribute('data-anchor-x')).toBe('200')
      expect(menuBox.getAttribute('data-anchor-y')).toBe('150')
    })

    it('target has an id attribute', async () => {
      const {target} = await mountContextMenu()
      expect(target.id).toBeTruthy()
      expect(target.id).toContain('target')
    })

    it('item elements receive role="menuitem" from headless contract', async () => {
      const {items} = await mountContextMenu()
      for (const item of items) {
        expect(item.getAttribute('role')).toBe('menuitem')
      }
    })

    it('item elements receive tabindex="-1" from headless contract', async () => {
      const {items} = await mountContextMenu()
      for (const item of items) {
        expect(item.getAttribute('tabindex')).toBe('-1')
      }
    })

    it('disabled item has aria-disabled="true"', async () => {
      const {items} = await mountContextMenu()
      const disabledItem = items.find((item) => item.value === 'delete')!
      expect(disabledItem.getAttribute('aria-disabled')).toBe('true')
    })
  })

  // --- events ---

  describe('events', () => {
    it('input event fires on state change with correct detail shape', async () => {
      const {menu, target} = await mountContextMenu()
      let inputDetail: unknown = null

      menu.addEventListener('cv-input', (event) => {
        inputDetail = (event as CustomEvent).detail
      })

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 100, clientY: 200}))
      await settle(menu)

      expect(inputDetail).not.toBeNull()
      expect(inputDetail).toHaveProperty('value')
      expect(inputDetail).toHaveProperty('activeId')
      expect(inputDetail).toHaveProperty('open')
      expect(inputDetail).toHaveProperty('anchorX')
      expect(inputDetail).toHaveProperty('anchorY')
      expect(inputDetail).toHaveProperty('openedBy')
    })

    it('change event fires only when value changes', async () => {
      const {menu, target, menuBox} = await mountContextMenu()
      let changeCount = 0
      let changeDetail: unknown = null

      menu.addEventListener('cv-change', (event) => {
        changeCount++
        changeDetail = (event as CustomEvent).detail
      })

      // Opening should NOT fire change (no value change)
      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)
      expect(changeCount).toBe(0)

      // Selecting should fire change
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(menu)

      expect(changeCount).toBeGreaterThan(0)
      expect(changeDetail).toHaveProperty('value')
      expect(changeDetail).toHaveProperty('activeId')
      expect(changeDetail).toHaveProperty('open')
      expect(changeDetail).toHaveProperty('anchorX')
      expect(changeDetail).toHaveProperty('anchorY')
      expect(changeDetail).toHaveProperty('openedBy')
    })

    it('input event detail includes anchorX and anchorY coordinates', async () => {
      const {menu, target} = await mountContextMenu()
      let inputDetail: {anchorX: number; anchorY: number} | null = null

      menu.addEventListener('cv-input', (event) => {
        inputDetail = (event as CustomEvent).detail
      })

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 300, clientY: 400}))
      await settle(menu)

      expect(inputDetail).not.toBeNull()
      expect(inputDetail!.anchorX).toBe(300)
      expect(inputDetail!.anchorY).toBe(400)
    })

    it('change event detail includes the selected value', async () => {
      const {menu, target, menuBox} = await mountContextMenu()
      let changeDetail: {value: string | null} | null = null

      menu.addEventListener('cv-change', (event) => {
        changeDetail = (event as CustomEvent).detail
      })

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(menu)

      expect(changeDetail).not.toBeNull()
      expect(changeDetail!.value).toBeTruthy()
    })
  })

  // --- context menu open via right-click ---

  describe('right-click trigger', () => {
    it('opens menu from contextmenu event at pointer coordinates', async () => {
      const {menu, target, menuBox} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 120, clientY: 70}))
      await settle(menu)

      expect(menu.open).toBe(true)
      expect(menu.anchorX).toBe(120)
      expect(menu.anchorY).toBe(70)
      expect(menuBox.hidden).toBe(false)
    })

    it('updates CSS custom properties for positioning', async () => {
      const {menu, target, menuBox} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 150, clientY: 250}))
      await settle(menu)

      const style = menuBox.getAttribute('style') || ''
      expect(style).toContain('150px')
      expect(style).toContain('250px')
    })
  })

  // --- keyboard open ---

  describe('keyboard open', () => {
    it('Shift+F10 opens menu', async () => {
      const {menu, target} = await mountContextMenu()

      target.dispatchEvent(new KeyboardEvent('keydown', {key: 'F10', shiftKey: true, bubbles: true}))
      await settle(menu)

      expect(menu.open).toBe(true)
    })

    it('ContextMenu key opens menu', async () => {
      const {menu, target} = await mountContextMenu()

      target.dispatchEvent(new KeyboardEvent('keydown', {key: 'ContextMenu', bubbles: true}))
      await settle(menu)

      expect(menu.open).toBe(true)
    })
  })

  // --- keyboard navigation (menu open) ---

  describe('keyboard navigation', () => {
    it('ArrowDown moves active to next enabled item', async () => {
      const {menu, target, menuBox, items} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(menu)

      // First enabled item should be active (copy)
      expect(items[0]!.active).toBe(true)
    })

    it('ArrowDown wraps around at the end', async () => {
      const {menu, target, menuBox, items} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      // Navigate past all enabled items: copy -> paste (skip delete disabled) -> wrap to copy
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(menu)

      // Should wrap back to first enabled item
      expect(items[0]!.active).toBe(true)
    })

    it('ArrowUp moves active to previous enabled item', async () => {
      const {menu, target, menuBox, items} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      // ArrowUp from start should wrap to last enabled item
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(menu)

      expect(items[1]!.active).toBe(true)
    })

    it('Home moves active to first enabled item', async () => {
      const {menu, target, menuBox, items} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      // Move to second item first
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(menu)

      // Then Home
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true}))
      await settle(menu)

      expect(items[0]!.active).toBe(true)
    })

    it('End moves active to last enabled item', async () => {
      const {menu, target, menuBox, items} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true}))
      await settle(menu)

      // Last enabled item should be active (paste, index 1, since delete is disabled)
      expect(items[1]!.active).toBe(true)
    })

    it('Enter selects the active item', async () => {
      const {menu, target, menuBox} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(menu)

      expect(menu.value).toBeTruthy()
      expect(menu.open).toBe(false)
    })

    it('Space selects the active item', async () => {
      const {menu, target, menuBox} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(menu)

      expect(menu.value).toBeTruthy()
      expect(menu.open).toBe(false)
    })

    it('Escape closes the menu', async () => {
      const {menu, target, menuBox} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)
      expect(menu.open).toBe(true)

      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(menu)

      expect(menu.open).toBe(false)
    })

    it('Tab closes the menu', async () => {
      const {menu, target, menuBox} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)
      expect(menu.open).toBe(true)

      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true}))
      await settle(menu)

      expect(menu.open).toBe(false)
    })
  })

  // --- item selection ---

  describe('item selection', () => {
    it('navigates and selects with keyboard Enter', async () => {
      const {menu, target, menuBox, items} = await mountContextMenu()
      const changes: Array<{value: string | null; activeId: string | null; open: boolean}> = []

      menu.addEventListener('cv-change', (event) => {
        changes.push((event as CustomEvent<{value: string | null; activeId: string | null; open: boolean}>).detail)
      })

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(menu)

      expect(menu.value).toBe('paste')
      expect(menu.open).toBe(false)
      expect(items[1]!.selected).toBe(true)
      expect(changes.at(-1)).toMatchObject({value: 'paste', activeId: null, open: false})
    })

    it('selects item on click', async () => {
      const {menu, target, items} = await mountContextMenu()
      let changeCount = 0

      menu.addEventListener('cv-change', () => {
        changeCount += 1
      })

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      items[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(menu)

      expect(menu.value).toBe('copy')
      expect(menu.open).toBe(false)
      expect(changeCount).toBe(1)
    })

    it('item.selected reflects the selected state', async () => {
      const {menu, target, items, menuBox} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(menu)

      expect(items[0]!.selected).toBe(true)
      expect(items[1]!.selected).toBe(false)
    })
  })

  // --- disabled item behavior ---

  describe('disabled items', () => {
    it('disabled item is skipped during keyboard navigation', async () => {
      const {menu, target, menuBox, items} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      // ArrowDown twice: should skip disabled "delete" and wrap
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(menu)

      // Should be on paste (index 1), not delete (index 2)
      expect(items[1]!.active).toBe(true)
      expect(items[2]!.active).toBe(false)
    })

    it('clicking disabled item does not select it', async () => {
      const {menu, target, items} = await mountContextMenu()
      let changeCount = 0

      menu.addEventListener('cv-change', () => {
        changeCount += 1
      })

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      items[2]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(menu)

      expect(menu.value).toBe('')
      expect(changeCount).toBe(0)
    })

    it('disabled item has data-active="false"', async () => {
      const {items} = await mountContextMenu()
      const disabledItem = items.find((item) => item.value === 'delete')!
      expect(disabledItem.getAttribute('data-active')).toBe('false')
    })
  })

  // --- dismiss behavior ---

  describe('dismiss behavior', () => {
    it('closes on outside pointer', async () => {
      const {menu, target} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)
      expect(menu.open).toBe(true)

      document.body.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true}))
      await settle(menu)

      expect(menu.open).toBe(false)
    })

    it('honors closeOnOutsidePointer=false', async () => {
      const {menu, target} = await mountContextMenu({closeOnOutsidePointer: false})

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)
      expect(menu.open).toBe(true)

      document.body.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true}))
      await settle(menu)

      expect(menu.open).toBe(true)
    })

    it('closes on Escape key', async () => {
      const {menu, target, menuBox} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(menu)

      expect(menu.open).toBe(false)
    })

    it('closes on item selection when closeOnSelect=true (default)', async () => {
      const {menu, target, items} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      items[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(menu)

      expect(menu.open).toBe(false)
    })

    it('stays open on item selection when closeOnSelect=false', async () => {
      const {menu, target, items} = await mountContextMenu({closeOnSelect: false})

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      items[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(menu)

      expect(menu.open).toBe(true)
    })
  })

  // --- imperative API ---

  describe('imperative API', () => {
    it('openAt(x, y) opens the menu at given coordinates', async () => {
      const {menu, menuBox} = await mountContextMenu()

      menu.openAt(200, 150)
      await settle(menu)

      expect(menu.open).toBe(true)
      expect(menu.anchorX).toBe(200)
      expect(menu.anchorY).toBe(150)
      expect(menuBox.hidden).toBe(false)
    })

    it('close() closes the menu', async () => {
      const {menu, menuBox} = await mountContextMenu()

      menu.openAt(200, 150)
      await settle(menu)
      expect(menu.open).toBe(true)

      menu.close()
      await settle(menu)

      expect(menu.open).toBe(false)
      expect(menuBox.hidden).toBe(true)
    })
  })

  // --- headless contract delegation ---

  describe('headless contract delegation', () => {
    it('target element receives id from headless getTargetProps()', async () => {
      const {target} = await mountContextMenu()
      expect(target.id).toBeTruthy()
    })

    it('menu element receives role from headless getMenuProps()', async () => {
      const {menuBox} = await mountContextMenu()
      expect(menuBox.getAttribute('role')).toBe('menu')
    })

    it('menu element receives data-anchor-x and data-anchor-y from headless', async () => {
      const {menu, target, menuBox} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 123, clientY: 456}))
      await settle(menu)

      expect(menuBox.getAttribute('data-anchor-x')).toBe('123')
      expect(menuBox.getAttribute('data-anchor-y')).toBe('456')
    })

    it('item elements receive id from headless getItemProps(id)', async () => {
      const {items} = await mountContextMenu()
      for (const item of items) {
        expect(item.id).toBeTruthy()
      }
    })

    it('item elements receive role="menuitem" from headless getItemProps(id)', async () => {
      const {items} = await mountContextMenu()
      for (const item of items) {
        expect(item.getAttribute('role')).toBe('menuitem')
      }
    })

    it('item elements receive data-active from headless getItemProps(id)', async () => {
      const {items} = await mountContextMenu()
      for (const item of items) {
        expect(item.hasAttribute('data-active')).toBe(true)
      }
    })

    it('disabled item receives aria-disabled="true" from headless', async () => {
      const {items} = await mountContextMenu()
      const disabledItem = items.find((item) => item.value === 'delete')!
      expect(disabledItem.getAttribute('aria-disabled')).toBe('true')
    })

    it('enabled items do not have aria-disabled', async () => {
      const {items} = await mountContextMenu()
      const enabledItem = items.find((item) => item.value === 'copy')!
      expect(enabledItem.hasAttribute('aria-disabled')).toBe(false)
    })
  })

  // --- parent-child coordination ---

  describe('parent-child coordination', () => {
    it('items are hidden when menu is closed', async () => {
      const {items} = await mountContextMenu()
      for (const item of items) {
        expect(item.hidden).toBe(true)
      }
    })

    it('items are visible when menu is open', async () => {
      const {menu, target, items} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      for (const item of items) {
        expect(item.hidden).toBe(false)
      }
    })

    it('active item has active=true, others have active=false', async () => {
      const {menu, target, menuBox, items} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(menu)

      expect(items[0]!.active).toBe(true)
      expect(items[1]!.active).toBe(false)
      expect(items[2]!.active).toBe(false)
    })

    it('selected item has selected=true after selection', async () => {
      const {menu, target, items} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      items[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(menu)

      expect(items[0]!.selected).toBe(false)
      expect(items[1]!.selected).toBe(true)
      expect(items[2]!.selected).toBe(false)
    })

    it('slot change rebuilds the model', async () => {
      const {menu, target, menuBox} = await mountContextMenu()

      // Add a new item dynamically
      const newItem = document.createElement('cv-menu-item') as CVMenuItem
      newItem.value = 'select-all'
      newItem.textContent = 'Select All'
      menu.appendChild(newItem)
      await settle(menu)

      // Open and navigate to the new item
      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)

      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true}))
      menuBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(menu)

      expect(menu.value).toBe('select-all')
    })
  })

  // --- dynamic state updates ---

  describe('dynamic state updates', () => {
    it('programmatic open=true opens the menu', async () => {
      const {menu, menuBox} = await mountContextMenu()

      menu.open = true
      await settle(menu)

      expect(menuBox.hidden).toBe(false)
    })

    it('programmatic open=false closes the menu', async () => {
      const {menu, target, menuBox} = await mountContextMenu()

      target.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 10, clientY: 10}))
      await settle(menu)
      expect(menu.open).toBe(true)

      menu.open = false
      await settle(menu)

      expect(menuBox.hidden).toBe(true)
    })

    it('programmatic value change updates selection', async () => {
      const {menu, items} = await mountContextMenu()

      menu.value = 'paste'
      await settle(menu)

      expect(items[1]!.selected).toBe(true)
    })
  })
})
