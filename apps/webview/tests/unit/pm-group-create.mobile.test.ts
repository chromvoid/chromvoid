import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {CVInput, CVTextarea} from '@chromvoid/uikit'

import {setPasswordManagerLang} from '@project/passmanager/i18n'
import {PMGroupCreateMobile} from '../../src/features/passmanager/components/group/group-create'
import {groupPresetIconService} from '../../src/features/passmanager/components/group/group-create/group-icon-presets'
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

  it('starts with the destination path and keeps the shell as the only screen header', async () => {
    window.passmanager = {
      createGroup: vi.fn(),
      showElement: () => 'createGroup',
    } as unknown as typeof window.passmanager
    setPasswordManagerLang('ru')

    const element = document.createElement('pm-group-create-mobile') as PMGroupCreateMobile
    document.body.append(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('h1')).toBeNull()
    expect(element.shadowRoot?.querySelector('.location-card')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.create-scroll')?.firstElementChild?.classList).toContain(
      'location-card',
    )
    expect(element.shadowRoot?.textContent).toContain('Создаётся в')
    expect(element.shadowRoot?.textContent).toContain('Корень')
    expect(element.shadowRoot?.textContent).toContain('Новая группа')
    expect(element.shadowRoot?.querySelector('.form-card')).toBeNull()
    expect(element.shadowRoot?.querySelector('.section')).toBeNull()

    const nameInput = element.shadowRoot?.querySelector('cv-input[name="name"]')
    const description = element.shadowRoot?.querySelector('cv-textarea[name="description"]')
    expect(nameInput?.getAttribute('placeholder')).toBe('Например, команда проекта')
    expect(description?.getAttribute('placeholder')).toBe('Кратко опишите назначение группы')
    expect(element.shadowRoot?.textContent).toContain('Остаётся в этом хранилище')
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
    const description = element.shadowRoot?.querySelector(
      'cv-textarea[name="description"]',
    ) as CVTextarea | null

    expect(nameInput?.getAttribute('maxlength')).toBe('40')
    expect(description?.getAttribute('maxlength')).toBe('120')
    expect(element.shadowRoot?.querySelector('.name-field .required-marker')?.textContent).toBe('*')
    expect(element.shadowRoot?.textContent).toContain('0/40')
    expect(element.shadowRoot?.textContent).toContain('0/120')

    dispatchInput(nameInput, 'Project team')
    dispatchInput(description, 'Internal launch notes')
    await settle(element)

    expect(element.shadowRoot?.textContent).toContain('12/40')
    expect(element.shadowRoot?.textContent).toContain('21/120')
  })

  it('keeps submit available for whitespace and explains the missing name on submit', async () => {
    const createGroup = vi.fn()
    window.passmanager = {
      createGroup,
      showElement: () => 'createGroup',
    } as unknown as typeof window.passmanager

    const element = document.createElement('pm-group-create-mobile') as PMGroupCreateMobile
    document.body.append(element)
    await settle(element)

    const submit = element.shadowRoot?.querySelector('cv-button.submit') as HTMLElement | null
    expect(submit?.hasAttribute('disabled')).toBe(false)

    dispatchInput(element.shadowRoot?.querySelector('cv-input[name="name"]'), '   ')
    await settle(element)
    expect(submit?.hasAttribute('disabled')).toBe(false)

    submitForm(element)
    await settle(element)

    const nameInput = element.shadowRoot?.querySelector('cv-input[name="name"]') as CVInput | null
    const nativeInput = nameInput?.shadowRoot?.querySelector('input')
    expect(createGroup).not.toHaveBeenCalled()
    expect(element.shadowRoot?.querySelector('cv-field[invalid]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[slot="error"]')?.textContent).not.toBe('')
    expect(nameInput?.shadowRoot?.activeElement).toBe(nativeInput)
  })

  it('enables submit for a valid name and submits trimmed values', async () => {
    const createGroup = vi.fn()
    vi.spyOn(groupPresetIconService, 'upload').mockResolvedValue('sha256:group-preset')
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
      iconRef: 'sha256:group-preset',
      entries: [],
    })
  })

  it('offers only preset icons and colors and submits the selected pair', async () => {
    const createGroup = vi.fn()
    const upload = vi.spyOn(groupPresetIconService, 'upload').mockResolvedValue('sha256:selected-preset')
    window.passmanager = {
      createGroup,
      showElement: () => 'createGroup',
      entriesList: () => [],
    } as unknown as typeof window.passmanager

    const element = document.createElement('pm-group-create-mobile') as PMGroupCreateMobile
    document.body.append(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('pm-icon-picker-mobile')).toBeNull()
    expect(element.shadowRoot?.querySelector('input[type="file"]')).toBeNull()
    expect(element.shadowRoot?.querySelectorAll('.icon-option')).toHaveLength(8)
    expect(element.shadowRoot?.querySelectorAll('.color-option')).toHaveLength(7)
    expect(
      element.shadowRoot?.querySelector('.icon-option[data-icon="folder"]')?.getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      element.shadowRoot?.querySelector('.color-option[data-color="violet"]')?.getAttribute('aria-pressed'),
    ).toBe('true')

    element.shadowRoot
      ?.querySelector('.icon-option[data-icon="shield"]')
      ?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    element.shadowRoot
      ?.querySelector('.color-option[data-color="amber"]')
      ?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    dispatchInput(element.shadowRoot?.querySelector('cv-input[name="name"]'), 'Protected')
    await settle(element)

    submitForm(element)
    await settle(element)

    expect(upload).toHaveBeenCalledWith({icon: 'shield', color: 'amber'})
    expect(createGroup).toHaveBeenCalledWith({
      name: 'Protected',
      description: '',
      iconRef: 'sha256:selected-preset',
      entries: [],
    })
    const submitBar = element.shadowRoot?.querySelector(
      'mobile-bottom-action-footer.submit-bar',
    ) as HTMLElement | null
    const submitButton = element.shadowRoot?.querySelector('cv-button.submit') as HTMLElement | null
    expect(submitBar?.tagName.toLowerCase()).toBe('mobile-bottom-action-footer')
    expect(submitBar?.shadowRoot?.querySelector('[part="row"]')).not.toBeNull()
    expect(submitBar?.contains(submitButton)).toBe(true)
  })

  it('shows invalid separators inline and blocks submit', async () => {
    const createGroup = vi.fn()
    window.passmanager = {
      createGroup,
      showElement: () => 'createGroup',
      entriesList: () => [],
    } as unknown as typeof window.passmanager

    const element = document.createElement('pm-group-create-mobile') as PMGroupCreateMobile
    document.body.append(element)
    await settle(element)

    dispatchInput(element.shadowRoot?.querySelector('cv-input[name="name"]'), 'Ops/Deploy')
    await settle(element)

    expect(element.shadowRoot?.querySelector('cv-field[invalid]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[slot="error"]')?.textContent).not.toBe('')
    expect(element.shadowRoot?.querySelector('cv-button.submit')?.hasAttribute('disabled')).toBe(false)

    submitForm(element)
    await settle(element)
    expect(createGroup).not.toHaveBeenCalled()
  })

  it('replaces the form with a read-only state', async () => {
    window.passmanager = {
      createGroup: vi.fn(),
      showElement: () => 'createGroup',
      isReadOnly: () => true,
    } as unknown as typeof window.passmanager

    const element = document.createElement('pm-group-create-mobile') as PMGroupCreateMobile
    document.body.append(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.readonly-state')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('form')).toBeNull()
    expect(element.shadowRoot?.textContent).toContain('This vault is read-only')
  })
})
