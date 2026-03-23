import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Entry, ManagerRoot} from '@project/passmanager'
import {PMEntryMobile} from '../../src/features/passmanager/components/card/entry/entry-mobile'

let defined = false

function ensureDefined() {
  if (defined) return
  PMEntryMobile.define()
  defined = true
}

async function settle(element: PMEntryMobile) {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

function createEntry(
  urls: Array<{match: string; value: string}>,
  options: {
    id?: string
    flushPendingPersistence?: () => Promise<void>
    password?: () => Promise<string | undefined>
    note?: () => Promise<string | undefined>
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
      otps: [],
      sshKeys: [],
    } as any,
  )

  ;(entry as Entry & {flushPendingPersistence: () => Promise<void>}).flushPendingPersistence = vi.fn(
    options.flushPendingPersistence ?? (async () => {}),
  )
  vi.spyOn(entry, 'password').mockImplementation(options.password ?? (async () => 'secret'))
  vi.spyOn(entry, 'note').mockImplementation(options.note ?? (async () => ''))

  return entry
}

describe('PMEntryMobile', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
    ensureDefined()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.passmanager = previousPassmanager
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

    const passwordField = component.shadowRoot?.querySelectorAll('.credential-field')[1] as HTMLElement | undefined
    expect(passwordField?.querySelector('.secret-skeleton')).not.toBeNull()
    expect(passwordField?.querySelector('.password-input')).toBeNull()

    flush.resolve()
    password.resolve('secret')
    note.resolve('')
    await settle(component)

    const passwordInput = passwordField?.querySelector('.password-input') as HTMLElement & {value?: string}
    expect(passwordInput?.value).toBe('secret')
    expect(passwordField?.querySelector('.secret-skeleton')).toBeNull()
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

    const passwordField = component.shadowRoot?.querySelectorAll('.credential-field')[1] as HTMLElement | undefined
    const passwordInput = passwordField?.querySelector('.password-input') as HTMLElement & {value?: string}
    expect(passwordInput?.value).toBe('second-secret')

    staleFlush.resolve()
    stalePassword.resolve('stale-secret')
    staleNote.resolve('stale-note')
    await settle(component)

    expect(passwordInput?.value).toBe('second-secret')
  })
})
