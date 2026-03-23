import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Entry, ManagerRoot} from '@project/passmanager'
import {PMEntry} from '../../src/features/passmanager/components/card/entry/entry'

let defined = false

function ensureDefined() {
  if (defined) return
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
  await element.updateComplete
  await Promise.resolve()
}

function createEntry(options: {
  flushPendingPersistence?: () => Promise<void>
  password?: () => Promise<string | undefined>
  note?: () => Promise<string | undefined>
} = {}) {
  const entry = new Entry(
    Object.create(ManagerRoot.prototype) as ManagerRoot,
    {
      id: 'entry-render-test',
      title: 'Entry',
      urls: [{match: 'domain', value: 'https://example.com'}],
      username: 'alice',
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

describe('PMEntry', () => {
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

    const passwordField = component.shadowRoot?.querySelectorAll('.credential-field')[1] as HTMLElement | undefined
    expect(passwordField?.querySelector('.secret-skeleton')).not.toBeNull()
    expect(passwordField?.querySelector('.password-input')).toBeNull()

    flush.resolve()
    password.resolve('secret')
    note.resolve('')
    await settle(component)

    const passwordInput = passwordField?.querySelector('.password-input') as HTMLElement & {value?: string}
    expect(passwordInput?.value).toBe('secret')
  })
})
