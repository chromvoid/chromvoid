import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CVCombobox, CVInput, CVRadio, CVRadioGroup, CVTextarea} from '@chromvoid/uikit'
import {PMEntryCreateDesktop} from '../../src/features/passmanager/components/card/entry-create/entry-create'
import {PMEntryCreateMobile} from '../../src/features/passmanager/components/card/entry-create/entry-create-mobile'

const settle = async (component: HTMLElement & {updateComplete: Promise<unknown>}) => {
  await component.updateComplete
  await Promise.resolve()
  await component.updateComplete
}

const getTypeSwitchIcons = (component: HTMLElement) =>
  Array.from(component.shadowRoot?.querySelectorAll('.entry-type-option cv-icon') ?? []).map((icon) => icon.getAttribute('name'))

const getTypeSwitch = (component: HTMLElement) =>
  component.shadowRoot?.querySelector('cv-radio-group.entry-type-switch') as CVRadioGroup | null

const getTypeOptions = (component: HTMLElement) =>
  Array.from(component.shadowRoot?.querySelectorAll('cv-radio.entry-type-option') ?? []) as CVRadio[]

describe('PMEntryCreate entry type switch', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
    window.passmanager = {
      isReadOnly: vi.fn(() => false),
      showElement: () => null,
    } as unknown as typeof window.passmanager

    CVInput.define()
    CVRadio.define()
    CVRadioGroup.define()
    CVTextarea.define()
    CVCombobox.define()
    PMEntryCreateDesktop.define()
    PMEntryCreateMobile.define()

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.passmanager = previousPassmanager
    vi.restoreAllMocks()
  })

  it('uses registered icons for desktop entry types', async () => {
    const component = document.createElement('pm-entry-create-desktop') as HTMLElement & {
      updateComplete: Promise<unknown>
    }
    document.body.append(component)
    await settle(component)

    expect(getTypeSwitchIcons(component)).toEqual(['person-circle', 'credit-card'])
  })

  it('uses registered icons for mobile entry types', async () => {
    const component = document.createElement('pm-entry-create-mobile') as HTMLElement & {
      updateComplete: Promise<unknown>
    }
    document.body.append(component)
    await settle(component)

    expect(getTypeSwitchIcons(component)).toEqual(['person-circle', 'credit-card'])
  })

  it('uses segmented radio semantics for desktop entry types', async () => {
    const component = document.createElement('pm-entry-create-desktop') as HTMLElement & {
      updateComplete: Promise<unknown>
    }
    document.body.append(component)
    await settle(component)

    const group = getTypeSwitch(component)
    const options = getTypeOptions(component)

    expect(component.shadowRoot?.querySelector('[role="tablist"]')).toBeNull()
    expect(group).not.toBeNull()
    expect(group?.getAttribute('variant')).toBe('segmented')
    expect(group?.shadowRoot?.querySelector('[part="base"]')?.getAttribute('role')).toBe('radiogroup')
    expect(options.map((option) => option.value)).toEqual(['login', 'payment_card'])
    expect(options.map((option) => option.getAttribute('role'))).toEqual(['radio', 'radio'])
    expect(options.map((option) => option.getAttribute('aria-checked'))).toEqual(['true', 'false'])

    options[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(component)

    const updatedOptions = getTypeOptions(component)
    expect(getTypeSwitch(component)?.value).toBe('payment_card')
    expect(updatedOptions.map((option) => option.getAttribute('aria-checked'))).toEqual(['false', 'true'])
  })

  it('keeps keyboard selection behavior for mobile entry types', async () => {
    const component = document.createElement('pm-entry-create-mobile') as HTMLElement & {
      updateComplete: Promise<unknown>
    }
    document.body.append(component)
    await settle(component)

    const options = getTypeOptions(component)

    expect(component.shadowRoot?.querySelector('[role="tablist"]')).toBeNull()
    expect(getTypeSwitch(component)?.getAttribute('variant')).toBe('segmented')
    expect(options.map((option) => option.getAttribute('aria-checked'))).toEqual(['true', 'false'])

    options[0]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
    await settle(component)

    expect(getTypeSwitch(component)?.value).toBe('payment_card')
    expect(getTypeOptions(component).map((option) => option.getAttribute('aria-checked'))).toEqual(['false', 'true'])
  })

  it('uses the shared mobile tag picker in the Details hub', async () => {
    const component = document.createElement('pm-entry-create-mobile') as HTMLElement & {
      updateComplete: Promise<unknown>
    }
    document.body.append(component)
    await settle(component)

    const model = (component as unknown as {
      model: {openDetailsSheet(): void; openDetailsEditor(detail: 'tags'): void}
    }).model
    model.openDetailsSheet()
    model.openDetailsEditor('tags')
    await settle(component)

    const sheet = component.shadowRoot?.querySelector('pm-entry-create-details-sheet') as
      | (HTMLElement & {shadowRoot?: ShadowRoot; updateComplete: Promise<unknown>})
      | null
    if (sheet) await settle(sheet)

    const picker = sheet?.shadowRoot?.querySelector('[data-detail-editor="tags"]') as
      | (HTMLElement & {shadowRoot?: ShadowRoot; updateComplete: Promise<unknown>})
      | null
    if (picker) await settle(picker)

    expect(picker?.tagName.toLowerCase()).toBe('pm-mobile-tag-picker')
    expect(picker?.querySelector('[slot="leading"][data-detail-back]')).not.toBeNull()
    expect(picker?.shadowRoot?.querySelector('.new-tag-button')).not.toBeNull()
    expect(picker?.shadowRoot?.querySelector('.edit-toggle')).not.toBeNull()
    expect(picker?.shadowRoot?.querySelectorAll('.tag-chip-wrap')).toHaveLength(0)
    expect(picker?.shadowRoot?.querySelector('.empty-state')).not.toBeNull()
    expect(sheet?.shadowRoot?.querySelector('cv-combobox.entry-tags-combobox')).toBeNull()
    expect(picker?.shadowRoot?.querySelector('cv-bottom-sheet')).toBeNull()
  })
})
