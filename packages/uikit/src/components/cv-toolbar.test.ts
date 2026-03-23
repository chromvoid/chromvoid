import {afterEach, describe, expect, it} from 'vitest'

import {CVToolbar} from './cv-toolbar'
import {CVToolbarItem} from './cv-toolbar-item'

CVToolbar.define()
CVToolbarItem.define()

const settle = async (element: CVToolbar) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createItem = (value: string, label: string, opts?: {disabled?: boolean}) => {
  const item = document.createElement('cv-toolbar-item') as CVToolbarItem
  item.value = value
  item.textContent = label
  if (opts?.disabled) item.disabled = true
  return item
}

const createSeparator = (value?: string) => {
  const sep = document.createElement('cv-toolbar-separator')
  if (value) sep.setAttribute('value', value)
  return sep
}

const createToolbar = async (
  items: Array<{type: 'item'; value: string; label: string; disabled?: boolean} | {type: 'separator'; value?: string}>,
  attrs?: {orientation?: 'horizontal' | 'vertical'; wrap?: boolean; 'aria-label'?: string; value?: string},
) => {
  const toolbar = document.createElement('cv-toolbar') as CVToolbar
  if (attrs?.orientation) toolbar.orientation = attrs.orientation
  if (attrs?.wrap !== undefined) toolbar.wrap = attrs.wrap
  if (attrs?.['aria-label']) toolbar.setAttribute('aria-label', attrs['aria-label'])
  if (attrs?.value) toolbar.value = attrs.value

  for (const def of items) {
    if (def.type === 'item') {
      toolbar.append(createItem(def.value, def.label, {disabled: def.disabled}))
    } else {
      toolbar.append(createSeparator(def.value))
    }
  }

  document.body.append(toolbar)
  await settle(toolbar)
  return toolbar
}

const getBase = (toolbar: CVToolbar) =>
  toolbar.shadowRoot!.querySelector('[part="base"]') as HTMLElement

const getItems = (toolbar: CVToolbar) =>
  Array.from(toolbar.querySelectorAll('cv-toolbar-item')) as CVToolbarItem[]

