import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CVButton, CVCombobox, CVInput, CVTextarea} from '@chromvoid/uikit'
import {setPasswordManagerLang} from '@project/passmanager/i18n'
import {PMEntryCreateDesktop} from '../../src/features/passmanager/components/card/entry-create/entry-create'
import {pmCredentialTagsModel} from 'root/features/passmanager/models/pm-credential-tags.model'
import {setPassmanagerRoot} from 'root/features/passmanager/models/pm-root.adapter'

type WorkspaceHeaderElement = HTMLElement & {
  contextLabel?: string
  hasContextBand?: boolean
  titleError?: string
  titlePlaceholder?: string
  shadowRoot: ShadowRoot
}

const settle = async (component: PMEntryCreateDesktop) => {
  await component.updateComplete
  await Promise.resolve()
  await component.updateComplete
}

function clickSubmit(button: CVButton | null, form: HTMLFormElement | null): void {
  if (!button || !form) return
  Object.defineProperty(button, 'form', {configurable: true, value: form})
  button.click()
}

function getWorkspaceHeader(component: PMEntryCreateDesktop): WorkspaceHeaderElement | null {
  return component.shadowRoot?.querySelector('pm-workspace-header') as WorkspaceHeaderElement | null
}

function getWorkspaceTitleInput(component: PMEntryCreateDesktop): CVInput | null {
  return getWorkspaceHeader(component)?.shadowRoot.querySelector('cv-input.title-input') as CVInput | null
}

function setWorkspaceTitle(component: PMEntryCreateDesktop, value: string): void {
  getWorkspaceHeader(component)?.dispatchEvent(
    new CustomEvent('pm-workspace-header-title-input', {
      detail: {value},
      bubbles: true,
      composed: true,
    }),
  )
}

function installTagRoot({
  catalog = [],
  readOnly = false,
  overrides = {},
}: {
  catalog?: readonly string[]
  readOnly?: boolean
  overrides?: Record<string, unknown>
} = {}) {
  let rootCatalog = [...catalog]
  const root = {
    id: 'root',
    name: 'Vault',
    entriesList: vi.fn(() => []),
    getEntry: vi.fn(() => undefined),
    getGroup: vi.fn(() => undefined),
    setShowElement: vi.fn(),
    presentCreatedEntry: vi.fn(),
    showElement: vi.fn(() => 'createEntry'),
    allEntries: [],
    credentialTags: () => rootCatalog,
    isReadOnly: () => readOnly,
    saveCredentialTagCatalog: vi.fn(async (tags: unknown) => {
      rootCatalog = Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : []
      return true
    }),
    ...overrides,
  }
  setPassmanagerRoot(root as never)
  return root
}

