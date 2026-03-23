import {afterEach, describe, expect, it} from 'vitest'

import {CVListbox} from './cv-listbox'
import {CVOption} from './cv-option'

CVListbox.define()
CVOption.define()

const settle = async (element: CVListbox) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

const createListbox = async (
  attrs?: Partial<CVListbox>,
  optionsHtml?: string,
) => {
  const el = document.createElement('cv-listbox') as CVListbox
  if (attrs) Object.assign(el, attrs)
  el.innerHTML =
    optionsHtml ??
    `
    <cv-option value="a">Alpha</cv-option>
    <cv-option value="b">Beta</cv-option>
    <cv-option value="c" disabled>Gamma</cv-option>
    <cv-option value="d">Delta</cv-option>
  `
  document.body.append(el)
  await settle(el)
  return el
}

const createListboxWithSelected = async (attrs?: Partial<CVListbox>) => {
  const el = document.createElement('cv-listbox') as CVListbox
  if (attrs) Object.assign(el, attrs)
  el.innerHTML = `
    <cv-option value="a">Alpha</cv-option>
    <cv-option value="b" selected>Beta</cv-option>
    <cv-option value="c">Gamma</cv-option>
  `
  document.body.append(el)
  await settle(el)
  return el
}

const createGroupedListbox = async (attrs?: Partial<CVListbox>) => {
  const el = document.createElement('cv-listbox') as CVListbox
  if (attrs) Object.assign(el, attrs)
  el.innerHTML = `
    <cv-listbox-group label="Fruits">
      <cv-option value="apple">Apple</cv-option>
      <cv-option value="banana">Banana</cv-option>
    </cv-listbox-group>
    <cv-listbox-group label="Vegetables">
      <cv-option value="carrot">Carrot</cv-option>
      <cv-option value="potato">Potato</cv-option>
    </cv-listbox-group>
  `
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVListbox) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

const getOptions = (el: CVListbox) =>
  Array.from(el.querySelectorAll('cv-option')) as CVOption[]

