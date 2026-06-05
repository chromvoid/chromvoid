import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {CVInput, CVTextarea} from '@chromvoid/uikit'

import {setPasswordManagerLang} from '@project/passmanager/i18n'
import {PMGroupCreateMobile} from '../../src/features/passmanager/components/group/group-create'
import {passmanagerNavigationController} from '../../src/features/passmanager/passmanager-navigation.controller'
import {MobileBottomActionFooter} from '../../src/shared/ui/mobile-bottom-action-footer'

let defined = false

function ensureDefined() {
  if (defined) return
  CVInput.define()
  CVTextarea.define()
  MobileBottomActionFooter.define()
  PMGroupCreateMobile.define()
  defined = true
}

async function settle(element: PMGroupCreateMobile) {
  await element.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await element.updateComplete
  await Promise.resolve()
}

function dispatchInput(element: Element | null | undefined, value: string) {
  element?.dispatchEvent(
    new CustomEvent('cv-input', {
      detail: {value},
      bubbles: true,
      composed: true,
    }),
  )
}

function submitForm(element: PMGroupCreateMobile) {
  const form = element.shadowRoot?.querySelector('form') as HTMLFormElement | null
  form?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
}

describe('PMGroupCreate mobile', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
    passmanagerNavigationController.reset()
    setPasswordManagerLang('en')
    ensureDefined()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.passmanager = previousPassmanager
    setPasswordManagerLang('en')
    vi.restoreAllMocks()
  })

  it('renders one local title, focused form copy, and one form card', async () => {
    window.passmanager = {
      createGroup: vi.fn(),
      showElement: () => 'createGroup',
    } as unknown as typeof window.passmanager
    setPasswordManagerLang('ru')

    const element = document.createElement('pm-group-create-mobile') as PMGroupCreateMobile
    document.body.append(element)
    await settle(element)

    expect(element.shadowRoot?.querySelectorAll('h1')).toHaveLength(1)
    expect(element.shadowRoot?.querySelector('h1')?.textContent?.trim()).toBe('Новая группа')
    expect(element.shadowRoot?.textContent).not.toContain('Создать группу')
    expect(element.shadowRoot?.querySelector('.form-card')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.section')).toBeNull()

    const nameInput = element.shadowRoot?.querySelector('cv-input[name="name"]')
    const description = element.shadowRoot?.querySelector('cv-textarea[name="description"]')
    expect(nameInput?.getAttribute('placeholder')).toBe('Например, команда проекта')
    expect(description?.getAttribute('placeholder')).toBe('Кратко опишите назначение группы')
    expect(element.shadowRoot?.textContent).toContain('Группа будет доступна только внутри текущего хранилища')
  })

  it('renders required name marker, maxlength contracts, and reactive counters', async () => {
    window.passmanager = {
      createGroup: vi.fn(),
      showElement: () => 'createGroup',
    } as unknown as typeof window.passmanager

    const element = document.createElement('pm-group-create-mobile') as PMGroupCreateMobile
    document.body.append(element)
    await settle(element)

    const nameInput = element.shadowRoot?.querySelector('cv-input[name="name"]') as CVInput | null
    const description = element.shadowRoot?.querySelector('cv-textarea[name="description"]') as CVTextarea | null

    expect(nameInput?.getAttribute('maxlength')).toBe('40')
    expect(description?.getAttribute('maxlength')).toBe('120')
    expect(nameInput?.querySelector('.required-marker')?.textContent).toBe('*')
    expect(element.shadowRoot?.textContent).toContain('0/40')
    expect(element.shadowRoot?.textContent).toContain('0/120')

    dispatchInput(nameInput, 'Project team')
    dispatchInput(description, 'Internal launch notes')
    await settle(element)

    expect(element.shadowRoot?.textContent).toContain('12/40')
    expect(element.shadowRoot?.textContent).toContain('21/120')
  })

  it('keeps submit disabled for whitespace and does not create a group', async () => {
    const createGroup = vi.fn()
    window.passmanager = {
      createGroup,
      showElement: () => 'createGroup',
    } as unknown as typeof window.passmanager

    const element = document.createElement('pm-group-create-mobile') as PMGroupCreateMobile
    document.body.append(element)
    await settle(element)

    const submit = element.shadowRoot?.querySelector('cv-button.submit') as HTMLElement | null
    expect(submit?.hasAttribute('disabled')).toBe(true)

    dispatchInput(element.shadowRoot?.querySelector('cv-input[name="name"]'), '   ')
    await settle(element)
    expect(submit?.hasAttribute('disabled')).toBe(true)

    submitForm(element)
    await settle(element)

    expect(createGroup).not.toHaveBeenCalled()
  })

  it('enables submit for a valid name and submits trimmed values', async () => {
    const createGroup = vi.fn()
    window.passmanager = {
      createGroup,
      showElement: () => 'createGroup',
    } as unknown as typeof window.passmanager

    const element = document.createElement('pm-group-create-mobile') as PMGroupCreateMobile
    document.body.append(element)
    await settle(element)

    const submit = element.shadowRoot?.querySelector('cv-button.submit') as HTMLElement | null

    dispatchInput(element.shadowRoot?.querySelector('cv-input[name="name"]'), '  Project Team  ')
    dispatchInput(element.shadowRoot?.querySelector('cv-textarea[name="description"]'), 'Launch access')
    await settle(element)

    expect(submit?.hasAttribute('disabled')).toBe(false)

    submitForm(element)
    await settle(element)

    expect(createGroup).toHaveBeenCalledWith({
      name: 'Project Team',
      description: 'Launch access',
      iconRef: undefined,
      entries: [],
    })
  })

  it('renders the mobile icon action with chooser copy', async () => {
    window.passmanager = {
      createGroup: vi.fn(),
      showElement: () => 'createGroup',
    } as unknown as typeof window.passmanager

    const element = document.createElement('pm-group-create-mobile') as PMGroupCreateMobile
    document.body.append(element)
    await settle(element)

    const picker = element.shadowRoot?.querySelector('pm-icon-picker-mobile') as
      | (HTMLElement & {updateComplete?: Promise<unknown>})
      | null
    expect(picker).not.toBeNull()
    await picker?.updateComplete

    expect(picker?.getAttribute('trigger-label')).toBe('Choose image')
    expect(picker?.shadowRoot?.textContent).toContain('Choose image')
    expect(element.shadowRoot?.textContent).toContain('An icon helps you find this group faster')
    const submitBar = element.shadowRoot?.querySelector(
      'mobile-bottom-action-footer.submit-bar',
    ) as HTMLElement | null
    const submitButton = element.shadowRoot?.querySelector('cv-button.submit') as HTMLElement | null
    expect(submitBar?.tagName.toLowerCase()).toBe('mobile-bottom-action-footer')
    expect(submitBar?.shadowRoot?.querySelector('[part="row"]')).not.toBeNull()
    expect(submitBar?.contains(submitButton)).toBe(true)
  })
})
