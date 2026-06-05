import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CVCombobox, CVInput, CVTextarea} from '@chromvoid/uikit'
import {PMEntryCreateDesktop} from '../../src/features/passmanager/components/card/entry-create/entry-create'
import {PMEntryCreateMobile} from '../../src/features/passmanager/components/card/entry-create/entry-create-mobile'

const settle = async (component: HTMLElement & {updateComplete: Promise<unknown>}) => {
  await component.updateComplete
  await Promise.resolve()
  await component.updateComplete
}

const getTypeSwitchIcons = (component: HTMLElement) =>
  Array.from(component.shadowRoot?.querySelectorAll('.entry-type-option cv-icon') ?? []).map((icon) => icon.getAttribute('name'))

describe('PMEntryCreate entry type switch', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
    window.passmanager = {
      isReadOnly: vi.fn(() => false),
      showElement: () => null,
    } as unknown as typeof window.passmanager

    CVInput.define()
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

  it('keeps the mobile create tag editor compact', async () => {
    const component = document.createElement('pm-entry-create-mobile') as HTMLElement & {
      updateComplete: Promise<unknown>
    }
    document.body.append(component)
    await settle(component)

    const section = component.shadowRoot?.querySelector('.mobile-tags-section')
    expect(section).not.toBeNull()

    const combobox = section?.querySelector('cv-combobox.entry-tags-combobox') as
      | (HTMLElement & {shadowRoot?: ShadowRoot; updateComplete?: Promise<unknown>})
      | null
    await combobox?.updateComplete

    expect(combobox?.getAttribute('max-tags-visible')).toBe('1')
    expect(combobox?.getAttribute('type')).toBe('select-only')
    expect(combobox?.shadowRoot?.querySelector('[part="input"]')).toBeNull()
    expect(combobox?.shadowRoot?.querySelector('[part="trigger"]')).not.toBeNull()

    const manageButton = section?.querySelector('.entry-tags-manage')
    expect(manageButton?.getAttribute('aria-label')).toBe('Manage tags')
  })

})
