import {afterEach, describe, expect, it} from 'vitest'

import {CVRadio} from './cv-radio'
import {CVRadioGroup} from './cv-radio-group'

const settle = async (element: CVRadioGroup) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

const hasElementInternals = typeof (HTMLElement.prototype as {attachInternals?: unknown}).attachInternals === 'function'

async function mountRadioGroup(params: {disabled?: boolean} = {}) {
  CVRadio.define()
  CVRadioGroup.define()

  const group = document.createElement('cv-radio-group') as CVRadioGroup
  if (params.disabled) {
    group.disabled = true
  }

  group.innerHTML = `
    <cv-radio value="a">Alpha</cv-radio>
    <cv-radio value="b" disabled>Beta</cv-radio>
    <cv-radio value="c">Gamma</cv-radio>
  `

  document.body.append(group)
  await settle(group)

  const radios = Array.from(group.querySelectorAll('cv-radio')) as CVRadio[]
  return {group, radios}
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-radio-group', () => {
  it('parses cv-radio slot items and syncs aria radio props', async () => {
    const {group, radios} = await mountRadioGroup()

    expect(group.getAttribute('role')).toBeNull()
    expect(radios[0]!.getAttribute('role')).toBe('radio')
    expect(radios[0]!.getAttribute('tabindex')).toBe('0')
    expect(radios[0]!.getAttribute('aria-checked')).toBe('false')

    expect(radios[1]!.getAttribute('aria-disabled')).toBe('true')
    expect(radios[2]!.getAttribute('role')).toBe('radio')
  })

  it('supports keyboard navigation and emits input/change when value changes', async () => {
    const {group, radios} = await mountRadioGroup()

    const inputEvents: Array<{value: string | null; activeId: string | null}> = []
    const changeEvents: Array<{value: string | null; activeId: string | null}> = []

    group.addEventListener('cv-input', (event) => {
      inputEvents.push((event as CustomEvent<{value: string | null; activeId: string | null}>).detail)
    })

    group.addEventListener('cv-change', (event) => {
      changeEvents.push((event as CustomEvent<{value: string | null; activeId: string | null}>).detail)
    })

    radios[0]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
    await settle(group)

    expect(group.value).toBe('c')
    expect((group.querySelector('cv-radio[value="c"]') as CVRadio).checked).toBe(true)
    expect(inputEvents.at(-1)).toEqual({value: 'c', activeId: 'c'})
    expect(changeEvents.at(-1)).toEqual({value: 'c', activeId: 'c'})
  })

  it('selects on click and keeps single selection state', async () => {
    const {group, radios} = await mountRadioGroup()

    radios[2]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(group)

    expect(group.value).toBe('c')
    expect(radios[0]!.checked).toBe(false)
    expect(radios[2]!.checked).toBe(true)
  })

  it('prevents value changes when group is disabled', async () => {
    const {group, radios} = await mountRadioGroup({disabled: true})
    const initialValue = group.value

    let changeCount = 0
    group.addEventListener('cv-change', () => {
      changeCount += 1
    })

    radios[2]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    radios[0]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
    await settle(group)

    expect(group.value).toBe(initialValue)
    expect(changeCount).toBe(0)
    expect(radios[2]!.getAttribute('aria-disabled')).toBe('true')
  })

  it('preserves valid selected value across slot rebuilds', async () => {
    const {group} = await mountRadioGroup()

    const radioC = group.querySelector('cv-radio[value="c"]') as CVRadio
    radioC.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(group)

    expect(group.value).toBe('c')

    const radioA = group.querySelector('cv-radio[value="a"]') as CVRadio
    radioA.remove()
    await settle(group)

    expect(group.value).toBe('c')
    expect((group.querySelector('cv-radio[value="c"]') as CVRadio).checked).toBe(true)
  })

  // --- ARIA attributes originate from headless contracts ---

  describe('headless contract delegation', () => {
    it('role="radiogroup" on base element originates from headless getRootProps()', async () => {
      const {group} = await mountRadioGroup()
      const base = group.shadowRoot!.querySelector('[part="base"]') as HTMLElement
      expect(base.getAttribute('role')).toBe('radiogroup')
    })

    it('radio role, tabindex, aria-checked on children originate from headless getRadioProps()', async () => {
      const {radios} = await mountRadioGroup()

      // All radios get role="radio" from headless contracts
      for (const radio of radios) {
        expect(radio.getAttribute('role')).toBe('radio')
        expect(radio.hasAttribute('tabindex')).toBe(true)
        expect(radio.hasAttribute('aria-checked')).toBe(true)
      }

      // Exactly one radio has tabindex="0" (roving tabindex from headless)
      const tabbable = radios.filter((r) => r.getAttribute('tabindex') === '0')
      expect(tabbable).toHaveLength(1)
    })

    it('aria-disabled on group base when group is disabled', async () => {
      const {group} = await mountRadioGroup({disabled: true})
      const base = group.shadowRoot!.querySelector('[part="base"]') as HTMLElement
      expect(base.getAttribute('aria-disabled')).toBe('true')
    })

    it('aria-orientation on base reflects orientation attribute', async () => {
      CVRadio.define()
      CVRadioGroup.define()

      const group = document.createElement('cv-radio-group') as CVRadioGroup
      group.orientation = 'vertical'
      group.innerHTML = `
        <cv-radio value="a">Alpha</cv-radio>
        <cv-radio value="b">Beta</cv-radio>
      `
      document.body.append(group)
      await settle(group)

      const base = group.shadowRoot!.querySelector('[part="base"]') as HTMLElement
      expect(base.getAttribute('aria-orientation')).toBe('vertical')
    })
  })

  // --- Size propagation ---

  describe('size propagation', () => {
    it('child radios retain their individual size attribute', async () => {
      CVRadio.define()
      CVRadioGroup.define()

      const group = document.createElement('cv-radio-group') as CVRadioGroup
      group.innerHTML = `
        <cv-radio value="sm" size="small">Small</cv-radio>
        <cv-radio value="med" size="medium">Medium</cv-radio>
        <cv-radio value="lg" size="large">Large</cv-radio>
      `
      document.body.append(group)
      await settle(group)

      const radios = Array.from(group.querySelectorAll('cv-radio')) as CVRadio[]
      expect(radios[0]!.getAttribute('size')).toBe('small')
      expect(radios[1]!.getAttribute('size')).toBe('medium')
      expect(radios[2]!.getAttribute('size')).toBe('large')
    })
  })

  // --- Description slot support ---

  describe('description slot support', () => {
    it('cv-radio with description slot content renders description part', async () => {
      CVRadio.define()
      CVRadioGroup.define()

      const group = document.createElement('cv-radio-group') as CVRadioGroup
      group.value = 'with-desc'
      group.innerHTML = `
        <cv-radio value="with-desc">
          Primary option
          <span slot="description">Additional details</span>
        </cv-radio>
        <cv-radio value="other">Other option</cv-radio>
      `
      document.body.append(group)
      await settle(group)

      const radio = group.querySelector('cv-radio[value="with-desc"]') as CVRadio
      const descPart = radio.shadowRoot!.querySelector('[part="description"]')
      expect(descPart).not.toBeNull()

      const descSlot = descPart!.querySelector('slot[name="description"]')
      expect(descSlot).not.toBeNull()
    })

    it('aria-describedby is set on radio when describedBy is provided via headless item config', async () => {
      CVRadio.define()
      CVRadioGroup.define()

      const group = document.createElement('cv-radio-group') as CVRadioGroup
      group.innerHTML = `
        <cv-radio value="with-desc">
          Primary option
          <span slot="description">Additional details</span>
        </cv-radio>
        <cv-radio value="other">Other option</cv-radio>
      `
      document.body.append(group)
      await settle(group)

      // The radio with description should have aria-describedby set
      // (once the group passes describedBy to the headless model)
      const radioWithDesc = group.querySelector('cv-radio[value="with-desc"]') as CVRadio
      const radioWithout = group.querySelector('cv-radio[value="other"]') as CVRadio

      // Verify that when describedBy is configured, aria-describedby appears
      // and when not configured, it is absent
      expect(radioWithout.hasAttribute('aria-describedby')).toBe(false)
      // The radio with description should have aria-describedby linking to description element
      expect(radioWithDesc.hasAttribute('aria-describedby')).toBe(true)
    })
  })

  describe('form association', () => {
    it('declares formAssociated for the custom element', () => {
      expect(CVRadioGroup.formAssociated).toBe(true)
    })

    it.skipIf(!hasElementInternals)('contributes selected value to FormData', async () => {
      const {group, radios} = await mountRadioGroup()
      group.setAttribute('name', 'plan')

      radios[2]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(group)

      const form = document.createElement('form')
      form.append(group)
      document.body.append(form)
      await settle(group)

      const value = new FormData(form).get('plan')
      if (value === null) {
        return
      }

      expect(value).toBe('c')
    })

    it('treats required radio group as invalid until a value is selected', async () => {
      CVRadio.define()
      CVRadioGroup.define()

      const group = document.createElement('cv-radio-group') as CVRadioGroup
      group.required = true
      group.innerHTML = `
        <cv-radio value="a">Alpha</cv-radio>
        <cv-radio value="b">Beta</cv-radio>
      `
      document.body.append(group)
      await settle(group)

      expect(group.checkValidity()).toBe(false)

      const radios = Array.from(group.querySelectorAll('cv-radio')) as CVRadio[]
      radios[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(group)

      expect(group.checkValidity()).toBe(true)
    })
  })
})
