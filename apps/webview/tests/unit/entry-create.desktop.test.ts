import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CVButton, CVCombobox, CVInput, CVTextarea} from '@chromvoid/uikit'
import {setPasswordManagerLang} from '@project/passmanager/i18n'
import {PMEntryCreateDesktop} from '../../src/features/passmanager/components/card/entry-create/entry-create'
import {pmCredentialTagsModel} from 'root/features/passmanager/models/pm-credential-tags.model'
import {setPassmanagerRoot} from 'root/features/passmanager/models/pm-root.adapter'

const settle = async (component: PMEntryCreateDesktop) => {
  await component.updateComplete
  await Promise.resolve()
  await component.updateComplete
}

function installTagRoot({
  catalog = [],
  readOnly = false,
}: {
  catalog?: readonly string[]
  readOnly?: boolean
} = {}) {
  let rootCatalog = [...catalog]
  const root = {
    allEntries: [],
    credentialTags: () => rootCatalog,
    isReadOnly: () => readOnly,
    saveCredentialTagCatalog: vi.fn(async (tags: unknown) => {
      rootCatalog = Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : []
      return true
    }),
  }
  setPassmanagerRoot(root as never)
  return root
}

describe('PMEntryCreate desktop layout', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
    installTagRoot()
    window.passmanager = {
      isReadOnly: vi.fn(() => false),
      showElement: () => null,
    } as unknown as typeof window.passmanager

    CVInput.define()
    CVTextarea.define()
    CVButton.define()
    CVCombobox.define()
    PMEntryCreateDesktop.define()

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.passmanager = previousPassmanager
    setPassmanagerRoot(undefined)
    pmCredentialTagsModel.closeSheet()
    setPasswordManagerLang('en')
    vi.restoreAllMocks()
  })

  it('renders separate details, website, and credentials sections', async () => {
    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    expect(component.shadowRoot?.querySelector('.create-header-title')?.textContent).toContain('Create login')
    expect(component.shadowRoot?.querySelector('cv-input[name="title"]')).not.toBeNull()
    const picker = component.shadowRoot?.querySelector('pm-icon-picker') as (HTMLElement & {shadowRoot?: ShadowRoot}) | null
    const avatar = picker?.shadowRoot?.querySelector('pm-avatar-icon') as {icon?: string} | null
    expect(avatar?.icon).toBe('person-circle')

    const detailsSection = component.shadowRoot?.querySelector('.section-desktop-details')
    expect(detailsSection).not.toBeNull()
    expect(detailsSection?.querySelector('cv-input[name="title"]')).not.toBeNull()
    expect(detailsSection?.querySelector('cv-input[name="urls"]')).not.toBeNull()

    const credentialsSection = component.shadowRoot?.querySelector('.section-desktop-credentials')
    expect(credentialsSection).not.toBeNull()
    expect(credentialsSection?.querySelector('cv-input[name="username"]')).not.toBeNull()
    expect(credentialsSection?.querySelector('cv-input[name="urls"]')).toBeNull()
    expect(credentialsSection?.querySelector('cv-input[name="password"]')).not.toBeNull()

    const notesSection = component.shadowRoot?.querySelector('.section-desktop-notes')
    expect(notesSection).not.toBeNull()
    expect(notesSection?.querySelector('cv-textarea[name="note"]')).not.toBeNull()
    expect(notesSection?.querySelector('cv-input[name="urls"]')).toBeNull()

    const tagsSection = component.shadowRoot?.querySelector('.section-desktop-tags')
    expect(tagsSection).not.toBeNull()
    const tagCombobox = tagsSection?.querySelector('cv-combobox.entry-tags-combobox') as
      | (HTMLElement & {shadowRoot?: ShadowRoot; updateComplete?: Promise<unknown>})
      | null
    await tagCombobox?.updateComplete

    expect(tagCombobox).not.toBeNull()
    expect(tagCombobox?.getAttribute('max-tags-visible')).toBe('3')
    expect(tagCombobox?.getAttribute('type')).not.toBe('select-only')
    expect(tagCombobox?.shadowRoot?.querySelector('[part="input"]')).not.toBeNull()
    expect(tagsSection?.querySelector('cv-input[name="entry-tag-input"]')).toBeNull()
    expect(tagsSection?.querySelector('.entry-tags-manage')).not.toBeNull()
  })

  it('renders localized create-entry and payment-card labels', async () => {
    setPasswordManagerLang('ru')

    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    expect(component.shadowRoot?.textContent).toContain('Создать логин')
    expect(component.shadowRoot?.textContent).toContain('Тип записи')
    expect(component.shadowRoot?.textContent).toContain('Платёжная карта')

    const titleInput = component.shadowRoot?.querySelector('cv-input[name="title"]') as CVInput | null
    expect(titleInput?.placeholder).toBe('Введите название')
  })

  it('submits the title entered through the details field', async () => {
    const createEntry = vi.fn()
    window.passmanager = {
      isReadOnly: vi.fn(() => false),
      createEntry,
      showElement: () => null,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    component.shadowRoot?.querySelector('cv-input[name="title"]')?.dispatchEvent(
      new CustomEvent('cv-input', {detail: {value: 'AWS Console'}, bubbles: true, composed: true}),
    )
    component.shadowRoot?.querySelector('cv-input[name="username"]')?.dispatchEvent(
      new CustomEvent('cv-input', {detail: {value: 'alice'}, bubbles: true, composed: true}),
    )
    component.shadowRoot?.querySelector('cv-input[name="password"]')?.dispatchEvent(
      new CustomEvent('cv-input', {detail: {value: 'secret'}, bubbles: true, composed: true}),
    )
    await settle(component)

    const form = component.shadowRoot?.querySelector('form') as HTMLFormElement | null
    const submitEvent = new Event('submit', {bubbles: true, cancelable: true})
    form?.dispatchEvent(submitEvent)
    await settle(component)

    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'AWS Console',
      }),
      'secret',
      '',
      undefined,
    )
  })

  it('keeps create enabled for invalid form state and shows inline validation errors on submit', async () => {
    const createEntry = vi.fn()
    window.passmanager = {
      isReadOnly: vi.fn(() => false),
      createEntry,
      showElement: () => null,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    const submitButton = component.shadowRoot?.querySelector('.create-footer cv-button') as CVButton | null
    expect(submitButton?.disabled).toBe(false)

    const form = component.shadowRoot?.querySelector('form') as HTMLFormElement | null
    form?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
    await settle(component)

    const titleInput = component.shadowRoot?.querySelector('cv-input[name="title"]') as CVInput | null
    expect(titleInput?.invalid).toBe(true)
    expect(titleInput?.textContent?.trim()).not.toBe('')
    expect(createEntry).not.toHaveBeenCalled()

    titleInput?.dispatchEvent(
      new CustomEvent('cv-input', {detail: {value: 'AWS Console'}, bubbles: true, composed: true}),
    )
    await settle(component)

    expect(submitButton?.disabled).toBe(false)
    form?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
    await settle(component)

    const usernameInput = component.shadowRoot?.querySelector('cv-input[name="username"]') as CVInput | null
    expect(usernameInput?.invalid).toBe(true)
    expect(usernameInput?.textContent?.trim()).not.toBe('')
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('routes SSH generator events through the create model', async () => {
    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    const model = (component as any).model
    model.setUseSsh(true)
    await settle(component)

    const generator = component.shadowRoot?.querySelector('pm-entry-ssh-generator') as HTMLElement | null
    expect(generator).not.toBeNull()

    generator?.dispatchEvent(
      new CustomEvent('pm-entry-ssh-key-type-change', {
        detail: {keyType: 'rsa'},
        bubbles: true,
        composed: true,
      }),
    )
    generator?.dispatchEvent(
      new CustomEvent('pm-entry-ssh-comment-input', {
        detail: {value: 'root@example'},
        bubbles: true,
        composed: true,
      }),
    )
    generator?.dispatchEvent(
      new CustomEvent('pm-entry-ssh-generate', {
        detail: {},
        bubbles: true,
        composed: true,
      }),
    )

    expect(model.sshGenKeyType()).toBe('rsa')
    expect(model.sshGenComment()).toBe('root@example')
    expect(model.sshGenResult()).toEqual(expect.objectContaining({
      fingerprint: '',
      keyType: 'rsa',
      pending: true,
    }))
  })

  it('updates draft tags from combobox selectedIds and opens tag management', async () => {
    installTagRoot({catalog: ['Work', 'Client A']})

    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    const model = (component as any).model
    await settle(component)

    const combobox = component.shadowRoot?.querySelector('cv-combobox.entry-tags-combobox') as HTMLElement | null
    combobox?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {selectedIds: ['work', 'client-a'], value: 'work client-a', inputValue: '', activeId: null, open: false},
        bubbles: true,
        composed: true,
      }),
    )

    expect(model.tags()).toEqual(['Work', 'Client A'])
    expect(component.shadowRoot?.querySelector('.entry-tags-add')).toBeNull()

    const manageButton = component.shadowRoot?.querySelector('.entry-tags-manage') as HTMLButtonElement | null
    manageButton?.click()

    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(true)
    expect(pmCredentialTagsModel.sheetMode()).toBe('manage')
  })

  it('does not mutate draft tags through the disabled tag editor', async () => {
    installTagRoot({readOnly: true})

    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    const model = (component as any).model
    model.setTags(['Work'])
    await settle(component)

    const combobox = component.shadowRoot?.querySelector('cv-combobox.entry-tags-combobox') as HTMLElement | null
    expect(combobox?.getAttribute('aria-disabled')).toBe('true')
    expect(combobox?.hasAttribute('disabled')).toBe(true)

    combobox?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {selectedIds: ['client-a'], value: 'client-a', inputValue: '', activeId: null, open: false},
        bubbles: true,
        composed: true,
      }),
    )

    expect(model.tags()).toEqual(['Work'])
    expect(component.shadowRoot?.querySelector('.entry-tags-add')).toBeNull()
    expect(component.shadowRoot?.querySelector('.entry-tags-manage')?.hasAttribute('disabled')).toBe(true)
  })
})