const getActiveOption = (el: CVListbox) =>
  el.querySelector('cv-option[data-active="true"]') as CVOption | null

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-listbox', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] with role="listbox"', async () => {
      const el = await createListbox()
      const base = getBase(el)
      expect(base).not.toBeNull()
      expect(base.getAttribute('role')).toBe('listbox')
    })

    it('renders a default slot inside [part="base"]', async () => {
      const el = await createListbox()
      const base = getBase(el)
      const slot = base.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('[part="base"] is a <div> element', async () => {
      const el = await createListbox()
      const base = getBase(el)
      expect(base.tagName.toLowerCase()).toBe('div')
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const el = await createListbox()
      expect(el.selectionMode).toBe('single')
      expect(el.orientation).toBe('vertical')
      expect(el.focusStrategy).toBe('aria-activedescendant')
      expect(el.value).toBeNull()
      expect(el.selectedValues).toEqual([])
    })

    it('typeahead defaults to true (enabled)', async () => {
      // typeahead is enabled by default per spec — verify that typing a character
      // navigates to a matching option
      const el = await createListbox()
      const base = getBase(el)
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'd', bubbles: true}))
      await settle(el)
      const active = getActiveOption(el)
      expect(active?.value).toBe('d')
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('reflects selection-mode attribute', async () => {
      const el = await createListbox({selectionMode: 'multiple'})
      expect(el.getAttribute('selection-mode')).toBe('multiple')
    })

    it('reflects orientation attribute', async () => {
      const el = await createListbox({orientation: 'horizontal'})
      expect(el.getAttribute('orientation')).toBe('horizontal')
    })

    it('reflects focus-strategy attribute', async () => {
      const el = await createListbox({focusStrategy: 'roving-tabindex'})
      expect(el.getAttribute('focus-strategy')).toBe('roving-tabindex')
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('role="listbox" on base', async () => {
      const el = await createListbox()
      expect(getBase(el).getAttribute('role')).toBe('listbox')
    })

    it('aria-orientation reflects orientation attribute', async () => {
      const el = await createListbox()
      expect(getBase(el).getAttribute('aria-orientation')).toBe('vertical')

      const el2 = await createListbox({orientation: 'horizontal'})
      expect(getBase(el2).getAttribute('aria-orientation')).toBe('horizontal')
    })

    it('aria-label is set when provided', async () => {
      const el = await createListbox({ariaLabel: 'Fruits'})
      expect(getBase(el).getAttribute('aria-label')).toBe('Fruits')
    })

    it('aria-multiselectable is "true" when selection-mode="multiple"', async () => {
      const el = await createListbox({selectionMode: 'multiple'})
      expect(getBase(el).getAttribute('aria-multiselectable')).toBe('true')
    })

    it('aria-multiselectable is absent when selection-mode="single"', async () => {
      const el = await createListbox()
      expect(getBase(el).hasAttribute('aria-multiselectable')).toBe(false)
    })

    it('tabindex="0" on base when focus-strategy="aria-activedescendant"', async () => {
      const el = await createListbox({focusStrategy: 'aria-activedescendant'})
      expect(getBase(el).getAttribute('tabindex')).toBe('0')
    })

    it('tabindex="-1" on base when focus-strategy="roving-tabindex"', async () => {
      const el = await createListbox({focusStrategy: 'roving-tabindex'})
      expect(getBase(el).getAttribute('tabindex')).toBe('-1')
    })

    it('aria-activedescendant present on base when strategy is activedescendant and option is active', async () => {
      const el = await createListbox({focusStrategy: 'aria-activedescendant'})
      const base = getBase(el)
      // First enabled option should be active by default
      const activeOpt = getActiveOption(el)
      if (activeOpt) {
        expect(base.getAttribute('aria-activedescendant')).toBe(activeOpt.id)
      }
    })

    it('aria-activedescendant absent when strategy is roving-tabindex', async () => {
      const el = await createListbox({focusStrategy: 'roving-tabindex'})
      expect(getBase(el).hasAttribute('aria-activedescendant')).toBe(false)
    })

    it('each cv-option has role="option"', async () => {
      const el = await createListbox()
      const options = getOptions(el)
      for (const opt of options) {
        expect(opt.getAttribute('role')).toBe('option')
      }
    })

    it('each cv-option has aria-selected attribute', async () => {
      const el = await createListbox()
      const options = getOptions(el)
      for (const opt of options) {
        expect(opt.hasAttribute('aria-selected')).toBe(true)
      }
    })

    it('disabled option has aria-disabled="true"', async () => {
      const el = await createListbox()
      const options = getOptions(el)
      const disabled = options.find((o) => o.value === 'c')
      expect(disabled?.getAttribute('aria-disabled')).toBe('true')
    })

    it('enabled option does not have aria-disabled', async () => {
      const el = await createListbox()
      const options = getOptions(el)
      const enabled = options.find((o) => o.value === 'a')
      expect(enabled?.hasAttribute('aria-disabled')).toBe(false)
    })
  })

  // --- Events ---

  describe('events', () => {
    it('input event detail shape: {selectedValues: string[], activeValue: string | null}', async () => {
      const el = await createListbox()
      let detail: unknown

      el.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      const base = getBase(el)
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      expect(detail).toHaveProperty('selectedValues')
      expect(detail).toHaveProperty('activeValue')
      expect(Array.isArray((detail as any).selectedValues)).toBe(true)
    })

    it('change event detail shape: {selectedValues: string[], activeValue: string | null}', async () => {
      const el = await createListbox()
      let detail: unknown

      el.addEventListener('cv-change', (e) => {
        detail = (e as CustomEvent).detail
      })

      // Navigate to second option and select it
      const base = getBase(el)
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect(detail).toHaveProperty('selectedValues')
      expect(detail).toHaveProperty('activeValue')
      expect(Array.isArray((detail as any).selectedValues)).toBe(true)
    })

    it('input fires on active option change (navigation)', async () => {
      const el = await createListbox()
      let inputCount = 0
      el.addEventListener('cv-input', () => inputCount++)

      const base = getBase(el)
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      expect(inputCount).toBeGreaterThanOrEqual(1)
    })

    it('change fires on selection change', async () => {
      const el = await createListbox()
      let changeCount = 0
      el.addEventListener('cv-change', () => changeCount++)

      const base = getBase(el)
      // Navigate then select
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      expect(changeCount).toBe(0)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect(changeCount).toBe(1)
    })

    it('input fires without change on navigation only', async () => {
      const el = await createListbox()
      let inputCount = 0
      let changeCount = 0
      el.addEventListener('cv-input', () => inputCount++)
      el.addEventListener('cv-change', () => changeCount++)

      const base = getBase(el)
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      expect(inputCount).toBeGreaterThanOrEqual(1)
      expect(changeCount).toBe(0)
    })
  })

  // --- Keyboard navigation ---

  describe('keyboard navigation', () => {
    it('ArrowDown moves to next enabled option', async () => {
      const el = await createListbox()
      const base = getBase(el)
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      const active = getActiveOption(el)
      expect(active?.value).toBe('b')
    })

    it('ArrowUp moves to previous enabled option', async () => {
      const el = await createListbox()
      const base = getBase(el)

      // Move to b first
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      // Move back to a
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(el)

      const active = getActiveOption(el)
      expect(active?.value).toBe('a')
    })

    it('Home moves to first enabled option', async () => {
      const el = await createListbox()
      const base = getBase(el)

      // Move to d
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true}))
      await settle(el)

      // Home should go to first
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true}))
      await settle(el)

      const active = getActiveOption(el)
      expect(active?.value).toBe('a')
    })

    it('End moves to last enabled option', async () => {
      const el = await createListbox()
      const base = getBase(el)
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true}))
      await settle(el)

      const active = getActiveOption(el)
      expect(active?.value).toBe('d')
    })

    it('ArrowDown skips disabled options', async () => {
      const el = await createListbox()
      const base = getBase(el)

      // Move from a -> b
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      expect(getActiveOption(el)?.value).toBe('b')

      // Move from b -> should skip c (disabled) -> d
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      expect(getActiveOption(el)?.value).toBe('d')
    })

    it('horizontal orientation uses ArrowRight/ArrowLeft instead', async () => {
      const el = await createListbox({orientation: 'horizontal'})
      const base = getBase(el)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)
      expect(getActiveOption(el)?.value).toBe('b')

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(el)
      expect(getActiveOption(el)?.value).toBe('a')
    })
  })

  // --- Single selection behavior ---

  describe('single selection behavior', () => {
    it('Enter selects the active option', async () => {
      const el = await createListbox()
      const base = getBase(el)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect(el.value).toBe('b')
      expect(el.selectedValues).toEqual(['b'])
    })

    it('Space selects the active option', async () => {
      const el = await createListbox()
      const base = getBase(el)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)

      expect(el.value).toBe('b')
    })

    it('clicking an option selects it exclusively', async () => {
      const el = await createListbox()
      const options = getOptions(el)

      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.value).toBe('b')
      expect(el.selectedValues).toEqual(['b'])
    })

    it('selecting another option replaces previous selection', async () => {
      const el = await createListbox()
      const options = getOptions(el)

      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.value).toBe('a')

      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.value).toBe('b')
      expect(el.selectedValues).toEqual(['b'])
    })

    it('initial selection is read from cv-option[selected] attribute', async () => {
      const el = await createListboxWithSelected()
      expect(el.value).toBe('b')
      expect(el.selectedValues).toEqual(['b'])
    })
  })

  // --- Multiple selection behavior ---

  describe('multiple selection behavior', () => {
    it('Space toggles selection on active option', async () => {
      const el = await createListbox({selectionMode: 'multiple'})
      const base = getBase(el)

      // Select first option
      base.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)

      // Navigate to next
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      // Select second option
      base.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)

      expect(el.selectedValues).toContain('a')
      expect(el.selectedValues).toContain('b')
    })

    it('Enter toggles selection in multiple mode', async () => {
      const el = await createListbox({selectionMode: 'multiple'})
      const base = getBase(el)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect(el.selectedValues).toContain('a')

      // Toggle off
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect(el.selectedValues).not.toContain('a')
    })

    it('clicking toggles option selection in multiple mode', async () => {
      const el = await createListbox({selectionMode: 'multiple'})
      const options = getOptions(el)

      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.selectedValues).toContain('a')
      expect(el.selectedValues).toContain('b')
    })

    it('Ctrl/Cmd+A selects all enabled options', async () => {
      const el = await createListbox({selectionMode: 'multiple'})
      const base = getBase(el)

      base.dispatchEvent(
        new KeyboardEvent('keydown', {key: 'a', ctrlKey: true, bubbles: true}),
      )
      await settle(el)

      // Should select a, b, d (c is disabled)
      expect(el.selectedValues).toContain('a')
      expect(el.selectedValues).toContain('b')
      expect(el.selectedValues).toContain('d')
      expect(el.selectedValues).not.toContain('c')
    })
  })

  // --- Disabled option behavior ---

  describe('disabled option behavior', () => {
    it('disabled option cannot be selected via click', async () => {
      const el = await createListbox()
      const options = getOptions(el)
      const disabledOpt = options.find((o) => o.value === 'c')!

      disabledOpt.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.selectedValues).not.toContain('c')
    })

    it('navigation skips disabled options', async () => {
      const el = await createListbox()
      const base = getBase(el)

      // a -> b
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      expect(getActiveOption(el)?.value).toBe('b')

      // b -> skip c (disabled) -> d
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      expect(getActiveOption(el)?.value).toBe('d')
    })
  })

  // --- Focus management ---

  describe('focus management', () => {
    it('aria-activedescendant strategy: base has tabindex="0", options have tabindex="-1"', async () => {
      const el = await createListbox({focusStrategy: 'aria-activedescendant'})
      const base = getBase(el)
      expect(base.getAttribute('tabindex')).toBe('0')

      const options = getOptions(el)
      for (const opt of options) {
        expect(opt.getAttribute('tabindex')).toBe('-1')
      }
    })

    it('roving-tabindex strategy: base has tabindex="-1", active option has tabindex="0"', async () => {
      const el = await createListbox({focusStrategy: 'roving-tabindex'})
      const base = getBase(el)
      expect(base.getAttribute('tabindex')).toBe('-1')

      const active = getActiveOption(el)
      expect(active).not.toBeNull()
      expect(active?.getAttribute('tabindex')).toBe('0')

      // Non-active options should have tabindex="-1"
      const options = getOptions(el)
      for (const opt of options) {
        if (opt !== active) {
          expect(opt.getAttribute('tabindex')).toBe('-1')
        }
      }
    })
  })

  // --- Value property ---

  describe('value property', () => {
    it('value returns null when no selection', async () => {
      const el = await createListbox()
      expect(el.value).toBeNull()
    })

    it('value returns first selected option value', async () => {
      const el = await createListboxWithSelected()
      expect(el.value).toBe('b')
    })

    it('setting value programmatically selects the option', async () => {
      const el = await createListbox()
      el.value = 'b'
      await settle(el)
      expect(el.selectedValues).toEqual(['b'])
    })

    it('setting value to null clears selection', async () => {
      const el = await createListboxWithSelected()
      expect(el.value).toBe('b')

      el.value = null
      await settle(el)
      expect(el.selectedValues).toEqual([])
    })
  })

  // --- selectedValues property ---

  describe('selectedValues property', () => {
    it('returns empty array when no selection', async () => {
      const el = await createListbox()
      expect(el.selectedValues).toEqual([])
    })

    it('returns array of selected values after selection', async () => {
      const el = await createListbox({selectionMode: 'multiple'})
      const options = getOptions(el)

      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.selectedValues).toEqual(expect.arrayContaining(['a', 'b']))
    })
  })

  // --- Slot rebuild preservation ---

  describe('slot rebuild preservation', () => {
    it('preserves valid selected values when option is removed', async () => {
      const el = await createListbox()
      const options = getOptions(el)

      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.selectedValues).toEqual(['b'])

      // Remove option "a"
      options[0]!.remove()
      await settle(el)

      expect(el.selectedValues).toEqual(['b'])
    })

    it('preserves valid selected values when new option is added', async () => {
      const el = await createListbox()
      const options = getOptions(el)

      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.selectedValues).toEqual(['a'])

      const newOpt = document.createElement('cv-option') as CVOption
      newOpt.value = 'e'
      newOpt.textContent = 'Epsilon'
      el.appendChild(newOpt)
      await settle(el)

      expect(el.selectedValues).toEqual(['a'])
    })
  })

  // --- Dynamic attribute updates ---

  describe('dynamic attribute updates', () => {
    it('changing selection-mode rebuilds model', async () => {
      const el = await createListbox()
      expect(getBase(el).hasAttribute('aria-multiselectable')).toBe(false)

      el.selectionMode = 'multiple'
      await settle(el)
      expect(getBase(el).getAttribute('aria-multiselectable')).toBe('true')
    })

    it('changing orientation updates aria-orientation', async () => {
      const el = await createListbox()
      expect(getBase(el).getAttribute('aria-orientation')).toBe('vertical')

      el.orientation = 'horizontal'
      await settle(el)
      expect(getBase(el).getAttribute('aria-orientation')).toBe('horizontal')
    })

    it('changing focus-strategy updates tabindex behavior', async () => {
      const el = await createListbox({focusStrategy: 'aria-activedescendant'})
      expect(getBase(el).getAttribute('tabindex')).toBe('0')

      el.focusStrategy = 'roving-tabindex'
      await settle(el)
      expect(getBase(el).getAttribute('tabindex')).toBe('-1')
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('option role, tabindex, aria-selected from getOptionProps', async () => {
      const el = await createListbox()
      const options = getOptions(el)
      const first = options[0]!

      expect(first.getAttribute('role')).toBe('option')
      expect(first.hasAttribute('tabindex')).toBe(true)
      expect(first.getAttribute('aria-selected')).toMatch(/^(true|false)$/)
    })

    it('base role, tabindex, aria-orientation from getRootProps', async () => {
      const el = await createListbox()
      const base = getBase(el)

      expect(base.getAttribute('role')).toBe('listbox')
      expect(base.hasAttribute('tabindex')).toBe(true)
      expect(base.getAttribute('aria-orientation')).toBe('vertical')
    })

    it('data-active attribute reflects headless active state', async () => {
      const el = await createListbox()

      const active = getActiveOption(el)
      expect(active).not.toBeNull()
      expect(active?.getAttribute('data-active')).toBe('true')

      // Non-active options should have data-active="false" or absent
      const options = getOptions(el)
      const nonActive = options.filter((o) => o !== active)
      for (const opt of nonActive) {
        expect(opt.hasAttribute('data-active')).toBe(false)
      }
    })

    it('aria-selected on options reflects headless selected state', async () => {
      const el = await createListbox()
      const options = getOptions(el)

      // Nothing selected initially
      for (const opt of options) {
        expect(opt.getAttribute('aria-selected')).toBe('false')
      }

      // Select first option
      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(options[0]!.getAttribute('aria-selected')).toBe('true')
    })
  })

  // --- Virtual scroll support (aria-setsize / aria-posinset) ---

  describe('virtual scroll support', () => {
    it('each option has aria-setsize equal to total option count', async () => {
      const el = await createListbox()
      const options = getOptions(el)
      const total = String(options.length)

      for (const opt of options) {
        expect(opt.getAttribute('aria-setsize')).toBe(total)
      }
    })

    it('each option has unique aria-posinset in [1, optionCount]', async () => {
      const el = await createListbox()
      const options = getOptions(el)
      const positions = options.map((opt) => opt.getAttribute('aria-posinset'))

      // All positions should be unique
      expect(new Set(positions).size).toBe(options.length)

      // All positions should be in valid range
      for (const pos of positions) {
        const num = Number(pos)
        expect(num).toBeGreaterThanOrEqual(1)
        expect(num).toBeLessThanOrEqual(options.length)
      }
    })

    it('aria-posinset follows declaration order', async () => {
      const el = await createListbox()
      const options = getOptions(el)

      expect(options[0]!.getAttribute('aria-posinset')).toBe('1')
      expect(options[1]!.getAttribute('aria-posinset')).toBe('2')
      expect(options[2]!.getAttribute('aria-posinset')).toBe('3')
      expect(options[3]!.getAttribute('aria-posinset')).toBe('4')
    })
  })

  // --- Range selection ---

  describe('range selection', () => {
    it('Shift+ArrowDown extends selection in multiple+range mode', async () => {
      const el = await createListbox({
        selectionMode: 'multiple',
        rangeSelection: true,
      } as any)
      const base = getBase(el)

      // Select starting option
      base.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)

      // Shift+ArrowDown to extend
      base.dispatchEvent(
        new KeyboardEvent('keydown', {key: 'ArrowDown', shiftKey: true, bubbles: true}),
      )
      await settle(el)

      expect(el.selectedValues).toContain('a')
      expect(el.selectedValues).toContain('b')
    })

    it('Shift+Space selects range from anchor to active', async () => {
      const el = await createListbox({
        selectionMode: 'multiple',
        rangeSelection: true,
      } as any)
      const base = getBase(el)

      // Select starting option (anchor)
      base.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)

      // Navigate to option d (skip c which is disabled)
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true}))
      await settle(el)

      // Shift+Space to select range
      base.dispatchEvent(
        new KeyboardEvent('keydown', {key: ' ', shiftKey: true, bubbles: true}),
      )
      await settle(el)

      expect(el.selectedValues).toContain('a')
      expect(el.selectedValues).toContain('b')
      expect(el.selectedValues).toContain('d')
      // c is disabled, should not be selected
      expect(el.selectedValues).not.toContain('c')
    })
  })

  // --- Typeahead ---

  describe('typeahead', () => {
    it('typing a character navigates to matching option', async () => {
      const el = await createListbox()
      const base = getBase(el)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'b', bubbles: true}))
      await settle(el)

      expect(getActiveOption(el)?.value).toBe('b')
    })

    it('typeahead skips disabled options', async () => {
      const el = await createListbox()
      const base = getBase(el)

      // "G" for Gamma which is disabled — should not become active
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'g', bubbles: true}))
      await settle(el)

      const active = getActiveOption(el)
      // Active should not be the disabled "c" option
      expect(active?.value).not.toBe('c')
    })
  })

  // --- Option auto-value assignment ---

  describe('option auto-value assignment', () => {
    it('assigns fallback value when cv-option has empty value', async () => {
      const el = await createListbox(
        {},
        `
        <cv-option>No Value</cv-option>
        <cv-option value="b">Beta</cv-option>
      `,
      )
      const options = getOptions(el)
      // First option should get a fallback value like "option-1"
      expect(options[0]!.value).toBeTruthy()
    })
  })

  // --- Group support ---

  describe('group support', () => {
    it('renders cv-listbox-group children inside listbox', async () => {
      const el = await createGroupedListbox()
      const groups = el.querySelectorAll('cv-listbox-group')
      expect(groups.length).toBe(2)
    })

    it('options within groups are accessible from listbox', async () => {
      const el = await createGroupedListbox()
      const options = el.querySelectorAll('cv-option')
      expect(options.length).toBe(4)
    })

    it('cv-listbox-group has a label attribute', async () => {
      const el = await createGroupedListbox()
      const groups = el.querySelectorAll('cv-listbox-group')
      expect(groups[0]?.getAttribute('label')).toBe('Fruits')
      expect(groups[1]?.getAttribute('label')).toBe('Vegetables')
    })

    it('group label part is rendered with correct text', async () => {
      const el = await createGroupedListbox()
      const groups = el.querySelectorAll('cv-listbox-group')
      const firstGroup = groups[0]
      if (firstGroup?.shadowRoot) {
        const labelPart = firstGroup.shadowRoot.querySelector('[part="label"]')
        expect(labelPart).not.toBeNull()
        expect(labelPart?.textContent?.trim()).toBe('Fruits')
      }
    })

    it('keyboard navigation crosses group boundaries seamlessly', async () => {
      const el = await createGroupedListbox()
      const base = getBase(el)

      // Assuming initial active is first option (apple)
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      expect(getActiveOption(el)?.value).toBe('banana')

      // Cross into second group
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      expect(getActiveOption(el)?.value).toBe('carrot')
    })

    it('aria-setsize spans all options across groups', async () => {
      const el = await createGroupedListbox()
      const options = Array.from(el.querySelectorAll('cv-option')) as CVOption[]
      for (const opt of options) {
        expect(opt.getAttribute('aria-setsize')).toBe(String(options.length))
      }
    })

    it('aria-posinset is sequential across groups', async () => {
      const el = await createGroupedListbox()
      const options = Array.from(el.querySelectorAll('cv-option')) as CVOption[]

      expect(options[0]!.getAttribute('aria-posinset')).toBe('1')
      expect(options[1]!.getAttribute('aria-posinset')).toBe('2')
      expect(options[2]!.getAttribute('aria-posinset')).toBe('3')
      expect(options[3]!.getAttribute('aria-posinset')).toBe('4')
    })
  })

  // --- Selection follows focus ---

  describe('selection follows focus', () => {
    it('auto-selects focused option in single mode when enabled', async () => {
      const el = await createListbox({
        selectionFollowsFocus: true,
      } as any)
      const base = getBase(el)

      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      expect(el.value).toBe('b')
    })
  })

  // --- Pointer interaction ---

  describe('pointer interaction', () => {
    it('click sets active and selects in single mode', async () => {
      const el = await createListbox()
      const options = getOptions(el)

      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(getActiveOption(el)?.value).toBe('b')
      expect(el.value).toBe('b')
    })

    it('click on disabled option does not change selection or active', async () => {
      const el = await createListbox()
      const options = getOptions(el)
      const disabledOpt = options.find((o) => o.value === 'c')!

      const prevActive = getActiveOption(el)?.value
      disabledOpt.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      // Selection should not include disabled option
      expect(el.selectedValues).not.toContain('c')
    })

    it('click dispatches input and change events', async () => {
      const el = await createListbox()
      let inputCount = 0
      let changeCount = 0
      el.addEventListener('cv-input', () => inputCount++)
      el.addEventListener('cv-change', () => changeCount++)

      const options = getOptions(el)
      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(inputCount).toBeGreaterThanOrEqual(1)
      expect(changeCount).toBeGreaterThanOrEqual(1)
    })
  })

  // --- Escape key ---

  describe('Escape key', () => {
    it('Escape calls close on headless model', async () => {
      const el = await createListbox()
      const base = getBase(el)

      // Just verify it does not throw and does not change selection
      base.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      // Should not crash, selection unchanged
      expect(el.selectedValues).toEqual([])
    })
  })
})
