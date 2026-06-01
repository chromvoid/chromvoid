import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const openExternalBrowserUrl = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const passmanagerSshKeygenMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/shared/services/external-browser', () => ({
  openExternalBrowserUrl: (url: string) => openExternalBrowserUrl(url),
}))

vi.mock('../../src/features/passmanager/service/passmanager-ssh-keygen', () => ({
  passmanagerSshKeygen: passmanagerSshKeygenMock,
}))

import {CVInput} from '@chromvoid/uikit/components/cv-input'
import {CVTextarea} from '@chromvoid/uikit/components/cv-textarea'
import {CVCopyButton} from '@chromvoid/uikit/components/cv-copy-button'
import {Entry, ManagerRoot} from '@project/passmanager'
import {setPasswordManagerLang} from '@project/passmanager/i18n'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {PMEntryMobile} from '../../src/features/passmanager/components/card/entry/entry-mobile'
import {passmanagerSshKeygen} from '../../src/features/passmanager/service/passmanager-ssh-keygen'
import {entryMobileStyles} from '../../src/features/passmanager/components/card/entry/styles'
import {pmEntryEditorModel} from '../../src/features/passmanager/models/pm-entry-editor.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

let defined = false

function ensureDefined() {
  if (defined) return
  CVCopyButton.define()
  PMEntryMobile.define()
  defined = true
}

async function settle(element: PMEntryMobile) {
  await element.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await element.updateComplete
  await Promise.resolve()
}

async function settleFocus(element: PMEntryMobile) {
  await settle(element)
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
  await Promise.resolve()
}

async function openEntryEdit(component: PMEntryMobile) {
  const editEntryButton = component.shadowRoot?.querySelector(
    '.entry-edit-entry-action',
  ) as HTMLButtonElement | null
  editEntryButton?.click()
  await settle(component)
}

async function activateEntryEditMode(component: PMEntryMobile, entry: Entry) {
  pmEntryEditorModel.openSurface(entry.id, 'entry')
  await settle(component)
}

function createTouchPointerEvent(
  type: string,
  options: {clientX?: number; clientY?: number; pointerId?: number; pointerType?: string} = {},
): PointerEvent {
  const event = new Event(type, {bubbles: true, cancelable: true, composed: true}) as PointerEvent
  Object.defineProperties(event, {
    clientX: {value: options.clientX ?? 24},
    clientY: {value: options.clientY ?? 24},
    pointerId: {value: options.pointerId ?? 1},
    pointerType: {value: options.pointerType ?? 'touch'},
  })
  return event
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

async function waitForCondition(check: () => void, attempts = 10) {
  let lastError: unknown

  for (let i = 0; i < attempts; i += 1) {
    try {
      check()
      return
    } catch (error) {
      lastError = error
      await flushMicrotasks()
    }
  }

  throw lastError
}

function createEntry(
  urls: Array<{match: string; value: string}>,
  options: {
    id?: string
    flushPendingPersistence?: () => Promise<void>
    password?: () => Promise<string | undefined>
    note?: () => Promise<string | undefined>
    otps?: unknown[]
    sshKeys?: unknown[]
    tags?: string[]
  } = {},
) {
  const entry = new Entry(
    Object.create(ManagerRoot.prototype) as ManagerRoot,
    {
      id: options.id ?? 'entry-mobile-render-test',
      title: '1cCloud',
      urls,
      username: 'andry_diego@mail.ru',
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: options.otps ?? [],
      sshKeys: options.sshKeys ?? [],
      tags: options.tags ?? [],
    } as any,
  )

  ;(entry as Entry & {flushPendingPersistence: () => Promise<void>}).flushPendingPersistence = vi.fn(
    options.flushPendingPersistence ?? (async () => {}),
  )
  vi.spyOn(entry, 'password').mockImplementation(options.password ?? (async () => 'secret'))
  vi.spyOn(entry, 'note').mockImplementation(options.note ?? (async () => ''))
  vi.spyOn(entry, 'sshPublicKey').mockResolvedValue('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA')

  return entry
}

function createPaymentCardEntry(options: {
  id?: string
  flushPendingPersistence?: () => Promise<void>
  cardPan?: () => Promise<string | undefined>
  cardCvv?: () => Promise<string | undefined>
  note?: () => Promise<string | undefined>
  tags?: string[]
} = {}) {
  const entry = new Entry(
    Object.create(ManagerRoot.prototype) as ManagerRoot,
    {
      id: options.id ?? 'entry-mobile-payment-card-render-test',
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
    } as any,
  )

  ;(entry as Entry & {flushPendingPersistence: () => Promise<void>}).flushPendingPersistence = vi.fn(
    options.flushPendingPersistence ?? (async () => {}),
  )
  vi.spyOn(entry, 'cardPan').mockImplementation(options.cardPan ?? (async () => '4111111111111111'))
  vi.spyOn(entry, 'cardCvv').mockImplementation(options.cardCvv ?? (async () => '123'))
  vi.spyOn(entry, 'note').mockImplementation(options.note ?? (async () => 'Billing address'))
  vi.spyOn(entry, 'sshPublicKey').mockResolvedValue('')

  return entry
}

function installClipboardInvokeSpy() {
  const invoke = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {invoke},
  })
  return invoke
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

function installVisualViewportMock() {
  const previous = Object.getOwnPropertyDescriptor(window, 'visualViewport')
  const viewport = new EventTarget() as VisualViewport

  Object.assign(viewport, {
    width: 390,
    height: 844,
    scale: 1,
    offsetTop: 0,
    offsetLeft: 0,
    pageTop: 0,
    pageLeft: 0,
  })

  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  })

  return {
    dispatchResize() {
      viewport.dispatchEvent(new Event('resize'))
    },
    restore() {
      if (previous) {
        Object.defineProperty(window, 'visualViewport', previous)
        return
      }

      delete (window as Window & {visualViewport?: VisualViewport}).visualViewport
    },
  }
}

const getCvInput = (component: PMEntryMobile, name: string) =>
  component.shadowRoot?.querySelector(`cv-input[name="${name}"]`) as
    | (HTMLElement & {shadowRoot?: ShadowRoot})
    | null

const getNativeInput = (component: PMEntryMobile, name: string) =>
  getCvInput(component, name)?.shadowRoot?.querySelector('input') as HTMLInputElement | null

const getCvTextarea = (component: PMEntryMobile, name: string) =>
  component.shadowRoot?.querySelector(`cv-textarea[name="${name}"]`) as
    | (HTMLElement & {shadowRoot?: ShadowRoot; value?: string})
    | null

const getNativeTextarea = (component: PMEntryMobile, name: string) =>
  getCvTextarea(component, name)?.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement | null

function expectFocusedInput(component: PMEntryMobile, name: string) {
  const input = getCvInput(component, name)
  const nativeInput = getNativeInput(component, name)

  expect(input).not.toBeNull()
  expect(nativeInput).not.toBeNull()
  expect(component.shadowRoot?.activeElement).toBe(input)
  expect(input?.shadowRoot?.activeElement).toBe(nativeInput)
}

function expectFocusedTextarea(component: PMEntryMobile, name: string) {
  const textarea = getCvTextarea(component, name)
  const nativeTextarea = getNativeTextarea(component, name)

  expect(textarea).not.toBeNull()
  expect(nativeTextarea).not.toBeNull()
  expect(component.shadowRoot?.activeElement).toBe(textarea)
  expect(textarea?.shadowRoot?.activeElement).toBe(nativeTextarea)
}

function getStyleRule(cssText: string, selector: string) {
  const selectorIndex = cssText.indexOf(`${selector} {`)
  if (selectorIndex === -1) return ''

  const ruleStart = cssText.indexOf('{', selectorIndex)
  const ruleEnd = cssText.indexOf('}', ruleStart)

  return cssText.slice(ruleStart + 1, ruleEnd)
}

