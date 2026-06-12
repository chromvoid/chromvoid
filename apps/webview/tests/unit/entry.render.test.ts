import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const openExternalBrowserUrl = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('../../src/shared/services/external-browser', () => ({
  openExternalBrowserUrl: (url: string) => openExternalBrowserUrl(url),
}))

import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {setPasswordManagerLang} from '@project/passmanager/i18n'
import {CVCopyButton} from '@chromvoid/uikit/components/cv-copy-button'
import {CVCombobox} from '@chromvoid/uikit/components/cv-combobox'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {passmanagerNavigationController} from '../../src/features/passmanager/passmanager-navigation.controller'
import {PMEntry} from '../../src/features/passmanager/components/card/entry/entry'
import {PMEntryModel} from '../../src/features/passmanager/components/card/entry/entry.model'
import {pmEntryEditorModel} from '../../src/features/passmanager/models/pm-entry-editor.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

let defined = false

function ensureDefined() {
  if (defined) return
  CVCopyButton.define()
  CVCombobox.define()
  PMEntry.define()
  defined = true
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

async function settle(element: PMEntry) {
  await element.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await element.updateComplete
  await Promise.resolve()
}

async function settleFocus(element: PMEntry) {
  await settle(element)
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
  await Promise.resolve()
}

const getCvInput = (component: PMEntry, name: string) =>
  component.shadowRoot?.querySelector(`cv-input[name="${name}"]`) as
    | (HTMLElement & {shadowRoot?: ShadowRoot})
    | null

const getNativeInput = (component: PMEntry, name: string) =>
  getCvInput(component, name)?.shadowRoot?.querySelector('input') as HTMLInputElement | null

const getCvTextarea = (component: PMEntry, name: string) =>
  component.shadowRoot?.querySelector(`cv-textarea[name="${name}"]`) as
    | (HTMLElement & {shadowRoot?: ShadowRoot})
    | null

const getNativeTextarea = (component: PMEntry, name: string) =>
  getCvTextarea(component, name)?.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement | null

function expectFocusedTextarea(component: PMEntry, name: string) {
  const textarea = getCvTextarea(component, name)
  const nativeTextarea = getNativeTextarea(component, name)

  expect(textarea).not.toBeNull()
  expect(nativeTextarea).not.toBeNull()
  expect(component.shadowRoot?.activeElement).toBe(textarea)
  expect(textarea?.shadowRoot?.activeElement).toBe(nativeTextarea)
}

function installScrollIntoViewSpy() {
  const previous = HTMLElement.prototype.scrollIntoView
  const scrollIntoView = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })

  return {
    scrollIntoView,
    restore() {
      if (previous) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
          configurable: true,
          value: previous,
        })
        return
      }

      delete (HTMLElement.prototype as {scrollIntoView?: unknown}).scrollIntoView
    },
  }
}

function createEntry(
  options: {
    parent?: ManagerRoot | Group
    flushPendingPersistence?: () => Promise<void>
    password?: () => Promise<string | undefined>
    note?: () => Promise<string | undefined>
    otps?: unknown[]
    sshKeys?: unknown[]
    tags?: string[]
  } = {},
) {
  const parent = options.parent ?? (Object.create(ManagerRoot.prototype) as ManagerRoot)
  const entry = new Entry(parent, {
    id: 'entry-render-test',
    title: 'Entry',
    urls: [{match: 'domain', value: 'https://example.com'}],
    username: 'alice',
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: options.otps ?? [],
    sshKeys: options.sshKeys ?? [],
    tags: options.tags ?? [],
  } as any)

  ;(entry as Entry & {flushPendingPersistence: () => Promise<void>}).flushPendingPersistence = vi.fn(
    options.flushPendingPersistence ?? (async () => {}),
  )
  vi.spyOn(entry, 'password').mockImplementation(options.password ?? (async () => 'secret'))
  vi.spyOn(entry, 'note').mockImplementation(options.note ?? (async () => ''))

  return entry
}