const pressKey = async (toolbar: CVToolbar, key: string) => {
  const base = getBase(toolbar)
  base.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}))
  await settle(toolbar)
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-toolbar', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as a div element', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
      ])
      const base = getBase(toolbar)
      expect(base).not.toBeNull()
      expect(base.tagName.toLowerCase()).toBe('div')
    })

    it('renders [part="base"] with role="toolbar"', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
      ])
      const base = getBase(toolbar)
      expect(base.getAttribute('role')).toBe('toolbar')
    })

    it('renders a default slot inside [part="base"]', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
      ])
      const base = getBase(toolbar)
      const slot = base.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
      ])
      expect(toolbar.orientation).toBe('horizontal')
      expect(toolbar.wrap).toBe(true)
      expect(toolbar.ariaLabel).toBe('')
    })

    it('value defaults to first item when no explicit value set', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
      ])
      expect(toolbar.value).toBe('a')
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('orientation attribute reflects to DOM', async () => {
      const toolbar = await createToolbar(
        [{type: 'item', value: 'a', label: 'A'}],
        {orientation: 'vertical'},
      )
      expect(toolbar.getAttribute('orientation')).toBe('vertical')
    })

    it('wrap attribute reflects to DOM as boolean', async () => {
      const toolbar = await createToolbar(
        [{type: 'item', value: 'a', label: 'A'}],
        {wrap: true},
      )
      expect(toolbar.hasAttribute('wrap')).toBe(true)
    })

    it('value attribute reflects to DOM', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
      ])
      expect(toolbar.getAttribute('value')).toBe('a')
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('role="toolbar" on [part="base"]', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
      ])
      expect(getBase(toolbar).getAttribute('role')).toBe('toolbar')
    })

    it('aria-orientation defaults to "horizontal"', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
      ])
      expect(getBase(toolbar).getAttribute('aria-orientation')).toBe('horizontal')
    })

    it('aria-orientation reflects orientation attribute', async () => {
      const toolbar = await createToolbar(
        [{type: 'item', value: 'a', label: 'A'}],
        {orientation: 'vertical'},
      )
      expect(getBase(toolbar).getAttribute('aria-orientation')).toBe('vertical')
    })

    it('aria-label is set when provided', async () => {
      const toolbar = await createToolbar(
        [{type: 'item', value: 'a', label: 'A'}],
        {'aria-label': 'Text formatting'},
      )
      expect(getBase(toolbar).getAttribute('aria-label')).toBe('Text formatting')
    })

    it('active item has tabindex="0", others have tabindex="-1"', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
        {type: 'item', value: 'c', label: 'C'},
      ])
      const items = getItems(toolbar)
      expect(items[0].tabIndex).toBe(0)
      expect(items[1].tabIndex).toBe(-1)
      expect(items[2].tabIndex).toBe(-1)
    })

    it('disabled item has aria-disabled="true"', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B', disabled: true},
      ])
      const items = getItems(toolbar)
      expect(items[1].getAttribute('aria-disabled')).toBe('true')
    })
  })

  // --- cv-toolbar-item defaults and reflection ---

  describe('cv-toolbar-item', () => {
    it('has correct default property values', async () => {
      const item = document.createElement('cv-toolbar-item') as CVToolbarItem
      expect(item.value).toBe('')
      expect(item.disabled).toBe(false)
      expect(item.active).toBe(false)
    })

    it('renders [part="base"] as a div element', async () => {
      const item = document.createElement('cv-toolbar-item') as CVToolbarItem
      document.body.append(item)
      await item.updateComplete
      const base = item.shadowRoot!.querySelector('[part="base"]')
      expect(base).not.toBeNull()
      expect(base!.tagName.toLowerCase()).toBe('div')
    })

    it('renders a default slot inside [part="base"]', async () => {
      const item = document.createElement('cv-toolbar-item') as CVToolbarItem
      document.body.append(item)
      await item.updateComplete
      const base = item.shadowRoot!.querySelector('[part="base"]')
      const slot = base!.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('disabled attribute reflects to DOM', async () => {
      const item = document.createElement('cv-toolbar-item') as CVToolbarItem
      item.disabled = true
      document.body.append(item)
      await item.updateComplete
      expect(item.hasAttribute('disabled')).toBe(true)
    })

    it('active attribute reflects to DOM', async () => {
      const item = document.createElement('cv-toolbar-item') as CVToolbarItem
      item.active = true
      document.body.append(item)
      await item.updateComplete
      expect(item.hasAttribute('active')).toBe(true)
    })

    it('value attribute reflects to DOM', async () => {
      const item = document.createElement('cv-toolbar-item') as CVToolbarItem
      item.value = 'bold'
      document.body.append(item)
      await item.updateComplete
      expect(item.getAttribute('value')).toBe('bold')
    })
  })

  // --- Horizontal arrow navigation ---

  describe('horizontal arrow navigation', () => {
    it('ArrowRight moves to next item', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
        {type: 'item', value: 'c', label: 'C'},
      ])
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'ArrowRight')
      expect(toolbar.value).toBe('b')

      await pressKey(toolbar, 'ArrowRight')
      expect(toolbar.value).toBe('c')
    })

    it('ArrowLeft moves to previous item', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
        {type: 'item', value: 'c', label: 'C'},
      ])
      await pressKey(toolbar, 'ArrowRight')
      await pressKey(toolbar, 'ArrowRight')
      expect(toolbar.value).toBe('c')

      await pressKey(toolbar, 'ArrowLeft')
      expect(toolbar.value).toBe('b')
    })

    it('ArrowDown and ArrowUp are ignored in horizontal orientation', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
      ])
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'ArrowDown')
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'ArrowUp')
      expect(toolbar.value).toBe('a')
    })

    it('emits input and change events on arrow navigation', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
      ])

      const inputDetails: Array<{activeId: string | null}> = []
      const changeDetails: Array<{activeId: string | null}> = []
      toolbar.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      toolbar.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      await pressKey(toolbar, 'ArrowRight')

      expect(inputDetails).toEqual([{activeId: 'b'}])
      expect(changeDetails).toEqual([{activeId: 'b'}])
    })
  })

  // --- Vertical arrow navigation ---

  describe('vertical arrow navigation', () => {
    it('ArrowDown moves to next item', async () => {
      const toolbar = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
          {type: 'item', value: 'b', label: 'B'},
        ],
        {orientation: 'vertical'},
      )
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'ArrowDown')
      expect(toolbar.value).toBe('b')
    })

    it('ArrowUp moves to previous item', async () => {
      const toolbar = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
          {type: 'item', value: 'b', label: 'B'},
        ],
        {orientation: 'vertical'},
      )
      await pressKey(toolbar, 'ArrowDown')
      expect(toolbar.value).toBe('b')

      await pressKey(toolbar, 'ArrowUp')
      expect(toolbar.value).toBe('a')
    })

    it('ArrowRight and ArrowLeft are ignored in vertical orientation', async () => {
      const toolbar = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
          {type: 'item', value: 'b', label: 'B'},
        ],
        {orientation: 'vertical'},
      )
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'ArrowRight')
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'ArrowLeft')
      expect(toolbar.value).toBe('a')
    })
  })

  // --- Home/End key navigation ---

  describe('Home/End key navigation', () => {
    it('Home moves to first item in horizontal', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
        {type: 'item', value: 'c', label: 'C'},
      ])
      await pressKey(toolbar, 'ArrowRight')
      await pressKey(toolbar, 'ArrowRight')
      expect(toolbar.value).toBe('c')

      await pressKey(toolbar, 'Home')
      expect(toolbar.value).toBe('a')
    })

    it('End moves to last item in horizontal', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
        {type: 'item', value: 'c', label: 'C'},
      ])
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'End')
      expect(toolbar.value).toBe('c')
    })

    it('Home moves to first item in vertical', async () => {
      const toolbar = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
          {type: 'item', value: 'b', label: 'B'},
          {type: 'item', value: 'c', label: 'C'},
        ],
        {orientation: 'vertical'},
      )
      await pressKey(toolbar, 'ArrowDown')
      await pressKey(toolbar, 'ArrowDown')
      expect(toolbar.value).toBe('c')

      await pressKey(toolbar, 'Home')
      expect(toolbar.value).toBe('a')
    })

    it('End moves to last item in vertical', async () => {
      const toolbar = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
          {type: 'item', value: 'b', label: 'B'},
          {type: 'item', value: 'c', label: 'C'},
        ],
        {orientation: 'vertical'},
      )
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'End')
      expect(toolbar.value).toBe('c')
    })

    it('Home skips disabled items at the start', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A', disabled: true},
        {type: 'item', value: 'b', label: 'B'},
        {type: 'item', value: 'c', label: 'C'},
      ])
      await pressKey(toolbar, 'End')
      expect(toolbar.value).toBe('c')

      await pressKey(toolbar, 'Home')
      expect(toolbar.value).toBe('b')
    })

    it('End skips disabled items at the end', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
        {type: 'item', value: 'c', label: 'C', disabled: true},
      ])
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'End')
      expect(toolbar.value).toBe('b')
    })
  })

  // --- Wrap vs clamp behavior ---

  describe('wrap vs clamp behavior', () => {
    it('wrap=true: ArrowRight wraps from last to first', async () => {
      const toolbar = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
          {type: 'item', value: 'b', label: 'B'},
          {type: 'item', value: 'c', label: 'C'},
        ],
        {wrap: true},
      )
      await pressKey(toolbar, 'End')
      expect(toolbar.value).toBe('c')

      await pressKey(toolbar, 'ArrowRight')
      expect(toolbar.value).toBe('a')
    })

    it('wrap=true: ArrowLeft wraps from first to last', async () => {
      const toolbar = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
          {type: 'item', value: 'b', label: 'B'},
          {type: 'item', value: 'c', label: 'C'},
        ],
        {wrap: true},
      )
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'ArrowLeft')
      expect(toolbar.value).toBe('c')
    })

    it('wrap=false: ArrowRight clamps at last item', async () => {
      const toolbar = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
          {type: 'item', value: 'b', label: 'B'},
          {type: 'item', value: 'c', label: 'C'},
        ],
        {wrap: false},
      )
      await pressKey(toolbar, 'End')
      expect(toolbar.value).toBe('c')

      await pressKey(toolbar, 'ArrowRight')
      expect(toolbar.value).toBe('c')
    })

    it('wrap=false: ArrowLeft clamps at first item', async () => {
      const toolbar = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
          {type: 'item', value: 'b', label: 'B'},
          {type: 'item', value: 'c', label: 'C'},
        ],
        {wrap: false},
      )
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'ArrowLeft')
      expect(toolbar.value).toBe('a')
    })

    it('wrap=true vertical: ArrowDown wraps from last to first', async () => {
      const toolbar = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
          {type: 'item', value: 'b', label: 'B'},
        ],
        {orientation: 'vertical', wrap: true},
      )
      await pressKey(toolbar, 'ArrowDown')
      expect(toolbar.value).toBe('b')

      await pressKey(toolbar, 'ArrowDown')
      expect(toolbar.value).toBe('a')
    })

    it('wrap=false vertical: ArrowDown clamps at last item', async () => {
      const toolbar = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
          {type: 'item', value: 'b', label: 'B'},
        ],
        {orientation: 'vertical', wrap: false},
      )
      await pressKey(toolbar, 'ArrowDown')
      expect(toolbar.value).toBe('b')

      await pressKey(toolbar, 'ArrowDown')
      expect(toolbar.value).toBe('b')
    })
  })

  // --- Disabled item skip ---

  describe('disabled item skip', () => {
    it('skips disabled items during ArrowRight navigation', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B', disabled: true},
        {type: 'item', value: 'c', label: 'C'},
      ])
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'ArrowRight')
      expect(toolbar.value).toBe('c')
    })

    it('skips disabled items during ArrowLeft navigation', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B', disabled: true},
        {type: 'item', value: 'c', label: 'C'},
      ])
      await pressKey(toolbar, 'End')
      expect(toolbar.value).toBe('c')

      await pressKey(toolbar, 'ArrowLeft')
      expect(toolbar.value).toBe('a')
    })

    it('disabled item does not have active attribute', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B', disabled: true},
      ])
      const items = getItems(toolbar)
      expect(items[0].active).toBe(true)
      expect(items[1].active).toBe(false)
    })
  })

  // --- Separator behavior ---

  describe('separator behavior', () => {
    it('separators are skipped during arrow navigation', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'separator', value: 'sep1'},
        {type: 'item', value: 'b', label: 'B'},
      ])
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'ArrowRight')
      expect(toolbar.value).toBe('b')
    })

    it('separators are skipped during Home/End navigation', async () => {
      const toolbar = await createToolbar([
        {type: 'separator', value: 'sep-start'},
        {type: 'item', value: 'a', label: 'A'},
        {type: 'separator', value: 'sep-mid'},
        {type: 'item', value: 'b', label: 'B'},
        {type: 'separator', value: 'sep-end'},
      ])
      // First navigable item should be active
      expect(toolbar.value).toBe('a')

      await pressKey(toolbar, 'End')
      expect(toolbar.value).toBe('b')

      await pressKey(toolbar, 'Home')
      expect(toolbar.value).toBe('a')
    })

    it('cv-toolbar-separator renders with role="separator"', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'separator', value: 'sep1'},
        {type: 'item', value: 'b', label: 'B'},
      ])
      const sep = toolbar.querySelector('cv-toolbar-separator')
      expect(sep).not.toBeNull()
      // The separator should have role="separator" set by the parent toolbar
      // via contracts.getSeparatorProps()
      const base = sep!.shadowRoot?.querySelector('[part="base"]')
      if (base) {
        expect(base.getAttribute('role')).toBe('separator')
      } else {
        // If separator renders role on host
        expect(sep!.getAttribute('role')).toBe('separator')
      }
    })

    it('cv-toolbar-separator aria-orientation is perpendicular to toolbar orientation', async () => {
      const toolbarH = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
          {type: 'separator', value: 'sep1'},
          {type: 'item', value: 'b', label: 'B'},
        ],
      )
      const sepH = toolbarH.querySelector('cv-toolbar-separator')
      const baseH = sepH!.shadowRoot?.querySelector('[part="base"]')
      const orientationTarget = baseH ?? sepH!
      expect(orientationTarget.getAttribute('aria-orientation')).toBe('vertical')

      document.body.innerHTML = ''

      const toolbarV = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
          {type: 'separator', value: 'sep1'},
          {type: 'item', value: 'b', label: 'B'},
        ],
        {orientation: 'vertical'},
      )
      const sepV = toolbarV.querySelector('cv-toolbar-separator')
      const baseV = sepV!.shadowRoot?.querySelector('[part="base"]')
      const orientationTargetV = baseV ?? sepV!
      expect(orientationTargetV.getAttribute('aria-orientation')).toBe('horizontal')
    })
  })

  // --- Focus memory ---

  describe('focus memory', () => {
    it('re-entering toolbar restores focus to last active item', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
        {type: 'item', value: 'c', label: 'C'},
      ])

      // Navigate to item B
      await pressKey(toolbar, 'ArrowRight')
      expect(toolbar.value).toBe('b')

      // Simulate blur (focus leaves toolbar)
      const base = getBase(toolbar)
      base.dispatchEvent(new FocusEvent('focusout', {bubbles: true, relatedTarget: document.body}))
      await settle(toolbar)

      // Simulate re-entry (focus returns to toolbar)
      base.dispatchEvent(new FocusEvent('focusin', {bubbles: true}))
      await settle(toolbar)

      // Should restore to item B (last active before blur)
      expect(toolbar.value).toBe('b')
    })
  })

  // --- Events ---

  describe('events', () => {
    it('input event has detail shape {activeId: string | null}', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
      ])
      let detail: unknown

      toolbar.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      await pressKey(toolbar, 'ArrowRight')

      expect(detail).toEqual({activeId: 'b'})
    })

    it('change event has detail shape {activeId: string | null}', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
      ])
      let detail: unknown

      toolbar.addEventListener('cv-change', (e) => {
        detail = (e as CustomEvent).detail
      })

      await pressKey(toolbar, 'ArrowRight')

      expect(detail).toEqual({activeId: 'b'})
    })

    it('both input and change fire on navigation', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
      ])
      let inputCount = 0
      let changeCount = 0

      toolbar.addEventListener('cv-input', () => inputCount++)
      toolbar.addEventListener('cv-change', () => changeCount++)

      await pressKey(toolbar, 'ArrowRight')

      expect(inputCount).toBe(1)
      expect(changeCount).toBe(1)
    })

    it('no events fire when navigation does not change active item', async () => {
      const toolbar = await createToolbar(
        [
          {type: 'item', value: 'a', label: 'A'},
        ],
        {wrap: false},
      )
      let eventCount = 0

      toolbar.addEventListener('cv-input', () => eventCount++)
      toolbar.addEventListener('cv-change', () => eventCount++)

      await pressKey(toolbar, 'ArrowLeft')

      expect(eventCount).toBe(0)
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('getRootProps() attributes are reflected on [part="base"]', async () => {
      const toolbar = await createToolbar(
        [{type: 'item', value: 'a', label: 'A'}],
        {'aria-label': 'Actions'},
      )
      const base = getBase(toolbar)
      expect(base.getAttribute('role')).toBe('toolbar')
      expect(base.getAttribute('aria-orientation')).toBe('horizontal')
      expect(base.getAttribute('aria-label')).toBe('Actions')
      expect(base.id).toContain('root')
    })

    it('getItemProps() attributes are reflected on cv-toolbar-item elements', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
        {type: 'item', value: 'c', label: 'C', disabled: true},
      ])
      const items = getItems(toolbar)

      // Active item (first)
      expect(items[0].id).toBeTruthy()
      expect(items[0].tabIndex).toBe(0)
      expect(items[0].getAttribute('data-active')).toBe('true')

      // Inactive item
      expect(items[1].id).toBeTruthy()
      expect(items[1].tabIndex).toBe(-1)
      expect(items[1].getAttribute('data-active')).toBe('false')

      // Disabled item
      expect(items[2].id).toBeTruthy()
      expect(items[2].getAttribute('aria-disabled')).toBe('true')
      expect(items[2].getAttribute('data-active')).toBe('false')
    })

    it('roving tabindex updates when active item changes', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
        {type: 'item', value: 'c', label: 'C'},
      ])
      const items = getItems(toolbar)

      expect(items[0].tabIndex).toBe(0)
      expect(items[1].tabIndex).toBe(-1)
      expect(items[2].tabIndex).toBe(-1)

      await pressKey(toolbar, 'ArrowRight')

      expect(items[0].tabIndex).toBe(-1)
      expect(items[1].tabIndex).toBe(0)
      expect(items[2].tabIndex).toBe(-1)
    })

    it('data-active attribute updates when active item changes', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
      ])
      const items = getItems(toolbar)

      expect(items[0].getAttribute('data-active')).toBe('true')
      expect(items[1].getAttribute('data-active')).toBe('false')

      await pressKey(toolbar, 'ArrowRight')

      expect(items[0].getAttribute('data-active')).toBe('false')
      expect(items[1].getAttribute('data-active')).toBe('true')
    })

    it('cv-toolbar-item active property syncs with data-active', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
      ])
      const items = getItems(toolbar)

      expect(items[0].active).toBe(true)
      expect(items[1].active).toBe(false)

      await pressKey(toolbar, 'ArrowRight')

      expect(items[0].active).toBe(false)
      expect(items[1].active).toBe(true)
    })
  })

  // --- Slotchange rebuild ---

  describe('slotchange rebuild', () => {
    it('rebuilds on slotchange and preserves valid active id', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
        {type: 'item', value: 'c', label: 'C'},
      ])

      await pressKey(toolbar, 'ArrowRight')
      expect(toolbar.value).toBe('b')

      const itemA = toolbar.querySelector('cv-toolbar-item[value="a"]')!
      itemA.remove()
      await settle(toolbar)

      expect(toolbar.value).toBe('b')
      const items = getItems(toolbar)
      const activeItem = items.find((i) => i.active)
      expect(activeItem?.value).toBe('b')
    })

    it('auto-generates value when item has no value attribute', async () => {
      const toolbar = document.createElement('cv-toolbar') as CVToolbar
      const item = document.createElement('cv-toolbar-item') as CVToolbarItem
      item.textContent = 'No Value'
      toolbar.append(item)
      document.body.append(toolbar)
      await settle(toolbar)

      // Should auto-generate a value like "item-1"
      expect(item.value).toMatch(/^item-\d+$/)
    })
  })

  // --- Programmatic value change ---

  describe('programmatic value change', () => {
    it('setting value attribute changes active item', async () => {
      const toolbar = await createToolbar([
        {type: 'item', value: 'a', label: 'A'},
        {type: 'item', value: 'b', label: 'B'},
        {type: 'item', value: 'c', label: 'C'},
      ])
      expect(toolbar.value).toBe('a')

      toolbar.value = 'c'
      await settle(toolbar)

      expect(toolbar.value).toBe('c')
      const items = getItems(toolbar)
      expect(items[2].active).toBe(true)
      expect(items[0].active).toBe(false)
    })
  })
})