describe('PMEntryMobile', () => {
  let previousPassmanager: typeof window.passmanager
  let previousPassmanagerDescriptor: PropertyDescriptor | undefined
  let currentPassmanager: typeof window.passmanager

  beforeEach(() => {
    openExternalBrowserUrl.mockReset()
    openExternalBrowserUrl.mockResolvedValue(undefined)
    vi.mocked(passmanagerSshKeygen).mockReset()
    setPasswordManagerLang('en')
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
    delete (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
    resetRuntimeCapabilities()
    setPasswordManagerLang('en')
    currentPassmanager = previousPassmanager
    setPassmanagerRoot(previousPassmanager as any)
    if (previousPassmanagerDescriptor) {
      Object.defineProperty(window, 'passmanager', previousPassmanagerDescriptor)
    } else {
      delete (window as {passmanager?: typeof window.passmanager}).passmanager
    }
    pmEntryEditorModel.reset()
    vi.restoreAllMocks()
  })

  it('hides website count badge when only one visible url exists', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const badges = Array.from(component.shadowRoot?.querySelectorAll('.entry-meta-badges cv-badge') ?? [])

    expect(badges).toHaveLength(1)
  })

  it('shows website count badge when multiple visible urls exist', async () => {
    const entry = createEntry([
      {match: 'domain', value: 'https://1ccloud.ru'},
      {match: 'regex', value: '^internal$'},
    ])
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const badges = Array.from(component.shadowRoot?.querySelectorAll('.entry-meta-badges cv-badge') ?? [])
    const badgeTexts = badges.map((badge) => badge.textContent?.trim() ?? '')

    expect(badges).toHaveLength(2)
    expect(badgeTexts).toContain('2')
  })

  it('renders payment card summary with hidden CVV until the reveal toggle is pressed', async () => {
    const entry = createPaymentCardEntry()
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const text = component.shadowRoot?.textContent ?? ''
    const face = component.shadowRoot?.querySelector('.payment-card-face') as HTMLElement | null
    const number = component.shadowRoot?.querySelector('.payment-card-number') as HTMLElement | null
    const cvv = component.shadowRoot?.querySelector('.payment-card-cvv-value') as HTMLElement | null
    const toggle = component.shadowRoot?.querySelector('.payment-card-cvv-toggle') as HTMLButtonElement | null
    const edit = component.shadowRoot?.querySelector('.payment-card-inline-action-edit') as HTMLButtonElement | null
    const copy = component.shadowRoot?.querySelector('.payment-card-number-copy') as HTMLElement | null

    expect(face).not.toBeNull()
    expect(text).toContain('Stored card')
    expect(text).toContain('Cardholder')
    expect(text).toContain('Expires')
    expect(number?.textContent).toContain('4111 1111 1111 1111')
    expect(cvv?.textContent?.trim()).toBe('•••')
    expect(toggle?.getAttribute('aria-pressed')).toBe('false')
    expect(edit).not.toBeNull()
    expect(copy).not.toBeNull()
    expect(copy?.getAttribute('appearance')).toBe('plain')

    toggle?.click()
    await settle(component)

    expect(
      (component.shadowRoot?.querySelector('.payment-card-cvv-value') as HTMLElement | null)?.textContent?.trim(),
    ).toBe('123')
    expect((component.shadowRoot?.querySelector('.payment-card-cvv-toggle') as HTMLButtonElement | null)?.getAttribute('aria-pressed')).toBe('true')
    expect(component.shadowRoot?.querySelector('.note-card')).not.toBeNull()
    expect(component.shadowRoot?.textContent).toContain('Billing address')
    expect(component.shadowRoot?.querySelector('.website-row')).toBeNull()

    edit?.click()
    await settle(component)

    expect(component.shadowRoot?.querySelector('input[name="payment-card-title"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('input[name="payment-card-number"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('input[name="payment-card-cardholder"]')).not.toBeNull()
  })

  it('renders the avatar beside the title and keeps badges in a separate header rail', async () => {
    const entry = createEntry(
      [
        {match: 'domain', value: 'https://1ccloud.ru'},
        {match: 'regex', value: '^internal$'},
      ],
      {
        otps: [{}],
        sshKeys: [{}],
      },
    )
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const header = component.shadowRoot?.querySelector('.entry-header') as HTMLElement | null
    const identity = component.shadowRoot?.querySelector('.entry-header-identity') as HTMLElement | null
    const avatarStatic = component.shadowRoot?.querySelector('.entry-header-avatar-static') as HTMLElement | null
    const avatarWrap = component.shadowRoot?.querySelector('.entry-header-avatar-wrap') as HTMLElement | null
    const avatar = component.shadowRoot?.querySelector('.entry-header-avatar') as
      | (HTMLElement & {
          item?: unknown
          letter?: string
        })
      | null
    const titleBlock = component.shadowRoot?.querySelector('.entry-title-block') as HTMLElement | null
    const aside = component.shadowRoot?.querySelector('.entry-header-aside') as HTMLElement | null
    const badgeRail = component.shadowRoot?.querySelector('.entry-meta-badges') as HTMLElement | null
    const metaInline = component.shadowRoot?.querySelector('.entry-meta-inline') as HTMLElement | null
    const metaLabels = Array.from(component.shadowRoot?.querySelectorAll('.entry-meta-label') ?? []).map(
      (element) => element.textContent?.trim(),
    )

    expect(header).not.toBeNull()
    expect(identity).not.toBeNull()
    expect(avatarStatic).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.entry-header-avatar-trigger')).toBeNull()
    expect(avatarWrap).not.toBeNull()
    expect(avatar).not.toBeNull()
    expect(avatar?.item).toBe(entry)
    expect(avatar?.letter).toBe('1')
    expect(identity?.firstElementChild).toBe(avatarStatic)
    expect(avatarStatic?.firstElementChild).toBe(avatarWrap)
    expect(avatarWrap?.firstElementChild).toBe(avatar)
    expect(titleBlock?.querySelector('.entry-title')?.textContent).toContain('1cCloud')
    expect(titleBlock?.querySelector('.entry-header-aside')).toBe(aside)
    expect(titleBlock?.querySelector('.entry-meta-inline')).toBe(metaInline)
    expect(header?.firstElementChild).toBe(identity)
    expect(header?.children).toHaveLength(1)
    expect(aside?.firstElementChild).toBe(badgeRail)
    expect(badgeRail?.querySelectorAll('cv-badge')).toHaveLength(4)
    expect(metaLabels).toEqual(['Last modified', 'Created'])
  })

  it('shows password skeleton while secrets are loading and fills the field after load', async () => {
    const flush = deferred<void>()
    const password = deferred<string | undefined>()
    const note = deferred<string | undefined>()
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      flushPendingPersistence: () => flush.promise,
      password: () => password.promise,
      note: () => note.promise,
    })

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const passwordField = component.shadowRoot?.querySelectorAll('.credential-field')[1] as
      | HTMLElement
      | undefined
    expect(passwordField?.querySelector('.secret-skeleton')).not.toBeNull()
    expect(passwordField?.querySelector('.password-input')).toBeNull()

    flush.resolve()
    password.resolve('secret')
    note.resolve('')
    await settle(component)

    const updatedPasswordField = component.shadowRoot?.querySelectorAll('.credential-field')[1] as
      | HTMLElement
      | undefined
    const passwordInput = updatedPasswordField?.querySelector('.password-input') as HTMLElement & {
      value?: string
    }
    expect(passwordInput?.value).toBe('secret')
    expect(updatedPasswordField?.querySelector('.secret-skeleton')).toBeNull()
  })

  it('copies the loaded password from the detail copy icon without re-reading the entry secret', async () => {
    const invoke = installClipboardInvokeSpy()
    let blockPasswordRead = false
    const password = vi.fn(async () => {
      if (blockPasswordRead) {
        throw new Error('password should not be re-read from the copy icon')
      }
      return 'mobile-loaded-secret'
    })
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {password})
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const passwordField = component.shadowRoot?.querySelectorAll('.credential-field')[1] as
      | HTMLElement
      | undefined
    const passwordInput = passwordField?.querySelector('.password-input') as HTMLElement & {value?: string}
    expect(passwordInput?.value).toBe('mobile-loaded-secret')

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
        expect.objectContaining({text: 'mobile-loaded-secret'}),
      )
    })
    expect(password).toHaveBeenCalledTimes(passwordReadCount)
  })

  it('renders generator controls and settings inside mobile inline password edit', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      password: async () => 'secret',
      note: async () => '',
    })

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)
    await activateEntryEditMode(component, entry)

    const generateButton = component.shadowRoot?.querySelector(
      '.generate-action-button',
    ) as HTMLButtonElement | null
    const settingsButton = component.shadowRoot?.querySelector(
      '.generator-toggle-button',
    ) as HTMLButtonElement | null

    expect(generateButton).not.toBeNull()
    expect(settingsButton).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-password-strength')).not.toBeNull()

    settingsButton?.click()
    await settle(component)

    expect(component.shadowRoot?.querySelector('.password-generator-panel')).not.toBeNull()
    expect(component.shadowRoot?.querySelectorAll('.generator-option')).toHaveLength(4)
  })

  it('ignores stale secret loads when switching to another entry', async () => {
    const staleFlush = deferred<void>()
    const stalePassword = deferred<string | undefined>()
    const staleNote = deferred<string | undefined>()
    const firstEntry = createEntry([{match: 'domain', value: 'https://one.invalid'}], {
      id: 'entry-mobile-stale-1',
      flushPendingPersistence: () => staleFlush.promise,
      password: () => stalePassword.promise,
      note: () => staleNote.promise,
    })
    const secondEntry = createEntry([{match: 'domain', value: 'https://two.invalid'}], {
      id: 'entry-mobile-stale-2',
      password: async () => 'second-secret',
      note: async () => '',
    })

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = firstEntry
    document.body.append(component)
    await settle(component)

    component.entry = secondEntry
    await settle(component)

    const passwordField = component.shadowRoot?.querySelectorAll('.credential-field')[1] as
      | HTMLElement
      | undefined
    const passwordInput = passwordField?.querySelector('.password-input') as HTMLElement & {value?: string}
    expect(passwordInput?.value).toBe('second-secret')

    staleFlush.resolve()
    stalePassword.resolve('stale-secret')
    staleNote.resolve('stale-note')
    await settle(component)

    const stablePasswordField = component.shadowRoot?.querySelectorAll('.credential-field')[1] as
      | HTMLElement
      | undefined
    const stablePasswordInput = stablePasswordField?.querySelector('.password-input') as HTMLElement & {
      value?: string
    }
    expect(stablePasswordInput?.value).toBe('second-secret')
  })

  it('renders compact website rows and hides mutation affordances in read-only mode', async () => {
    const entry = createEntry([
      {match: 'domain', value: 'https://1ccloud.ru'},
      {match: 'regex', value: '^internal$'},
    ])
    window.passmanager = {
      isReadOnly: () => true,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    expect(component.shadowRoot?.querySelector('.action-rail')).toBeNull()
    expect(component.shadowRoot?.querySelector('.website-row')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.website-actions')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.website-open')?.textContent).toContain('Open site')
    expect(component.shadowRoot?.querySelector('.inline-action')).toBeNull()
    expect(component.shadowRoot?.querySelector('.section-action')).toBeNull()
  })

  it('opens mobile website links and quick action through the external browser command', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const link = component.shadowRoot?.querySelector<HTMLAnchorElement>('.website-open')
    expect(link).not.toBeNull()
    const href = link?.getAttribute('href')

    const click = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true})
    link?.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(openExternalBrowserUrl).toHaveBeenCalledWith(href)
    expect(windowOpen).not.toHaveBeenCalled()

    openExternalBrowserUrl.mockClear()
    const quickActions = component.shadowRoot?.querySelectorAll<HTMLButtonElement>('.quick-action')
    quickActions?.[2]?.click()

    expect(openExternalBrowserUrl).toHaveBeenCalledWith(href)
    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('renders the main mobile regions in action-first order', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const shell = component.shadowRoot?.querySelector('.entry-shell') as HTMLElement | null
    const scroll = component.shadowRoot?.querySelector('.entry-scroll') as HTMLElement | null
    const footer = component.shadowRoot?.querySelector('.entry-action-footer') as HTMLElement | null
    const article = component.shadowRoot?.querySelector('article.wrapper') as HTMLElement | null
    const editAction = component.shadowRoot?.querySelector('.entry-edit-entry-action') as HTMLElement | null
    const childClasses = Array.from(article?.children ?? []).map((child) => child.className)

    expect(shell).not.toBeNull()
    expect(scroll).not.toBeNull()
    expect(footer).not.toBeNull()
    expect(scroll?.contains(article)).toBe(true)
    expect(childClasses.slice(0, 4)).toEqual([
      'entry-header',
      'entry-view-add-actions',
      'quick-actions',
      'primary-card',
    ])
    expect(childClasses.at(-1)).toBe('secondary-stack')
    expect(editAction).not.toBeNull()
    expect(editAction?.getAttribute('variant')).toBe('default')
    expect(editAction?.hasAttribute('unstyled')).toBe(true)
    expect(shell?.contains(footer)).toBe(true)
    expect(footer?.contains(editAction)).toBe(true)
    expect(scroll?.contains(footer)).toBe(false)
    expect(scroll?.contains(editAction)).toBe(false)
    expect(article?.contains(editAction)).toBe(false)
    expect(
      childClasses.filter((value) => value === 'section-block secondary-block').length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('uses compact mobile placeholder text for tags and note empty states', () => {
    const cssText = entryMobileStyles.cssText
    const tagsEmptyStateCssText = getStyleRule(cssText, '.section-block.secondary-block > .empty-state')
    const emptyStateCssText = getStyleRule(cssText, '.note-card-demoted .empty-state')
    const emptyStateSpanCssText = getStyleRule(cssText, '.note-card-demoted .empty-state span')

    expect(tagsEmptyStateCssText).toContain('min-inline-size: 0;')
    expect(tagsEmptyStateCssText).toContain('color: var(--cv-color-text-muted);')
    expect(tagsEmptyStateCssText).toContain('font-size: var(--cv-font-size-xs);')
    expect(tagsEmptyStateCssText).toContain('line-height: 1.45;')
    expect(tagsEmptyStateCssText).toContain('white-space: normal;')
    expect(emptyStateCssText).toContain('inline-size: 100%;')
    expect(emptyStateCssText).toContain('min-inline-size: 0;')
    expect(emptyStateCssText).toContain('box-sizing: border-box;')
    expect(emptyStateCssText).toContain('color: var(--cv-color-text-muted);')
    expect(emptyStateCssText).toContain('font-size: var(--cv-font-size-xs);')
    expect(emptyStateCssText).toContain('white-space: normal;')
    expect(emptyStateCssText).toContain('overflow: hidden;')
    expect(emptyStateCssText).toContain('text-align: left;')
    expect(emptyStateCssText).toContain('line-height: 1.45;')
    expect(emptyStateSpanCssText).toContain('display: block;')
    expect(emptyStateSpanCssText).toContain('min-inline-size: 0;')
    expect(emptyStateSpanCssText).toContain('max-inline-size: 100%;')
    expect(emptyStateSpanCssText).toContain('white-space: normal;')
    expect(emptyStateSpanCssText).toContain('overflow-wrap: anywhere;')
    expect(emptyStateSpanCssText).toContain('word-break: normal;')
  })

  it('lets mobile quick action labels wrap inside their grid cells', () => {
    const cssText = entryMobileStyles.cssText
    const quickActionCssText = getStyleRule(cssText, '.quick-action')
    const quickActionBaseCssText = getStyleRule(cssText, '.quick-action::part(base)')
    const quickActionLabelCssText = getStyleRule(cssText, '.quick-action::part(label)')
    const quickActionSpanCssText = getStyleRule(cssText, '.quick-action span')

    expect(quickActionCssText).toContain('inline-size: 100%;')
    expect(quickActionCssText).toContain('min-inline-size: 0;')
    expect(quickActionCssText).toContain('overflow: hidden;')
    expect(quickActionBaseCssText).toContain('box-sizing: border-box;')
    expect(quickActionBaseCssText).toContain('inline-size: 100%;')
    expect(quickActionBaseCssText).toContain('min-inline-size: 0;')
    expect(quickActionBaseCssText).toContain('white-space: normal;')
    expect(quickActionLabelCssText).toContain('box-sizing: border-box;')
    expect(quickActionLabelCssText).toContain('inline-size: 100%;')
    expect(quickActionLabelCssText).toContain('min-inline-size: 0;')
    expect(quickActionLabelCssText).toContain('white-space: normal;')
    expect(quickActionSpanCssText).toContain('display: block;')
    expect(quickActionSpanCssText).toContain('inline-size: 100%;')
    expect(quickActionSpanCssText).toContain('overflow-wrap: anywhere;')
    expect(quickActionSpanCssText).toContain('white-space: normal;')
  })

  it('renders quick actions after the hero and routes them through entry actions', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    const invoke = installClipboardInvokeSpy()
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const quickActions = component.shadowRoot?.querySelector('.quick-actions') as HTMLElement | null
    const buttons = Array.from(quickActions?.querySelectorAll<HTMLButtonElement>('.quick-action') ?? [])

    const entryViewAddActions = quickActions?.previousElementSibling as HTMLElement | null

    expect(entryViewAddActions?.classList.contains('entry-view-add-actions')).toBe(true)
    expect(entryViewAddActions?.previousElementSibling?.classList.contains('entry-header')).toBe(true)
    expect(quickActions?.nextElementSibling?.classList.contains('primary-card')).toBe(true)
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Copy username',
      'Copy password',
      'Open website',
    ])

    buttons[0]?.click()
    buttons[1]?.click()
    buttons[2]?.click()

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'plugin:clipboard-manager|write_text',
        expect.objectContaining({text: 'andry_diego@mail.ru'}),
      )
      expect(invoke).toHaveBeenCalledWith(
        'plugin:clipboard-manager|write_text',
        expect.objectContaining({text: 'secret'}),
      )
    })
    expect(openExternalBrowserUrl).toHaveBeenCalledWith('https://1ccloud.ru')
    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('renders localized Russian quick action labels', async () => {
    setPasswordManagerLang('ru')
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const buttons = Array.from(component.shadowRoot?.querySelectorAll<HTMLButtonElement>('.quick-action') ?? [])

    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Копировать имя пользователя',
      'Копировать пароль',
      'Открыть сайт',
    ])
  })

  it('switches entry fields into full edit mode with one bottom save/cancel group', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)
    await activateEntryEditMode(component, entry)

    expect(component.shadowRoot?.querySelector('pm-entry-edit-mobile')).toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-action[data-inline-field="username"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-action[data-inline-field="password"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('cv-input[name="inline-password"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('cv-input[name="inline-username"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('cv-input[name="inline-website"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.entry-edit-save-action')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.entry-edit-cancel-action')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-edit-save')).toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-edit-cancel')).toBeNull()
  })

  it('does not autofocus the title when full edit mode starts from the edit button', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    await openEntryEdit(component)
    await settleFocus(component)

    const titleInput = getCvInput(component, 'inline-title')
    const nativeTitleInput = getNativeInput(component, 'inline-title')

    expect(titleInput).not.toBeNull()
    expect(titleInput?.hasAttribute('autofocus')).toBe(false)
    expect(component.shadowRoot?.activeElement).not.toBe(titleInput)
    expect(titleInput?.shadowRoot?.activeElement).not.toBe(nativeTitleInput)
  })

  it('renders mobile tag chips and saves changed tags from the tag section', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {tags: ['Work']})
    const updateTags = vi.spyOn(entry, 'updateTags').mockResolvedValue(undefined)
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    expect(component.shadowRoot?.textContent).toContain('Work')

    const editButton = component.shadowRoot?.querySelector(
      '[data-snippet-section="tags"]',
    ) as HTMLButtonElement | null
    editButton?.click()
    await settle(component)

    expect(component.shadowRoot?.querySelector('cv-combobox.entry-tags-combobox')).not.toBeNull()

    component.shadowRoot?.querySelector('cv-input[name="entry-tag-input"]')?.dispatchEvent(
      new CustomEvent('cv-input', {detail: {value: 'Rotate'}, bubbles: true, composed: true}),
    )
    component.shadowRoot?.querySelector('.entry-tags-add')?.dispatchEvent(
      new Event('submit', {bubbles: true, cancelable: true}),
    )

    const saveButton = component.shadowRoot?.querySelector('.inline-edit-save') as HTMLButtonElement | null
    saveButton?.click()
    await settle(component)

    expect(updateTags).toHaveBeenCalledWith(['Work', 'Rotate'])
  })

  it.each([
    {
      field: 'username',
      inputName: 'inline-username',
      nextValue: 'new-user',
      assertUpdate: (update: ReturnType<typeof vi.fn>) => {
        const call = update.mock.calls.at(-1)
        expect(call?.[0]).toEqual(expect.objectContaining({username: 'new-user'}))
        expect(call?.[1]).toBeUndefined()
        expect(call?.[2]).toBeUndefined()
      },
    },
    {
      field: 'password',
      inputName: 'inline-password',
      nextValue: 'new-secret',
      assertUpdate: (update: ReturnType<typeof vi.fn>) => {
        const call = update.mock.calls.at(-1)
        expect(call?.[0]).toEqual(expect.objectContaining({title: '1cCloud'}))
        expect(call?.[1]).toBe('new-secret')
        expect(call?.[2]).toBeUndefined()
      },
    },
    {
      field: 'website',
      inputName: 'inline-website',
      nextValue: 'https://example.com',
      assertUpdate: (update: ReturnType<typeof vi.fn>) => {
        const call = update.mock.calls.at(-1)
        expect(call?.[0]).toEqual(
          expect.objectContaining({
            urls: [expect.objectContaining({value: 'https://example.com'})],
          }),
        )
        expect(call?.[1]).toBeUndefined()
        expect(call?.[2]).toBeUndefined()
      },
    },
  ])('saves %s from full-entry edit controls', async ({inputName, nextValue, assertUpdate}) => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    const update = vi.fn(async () => {})
    ;(entry as Entry & {update: typeof update}).update = update

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)
    await activateEntryEditMode(component, entry)

    const input = getNativeInput(component, inputName)
    expect(input).not.toBeNull()

    input!.value = nextValue
    input!.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))
    await settle(component)

    const saveButton = component.shadowRoot?.querySelector('.entry-edit-save-action') as HTMLButtonElement | null
    saveButton?.click()
    await settle(component)

    assertUpdate(update)
    expect(getCvInput(component, inputName)).toBeNull()
  })

  it('does not overwrite late-loaded secrets when only metadata changes in full-entry edit', async () => {
    const flush = deferred<void>()
    const password = deferred<string | undefined>()
    const note = deferred<string | undefined>()
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      flushPendingPersistence: () => flush.promise,
      password: () => password.promise,
      note: () => note.promise,
    })
    const update = vi.fn(async () => {})
    ;(entry as Entry & {update: typeof update}).update = update

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)
    await activateEntryEditMode(component, entry)

    const input = getNativeInput(component, 'inline-username')
    expect(input).not.toBeNull()

    input!.value = 'late-load-user'
    input!.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))

    flush.resolve()
    password.resolve('secret')
    note.resolve('Personal note')
    await vi.waitFor(() => {
      const model = (
        component as unknown as {
          model: {
            state: {
              passwordResource(): {status: string}
              noteResource(): {status: string}
            }
          }
        }
      ).model
      expect(model.state.passwordResource().status).toBe('ready')
      expect(model.state.noteResource().status).toBe('ready')
    })
    await settle(component)

    expect(getNativeInput(component, 'inline-password')?.value).toBe('secret')
    expect(getNativeTextarea(component, 'inline-note')?.value).toBe('Personal note')

    const saveButton = component.shadowRoot?.querySelector('.entry-edit-save-action') as HTMLButtonElement | null
    saveButton?.click()
    await settle(component)

    const call = update.mock.calls.at(-1)
    expect(call?.[0]).toEqual(expect.objectContaining({username: 'late-load-user'}))
    expect(call?.[1]).toBeUndefined()
    expect(call?.[2]).toBeUndefined()
  })

  it.each([
    {
      field: 'username',
      inputName: 'inline-username',
      nextValue: 'escape-user@example.com',
    },
    {
      field: 'password',
      inputName: 'inline-password',
      nextValue: 'escape-secret',
    },
    {
      field: 'website',
      inputName: 'inline-website',
      nextValue: 'https://escape.example',
    },
  ])('renders %s as an input without field edit buttons in full edit mode', async ({inputName}) => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)
    await activateEntryEditMode(component, entry)

    expect(getCvInput(component, inputName)).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-action')).toBeNull()
  })

  it.each([
    {
      field: 'username',
      inputName: 'inline-username',
      nextValue: 'escape-user@example.com',
    },
    {
      field: 'password',
      inputName: 'inline-password',
      nextValue: 'escape-secret',
    },
    {
      field: 'website',
      inputName: 'inline-website',
      nextValue: 'https://escape.example',
    },
  ])('cancels full-entry edit from %s on Escape', async ({inputName, nextValue}) => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    const update = vi.fn(async () => {})
    ;(entry as Entry & {update: typeof update}).update = update

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)
    await activateEntryEditMode(component, entry)

    const input = getNativeInput(component, inputName)
    expect(input).not.toBeNull()

    input!.value = nextValue
    input!.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))
    await settle(component)

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    input!.dispatchEvent(event)
    await settle(component)

    expect(event.defaultPrevented).toBe(true)
    expect(update).not.toHaveBeenCalled()
    expect(getCvInput(component, inputName)).toBeNull()
  })

  it('keeps avatar editing hidden in read mode and available in edit mode', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    expect(component.shadowRoot?.querySelector('.entry-header-avatar-trigger')).toBeNull()
    expect(component.shadowRoot?.querySelector('.entry-header-avatar-decoration')).toBeNull()

    pmEntryEditorModel.openSurface(entry.id, 'entry')
    await settle(component)

    const avatarTrigger = component.shadowRoot?.querySelector(
      '.entry-header-avatar-trigger',
    ) as HTMLButtonElement | null
    expect(avatarTrigger).not.toBeNull()

    avatarTrigger?.click()
    await settle(component)

    const iconPicker = component.shadowRoot?.querySelector(
      'pm-icon-picker-mobile[data-inline-picker="header-avatar"]',
    ) as (HTMLElement & {shadowRoot?: ShadowRoot}) | null
    const pickerDialog = iconPicker?.shadowRoot?.querySelector('adaptive-modal-surface') as {open?: boolean} | null

    expect(component.shadowRoot?.querySelector('pm-entry-edit-mobile')).toBeNull()
    expect(component.shadowRoot?.querySelector('cv-input[name="inline-title"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-edit-save')).toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-edit-cancel')).toBeNull()
    expect(iconPicker).not.toBeNull()
    expect(avatarTrigger?.contains(iconPicker)).toBe(false)
    expect(pickerDialog?.open).toBe(true)
    expect(component.shadowRoot?.querySelector('.entry-header-avatar-decoration')).not.toBeNull()
  })

  it('hides title and avatar edit affordances in read mode', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => 'Personal note',
    })
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const titleEditButton = component.shadowRoot?.querySelector('.entry-title-edit-action') as HTMLButtonElement | null
    const avatarTrigger = component.shadowRoot?.querySelector('.entry-header-avatar-trigger') as HTMLButtonElement | null
    const usernameEditButton = component.shadowRoot?.querySelector(
      '.inline-action[data-inline-field="username"]',
    ) as HTMLButtonElement | null
    const passwordEditButton = component.shadowRoot?.querySelector(
      '.inline-action[data-inline-field="password"]',
    ) as HTMLButtonElement | null
    const websiteEditButton = component.shadowRoot?.querySelector(
      '.inline-action[data-inline-field="website"]',
    ) as HTMLButtonElement | null
    const noteEditButton = component.shadowRoot?.querySelector('.note-edit-action') as HTMLButtonElement | null

    expect(titleEditButton).toBeNull()
    expect(avatarTrigger).toBeNull()
    expect(component.shadowRoot?.querySelector('.entry-header-avatar-decoration')).toBeNull()
    expect(usernameEditButton).toBeNull()
    expect(passwordEditButton).toBeNull()
    expect(websiteEditButton).toBeNull()
    expect(noteEditButton).toBeNull()
  })

  it('keeps read-mode note copy action while hiding note edit', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => 'Personal note',
    })
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    expect(component.shadowRoot?.querySelector('.note-cv-copy-button')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.note-edit-action')).toBeNull()
  })

  it('uses the passmanager auto-wipe adapter for note copy button feedback', async () => {
    const write = deferred<void>()
    const invoke = vi.fn().mockReturnValue(write.promise)
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {invoke},
    })
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => 'Personal note',
    })
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const copyButton = component.shadowRoot?.querySelector('.note-cv-copy-button') as
      | (CVCopyButton & {updateComplete: Promise<unknown>})
      | null
    const base = copyButton?.shadowRoot?.querySelector('[part="base"]') as HTMLElement | null
    expect(copyButton).not.toBeNull()
    expect(base).not.toBeNull()

    vi.useFakeTimers()
    try {
      base?.click()
      await waitForCondition(() => {
        expect(copyButton?.hasAttribute('copying')).toBe(true)
      })

      expect(copyButton?.hasAttribute('copying')).toBe(true)
      expect(copyButton?.getAttribute('status')).toBe('idle')
      expect(invoke).toHaveBeenCalledWith(
        'plugin:clipboard-manager|write_text',
        expect.objectContaining({text: 'Personal note'}),
      )

      write.resolve()
      await vi.advanceTimersByTimeAsync(0)
      await copyButton?.updateComplete
      await Promise.resolve()
      await copyButton?.updateComplete

      expect(copyButton?.hasAttribute('copying')).toBe(false)
      expect(copyButton?.getAttribute('status')).toBe('success')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps read-mode note loading action while hiding note edit', async () => {
    const note = deferred<string | undefined>()
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: () => note.promise,
    })
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await Promise.resolve()
    await component.updateComplete

    expect(component.shadowRoot?.querySelector('.note-spinner')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.note-edit-action')).toBeNull()

    note.resolve('')
    await settle(component)
  })

  it('opens full edit mode and focuses note from an empty note tap', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => '',
    })
    const scrollSpy = installScrollIntoViewSpy()
    const viewport = installVisualViewportMock()

    try {
      window.passmanager = {
        isReadOnly: () => false,
      } as unknown as typeof window.passmanager

      const component = document.createElement('pm-entry-mobile') as PMEntryMobile
      component.entry = entry
      document.body.append(component)
      await settle(component)

      const emptyState = component.shadowRoot?.querySelector('.note-card .empty-state-action') as HTMLElement | null

      expect(emptyState).not.toBeNull()
      expect(component.shadowRoot?.querySelector('.note-edit-action')).toBeNull()
      emptyState?.click()
      await settleFocus(component)

      expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(true)
      expect(component.shadowRoot?.querySelector('.entry-edit-save-action')).not.toBeNull()
      expect(scrollSpy.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })
      expectFocusedTextarea(component, 'inline-note')

      const scrollCountBeforeKeyboardResize = scrollSpy.scrollIntoView.mock.calls.length
      viewport.dispatchResize()
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

      expect(scrollSpy.scrollIntoView.mock.calls.length).toBeGreaterThan(scrollCountBeforeKeyboardResize)
    } finally {
      viewport.restore()
      scrollSpy.restore()
    }
  })

  it('opens full edit mode and focuses note on read-mode note double tap', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => 'Personal note',
    })
    const scrollSpy = installScrollIntoViewSpy()

    try {
      window.passmanager = {
        isReadOnly: () => false,
      } as unknown as typeof window.passmanager

      const component = document.createElement('pm-entry-mobile') as PMEntryMobile
      component.entry = entry
      document.body.append(component)
      await settle(component)

      const noteContent = component.shadowRoot?.querySelector('.note-card .note-content') as HTMLElement | null
      expect(noteContent).not.toBeNull()
      expect(noteContent?.textContent).toBe('Personal note')

      const doubleTap = new MouseEvent('dblclick', {bubbles: true, cancelable: true, composed: true})
      noteContent?.dispatchEvent(doubleTap)
      await settleFocus(component)

      expect(doubleTap.defaultPrevented).toBe(true)
      expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(true)
      expect(getCvTextarea(component, 'inline-note')?.value).toBe('Personal note')
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

  it('does not open full edit mode from a read-mode note single click', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => 'Personal note',
    })
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const noteContent = component.shadowRoot?.querySelector('.note-card .note-content') as HTMLElement | null
    expect(noteContent).not.toBeNull()

    noteContent?.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, composed: true}))
    await settle(component)

    expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(false)
    expect(component.shadowRoot?.querySelector('.entry-edit-save-action')).toBeNull()
  })

  it('opens full edit mode and focuses note after a touch double tap', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => 'Personal note',
    })
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const noteContent = component.shadowRoot?.querySelector('.note-card .note-content') as HTMLElement | null
    expect(noteContent).not.toBeNull()

    const firstDown = createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 24})
    const firstUp = createTouchPointerEvent('pointerup', {clientX: 12, clientY: 24})
    const secondDown = createTouchPointerEvent('pointerdown', {clientX: 14, clientY: 25})
    const secondUp = createTouchPointerEvent('pointerup', {clientX: 14, clientY: 25})

    vi.useFakeTimers()
    try {
      noteContent?.dispatchEvent(firstDown)
      noteContent?.dispatchEvent(firstUp)
      expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(false)

      vi.advanceTimersByTime(120)
      noteContent?.dispatchEvent(secondDown)
      noteContent?.dispatchEvent(secondUp)
    } finally {
      vi.useRealTimers()
    }

    await settleFocus(component)

    expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(true)
    expect(secondUp.defaultPrevented).toBe(true)
    expect(getCvTextarea(component, 'inline-note')?.value).toBe('Personal note')
    expectFocusedTextarea(component, 'inline-note')
  })

  it('does not open full edit mode from a read-mode note single touch tap', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => 'Personal note',
    })
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const noteContent = component.shadowRoot?.querySelector('.note-card .note-content') as HTMLElement | null
    expect(noteContent).not.toBeNull()

    noteContent?.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 24}))
    noteContent?.dispatchEvent(createTouchPointerEvent('pointerup', {clientX: 12, clientY: 24}))
    await settle(component)

    expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(false)
    expect(component.shadowRoot?.querySelector('.entry-edit-save-action')).toBeNull()
  })

  it('keeps read-only note clicks in read mode', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => 'Personal note',
    })
    window.passmanager = {
      isReadOnly: () => true,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const noteContent = component.shadowRoot?.querySelector('.note-card .note-content') as HTMLElement | null
    expect(noteContent).not.toBeNull()

    noteContent?.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, composed: true}))
    await settle(component)

    expect(pmEntryEditorModel.isActiveForEntry(entry.id)).toBe(false)
    expect(component.shadowRoot?.querySelector('.entry-edit-save-action')).toBeNull()
  })

  it('renders one read-mode edit entry action and activates the shared editor model', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => false,
      showElement: Object.assign(() => entry, {subscribe: () => () => {}}),
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    expect(component.shadowRoot?.querySelector('.inline-action[data-inline-field="username"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-action[data-inline-field="password"]')).toBeNull()

    const editEntryButton = component.shadowRoot?.querySelector(
      '.entry-edit-entry-action',
    ) as HTMLButtonElement | null
    expect(editEntryButton?.textContent).toContain('Edit entry')

    await openEntryEdit(component)

    expect(pmEntryEditorModel.isActiveForEntry(entry.id)).toBe(true)
    expect(component.shadowRoot?.querySelector('.entry-edit-entry-action')).toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-action[data-inline-field="username"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-action[data-inline-field="password"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('cv-input[name="inline-username"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('cv-input[name="inline-password"]')).not.toBeNull()
    const article = component.shadowRoot?.querySelector('article.wrapper') as HTMLElement | null
    const scroll = component.shadowRoot?.querySelector('.entry-scroll') as HTMLElement | null
    const footer = component.shadowRoot?.querySelector('.entry-action-footer') as HTMLElement | null
    const editActions = component.shadowRoot?.querySelector('.entry-edit-actions') as HTMLElement | null
    const saveAction = editActions?.querySelector('.entry-edit-save-action') as HTMLElement | null
    const cancelAction = editActions?.querySelector('.entry-edit-cancel-action') as HTMLElement | null
    expect(footer).not.toBeNull()
    expect(editActions).not.toBeNull()
    expect(footer?.contains(editActions)).toBe(true)
    expect(scroll?.contains(footer)).toBe(false)
    expect(article?.contains(editActions)).toBe(false)
    expect(saveAction).not.toBeNull()
    expect(saveAction?.getAttribute('variant')).toBe('default')
    expect(saveAction?.hasAttribute('unstyled')).toBe(true)
    expect(cancelAction).not.toBeNull()
    expect(cancelAction?.getAttribute('variant')).toBe('default')
    expect(cancelAction?.hasAttribute('unstyled')).toBe(true)
  })

  it.each([
    {
      field: 'username',
      inputName: 'inline-username',
    },
    {
      field: 'password',
      inputName: 'inline-password',
    },
  ] as const)('opens full edit mode and focuses %s from credential double tap', async ({field, inputName}) => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const target = component.shadowRoot?.querySelector(
      `[data-credential-edit-field="${field}"]`,
    ) as HTMLElement | null
    expect(target).not.toBeNull()

    const doubleTap = new MouseEvent('dblclick', {bubbles: true, cancelable: true, composed: true})
    target?.dispatchEvent(doubleTap)
    await settleFocus(component)

    expect(doubleTap.defaultPrevented).toBe(true)
    expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(true)
    expect(component.shadowRoot?.querySelector('.entry-edit-save-action')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.entry-edit-cancel-action')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-edit-mobile')).toBeNull()
    expectFocusedInput(component, inputName)
  })

  it('opens full edit mode and focuses title from title double tap', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const target = component.shadowRoot?.querySelector('[data-entry-title-edit-field="title"]') as HTMLElement | null
    expect(target).not.toBeNull()

    const doubleTap = new MouseEvent('dblclick', {bubbles: true, cancelable: true, composed: true})
    target?.dispatchEvent(doubleTap)
    await settleFocus(component)

    expect(doubleTap.defaultPrevented).toBe(true)
    expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(true)
    expect(component.shadowRoot?.querySelector('.entry-edit-save-action')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.entry-edit-cancel-action')).not.toBeNull()
    expectFocusedInput(component, 'inline-title')
  })

  it('opens full edit mode and focuses title after a touch double tap', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const target = component.shadowRoot?.querySelector('[data-entry-title-edit-field="title"]') as HTMLElement | null
    expect(target).not.toBeNull()

    const firstDown = createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 24})
    const firstUp = createTouchPointerEvent('pointerup', {clientX: 12, clientY: 24})
    const secondDown = createTouchPointerEvent('pointerdown', {clientX: 14, clientY: 25})
    const secondUp = createTouchPointerEvent('pointerup', {clientX: 14, clientY: 25})

    vi.useFakeTimers()
    try {
      target?.dispatchEvent(firstDown)
      target?.dispatchEvent(firstUp)
      expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(false)

      vi.advanceTimersByTime(120)
      target?.dispatchEvent(secondDown)
      target?.dispatchEvent(secondUp)
    } finally {
      vi.useRealTimers()
    }

    await settleFocus(component)

    expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(true)
    expect(secondUp.defaultPrevented).toBe(true)
    expectFocusedInput(component, 'inline-title')
  })

  it('does not open title edit mode from a single touch tap', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const target = component.shadowRoot?.querySelector('[data-entry-title-edit-field="title"]') as HTMLElement | null
    expect(target).not.toBeNull()

    target?.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 24}))
    target?.dispatchEvent(createTouchPointerEvent('pointerup', {clientX: 12, clientY: 24}))
    await settleFocus(component)

    expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(false)
    expect(component.shadowRoot?.querySelector('.entry-edit-save-action')).toBeNull()
  })

  it('opens full edit mode and focuses username after a touch double tap', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const target = component.shadowRoot?.querySelector(
      '[data-credential-edit-field="username"]',
    ) as HTMLElement | null
    expect(target).not.toBeNull()

    const firstDown = createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 24})
    const firstUp = createTouchPointerEvent('pointerup', {clientX: 12, clientY: 24})
    const secondDown = createTouchPointerEvent('pointerdown', {clientX: 14, clientY: 25})
    const secondUp = createTouchPointerEvent('pointerup', {clientX: 14, clientY: 25})

    vi.useFakeTimers()
    try {
      target?.dispatchEvent(firstDown)
      target?.dispatchEvent(firstUp)
      expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(false)

      vi.advanceTimersByTime(120)
      target?.dispatchEvent(secondDown)
      target?.dispatchEvent(secondUp)
    } finally {
      vi.useRealTimers()
    }

    await settleFocus(component)

    expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(true)
    expect(secondUp.defaultPrevented).toBe(true)
    expectFocusedInput(component, 'inline-username')
  })

  it('does not open credential edit mode from a single touch tap', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const target = component.shadowRoot?.querySelector(
      '[data-credential-edit-field="username"]',
    ) as HTMLElement | null
    expect(target).not.toBeNull()

    target?.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 24}))
    target?.dispatchEvent(createTouchPointerEvent('pointerup', {clientX: 12, clientY: 24}))
    await settleFocus(component)

    expect(pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')).toBe(false)
    expect(component.shadowRoot?.querySelector('.entry-edit-save-action')).toBeNull()
  })

  it('does not expose credential edit double-tap targets in read-only or payment-card views', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => true,
    } as unknown as typeof window.passmanager

    const readOnlyComponent = document.createElement('pm-entry-mobile') as PMEntryMobile
    readOnlyComponent.entry = entry
    document.body.append(readOnlyComponent)
    await settle(readOnlyComponent)

    expect(readOnlyComponent.shadowRoot?.querySelector('[data-credential-edit-field]')).toBeNull()
    expect(readOnlyComponent.shadowRoot?.querySelector('[data-entry-title-edit-field]')).toBeNull()

    readOnlyComponent.shadowRoot
      ?.querySelector('.primary-card')
      ?.dispatchEvent(new Event('contextmenu', {bubbles: true, cancelable: true, composed: true}))
    await settle(readOnlyComponent)

    expect(pmEntryEditorModel.isActiveForEntry(entry.id)).toBe(false)

    document.body.innerHTML = ''
    pmEntryEditorModel.reset()
    const paymentCard = createPaymentCardEntry()
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const paymentCardComponent = document.createElement('pm-entry-mobile') as PMEntryMobile
    paymentCardComponent.entry = paymentCard
    document.body.append(paymentCardComponent)
    await settle(paymentCardComponent)

    expect(paymentCardComponent.shadowRoot?.querySelector('[data-credential-edit-field]')).toBeNull()
    expect(pmEntryEditorModel.isActiveForEntry(paymentCard.id)).toBe(false)
  })

  it('hides edit entry action in read-only mode', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    window.passmanager = {
      isReadOnly: () => true,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    expect(component.shadowRoot?.querySelector('.entry-edit-entry-action')).toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-action[data-inline-field="username"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-action[data-inline-field="password"]')).toBeNull()
  })

  it('saves header title edits through the full-entry save action', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    const update = vi.fn(async () => {})
    ;(entry as Entry & {update: typeof update}).update = update

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)
    await activateEntryEditMode(component, entry)

    const titleInput = component.shadowRoot?.querySelector(
      'cv-input[name="inline-title"]',
    ) as HTMLElement | null
    titleInput?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'Updated mobile entry'},
        bubbles: true,
        composed: true,
      }),
    )

    const saveButton = component.shadowRoot?.querySelector('.entry-edit-save-action') as HTMLButtonElement | null
    saveButton?.click()
    await settle(component)

    const call = update.mock.calls.at(-1)
    expect(call?.[0]).toEqual(expect.objectContaining({title: 'Updated mobile entry'}))
    expect(call?.[1]).toBeUndefined()
    expect(call?.[2]).toBeUndefined()
    expect(component.shadowRoot?.querySelector('cv-input[name="inline-title"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-edit-mobile')).toBeNull()
  })

  it('saves avatar edits through the full-entry save action', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    const update = vi.fn(async () => {})
    ;(entry as Entry & {update: typeof update}).update = update

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)
    await activateEntryEditMode(component, entry)

    const avatarTrigger = component.shadowRoot?.querySelector(
      '.entry-header-avatar-trigger',
    ) as HTMLButtonElement | null
    avatarTrigger?.click()
    await settle(component)

    const iconPicker = component.shadowRoot?.querySelector(
      'pm-icon-picker-mobile[data-inline-picker="header-avatar"]',
    ) as HTMLElement | null
    iconPicker?.dispatchEvent(
      new CustomEvent('pm-icon-change', {
        detail: {iconRef: 'icon-inline-updated'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(component)

    const saveButton = component.shadowRoot?.querySelector('.entry-edit-save-action') as HTMLButtonElement | null
    saveButton?.click()
    await settle(component)

    expect(component.shadowRoot?.querySelector('cv-input[name="inline-title"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-edit-save')).toBeNull()
    const call = update.mock.calls.at(-1)
    expect(call?.[0]).toEqual(expect.objectContaining({title: '1cCloud', iconRef: 'icon-inline-updated'}))
    expect(call?.[1]).toBeUndefined()
    expect(call?.[2]).toBeUndefined()
  })

  it('shows note input inside full-entry edit without note-level save/cancel', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => 'Personal note',
    })
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)
    await activateEntryEditMode(component, entry)

    expect(component.shadowRoot?.querySelector('pm-entry-edit-mobile')).toBeNull()
    expect(component.shadowRoot?.querySelector('cv-textarea[name="inline-note"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.note-edit-action')).toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-edit-save')).toBeNull()
    expect(component.shadowRoot?.querySelector('.inline-edit-cancel')).toBeNull()
    expect(component.shadowRoot?.querySelector('.entry-edit-save-action')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.entry-edit-cancel-action')).not.toBeNull()
  })

  it('saves note from the full-entry save action', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => 'Personal note',
    })
    const update = vi.fn(async () => {})
    ;(entry as Entry & {update: typeof update}).update = update

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)
    await activateEntryEditMode(component, entry)

    const textarea = getNativeTextarea(component, 'inline-note')
    expect(textarea).not.toBeNull()

    const note = 'Привет, заметка №1'
    textarea!.value = note
    textarea!.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))
    await settle(component)

    const saveButton = component.shadowRoot?.querySelector('.entry-edit-save-action') as HTMLButtonElement | null
    saveButton?.click()
    await settle(component)

    const call = update.mock.calls.at(-1)
    expect(call?.[0]).toEqual(expect.objectContaining({title: '1cCloud'}))
    expect(call?.[1]).toBeUndefined()
    expect(call?.[2]).toBe(note)
    expect(getCvTextarea(component, 'inline-note')).toBeNull()
  })

  it('keeps note multiline editing on Shift+Enter', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => 'Personal note',
    })
    const update = vi.fn(async () => {})
    ;(entry as Entry & {update: typeof update}).update = update

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)
    await activateEntryEditMode(component, entry)

    const textarea = getNativeTextarea(component, 'inline-note')
    expect(textarea).not.toBeNull()

    textarea!.value = 'Line 1\n'
    textarea!.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))
    await settle(component)

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    textarea!.dispatchEvent(event)
    await settle(component)

    expect(event.defaultPrevented).toBe(false)
    expect(update).not.toHaveBeenCalled()
    expect(getCvTextarea(component, 'inline-note')?.value).toBe('Line 1\n')
  })

  it('cancels the note snippet on Escape', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => 'Personal note',
    })
    const update = vi.fn(async () => {})
    ;(entry as Entry & {update: typeof update}).update = update

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)
    await activateEntryEditMode(component, entry)

    const textarea = getNativeTextarea(component, 'inline-note')
    expect(textarea).not.toBeNull()

    textarea!.value = 'Updated note'
    textarea!.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))
    await settle(component)

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    textarea!.dispatchEvent(event)
    await settle(component)

    expect(event.defaultPrevented).toBe(true)
    expect(update).not.toHaveBeenCalled()
    expect(getCvTextarea(component, 'inline-note')).toBeNull()
  })

  it('keeps note textarea in the full-entry edit surface', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      note: async () => 'Personal note',
    })

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)
    await activateEntryEditMode(component, entry)

    expect(component.shadowRoot?.querySelector('cv-textarea[name="inline-note"]')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('.note-edit-action')).toBeNull()
  })

  it('shows otp create snippet on the entry page without opening pm-entry-edit-mobile', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
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
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const editButton = component.shadowRoot?.querySelector(
      '.section-action[data-snippet-section="otp"]',
    ) as HTMLButtonElement | null
    expect(editButton).not.toBeNull()

    editButton?.click()
    await settle(component)

    const otpItem = component.shadowRoot?.querySelector('pm-entry-otp-item') as
      | (HTMLElement & {shadowRoot?: ShadowRoot; updateComplete?: Promise<unknown>})
      | null
    await otpItem?.updateComplete

    expect(component.shadowRoot?.querySelector('pm-entry-edit-mobile')).toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-otp-create[data-snippet="otp"]')).toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-otp-create-sheet[open]')).not.toBeNull()
    expect(otpItem?.shadowRoot?.querySelector('.otp-remove-action')).not.toBeNull()
  })

  it('does not render OTP quick view action in the mobile OTP section', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
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
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const quickViewButton = component.shadowRoot?.querySelector(
      '[data-action="otp-quick-view"]',
    ) as HTMLButtonElement | null
    expect(quickViewButton).toBeNull()
  })

  it('shows missing otp and ssh add actions on the entry view only', async () => {
    const entryWithSecrets = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      otps: [
        {
          id: 'otp-1',
          type: 'TOTP',
          data: {label: 'Main OTP'},
          remove: vi.fn(),
        },
      ],
      sshKeys: [
        {
          id: 'ssh-1',
          type: 'ed25519',
          fingerprint: 'SHA256:test',
          comment: 'user@example.com',
        },
      ],
    })
    const entryWithoutSecrets = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const manageComponent = document.createElement('pm-entry-mobile') as PMEntryMobile
    manageComponent.entry = entryWithSecrets
    document.body.append(manageComponent)
    await settle(manageComponent)

    const otpAddButton = manageComponent.shadowRoot?.querySelector(
      '.section-action[data-snippet-section="otp"]',
    ) as HTMLButtonElement | null
    const sshAddButton = manageComponent.shadowRoot?.querySelector(
      '.section-action[data-snippet-section="ssh"]',
    ) as HTMLButtonElement | null
    const otpItems = Array.from(
      manageComponent.shadowRoot?.querySelectorAll('pm-entry-otp-item') ?? [],
    ) as Array<HTMLElement & {shadowRoot?: ShadowRoot; updateComplete?: Promise<unknown>}>
    await Promise.all(otpItems.map((item) => item.updateComplete))
    const otpInlineRemoveActions = otpItems.filter((item) => item.shadowRoot?.querySelector('.otp-remove-action'))
    const sshItems = Array.from(
      manageComponent.shadowRoot?.querySelectorAll('pm-entry-ssh-key') ?? [],
    ) as Array<HTMLElement & {shadowRoot?: ShadowRoot; updateComplete?: Promise<unknown>}>
    await Promise.all(sshItems.map((item) => item.updateComplete))
    const sshInlineRemoveActions = sshItems.filter((item) => item.shadowRoot?.querySelector('.ssh-remove-action'))
    const viewOtpAddButton = manageComponent.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="otp"]',
    ) as HTMLButtonElement | null
    const viewSshAddButton = manageComponent.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="ssh"]',
    ) as HTMLButtonElement | null

    expect(viewOtpAddButton).toBeNull()
    expect(viewSshAddButton).toBeNull()
    expect(otpAddButton?.classList.contains('edit-icon-action')).toBe(false)
    expect(otpAddButton?.textContent).toContain('Add OTP')
    expect(sshAddButton?.classList.contains('edit-icon-action')).toBe(true)
    expect(sshAddButton?.getAttribute('aria-label')).toBe('Add SSH Key')
    expect(sshAddButton?.querySelector('span')).toBeNull()
    expect(otpInlineRemoveActions).toHaveLength(0)
    expect(sshInlineRemoveActions).toHaveLength(1)

    await activateEntryEditMode(manageComponent, entryWithSecrets)
    const editModeOtpAddButton = manageComponent.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="otp"]',
    ) as HTMLButtonElement | null
    const editModeSshAddButton = manageComponent.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="ssh"]',
    ) as HTMLButtonElement | null
    const editModeOtpItems = Array.from(
      manageComponent.shadowRoot?.querySelectorAll('pm-entry-otp-item') ?? [],
    ) as Array<HTMLElement & {shadowRoot?: ShadowRoot; updateComplete?: Promise<unknown>}>
    await Promise.all(editModeOtpItems.map((item) => item.updateComplete))
    const editModeOtpRemoveActions = editModeOtpItems.filter((item) =>
      item.shadowRoot?.querySelector('.otp-remove-action'),
    )
    const editModeSshItems = Array.from(
      manageComponent.shadowRoot?.querySelectorAll('pm-entry-ssh-key') ?? [],
    ) as Array<HTMLElement & {shadowRoot?: ShadowRoot; updateComplete?: Promise<unknown>}>
    await Promise.all(editModeSshItems.map((item) => item.updateComplete))
    const editModeSshRemoveActions = editModeSshItems.filter((item) =>
      item.shadowRoot?.querySelector('.ssh-remove-action'),
    )
    expect(editModeOtpAddButton).toBeNull()
    expect(editModeSshAddButton).toBeNull()
    expect(editModeOtpItems).toHaveLength(1)
    expect(editModeSshItems).toHaveLength(1)
    expect(editModeOtpRemoveActions).toHaveLength(0)
    expect(editModeSshRemoveActions).toHaveLength(0)

    manageComponent.remove()

    const addComponent = document.createElement('pm-entry-mobile') as PMEntryMobile
    addComponent.entry = entryWithoutSecrets
    document.body.append(addComponent)
    await settle(addComponent)

    const emptySectionOtpAddButton = addComponent.shadowRoot?.querySelector(
      '.section-action[data-snippet-section="otp"]',
    ) as HTMLButtonElement | null
    const emptySectionSshAddButton = addComponent.shadowRoot?.querySelector(
      '.section-action[data-snippet-section="ssh"]',
    ) as HTMLButtonElement | null
    const emptyOtpAddButton = addComponent.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="otp"]',
    ) as HTMLButtonElement | null
    const emptySshAddButton = addComponent.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="ssh"]',
    ) as HTMLButtonElement | null

    expect(emptySectionOtpAddButton).toBeNull()
    expect(emptySectionSshAddButton).toBeNull()
    expect(emptyOtpAddButton?.textContent).toContain('Add OTP')
    expect(emptySshAddButton?.textContent).toContain('Add SSH Key')
    expect(addComponent.shadowRoot?.querySelector('pm-entry-otp-item')).toBeNull()
    expect(addComponent.shadowRoot?.querySelector('pm-entry-ssh-key')).toBeNull()

    await activateEntryEditMode(addComponent, entryWithoutSecrets)
    const editModeEmptySectionOtpAddButton = addComponent.shadowRoot?.querySelector(
      '.section-action[data-snippet-section="otp"]',
    ) as HTMLButtonElement | null
    const editModeEmptySectionSshAddButton = addComponent.shadowRoot?.querySelector(
      '.section-action[data-snippet-section="ssh"]',
    ) as HTMLButtonElement | null
    const editModeEmptyOtpAddButton = addComponent.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="otp"]',
    ) as HTMLButtonElement | null
    const editModeEmptySshAddButton = addComponent.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="ssh"]',
    ) as HTMLButtonElement | null

    expect(editModeEmptySectionOtpAddButton).toBeNull()
    expect(editModeEmptySectionSshAddButton).toBeNull()
    expect(editModeEmptyOtpAddButton).toBeNull()
    expect(editModeEmptySshAddButton).toBeNull()
    expect(addComponent.shadowRoot?.querySelector('pm-entry-otp-item')).toBeNull()
    expect(addComponent.shadowRoot?.querySelector('pm-entry-ssh-key')).toBeNull()
  })

  it('opens missing otp and ssh add flows from the entry view', async () => {
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const otpEntry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      id: 'entry-mobile-add-otp-from-view',
    })

    const otpComponent = document.createElement('pm-entry-mobile') as PMEntryMobile
    otpComponent.entry = otpEntry
    document.body.append(otpComponent)
    await settle(otpComponent)

    const otpAddButton = otpComponent.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="otp"]',
    ) as HTMLButtonElement | null
    otpAddButton?.click()
    await settle(otpComponent)

    expect(otpComponent.shadowRoot?.querySelector('pm-entry-edit-mobile')).toBeNull()
    expect(otpComponent.shadowRoot?.querySelector('.entry-edit-actions')).toBeNull()
    expect(otpComponent.shadowRoot?.querySelector('pm-entry-otp-create[data-snippet="otp"]')).toBeNull()
    expect(otpComponent.shadowRoot?.querySelector('pm-entry-otp-create-sheet[open]')).not.toBeNull()

    otpComponent.remove()
    pmEntryEditorModel.reset()

    const sshEntry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      id: 'entry-mobile-add-ssh-from-view',
    })

    const sshComponent = document.createElement('pm-entry-mobile') as PMEntryMobile
    sshComponent.entry = sshEntry
    document.body.append(sshComponent)
    await settle(sshComponent)

    const sshAddButton = sshComponent.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="ssh"]',
    ) as HTMLButtonElement | null
    sshAddButton?.click()
    await settle(sshComponent)

    expect(sshComponent.shadowRoot?.querySelector('pm-entry-edit-mobile')).toBeNull()
    expect(sshComponent.shadowRoot?.querySelector('pm-entry-ssh-key')).toBeNull()
    expect(sshComponent.shadowRoot?.querySelector('pm-entry-ssh-generator')).toBeNull()
    expect(sshComponent.shadowRoot?.querySelector('pm-entry-ssh-create-sheet[open]')).not.toBeNull()
  })

  it('saves otp snippet from the entry page', async () => {
    const addOTP = vi.fn(async () => {})
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    ;(entry as Entry & {addOTP: typeof addOTP}).addOTP = addOTP
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_otp_qr_scan: true,
    })

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const editButton = component.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="otp"]',
    ) as HTMLButtonElement | null
    editButton?.click()
    await settle(component)

    expect(component.shadowRoot?.querySelector('.entry-edit-actions')).toBeNull()
    expect(component.shadowRoot?.querySelector('.entry-edit-entry-action')).toBeNull()

    const otpSheet = component.shadowRoot?.querySelector('pm-entry-otp-create-sheet') as {
      shadowRoot?: ShadowRoot | null
      updateComplete?: Promise<unknown>
    } | null
    expect(otpSheet).not.toBeNull()
    expect(otpSheet?.hasAttribute('open')).toBe(true)
    await otpSheet?.updateComplete

    const otpCreate = otpSheet?.shadowRoot?.querySelector('pm-entry-otp-create') as {
      model?: unknown
      shadowRoot?: ShadowRoot | null
      updateComplete?: Promise<unknown>
    } | null
    expect(otpCreate).not.toBeNull()
    expect(otpCreate?.model).toBe(
      (component as PMEntryMobile & {model: {otpDraft: {setSecret: (value: string) => void}}}).model.otpDraft,
    )
    await otpCreate?.updateComplete
    expect(otpCreate?.shadowRoot?.querySelector('.qr-hero-button')).not.toBeNull()

    ;(
      component as PMEntryMobile & {model: {otpDraft: {applyQrPayload: (value: string) => boolean}}}
    ).model.otpDraft.applyQrPayload('otpauth://totp/1cCloud?secret=JBSWY3DPEHPK3PXP&issuer=1cCloud')
    await settle(component)
    await otpSheet?.updateComplete

    const saveButton = otpSheet?.shadowRoot?.querySelector('.primary-action') as HTMLElement | null
    saveButton?.click()
    await settle(component)

    expect(addOTP).toHaveBeenCalledTimes(1)
    expect(addOTP).toHaveBeenCalledWith(expect.objectContaining({secret: 'JBSWY3DPEHPK3PXP'}))
    expect(component.shadowRoot?.querySelector('pm-entry-otp-create-sheet[open]')).toBeNull()
  })

  it('accepts otp secret entered through the embedded form inputs before save', async () => {
    const addOTP = vi.fn(async () => {})
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    ;(entry as Entry & {addOTP: typeof addOTP}).addOTP = addOTP

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const editButton = component.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="otp"]',
    ) as HTMLButtonElement | null
    editButton?.click()
    await settle(component)

    const otpSheet = component.shadowRoot?.querySelector('pm-entry-otp-create-sheet') as {
      shadowRoot?: ShadowRoot | null
      updateComplete?: Promise<unknown>
    } | null
    await otpSheet?.updateComplete

    const otpCreate = otpSheet?.shadowRoot?.querySelector('pm-entry-otp-create') as HTMLElement | null
    const secretInput = otpCreate?.shadowRoot?.querySelector('cv-input')
    expect(secretInput).not.toBeNull()

    secretInput?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'jbswy3dpehpk3pxp'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(component)
    await otpSheet?.updateComplete

    const saveButton = otpSheet?.shadowRoot?.querySelector('.primary-action') as HTMLElement | null
    saveButton?.click()
    await settle(component)

    expect(addOTP).toHaveBeenCalledWith(expect.objectContaining({secret: 'JBSWY3DPEHPK3PXP'}))
  })

  it('cancels the otp sheet when it closes', async () => {
    const addOTP = vi.fn(async () => {})
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    ;(entry as Entry & {addOTP: typeof addOTP}).addOTP = addOTP

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const editButton = component.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="otp"]',
    ) as HTMLButtonElement | null
    editButton?.click()
    await settle(component)

    const otpSheet = component.shadowRoot?.querySelector('pm-entry-otp-create-sheet') as HTMLElement | null
    expect(otpSheet).not.toBeNull()

    otpSheet?.dispatchEvent(
      new CustomEvent('pm-entry-otp-create-sheet-close', {
        bubbles: true,
        composed: true,
      }),
    )
    await settle(component)

    expect(addOTP).not.toHaveBeenCalled()
    expect(component.shadowRoot?.querySelector('pm-entry-otp-create-sheet[open]')).toBeNull()
  })

  it('opens the ssh create sheet on the entry page without opening pm-entry-edit-mobile', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      sshKeys: [
        {
          id: 'ssh-1',
          type: 'ed25519',
          fingerprint: 'SHA256:test',
          comment: 'user@example.com',
        },
      ],
    })
    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const addButton = component.shadowRoot?.querySelector(
      '.section-action[data-snippet-section="ssh"]',
    ) as HTMLButtonElement | null
    expect(component.shadowRoot?.querySelector('pm-entry-ssh-generator')).toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-ssh-create-sheet[open]')).toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-ssh-key')).not.toBeNull()
    expect(addButton).not.toBeNull()

    addButton?.click()
    await settle(component)

    expect(component.shadowRoot?.querySelector('pm-entry-edit-mobile')).toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-ssh-key')).not.toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-ssh-generator')).toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-ssh-create-sheet[open]')).not.toBeNull()
  })

  it('cancels the ssh create sheet when it closes', async () => {
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}], {
      sshKeys: [
        {
          id: 'ssh-1',
          type: 'ed25519',
          fingerprint: 'SHA256:test',
          comment: 'user@example.com',
        },
      ],
    })

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const addButton = component.shadowRoot?.querySelector(
      '.section-action[data-snippet-section="ssh"]',
    ) as HTMLButtonElement | null
    addButton?.click()
    await settle(component)

    const sshSheet = component.shadowRoot?.querySelector('pm-entry-ssh-create-sheet') as HTMLElement | null
    expect(sshSheet).not.toBeNull()

    sshSheet?.dispatchEvent(
      new CustomEvent('pm-entry-ssh-create-sheet-close', {
        bubbles: true,
        composed: true,
      }),
    )
    await settle(component)

    expect(component.shadowRoot?.querySelector('pm-entry-ssh-generator')).toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-ssh-create-sheet[open]')).toBeNull()
    expect(component.shadowRoot?.querySelector('pm-entry-ssh-key')).not.toBeNull()
  })

  it('generates ssh metadata from the sheet and keeps the result open', async () => {
    vi.mocked(passmanagerSshKeygen).mockResolvedValue({
      key_id: 'ssh-generated',
      public_key_openssh: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGenerated andry_diego@mail.ru@1cCloud',
      fingerprint: 'SHA256:generated',
      key_type: 'ed25519',
    })
    const updateSshKeys = vi.fn(async () => {})
    const entry = createEntry([{match: 'domain', value: 'https://1ccloud.ru'}])
    ;(entry as Entry & {updateSshKeys: typeof updateSshKeys}).updateSshKeys = updateSshKeys

    window.passmanager = {
      isReadOnly: () => false,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-mobile') as PMEntryMobile
    component.entry = entry
    document.body.append(component)
    await settle(component)

    const addButton = component.shadowRoot?.querySelector(
      '.entry-view-add-action[data-entry-view-add-action="ssh"]',
    ) as HTMLButtonElement | null
    addButton?.click()
    await settle(component)

    const sshSheet = component.shadowRoot?.querySelector('pm-entry-ssh-create-sheet') as {
      shadowRoot?: ShadowRoot | null
      updateComplete?: Promise<unknown>
    } | null
    expect(sshSheet).not.toBeNull()
    await sshSheet?.updateComplete

    const generateButton = sshSheet?.shadowRoot?.querySelector('.primary-action') as HTMLElement | null
    generateButton?.click()
    await settle(component)
    await sshSheet?.updateComplete

    expect(passmanagerSshKeygen).toHaveBeenCalledWith({
      entryId: entry.id,
      keyType: 'ed25519',
      comment: 'andry_diego@mail.ru@1cCloud',
    })
    expect(updateSshKeys).toHaveBeenCalledWith([
      {
        id: 'ssh-generated',
        type: 'ed25519',
        fingerprint: 'SHA256:generated',
        name: '1cCloud SSH',
        comment: 'andry_diego@mail.ru@1cCloud',
      },
    ])
    expect(component.shadowRoot?.querySelector('pm-entry-ssh-create-sheet[open]')).not.toBeNull()
    const sshCreate = sshSheet?.shadowRoot?.querySelector('pm-entry-ssh-create') as
      | (HTMLElement & {shadowRoot?: ShadowRoot | null; updateComplete?: Promise<unknown>})
      | null
    await sshCreate?.updateComplete
    expect(sshCreate?.shadowRoot?.textContent).toContain('SHA256:generated')
    expect(sshCreate?.shadowRoot?.textContent).toContain('ssh-ed25519 AAAAC3')
  })
})