function createPaymentCardEntry(
  options: {
    parent?: ManagerRoot | Group
    flushPendingPersistence?: () => Promise<void>
    cardPan?: () => Promise<string | undefined>
    cardCvv?: () => Promise<string | undefined>
    note?: () => Promise<string | undefined>
    tags?: string[]
  } = {},
) {
  const parent = options.parent ?? (Object.create(ManagerRoot.prototype) as ManagerRoot)
  const entry = new Entry(parent, {
    id: 'entry-payment-card-render-test',
    entryType: 'payment_card',
    title: 'Team Visa',
    urls: [],
    username: '',
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: [],
    sshKeys: [],
    paymentCard: {
      cardholderName: 'Alice Doe',
      expMonth: 12,
      expYear: 2032,
      brand: 'visa',
      last4: '1111',
    },
    tags: options.tags ?? [],
  } as any)

  ;(entry as Entry & {flushPendingPersistence: () => Promise<void>}).flushPendingPersistence = vi.fn(
    options.flushPendingPersistence ?? (async () => {}),
  )
  vi.spyOn(entry, 'cardPan').mockImplementation(options.cardPan ?? (async () => '4111111111111111'))
  vi.spyOn(entry, 'cardCvv').mockImplementation(options.cardCvv ?? (async () => '123'))
  vi.spyOn(entry, 'note').mockImplementation(options.note ?? (async () => 'Billing address'))

  return entry
}

