import {afterEach, describe, expect, it} from 'vitest'

import {CVCombobox} from './cv-combobox'
import {CVComboboxOption} from './cv-combobox-option'

CVComboboxOption.define()
CVCombobox.define()

const settle = async (element: CVCombobox) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

async function mountCombobox(params: {
  openOnFocus?: boolean
  openOnClick?: boolean
  closeOnSelect?: boolean
  matchMode?: 'includes' | 'startsWith'
} = {}) {
  const combobox = document.createElement('cv-combobox') as CVCombobox
  if (params.openOnFocus != null) {
    combobox.openOnFocus = params.openOnFocus
  }
  if (params.openOnClick != null) {
    combobox.openOnClick = params.openOnClick
  }
  if (params.closeOnSelect != null) {
    combobox.closeOnSelect = params.closeOnSelect
  }
  if (params.matchMode != null) {
    combobox.matchMode = params.matchMode
  }

  combobox.innerHTML = `
    <cv-combobox-option value="a">Alpha</cv-combobox-option>
    <cv-combobox-option value="b">Beta</cv-combobox-option>
    <cv-combobox-option value="c" disabled>Gamma</cv-combobox-option>
  `

  document.body.append(combobox)
  await settle(combobox)

  const options = Array.from(combobox.querySelectorAll('cv-combobox-option')) as CVComboboxOption[]
  const input = combobox.shadowRoot?.querySelector('[part="input"]') as HTMLInputElement

  return {combobox, options, input}
}

async function mountSelectOnly(params: {
  multiple?: boolean
  placeholder?: string
} = {}) {
  const combobox = document.createElement('cv-combobox') as CVCombobox
  ;(combobox as any).type = 'select-only'
  if (params.multiple) {
    ;(combobox as any).multiple = true
  }
  if (params.placeholder) {
    combobox.placeholder = params.placeholder
  }

  combobox.innerHTML = `
    <cv-combobox-option value="us">United States</cv-combobox-option>
    <cv-combobox-option value="uk">United Kingdom</cv-combobox-option>
    <cv-combobox-option value="de">Germany</cv-combobox-option>
    <cv-combobox-option value="fr" disabled>France</cv-combobox-option>
  `

  document.body.append(combobox)
  await settle(combobox)

  const options = Array.from(combobox.querySelectorAll('cv-combobox-option')) as CVComboboxOption[]
  const trigger = combobox.shadowRoot?.querySelector('[part="trigger"]') as HTMLElement
  const listbox = combobox.shadowRoot?.querySelector('[part="listbox"]') as HTMLElement

  return {combobox, options, trigger, listbox}
}

async function mountMultiSelect(params: {
  type?: 'editable' | 'select-only'
  maxTagsVisible?: number
} = {}) {
  const combobox = document.createElement('cv-combobox') as CVCombobox
  ;(combobox as any).multiple = true
  if (params.type) {
    ;(combobox as any).type = params.type
  }
  if (params.maxTagsVisible != null) {
    ;(combobox as any).maxTagsVisible = params.maxTagsVisible
  }

  combobox.innerHTML = `
    <cv-combobox-option value="js">JavaScript</cv-combobox-option>
    <cv-combobox-option value="ts">TypeScript</cv-combobox-option>
    <cv-combobox-option value="py">Python</cv-combobox-option>
    <cv-combobox-option value="rs">Rust</cv-combobox-option>
    <cv-combobox-option value="go">Go</cv-combobox-option>
  `

  document.body.append(combobox)
  await settle(combobox)

  const options = Array.from(combobox.querySelectorAll('cv-combobox-option')) as CVComboboxOption[]
  const input = combobox.shadowRoot?.querySelector('[part="input"]') as HTMLInputElement
  const trigger = combobox.shadowRoot?.querySelector('[part="trigger"]') as HTMLElement
  const listbox = combobox.shadowRoot?.querySelector('[part="listbox"]') as HTMLElement

  return {combobox, options, input, trigger, listbox}
}

async function mountClearable() {
  const combobox = document.createElement('cv-combobox') as CVCombobox
  ;(combobox as any).clearable = true

  combobox.innerHTML = `
    <cv-combobox-option value="apple">Apple</cv-combobox-option>
    <cv-combobox-option value="banana">Banana</cv-combobox-option>
    <cv-combobox-option value="cherry">Cherry</cv-combobox-option>
  `

  document.body.append(combobox)
  await settle(combobox)

  const options = Array.from(combobox.querySelectorAll('cv-combobox-option')) as CVComboboxOption[]
  const input = combobox.shadowRoot?.querySelector('[part="input"]') as HTMLInputElement

  return {combobox, options, input}
}