describe('PMEntryCreate desktop layout', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
    installTagRoot()

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
    pmCredentialTagsModel.closeCatalogManager()
    setPasswordManagerLang('en')
    vi.restoreAllMocks()
  })

  it('renders a desktop workbench with an editable header, primary fields, and configuration rail', async () => {
    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    const workspaceHeader = getWorkspaceHeader(component)
    expect(workspaceHeader?.contextLabel).toBe('')
    expect(workspaceHeader?.hasContextBand).toBe(false)
    expect(workspaceHeader?.titlePlaceholder).toBe('Enter title')
    expect(getWorkspaceTitleInput(component)).not.toBeNull()
    const picker = workspaceHeader?.shadowRoot.querySelector('pm-icon-picker') as
      | (HTMLElement & {shadowRoot?: ShadowRoot})
      | null
    const avatar = picker?.shadowRoot?.querySelector('pm-avatar-icon') as {icon?: string} | null
    expect(avatar?.icon).toBe('person-circle')

    const primarySurface = component.shadowRoot?.querySelector('.primary-surface')
    expect(primarySurface).not.toBeNull()
    expect(primarySurface?.querySelector('cv-input[name="username"]')).not.toBeNull()
    expect(primarySurface?.querySelector('cv-input[name="password"]')).not.toBeNull()
    const websiteEditor = primarySurface?.querySelector('pm-entry-website-editor') as
      | (HTMLElement & {controlSize?: string})
      | null
    expect(websiteEditor?.controlSize).toBe('large')
    expect(primarySurface?.querySelector('cv-textarea[name="note"]')).not.toBeNull()

    const configurationRail = component.shadowRoot?.querySelector('.configuration-rail')
    expect(configurationRail).not.toBeNull()
    expect(configurationRail?.querySelector('.entry-type-switch')).not.toBeNull()
    const locationSelect = configurationRail?.querySelector('.rail-location-section cv-select') as
      | (HTMLElement & {value?: string})
      | null
    expect(locationSelect?.value).toBe('root')

    const tagsSection = configurationRail?.querySelector('.rail-tags-section')
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

    const workspaceHeader = getWorkspaceHeader(component)
    expect(workspaceHeader?.contextLabel).toBe('')
    expect(component.shadowRoot?.textContent).toContain('Тип записи')
    expect(component.shadowRoot?.textContent).toContain('Платёжная карта')
    expect(getWorkspaceTitleInput(component)?.placeholder).toBe('Введите название')
  })

  it('renders desktop payment-card expiry year as YY input', async () => {
    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    component.shadowRoot?.querySelector('.entry-type-switch')?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {value: 'payment_card'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(component)

    const expYearInput = component.shadowRoot?.querySelector('cv-input[name="cardExpYear"]') as CVInput | null
    expect(expYearInput).not.toBeNull()
    expect(expYearInput?.placeholder).toBe('YY')
    expect(expYearInput?.maxlength).toBe(2)
    expect(expYearInput?.autocomplete).toBe('cc-exp-year')
  })

  it('submits the title entered through the details field', async () => {
    const entry = {
      id: 'desktop-created-entry',
      flushPendingPersistence: vi.fn(async () => {}),
    }
    const createEntry = vi.fn(() => entry)
    installTagRoot({
      overrides: {
        createEntry,
        getEntry: vi.fn((id: string) => (id === entry.id ? entry : undefined)),
      },
    })

    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    setWorkspaceTitle(component, 'AWS Console')
    component.shadowRoot
      ?.querySelector('cv-input[name="username"]')
      ?.dispatchEvent(new CustomEvent('cv-input', {detail: {value: 'alice'}, bubbles: true, composed: true}))
    component.shadowRoot
      ?.querySelector('cv-input[name="password"]')
      ?.dispatchEvent(new CustomEvent('cv-input', {detail: {value: 'secret'}, bubbles: true, composed: true}))
    await settle(component)

    const form = component.shadowRoot?.querySelector('form') as HTMLFormElement | null
    const submitButton = component.shadowRoot?.querySelector('[data-create-entry-submit]') as CVButton | null
    clickSubmit(submitButton, form)
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
    installTagRoot({overrides: {createEntry}})

    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    const submitButton = component.shadowRoot?.querySelector('[data-create-entry-submit]') as CVButton | null
    const form = component.shadowRoot?.querySelector('form') as HTMLFormElement | null
    expect(submitButton?.disabled).toBe(false)
    expect(form?.noValidate).toBe(true)

    clickSubmit(submitButton, form)
    await settle(component)

    const titleInput = getWorkspaceTitleInput(component)
    expect(titleInput?.invalid).toBe(true)
    expect(
      getWorkspaceHeader(component)?.shadowRoot.querySelector('.title-error')?.textContent?.trim(),
    ).not.toBe('')
    expect(createEntry).not.toHaveBeenCalled()

    setWorkspaceTitle(component, 'AWS Console')
    await settle(component)

    expect(submitButton?.disabled).toBe(false)
    clickSubmit(submitButton, form)
    await settle(component)

    const usernameInput = component.shadowRoot?.querySelector('cv-input[name="username"]') as CVInput | null
    expect(usernameInput?.invalid).toBe(true)
    expect(
      component.shadowRoot?.querySelector('.primary-surface .field-error')?.textContent?.trim(),
    ).not.toBe('')
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('does not render create-specific SSH controls', async () => {
    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    expect(component.shadowRoot?.querySelector('pm-entry-ssh-generator')).toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-ssh-create-sheet')).toBeNull()
    expect(component.shadowRoot?.textContent?.toLowerCase()).not.toContain('ssh')
  })

  it('updates draft tags from combobox selectedIds and opens tag management', async () => {
    installTagRoot({catalog: ['Work', 'Client A']})

    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    const model = (component as any).model
    await settle(component)

    const combobox = component.shadowRoot?.querySelector(
      'cv-combobox.entry-tags-combobox',
    ) as HTMLElement | null
    combobox?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {
          selectedIds: ['work', 'client-a'],
          value: 'work client-a',
          inputValue: '',
          activeId: null,
          open: false,
        },
        bubbles: true,
        composed: true,
      }),
    )

    expect(model.tags()).toEqual(['Work', 'Client A'])
    expect(component.shadowRoot?.querySelector('.entry-tags-add')).toBeNull()

    const manageButton = component.shadowRoot?.querySelector('.entry-tags-manage') as HTMLButtonElement | null
    manageButton?.click()

    expect(pmCredentialTagsModel.catalogManagerOpen()).toBe(true)
    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(false)
    expect(pmCredentialTagsModel.sheetMode()).toBe('manage')
    expect(model.tags()).toEqual(['Work', 'Client A'])
  })

  it('does not mutate draft tags through the disabled tag editor', async () => {
    installTagRoot({readOnly: true})

    const component = document.createElement('pm-entry-create-desktop') as PMEntryCreateDesktop
    document.body.append(component)
    await settle(component)

    const model = (component as any).model
    model.setTags(['Work'])
    await settle(component)

    const combobox = component.shadowRoot?.querySelector(
      'cv-combobox.entry-tags-combobox',
    ) as HTMLElement | null
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