describe('PMEntry', () => {
  let previousPassmanager: typeof window.passmanager
  let previousPassmanagerDescriptor: PropertyDescriptor | undefined
  let currentPassmanager: typeof window.passmanager

  beforeEach(() => {
    openExternalBrowserUrl.mockReset()
    openExternalBrowserUrl.mockResolvedValue(undefined)
    previousPassmanager = window.passmanager
    previousPassmanagerDescriptor = Object.getOwnPropertyDescriptor(window, 'passmanager')
    currentPassmanager = previousPassmanager
    Object.defineProperty(window, 'passmanager', {
      configurable: true,
      get() {
        return currentPassmanager
      },
      set(value) {
        currentPassmanager = value
        setPassmanagerRoot(value as any)
      },
    })
    setPassmanagerRoot(previousPassmanager as any)
    ensureDefined()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    currentPassmanager = previousPassmanager
    setPassmanagerRoot(previousPassmanager as any)
    if (previousPassmanagerDescriptor) {
      Object.defineProperty(window, 'passmanager', previousPassmanagerDescriptor)
    } else {
      delete (window as {passmanager?: typeof window.passmanager}).passmanager
    }
    delete (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
    resetRuntimeCapabilities()
    pmEntryEditorModel.reset()
    setPasswordManagerLang('en')
    vi.restoreAllMocks()
  })

  it('renders password skeleton before secrets resolve and shows the masked password afterwards', async () => {
    const flush = deferred<void>()
    const password = deferred<string | undefined>()
    const note = deferred<string | undefined>()
    const entry = createEntry({
      flushPendingPersistence: () => flush.promise,
      password: () => password.promise,
      note: () => note.promise,
    })

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const passwordField = component.shadowRoot?.querySelectorAll('.credential-field')[2] as
      | HTMLElement
      | undefined
    expect(passwordField?.querySelector('.secret-skeleton')).not.toBeNull()
    expect(passwordField?.querySelector('.password-input')).toBeNull()

    flush.resolve()
    password.resolve('secret')
    note.resolve('')
    await settle(component)

    const updatedPasswordField = component.shadowRoot?.querySelectorAll('.credential-field')[2] as
      | HTMLElement
      | undefined
    const passwordInput = updatedPasswordField?.querySelector('.password-input') as HTMLElement & {
      value?: string
    }
    expect(passwordInput?.value).toBe('secret')
  })

  it('copies the loaded password from the detail copy icon without re-reading the entry secret', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {invoke},
    })
    let blockPasswordRead = false
    const password = vi.fn(async () => {
      if (blockPasswordRead) {
        throw new Error('password should not be re-read from the copy icon')
      }
      return 'loaded-secret'
    })
    const entry = createEntry({password})
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const passwordField = component.shadowRoot?.querySelectorAll('.credential-field')[2] as
      | HTMLElement
      | undefined
    const passwordInput = passwordField?.querySelector('.password-input') as HTMLElement & {value?: string}
    expect(passwordInput?.value).toBe('loaded-secret')

    const passwordReadCount = password.mock.calls.length
    blockPasswordRead = true

    const copyButton = passwordField?.querySelector('cv-copy-button') as CVCopyButton | null
    const base = copyButton?.shadowRoot?.querySelector('[part="base"]') as HTMLElement | null
    expect(copyButton).not.toBeNull()
    expect(base).not.toBeNull()

    base?.click()

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'plugin:clipboard-manager|write_text',
        expect.objectContaining({text: 'loaded-secret'}),
      )
    })
    expect(password).toHaveBeenCalledTimes(passwordReadCount)
  })

  it('rerenders from reatom actions without manual requestUpdate', async () => {
    const entry = createEntry({
      password: async () => 'initial-secret',
      note: async () => '',
    })

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)
    ;(
      component as PMEntry & {
        model: {actions: {applySavedSecrets(next: {password?: string; note?: string}): void}}
      }
    ).model.actions.applySavedSecrets({
      password: 'updated-secret',
      note: 'Updated note from reatom',
    })

    await settle(component)

    const passwordField = component.shadowRoot?.querySelectorAll('.credential-field')[2] as
      | HTMLElement
      | undefined
    const passwordInput = passwordField?.querySelector('.password-input') as HTMLElement & {value?: string}
    const noteContent = component.shadowRoot?.querySelector('.note-content') as HTMLElement | null

    expect(passwordInput?.value).toBe('updated-secret')
    expect(noteContent?.textContent).toBe('Updated note from reatom')
  })

  it('opens full-entry edit and focuses note on note double-click', async () => {
    const entry = createEntry({
      note: async () => 'Desktop note',
    })
    const scrollSpy = installScrollIntoViewSpy()

    try {
      window.passmanager = {
        isReadOnly: () => false,
      } as unknown as typeof window.passmanager

      const component = document.createElement('pm-entry') as PMEntry
      component.entry = entry
      document.body.append(component)
      await settle(component)

      const noteContent = component.shadowRoot?.querySelector('.note-content') as HTMLElement | null
      expect(noteContent).not.toBeNull()
      expect(noteContent?.textContent).toBe('Desktop note')

      noteContent?.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, cancelable: true, composed: true}))
      await settleFocus(component)

      expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(true)
      expect(getCvTextarea(component, 'inline-note')).not.toBeNull()
      expect(component.shadowRoot?.querySelector('.note-edit-action')).toBeNull()
      expect(scrollSpy.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })
      expectFocusedTextarea(component, 'inline-note')
    } finally {
      scrollSpy.restore()
    }
  })

  it('opens desktop website links through the external browser command', async () => {
    const entry = createEntry()
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const link = component.shadowRoot?.querySelector<HTMLElement>('.url-link')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')

    const click = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true})
    link?.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(openExternalBrowserUrl).toHaveBeenCalledWith(link?.getAttribute('href'))
    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('shows inline SSH remove controls and opens the generator from the add action', async () => {
    const entry = createEntry({
      sshKeys: [
        {
          id: 'ssh-1',
          type: 'ed25519',
          fingerprint: 'SHA256:test',
          comment: 'user@example.com',
        },
      ],
    })
    vi.spyOn(entry, 'sshPublicKey').mockResolvedValue('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA')

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const addButton = component.shadowRoot?.querySelector(
      'cv-button[aria-label="Add SSH Key"]',
    ) as HTMLButtonElement | null
    const sshKey = component.shadowRoot?.querySelector('pm-entry-ssh-key') as
      | (HTMLElement & {shadowRoot?: ShadowRoot; updateComplete?: Promise<unknown>})
      | null

    expect(addButton).not.toBeNull()
    expect(sshKey).not.toBeNull()
    await sshKey?.updateComplete
    expect(sshKey?.shadowRoot?.querySelector('.ssh-remove-action')).not.toBeNull()

    addButton?.click()
    await settle(component)

    expect(component.shadowRoot?.querySelector('pm-entry-ssh-key')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-ssh-generator')).not.toBeNull()
  })

  it('renders desktop header toolbar actions only when enabled and dispatches through PMEntryModel', async () => {
    const entry = createEntry()
    const editSpy = vi.spyOn(PMEntryModel.prototype, 'startEntryEdit').mockImplementation(() => {})
    const moveSpy = vi.spyOn(PMEntryModel.prototype, 'moveEntryCard').mockResolvedValue(undefined)
    const deleteSpy = vi.spyOn(PMEntryModel.prototype, 'deleteEntryCard').mockImplementation(() => {})

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const getAction = (action: string) =>
      component.shadowRoot?.querySelector(`cv-toolbar-item[data-action="${action}"]`) as HTMLElement | null

    expect(getAction('edit-entry')).not.toBeNull()
    expect(getAction('move-entry')).not.toBeNull()
    expect(getAction('delete-entry')).not.toBeNull()
    expect(getAction('edit-entry')?.getAttribute('data-appearance')).toBe('ghost')
    expect(getAction('move-entry')?.getAttribute('data-appearance')).toBe('default')
    expect(getAction('delete-entry')?.getAttribute('data-appearance')).toBe('default')

    getAction('edit-entry')?.click()
    getAction('move-entry')?.click()
    getAction('delete-entry')?.click()

    expect(editSpy).toHaveBeenCalledTimes(1)
    expect(moveSpy).toHaveBeenCalledTimes(1)
    expect(moveSpy).toHaveBeenCalledWith(entry)
    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith(entry)

    component.showHeaderActions = false
    await settle(component)

    expect(getAction('edit-entry')).toBeNull()
    expect(getAction('move-entry')).toBeNull()
    expect(getAction('delete-entry')).toBeNull()
    expect(component.shadowRoot?.querySelector('.action-rail')).toBeNull()
  })

  it('renders payment card with CVV hidden by default and reveals it on explicit toggle', async () => {
    const entry = createPaymentCardEntry({cardCvv: async () => '1234'})

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const face = component.shadowRoot?.querySelector('.payment-card-face') as HTMLElement | null
    const number = component.shadowRoot?.querySelector('.payment-card-number') as HTMLElement | null
    const cvv = component.shadowRoot?.querySelector('.payment-card-cvv-value') as HTMLElement | null
    const toggle = component.shadowRoot?.querySelector('.payment-card-cvv-toggle') as HTMLButtonElement | null
    const edit = component.shadowRoot?.querySelector(
      '.payment-card-inline-action-edit',
    ) as HTMLButtonElement | null
    const copy = component.shadowRoot?.querySelector('.payment-card-number-copy') as HTMLElement | null

    expect(face).not.toBeNull()
    expect(component.shadowRoot?.textContent).toContain('Stored card')
    expect(component.shadowRoot?.textContent).toContain('Cardholder')
    expect(component.shadowRoot?.textContent).toContain('Expires')
    expect(number?.textContent).toContain('4111 1111 1111 1111')
    expect(cvv?.textContent?.trim()).toBe('•••')
    expect(toggle?.getAttribute('aria-pressed')).toBe('false')
    expect(edit).not.toBeNull()
    expect(copy).not.toBeNull()
    expect(copy?.getAttribute('appearance')).toBe('plain')

    toggle?.click()
    await settle(component)

    expect(
      (
        component.shadowRoot?.querySelector('.payment-card-cvv-value') as HTMLElement | null
      )?.textContent?.trim(),
    ).toBe('1234')
    expect(
      (
        component.shadowRoot?.querySelector('.payment-card-cvv-toggle') as HTMLButtonElement | null
      )?.getAttribute('aria-pressed'),
    ).toBe('true')
    expect(component.shadowRoot?.querySelector('.note-card')).not.toBeNull()
    expect(component.shadowRoot?.textContent).toContain('Billing address')
    expect(component.shadowRoot?.textContent).not.toContain('Website')

    edit?.click()
    await settle(component)

    expect(component.shadowRoot?.querySelector('input[name="payment-card-title"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('input[name="payment-card-number"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('input[name="payment-card-cardholder"]')).not.toBeNull()
  })

  it('renders localized payment card labels', async () => {
    setPasswordManagerLang('ru')
    const entry = createPaymentCardEntry()

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    expect(component.shadowRoot?.textContent).toContain('Сохранённая карта')
    expect(component.shadowRoot?.textContent).toContain('Держатель карты')
    expect(component.shadowRoot?.textContent).toContain('Срок действия')
  })

  it('renders the shared workspace header with root fallback and lets the header render shared metadata internally', async () => {
    const entry = createEntry()

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const header = component.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    const headerShadow = header?.shadowRoot
    const badges = Array.from(header?.querySelectorAll('[slot="context-end"] cv-badge') ?? [])
    const breadcrumbItems = Array.from(headerShadow?.querySelectorAll('cv-breadcrumb-item') ?? [])

    expect(component.shadowRoot?.querySelector('pm-card-header')).toBeNull()
    expect(header).not.toBeNull()
    expect(breadcrumbItems.map((item) => item.textContent?.trim() ?? '')).toEqual(['Root', 'Entry'])
    expect(breadcrumbItems.map((item) => item.hasAttribute('current'))).toEqual([false, true])
    expect(badges.length).toBe(2)
    expect(badges[0]?.textContent).toContain('Encrypted')
    expect(headerShadow?.querySelector('.workspace-meta')).not.toBeNull()
    expect(headerShadow?.querySelectorAll('.workspace-meta-item').length).toBe(2)
    expect(header?.querySelector('[slot="meta"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('article > .metadata-footer')).toBeNull()
  })

  it('renders read-only tag chips without tag edit actions', async () => {
    const root = new ManagerRoot({} as any)
    root.isReadOnly.set(true)
    const entry = createEntry({parent: root, tags: ['Work', 'Rotate']})
    root.entries.set([entry])
    window.passmanager = root as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const tagSection = Array.from(component.shadowRoot?.querySelectorAll('.inline-section-card') ?? []).find(
      (section) => section.textContent?.includes('Work'),
    )

    expect(tagSection).not.toBeNull()
    expect(tagSection?.textContent).toContain('Rotate')
    expect(tagSection?.querySelector('cv-combobox.entry-tags-combobox')).toBeNull()
    expect(tagSection?.querySelector('[data-snippet-section="tags"]')).toBeNull()
  })

  it('saves changed desktop tags through the entry model', async () => {
    const root = new ManagerRoot({} as any)
    root.credentialTags.set(['Work', 'Client A'])
    const entry = createEntry({parent: root, tags: ['Work']})
    root.entries.set([entry])
    const updateTags = vi.spyOn(entry, 'updateTags').mockResolvedValue(undefined)
    window.passmanager = root as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)
    const model = (component as any).model
    expect(component.shadowRoot?.querySelector('[data-snippet-section="tags"]')).toBeNull()
    pmEntryEditorModel.openSurface(entry.id, 'entry')
    await settle(component)

    const editButton = component.shadowRoot?.querySelector(
      '[data-snippet-section="tags"]',
    ) as HTMLButtonElement | null
    expect(editButton).not.toBeNull()
    editButton?.click()
    await settle(component)

    const combobox = component.shadowRoot?.querySelector('cv-combobox.entry-tags-combobox') as
      | (HTMLElement & {shadowRoot?: ShadowRoot; updateComplete?: Promise<unknown>})
      | null
    await combobox?.updateComplete

    expect(combobox).not.toBeNull()
    expect(combobox?.getAttribute('type')).not.toBe('select-only')
    expect(combobox?.shadowRoot?.querySelector('[part="input"]')).not.toBeNull()

    combobox?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {selectedIds: ['work', 'client-a'], value: 'work client-a', inputValue: '', activeId: null, open: false},
        bubbles: true,
        composed: true,
      }),
    )

    const tagSection = Array.from(component.shadowRoot?.querySelectorAll('.inline-section-card') ?? []).find(
      (section) => section.querySelector('cv-combobox.entry-tags-combobox'),
    )
    const saveButton = tagSection?.querySelector('.inline-edit-save') as HTMLButtonElement | null
    expect(model.tagDraft()).toEqual(['Work', 'Client A'])
    saveButton?.click()
    await settle(component)

    expect(updateTags).toHaveBeenCalledWith(['Work', 'Client A'])
    expect(model.tagDraft()).toEqual([])
  })

  it('clears desktop tag draft after cancelling tag edit', async () => {
    const root = new ManagerRoot({} as any)
    root.credentialTags.set(['Work', 'Client A'])
    const entry = createEntry({parent: root, tags: ['Work']})
    root.entries.set([entry])
    window.passmanager = root as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)
    const model = (component as any).model
    expect(component.shadowRoot?.querySelector('[data-snippet-section="tags"]')).toBeNull()
    pmEntryEditorModel.openSurface(entry.id, 'entry')
    await settle(component)

    component.shadowRoot
      ?.querySelector('[data-snippet-section="tags"]')
      ?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(component)

    const combobox = component.shadowRoot?.querySelector('cv-combobox.entry-tags-combobox') as HTMLElement | null
    combobox?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {selectedIds: ['work', 'client-a'], value: 'work client-a', inputValue: '', activeId: null, open: false},
        bubbles: true,
        composed: true,
      }),
    )

    expect(model.tagDraft()).toEqual(['Work', 'Client A'])

    const tagSection = Array.from(component.shadowRoot?.querySelectorAll('.inline-section-card') ?? []).find(
      (section) => section.querySelector('cv-combobox.entry-tags-combobox'),
    )
    tagSection?.querySelector<HTMLButtonElement>('.inline-edit-cancel')?.click()
    await settle(component)

    expect(model.tagDraft()).toEqual([])
  })

  it('renders the full parent group path in the shared workspace header', async () => {
    const group = new Group({
      id: 'group-parent',
      name: 'Work/Security',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    const entry = createEntry({parent: group})

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const header = component.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    const breadcrumbItems = Array.from(header?.shadowRoot?.querySelectorAll('cv-breadcrumb-item') ?? [])
    expect(breadcrumbItems.map((item) => item.textContent?.trim() ?? '')).toEqual([
      'Root',
      'Work',
      'Security',
      'Entry',
    ])
    expect(breadcrumbItems.at(-1)?.hasAttribute('current')).toBe(true)
  })

  it('navigates to the clicked ancestor group when a breadcrumb is pressed', async () => {
    const group = new Group({
      id: 'group-parent',
      name: 'Work/Security',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    const entry = createEntry({parent: group})
    const applyRouteSpy = vi.spyOn(passmanagerNavigationController, 'applyRoute').mockReturnValue(true)

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const header = component.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    const workItem = header?.shadowRoot?.querySelectorAll('cv-breadcrumb-item')[1] as HTMLElement | undefined
    const workLink = workItem?.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement | null

    workLink?.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, composed: true}))

    expect(applyRouteSpy).toHaveBeenCalledWith({kind: 'group', groupPath: 'Work'})
  })

  it('navigates to root when the root breadcrumb is pressed', async () => {
    const group = new Group({
      id: 'group-parent',
      name: 'Work/Security',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    const entry = createEntry({parent: group})
    const applyRouteSpy = vi.spyOn(passmanagerNavigationController, 'applyRoute').mockReturnValue(true)

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const header = component.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    const rootItem = header?.shadowRoot?.querySelectorAll('cv-breadcrumb-item')[0] as HTMLElement | undefined
    const rootLink = rootItem?.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement | null

    rootLink?.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, composed: true}))

    expect(applyRouteSpy).toHaveBeenCalledWith({kind: 'root'})
  })

  it('navigates to root from a root entry breadcrumb', async () => {
    const entry = createEntry()
    const applyRouteSpy = vi.spyOn(passmanagerNavigationController, 'applyRoute').mockReturnValue(true)

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const header = component.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    const rootItem = header?.shadowRoot?.querySelectorAll('cv-breadcrumb-item')[0] as HTMLElement | undefined
    const rootLink = rootItem?.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement | null

    rootLink?.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, composed: true}))

    expect(applyRouteSpy).toHaveBeenCalledWith({kind: 'root'})
  })

  it('does not navigate when the current entry breadcrumb is pressed', async () => {
    const group = new Group({
      id: 'group-parent',
      name: 'Work/Security',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    const entry = createEntry({parent: group})
    const applyRouteSpy = vi.spyOn(passmanagerNavigationController, 'applyRoute').mockReturnValue(true)

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const header = component.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    const currentItem = header?.shadowRoot?.querySelectorAll('cv-breadcrumb-item')[3] as HTMLElement | undefined
    const currentLink = currentItem?.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement | null
    const clickEvent = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true})

    currentLink?.dispatchEvent(clickEvent)

    expect(clickEvent.defaultPrevented).toBe(true)
    expect(applyRouteSpy).not.toHaveBeenCalled()
  })

  it('disables desktop header toolbar actions in readonly mode', async () => {
    const entry = createEntry()

    window.passmanager = {
      isReadOnly: () => true,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const items = Array.from(component.shadowRoot?.querySelectorAll('cv-toolbar-item') ?? [])
    expect(items.length).toBe(3)
    expect(items.every((item) => item.hasAttribute('disabled'))).toBe(true)
  })

  it('renders full-entry edit controls instead of per-field edit affordances', async () => {
    const entry = createEntry()

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    expect(component.shadowRoot?.querySelector('.inline-action[data-inline-field]')).toBeNull()
    expect(
      component.shadowRoot?.querySelector('.section-action-button[data-snippet-section="otp"]'),
    ).not.toBeNull()

    pmEntryEditorModel.openSurface(entry.id, 'entry')
    await settle(component)

    const header = component.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    expect(header?.shadowRoot?.querySelector('cv-input.title-input')).not.toBeNull()
    expect(getCvInput(component, 'inline-username')).not.toBeNull()
    expect(getCvInput(component, 'inline-password')).not.toBeNull()
    expect(getCvInput(component, 'inline-website')).not.toBeNull()
    expect(getCvTextarea(component, 'inline-note')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.entry-edit-save-action')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.entry-edit-cancel-action')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('cv-toolbar-item[data-action="edit-entry"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('cv-toolbar-item[data-action="move-entry"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('cv-toolbar-item[data-action="delete-entry"]')).toBeNull()
    expect(
      component.shadowRoot?.querySelector('.section-action-button[data-snippet-section="otp"]'),
    ).toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-otp-create[data-snippet="otp"]')).toBeNull()
  })

  it('saves changed desktop full-entry fields together', async () => {
    const entry = createEntry({
      note: async () => 'Old note',
    })
    const update = vi.spyOn(entry, 'update').mockResolvedValue(undefined)

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    pmEntryEditorModel.openSurface(entry.id, 'entry')
    await settle(component)

    const header = component.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    header?.dispatchEvent(
      new CustomEvent('pm-workspace-header-title-input', {
        detail: {value: 'Updated Entry'},
        bubbles: true,
        composed: true,
      }),
    )

    const usernameInput = getNativeInput(component, 'inline-username')
    const websiteInput = getNativeInput(component, 'inline-website')
    const noteInput = getNativeTextarea(component, 'inline-note')
    expect(usernameInput).not.toBeNull()
    expect(websiteInput).not.toBeNull()
    expect(noteInput).not.toBeNull()

    usernameInput!.value = 'bob'
    usernameInput!.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))
    websiteInput!.value = 'https://changed.example'
    websiteInput!.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))
    noteInput!.value = 'Updated note'
    noteInput!.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))
    await settle(component)

    component.shadowRoot?.querySelector<HTMLButtonElement>('.entry-edit-save-action')?.click()
    await settle(component)

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Updated Entry',
        username: 'bob',
        urls: [expect.objectContaining({value: 'https://changed.example'})],
      }),
      undefined,
      'Updated note',
    )
    expect(getCvInput(component, 'inline-username')).toBeNull()
    expect(pmEntryEditorModel.isActiveForEntry(entry.id)).toBe(false)
  })

  it('cancels desktop full-entry edit from the header action and Escape', async () => {
    const entry = createEntry()
    const update = vi.spyOn(entry, 'update').mockResolvedValue(undefined)

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    pmEntryEditorModel.openSurface(entry.id, 'entry')
    await settle(component)
    component.shadowRoot?.querySelector<HTMLButtonElement>('.entry-edit-cancel-action')?.click()
    await settle(component)

    expect(update).not.toHaveBeenCalled()
    expect(getCvInput(component, 'inline-username')).toBeNull()
    expect(pmEntryEditorModel.isActiveForEntry(entry.id)).toBe(false)

    pmEntryEditorModel.openSurface(entry.id, 'entry')
    await settle(component)
    getCvInput(component, 'inline-username')?.dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, composed: true, cancelable: true}),
    )
    await settle(component)

    expect(update).not.toHaveBeenCalled()
    expect(getCvInput(component, 'inline-username')).toBeNull()
    expect(pmEntryEditorModel.isActiveForEntry(entry.id)).toBe(false)
  })

  it('shows desktop otp add in read mode and hides it while another editor surface is active', async () => {
    const entry = createEntry({
      otps: [
        {
          id: 'otp-1',
          type: 'TOTP',
          data: {label: 'Main OTP'},
          remove: vi.fn(),
        },
      ],
    })

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const otpAddButton = component.shadowRoot?.querySelector(
      '.section-action-button[data-snippet-section="otp"]',
    ) as HTMLButtonElement | null
    const otpItems = Array.from(component.shadowRoot?.querySelectorAll('pm-entry-otp-item') ?? []) as Array<
      HTMLElement & {shadowRoot?: ShadowRoot; updateComplete?: Promise<unknown>}
    >
    await Promise.all(otpItems.map((item) => item.updateComplete))
    const otpInlineRemoveActions = otpItems.filter((item) =>
      item.shadowRoot?.querySelector('.otp-remove-action'),
    )

    expect(otpAddButton?.textContent).toContain('Add OTP')
    expect(otpInlineRemoveActions).toHaveLength(0)

    pmEntryEditorModel.openSurface(entry.id, 'entry')
    await settle(component)
    const editModeOtpAddButton = component.shadowRoot?.querySelector(
      '.section-action-button[data-snippet-section="otp"]',
    ) as HTMLButtonElement | null
    const editModeOtpItems = Array.from(
      component.shadowRoot?.querySelectorAll('pm-entry-otp-item') ?? [],
    ) as Array<HTMLElement & {shadowRoot?: ShadowRoot; updateComplete?: Promise<unknown>}>
    await Promise.all(editModeOtpItems.map((item) => item.updateComplete))
    const editModeOtpRemoveActions = editModeOtpItems.filter((item) =>
      item.shadowRoot?.querySelector('.otp-remove-action'),
    )
    expect(editModeOtpAddButton).toBeNull()
    expect(editModeOtpRemoveActions).toHaveLength(0)
  })

  it('saves desktop OTP label edits from full-entry edit controls', async () => {
    const entry = createEntry({
      otps: [
        {
          id: 'otp-1',
          label: 'Main OTP',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          encoding: 'base32',
          type: 'TOTP',
        },
      ],
    })
    const update = vi.spyOn(entry, 'update').mockResolvedValue(undefined)
    const updateOTPLabels = vi.fn(async () => true)
    ;(entry as Entry & {updateOTPLabels: typeof updateOTPLabels}).updateOTPLabels = updateOTPLabels

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    pmEntryEditorModel.openSurface(entry.id, 'entry')
    await settle(component)

    expect(component.shadowRoot?.querySelector('pm-entry-otp-create[data-snippet="otp"]')).toBeNull()
    const labelInput = getNativeInput(component, 'otp-label-otp-1')
    expect(labelInput).not.toBeNull()

    labelInput!.value = 'Backup OTP'
    labelInput!.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))
    await settle(component)

    component.shadowRoot?.querySelector<HTMLButtonElement>('.entry-edit-save-action')?.click()
    await settle(component)

    expect(update).toHaveBeenCalledTimes(1)
    expect(updateOTPLabels).toHaveBeenCalledTimes(1)
    expect(updateOTPLabels).toHaveBeenCalledWith({'otp-1': 'Backup OTP'})
    expect(component.shadowRoot?.querySelector('cv-input[data-otp-label-input="otp-1"]')).toBeNull()
  })

  it('keeps desktop full-entry edit open when an OTP label is too long', async () => {
    const entry = createEntry({
      otps: [
        {
          id: 'otp-1',
          label: 'Main OTP',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          encoding: 'base32',
          type: 'TOTP',
        },
      ],
    })
    const update = vi.spyOn(entry, 'update').mockResolvedValue(undefined)
    const updateOTPLabels = vi.fn(async () => true)
    ;(entry as Entry & {updateOTPLabels: typeof updateOTPLabels}).updateOTPLabels = updateOTPLabels

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    pmEntryEditorModel.openSurface(entry.id, 'entry')
    await settle(component)

    const labelInput = getNativeInput(component, 'otp-label-otp-1')
    expect(labelInput).not.toBeNull()
    labelInput!.value = 'a'.repeat(65)
    labelInput!.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))
    await settle(component)

    component.shadowRoot?.querySelector<HTMLButtonElement>('.entry-edit-save-action')?.click()
    await settle(component)

    expect(update).not.toHaveBeenCalled()
    expect(updateOTPLabels).not.toHaveBeenCalled()
    const erroredInput = component.shadowRoot?.querySelector('cv-input[data-otp-label-input="otp-1"]')
    expect(erroredInput).not.toBeNull()
    expect(erroredInput?.textContent).toContain('Label is too long')
    expect(component.shadowRoot?.querySelector('.entry-edit-save-action')).not.toBeNull()
  })

  it('does not render OTP quick view action in the desktop OTP section', async () => {
    const entry = createEntry({
      otps: [
        {
          id: 'otp-quick-view',
          type: 'TOTP',
          data: {label: 'Main OTP'},
          remove: vi.fn(),
        },
      ],
    })

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const quickViewButton = component.shadowRoot?.querySelector(
      '[data-action="otp-quick-view"]',
    ) as HTMLButtonElement | null
    expect(quickViewButton).toBeNull()
  })

  it('saves desktop otp snippet from the shared model draft', async () => {
    const addOTP = vi.fn(async () => {})
    const entry = createEntry()
    ;(entry as Entry & {addOTP: typeof addOTP}).addOTP = addOTP

    window.passmanager = {
      isReadOnly: () => false,
      isEditMode: {set: vi.fn()},
    } as unknown as typeof window.passmanager
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_otp_qr_scan: true,
    })

    const component = document.createElement('pm-entry') as PMEntry
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const addButton = component.shadowRoot?.querySelector(
      '.section-action-button[data-snippet-section="otp"]',
    ) as HTMLButtonElement | null
    addButton?.click()
    await settle(component)
    ;(
      component as PMEntry & {model: {otpDraft: {applyQrPayload: (value: string) => boolean}}}
    ).model.otpDraft.applyQrPayload('otpauth://totp/Entry?secret=AABBCCDD&issuer=Entry')

    const otpSection = Array.from(component.shadowRoot?.querySelectorAll('.inline-section-card') ?? []).find(
      (section) => section.querySelector('pm-entry-otp-create[data-snippet="otp"]'),
    )
    const otpCreate = otpSection?.querySelector('pm-entry-otp-create[data-snippet="otp"]') as
      | (HTMLElement & {updateComplete?: Promise<unknown>})
      | null
    await otpCreate?.updateComplete
    expect(otpCreate?.shadowRoot?.querySelector('.qr-scan-button')).not.toBeNull()

    const saveButton = otpSection?.querySelector('.inline-edit-save') as HTMLButtonElement | null
    saveButton?.click()
    await settle(component)

    expect(addOTP).toHaveBeenCalledTimes(1)
    expect(addOTP).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: 'AABBCCDD',
        type: 'TOTP',
        digits: 6,
        period: 30,
      }),
    )
    expect(component.shadowRoot?.querySelector('pm-entry-otp-create[data-snippet="otp"]')).toBeNull()
  })
})