async function mountGrouped() {
  const combobox = document.createElement('cv-combobox') as CVCombobox

  combobox.innerHTML = `
    <cv-combobox-group label="North America">
      <cv-combobox-option value="nyc">New York</cv-combobox-option>
      <cv-combobox-option value="la">Los Angeles</cv-combobox-option>
    </cv-combobox-group>
    <cv-combobox-group label="Europe">
      <cv-combobox-option value="lon">London</cv-combobox-option>
      <cv-combobox-option value="par">Paris</cv-combobox-option>
    </cv-combobox-group>
  `

  document.body.append(combobox)
  await settle(combobox)

  const options = Array.from(combobox.querySelectorAll('cv-combobox-option')) as CVComboboxOption[]
  const groups = Array.from(combobox.querySelectorAll('cv-combobox-group'))
  const input = combobox.shadowRoot?.querySelector('[part="input"]') as HTMLInputElement
  const listbox = combobox.shadowRoot?.querySelector('[part="listbox"]') as HTMLElement

  return {combobox, options, groups, input, listbox}
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-combobox', () => {
  it('filters visible options from input text', async () => {
    const {combobox, options, input} = await mountCombobox()

    input.value = 'be'
    input.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
    await settle(combobox)

    expect(combobox.open).toBe(true)
    expect(options[0]!.hidden).toBe(true)
    expect(options[1]!.hidden).toBe(false)
  })

  it('supports keyboard navigation and selection with Enter', async () => {
    const {combobox, options, input} = await mountCombobox()
    const changes: Array<{value: string | null; inputValue: string; activeId: string | null; open: boolean}> = []

    combobox.addEventListener('cv-change', (event) => {
      changes.push(
        (event as CustomEvent<{value: string | null; inputValue: string; activeId: string | null; open: boolean}>)
          .detail,
      )
    })

    input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
    await settle(combobox)

    expect(combobox.value).toBe('b')
    expect(combobox.inputValue).toBe('Beta')
    expect(combobox.open).toBe(false)
    expect(options[1]!.selected).toBe(true)
    expect(changes.at(-1)?.value).toBe('b')
  })

  it('selects option on click and emits change', async () => {
    const {combobox, options, input} = await mountCombobox()
    let changeCount = 0

    combobox.addEventListener('cv-change', () => {
      changeCount += 1
    })

    input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
    await settle(combobox)

    options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(combobox)

    expect(combobox.value).toBe('b')
    expect(combobox.open).toBe(false)
    expect(changeCount).toBe(1)
  })

  it('keeps popup open when closeOnSelect is false', async () => {
    const {combobox, options, input} = await mountCombobox({closeOnSelect: false})

    input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
    await settle(combobox)
    expect(combobox.open).toBe(true)

    options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(combobox)

    expect(combobox.value).toBe('b')
    expect(combobox.open).toBe(true)
  })

  it('closes when clicking outside', async () => {
    const {combobox, input} = await mountCombobox()

    input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
    await settle(combobox)
    expect(combobox.open).toBe(true)

    document.body.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true}))
    await settle(combobox)

    expect(combobox.open).toBe(false)
  })

  it('preserves valid selected value after slot rebuild', async () => {
    const {combobox} = await mountCombobox()
    const optionB = combobox.querySelector('cv-combobox-option[value="b"]') as CVComboboxOption
    const input = combobox.shadowRoot?.querySelector('[part="input"]') as HTMLInputElement

    input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
    optionB.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(combobox)

    expect(combobox.value).toBe('b')

    const optionA = combobox.querySelector('cv-combobox-option[value="a"]') as CVComboboxOption
    optionA.remove()
    await settle(combobox)

    expect(combobox.value).toBe('b')
    expect((combobox.querySelector('cv-combobox-option[value="b"]') as CVComboboxOption).selected).toBe(true)
  })

  it('exposes combobox aria contract on input and listbox', async () => {
    const {combobox, input} = await mountCombobox()
    const listbox = combobox.shadowRoot?.querySelector('[part="listbox"]') as HTMLDivElement

    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-haspopup')).toBe('listbox')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-controls')).toBe(listbox.id)
    expect(input.getAttribute('aria-activedescendant')).toBeNull()

    input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
    await settle(combobox)

    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBeTruthy()
  })

  it('emits input on open-state interaction without emitting change', async () => {
    const {combobox, input} = await mountCombobox()
    const inputs: Array<{value: string | null; inputValue: string; activeId: string | null; open: boolean}> = []
    let changeCount = 0

    combobox.addEventListener('cv-input', (event) => {
      inputs.push(
        (event as CustomEvent<{value: string | null; inputValue: string; activeId: string | null; open: boolean}>)
          .detail,
      )
    })
    combobox.addEventListener('cv-change', () => {
      changeCount += 1
    })

    input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
    await settle(combobox)

    expect(combobox.open).toBe(true)
    expect(inputs.length).toBeGreaterThan(0)
    expect(inputs.at(-1)?.open).toBe(true)
    expect(changeCount).toBe(0)
  })

  it('does not open on focus when openOnFocus is false', async () => {
    const {combobox, input} = await mountCombobox({openOnFocus: false, openOnClick: false})

    input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
    await settle(combobox)

    expect(combobox.open).toBe(false)
  })

  it('opens on click when openOnClick is true and openOnFocus is false', async () => {
    const {combobox, input} = await mountCombobox({openOnFocus: false, openOnClick: true})

    input.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(combobox)

    expect(combobox.open).toBe(true)
  })

  it('uses startsWith match mode when configured', async () => {
    const {combobox, options, input} = await mountCombobox({matchMode: 'startsWith'})

    input.value = 'ta'
    input.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
    await settle(combobox)

    expect(combobox.open).toBe(true)
    expect(options[0]!.hidden).toBe(true)
    expect(options[1]!.hidden).toBe(true)
    expect(options[2]!.hidden).toBe(true)

    input.value = 'be'
    input.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
    await settle(combobox)

    expect(options[1]!.hidden).toBe(false)
  })

  // =============================================
  // NEW FEATURE TESTS
  // =============================================

  describe('select-only mode', () => {
    it('renders trigger instead of input when type="select-only"', async () => {
      const {combobox, trigger} = await mountSelectOnly()
      const input = combobox.shadowRoot?.querySelector('[part="input"]')

      expect(trigger).not.toBeNull()
      expect(input).toBeNull()
    })

    it('trigger shows selected value text', async () => {
      const {combobox, trigger, options} = await mountSelectOnly()

      // Open and select an option
      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(combobox)

      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      const label = combobox.shadowRoot?.querySelector('[part="label"]') as HTMLElement
      expect(label).not.toBeNull()
      expect(label.textContent?.trim()).toBe('United States')
    })

    it('trigger has role="combobox" and aria-expanded (delegated from headless)', async () => {
      const {trigger} = await mountSelectOnly()

      // Verify these come from headless getInputProps, not hardcoded
      expect(trigger.getAttribute('role')).toBe('combobox')
      expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })

    it('does not have aria-autocomplete in select-only mode (headless contract)', async () => {
      const {trigger} = await mountSelectOnly()

      expect(trigger.hasAttribute('aria-autocomplete')).toBe(false)
    })

    it('Space key opens listbox when closed', async () => {
      const {combobox, trigger} = await mountSelectOnly()

      expect(combobox.open).toBe(false)
      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(combobox)

      expect(combobox.open).toBe(true)
    })

    it('Enter key opens listbox when closed', async () => {
      const {combobox, trigger} = await mountSelectOnly()

      expect(combobox.open).toBe(false)
      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(combobox)

      expect(combobox.open).toBe(true)
    })

    it('Enter key selects active option when open', async () => {
      const {combobox, trigger} = await mountSelectOnly()

      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(combobox)
      expect(combobox.open).toBe(true)

      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(combobox)

      expect(combobox.value).toBeTruthy()
      expect(combobox.open).toBe(false)
    })

    it('type-to-select: typing characters jumps to matching option', async () => {
      const {combobox, trigger} = await mountSelectOnly()

      // Open the listbox
      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(combobox)

      // Type 'g' to jump to Germany
      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'g', bubbles: true}))
      await settle(combobox)

      // The active option should now be Germany (de)
      const activeOption = combobox.querySelector('cv-combobox-option[data-active="true"]') as CVComboboxOption
      expect(activeOption).not.toBeNull()
      expect(activeOption.value).toBe('de')
    })

    it('Down/Up arrows navigate options', async () => {
      const {combobox, trigger} = await mountSelectOnly()

      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(combobox)
      expect(combobox.open).toBe(true)

      // Navigate down
      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(combobox)

      const activeOption = combobox.querySelector('cv-combobox-option[data-active="true"]') as CVComboboxOption
      expect(activeOption).not.toBeNull()
    })

    it('all options always visible (no filtering)', async () => {
      const {combobox, options, trigger} = await mountSelectOnly()

      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(combobox)

      // All non-disabled options should be visible when open
      const visibleOptions = options.filter((o) => !o.hidden && !o.disabled)
      expect(visibleOptions.length).toBe(3)
    })

    it('shows placeholder when no value selected', async () => {
      const {combobox} = await mountSelectOnly({placeholder: 'Select a country'})
      const label = combobox.shadowRoot?.querySelector('[part="label"]') as HTMLElement

      expect(label).not.toBeNull()
      expect(label.textContent?.trim()).toBe('Select a country')
    })
  })

  describe('multi-select', () => {
    it('multiple attribute enables multi-select', async () => {
      const {combobox} = await mountMultiSelect()

      expect((combobox as any).multiple).toBe(true)
    })

    it('clicking options toggles selection (does not replace)', async () => {
      const {combobox, options, input} = await mountMultiSelect()

      // Open
      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)

      // Select first option
      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      // Select second option
      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      // Both should be selected
      expect(options[0]!.selected).toBe(true)
      expect(options[1]!.selected).toBe(true)
    })

    it('listbox stays open after selection', async () => {
      const {combobox, options, input} = await mountMultiSelect()

      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)

      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      expect(combobox.open).toBe(true)
    })

    it('value is space-delimited string of selected option values', async () => {
      const {combobox, options, input} = await mountMultiSelect()

      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)

      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)
      options[2]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      expect(combobox.value).toBe('js py')
    })

    it('selected options have aria-selected="true" (headless contract)', async () => {
      const {combobox, options, input} = await mountMultiSelect()

      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)

      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)
      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      expect(options[0]!.getAttribute('aria-selected')).toBe('true')
      expect(options[1]!.getAttribute('aria-selected')).toBe('true')
      expect(options[2]!.getAttribute('aria-selected')).toBe('false')
    })

    it('listbox has aria-multiselectable="true" (headless contract)', async () => {
      const {listbox} = await mountMultiSelect()

      expect(listbox.getAttribute('aria-multiselectable')).toBe('true')
    })

    it('renders tags/chips for selected items', async () => {
      const {combobox, options, input} = await mountMultiSelect()

      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)

      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)
      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      const tags = combobox.shadowRoot!.querySelectorAll('[part="tag"]')
      expect(tags.length).toBe(2)

      const tagLabels = Array.from(tags).map(
        (tag) => tag.querySelector('[part="tag-label"]')?.textContent?.trim(),
      )
      expect(tagLabels).toContain('JavaScript')
      expect(tagLabels).toContain('TypeScript')
    })

    it('tag remove button deselects the option', async () => {
      const {combobox, options, input} = await mountMultiSelect()

      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)

      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)
      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      // Click remove on first tag
      const removeButtons = combobox.shadowRoot!.querySelectorAll('[part="tag-remove"]')
      expect(removeButtons.length).toBe(2)
      ;(removeButtons[0] as HTMLButtonElement).click()
      await settle(combobox)

      expect(options[0]!.selected).toBe(false)
      expect(options[1]!.selected).toBe(true)

      const remainingTags = combobox.shadowRoot!.querySelectorAll('[part="tag"]')
      expect(remainingTags.length).toBe(1)
    })

    it('max-tags-visible limits visible tags, shows "+N" overflow', async () => {
      const {combobox, options, input} = await mountMultiSelect({maxTagsVisible: 2})

      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)

      // Select 4 options
      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)
      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)
      options[2]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)
      options[3]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      const tags = combobox.shadowRoot!.querySelectorAll('[part="tag"]')
      expect(tags.length).toBe(2)

      const overflow = combobox.shadowRoot!.querySelector('[part="tag-overflow"]') as HTMLElement
      expect(overflow).not.toBeNull()
      expect(overflow.textContent?.trim()).toContain('+2')
    })

    it('Enter key toggles current option (does not close)', async () => {
      const {combobox, options, input} = await mountMultiSelect()

      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)

      // First option is already active after focus opens listbox.
      // Press Enter to select it.
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(combobox)

      expect(combobox.open).toBe(true)
      expect(options[0]!.selected).toBe(true)

      // Press Enter again to deselect
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(combobox)

      expect(combobox.open).toBe(true)
      expect(options[0]!.selected).toBe(false)
    })

    it('fires input event on each toggle', async () => {
      const {combobox, options, input} = await mountMultiSelect()
      let inputCount = 0

      combobox.addEventListener('cv-input', () => {
        inputCount++
      })

      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)
      inputCount = 0 // reset after open input event

      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      expect(inputCount).toBeGreaterThanOrEqual(1)

      const prevCount = inputCount
      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      expect(inputCount).toBeGreaterThan(prevCount)
    })

    it('fires change event on each toggle', async () => {
      const {combobox, options, input} = await mountMultiSelect()
      let changeCount = 0

      combobox.addEventListener('cv-change', () => {
        changeCount++
      })

      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)

      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)
      expect(changeCount).toBe(1)

      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)
      expect(changeCount).toBe(2)
    })
  })

  describe('clearable', () => {
    it('clearable attribute shows clear button when value is present', async () => {
      const {combobox, options, input} = await mountClearable()

      // Select an option
      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)
      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      const clearButton = combobox.shadowRoot!.querySelector('[part="clear-button"]') as HTMLElement
      expect(clearButton).not.toBeNull()
    })

    it('clear button not visible when no value', async () => {
      const {combobox} = await mountClearable()

      const clearButton = combobox.shadowRoot!.querySelector('[part="clear-button"]') as HTMLElement
      expect(clearButton).toBeNull()
    })

    it('clicking clear button resets selection and input value', async () => {
      const {combobox, options, input} = await mountClearable()

      // Select an option
      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)
      options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      expect(combobox.value).toBe('banana')

      const clearButton = combobox.shadowRoot!.querySelector('[part="clear-button"]') as HTMLElement
      expect(clearButton).not.toBeNull()
      clearButton.click()
      await settle(combobox)

      expect(combobox.value).toBe('')
      expect(combobox.inputValue).toBe('')
    })

    it('fires cv-clear event when cleared', async () => {
      const {combobox, options, input} = await mountClearable()
      let clearEventFired = false

      combobox.addEventListener('cv-clear', () => {
        clearEventFired = true
      })

      // Select an option
      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)
      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      const clearButton = combobox.shadowRoot!.querySelector('[part="clear-button"]') as HTMLElement
      clearButton.click()
      await settle(combobox)

      expect(clearEventFired).toBe(true)
    })

    it('clear button has accessible label', async () => {
      const {combobox, options, input} = await mountClearable()

      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)
      options[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      const clearButton = combobox.shadowRoot!.querySelector('[part="clear-button"]') as HTMLElement
      const hasLabel =
        clearButton.hasAttribute('aria-label') ||
        clearButton.hasAttribute('aria-labelledby') ||
        clearButton.getAttribute('title') != null
      expect(hasLabel).toBe(true)
    })
  })

  describe('option groups', () => {
    it('cv-combobox-group renders group headers in listbox', async () => {
      const {listbox} = await mountGrouped()

      const groupLabels = listbox.querySelectorAll('[part="group-label"]')
      expect(groupLabels.length).toBe(2)
      expect(groupLabels[0]!.textContent?.trim()).toBe('North America')
      expect(groupLabels[1]!.textContent?.trim()).toBe('Europe')
    })

    it('group has role="group" with aria-labelledby (headless contract)', async () => {
      const {listbox} = await mountGrouped()

      const groupElements = listbox.querySelectorAll('[part="group"]')
      expect(groupElements.length).toBe(2)

      for (const group of groupElements) {
        expect(group.getAttribute('role')).toBe('group')
        expect(group.hasAttribute('aria-labelledby')).toBe(true)

        // aria-labelledby should point to a group-label element
        const labelId = group.getAttribute('aria-labelledby')!
        const labelElement = listbox.querySelector(`#${labelId}`)
        expect(labelElement).not.toBeNull()
      }
    })

    it('group label has role="presentation" (headless contract)', async () => {
      const {listbox} = await mountGrouped()

      const groupLabels = listbox.querySelectorAll('[part="group-label"]')
      for (const label of groupLabels) {
        expect(label.getAttribute('role')).toBe('presentation')
      }
    })

    it('options within group are selectable', async () => {
      const {combobox, options, input} = await mountGrouped()

      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(combobox)

      options[2]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(combobox)

      expect(combobox.value).toBe('lon')
      expect(options[2]!.selected).toBe(true)
    })

    it('filtering hides groups with no matching options', async () => {
      const {combobox, input, listbox} = await mountGrouped()

      input.value = 'lon'
      input.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
      await settle(combobox)

      // "North America" group should be hidden (no matches)
      // "Europe" group should be visible (London matches)
      const groupElements = listbox.querySelectorAll('[part="group"]')
      expect(groupElements.length).toBe(2)

      // The first group (North America) should be hidden since no options match "lon"
      const visibleGroups = Array.from(groupElements).filter((g) => !(g as HTMLElement).hidden)
      expect(visibleGroups.length).toBe(1)
    })
  })
})
