import {CVInput, CVTextarea} from '@chromvoid/uikit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Group, ManagerRoot} from '@project/passmanager/core'
import {setPasswordManagerLang} from '@project/passmanager/i18n'
import {PMGroupEditMobile} from '../../src/features/passmanager/components/group/group/group-edit-mobile'
import {pmGroupEditModel} from '../../src/features/passmanager/components/group/group/group-edit.model'
import {PMGroupMobile} from '../../src/features/passmanager/components/group/group/group-mobile'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

let defined = false

function ensureDefined(): void {
  if (defined) return
  CVInput.define()
  CVTextarea.define()
  PMGroupEditMobile.define()
  PMGroupMobile.define()
  defined = true
}

function createRoot(readOnly = false): {root: ManagerRoot; group: Group} {
  const group = new Group({
    id: 'group-games',
    name: 'Personal/Games',
    description: 'Game accounts',
    iconRef: 'stored:gamepad',
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  })
  const root = new ManagerRoot({} as never)
  root.entries.set([group])
  root.showElement.set(group)
  ;(root as ManagerRoot & {isReadOnly: () => boolean}).isReadOnly = () => readOnly
  return {root, group}
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}): Promise<void> {
  await element.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await element.updateComplete
  const nested = element.shadowRoot?.querySelectorAll<HTMLElement & {updateComplete?: Promise<unknown>}>(
    'pm-group-edit-mobile, cv-input, cv-textarea, mobile-bottom-action-footer',
  )
  if (nested?.length) {
    await Promise.all([...nested].map((item) => item.updateComplete ?? Promise.resolve()))
  }
  await Promise.resolve()
}

function dispatchInput(element: Element | null | undefined, value: string): void {
  element?.dispatchEvent(
    new CustomEvent('cv-input', {
      detail: {value},
      bubbles: true,
      composed: true,
    }),
  )
}

describe('PMGroupEditMobile', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
    setPasswordManagerLang('en')
    ensureDefined()
  })

  afterEach(() => {
    pmGroupEditModel.discard()
    setPassmanagerRoot(undefined)
    window.passmanager = previousPassmanager
    document.body.innerHTML = ''
    setPasswordManagerLang('en')
    vi.restoreAllMocks()
  })

  it('replaces the mobile group content with the focused edit form', async () => {
    const {root, group} = createRoot()
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root)
    pmGroupEditModel.enter(group)

    const element = document.createElement('pm-group-mobile') as PMGroupMobile
    document.body.append(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('pm-group-edit-mobile')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('workspace-dashboard-header')).toBeNull()
    expect(element.shadowRoot?.querySelector('.group-virtual-list')).toBeNull()
    expect(element.shadowRoot?.querySelector('.group-metrics-strip')).toBeNull()
  })

  it('renders the complete form without autofocus and keeps Save available for validation', async () => {
    const {root, group} = createRoot()
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root)
    pmGroupEditModel.enter(group)

    const element = document.createElement('pm-group-edit-mobile') as PMGroupEditMobile
    document.body.append(element)
    await settle(element)

    const nameInput = element.shadowRoot?.querySelector('cv-input[name="name"]') as CVInput | null
    const description = element.shadowRoot?.querySelector(
      'cv-textarea[name="description"]',
    ) as CVTextarea | null
    const footer = element.shadowRoot?.querySelector('mobile-bottom-action-footer')
    const save = element.shadowRoot?.querySelector('cv-button[type="submit"]')
    const iconSelector = element.shadowRoot?.querySelector('button.icon-selector')
    const iconPicker = element.shadowRoot?.querySelector('pm-icon-picker-mobile.icon-picker-dialog')

    expect(nameInput?.value).toBe('Games')
    expect(description?.value).toBe('Game accounts')
    expect(nameInput?.hasAttribute('autofocus')).toBe(false)
    expect(description?.hasAttribute('autofocus')).toBe(false)
    expect(iconSelector?.getAttribute('aria-labelledby')).toBe('group-edit-icon-label group-edit-icon-action')
    expect(iconPicker?.hasAttribute('dialog-only')).toBe(true)
    expect(element.shadowRoot?.querySelector('.access-hint')).toBeNull()
    expect(footer?.getAttribute('columns')).toBe('2')
    expect(footer?.hasAttribute('safe-area')).toBe(true)
    expect(save?.getAttribute('preset')).toBe('action-primary')
    expect(save?.hasAttribute('unstyled')).toBe(false)
    expect(save?.hasAttribute('disabled')).toBe(false)
    ;(iconSelector as HTMLElement | null)?.click()
    await Promise.resolve()
    await (iconPicker as HTMLElement & {updateComplete?: Promise<unknown>})?.updateComplete
    expect(
      (iconPicker?.shadowRoot?.querySelector('cv-bottom-sheet') as (HTMLElement & {open?: boolean}) | null)
        ?.open,
    ).toBe(true)

    dispatchInput(nameInput, '   ')
    await settle(element)
    expect(save?.hasAttribute('disabled')).toBe(false)

    element.shadowRoot
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
    await vi.waitFor(() => expect(element.shadowRoot?.querySelector('cv-field[invalid]')).not.toBeNull())

    expect(save?.hasAttribute('disabled')).toBe(false)
    expect(element.shadowRoot?.querySelector('[slot="error"]')?.textContent).not.toBe('')
    expect(nameInput?.shadowRoot?.activeElement).toBe(nameInput?.shadowRoot?.querySelector('input'))
  })

  it('blocks editing and Save in read-only mode while leaving Cancel available', async () => {
    const {root, group} = createRoot(true)
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root)
    pmGroupEditModel.enter(group)

    const element = document.createElement('pm-group-edit-mobile') as PMGroupEditMobile
    document.body.append(element)
    await settle(element)

    const cancel = element.shadowRoot?.querySelector('.submit-bar cv-button[type="button"]')
    const save = element.shadowRoot?.querySelector('cv-button[type="submit"]')

    expect(element.shadowRoot?.querySelector('cv-input[name="name"]')?.hasAttribute('disabled')).toBe(true)
    expect(
      element.shadowRoot?.querySelector('cv-textarea[name="description"]')?.hasAttribute('disabled'),
    ).toBe(true)
    expect(save?.hasAttribute('disabled')).toBe(true)
    expect(cancel?.hasAttribute('disabled')).toBe(false)
    expect(element.shadowRoot?.querySelector('[slot="message"][role="status"]')).not.toBeNull()
  })

  it('keeps the draft open and announces persistence failure', async () => {
    const {root, group} = createRoot()
    vi.spyOn(root, 'save').mockResolvedValue(false)
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root)
    pmGroupEditModel.enter(group)

    const element = document.createElement('pm-group-edit-mobile') as PMGroupEditMobile
    document.body.append(element)
    await settle(element)

    dispatchInput(element.shadowRoot?.querySelector('cv-input[name="name"]'), 'Gaming')
    element.shadowRoot
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))

    await vi.waitFor(() =>
      expect(element.shadowRoot?.querySelector('[slot="message"][role="alert"]')).not.toBeNull(),
    )

    expect(pmGroupEditModel.active()).toBe(true)
    expect(pmGroupEditModel.name()).toBe('Gaming')
    expect(group.name).toBe('Personal/Games')
    expect(element.shadowRoot?.querySelector('cv-button[type="submit"]')?.hasAttribute('disabled')).toBe(
      false,
    )
  })
})
