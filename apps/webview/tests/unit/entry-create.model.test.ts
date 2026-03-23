import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PMEntryCreateModel} from '../../src/features/passmanager/components/card/entry-create/entry-create.model'
import type {AndroidPasswordSavePrefill} from '../../src/features/passmanager/models/android-password-save-prefill'

describe('PMEntryCreateModel', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
  })

  afterEach(() => {
    window.passmanager = previousPassmanager
    vi.restoreAllMocks()
  })

  it('returns passmanager_unavailable when global passmanager is missing', () => {
    window.passmanager = undefined as unknown as typeof window.passmanager
    const model = new PMEntryCreateModel()

    const result = model.submit()

    expect(result).toEqual({ok: false, reason: 'passmanager_unavailable'})
  })

  it('requires title before submit', () => {
    const createEntry = vi.fn()
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const model = new PMEntryCreateModel()
    const result = model.submit()

    expect(result).toEqual({ok: false, reason: 'missing_title'})
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('creates entry with derived URL rule from title when urls field is empty', () => {
    const createEntry = vi.fn(() => undefined)
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const model = new PMEntryCreateModel()
    model.setTitle('https://example.com/login')
    model.setUsername('john')
    model.setPassword('secret')
    model.setNote('note')
    model.setIconRef('sha256:icon')

    const result = model.submit()

    expect(result).toEqual({ok: true})
    expect(createEntry).toHaveBeenCalledTimes(1)

    const [entryData, password, note, otp] = createEntry.mock.calls[0] as [
      {title: string; username: string; urls: Array<{value: string; match: string}>; iconRef?: string},
      string,
      string,
      unknown,
    ]

    expect(entryData.title).toBe('https://example.com/login')
    expect(entryData.username).toBe('john')
    expect(entryData.urls).toEqual([{value: 'https://example.com/login', match: 'base_domain'}])
    expect(entryData.iconRef).toBe('sha256:icon')
    expect(password).toBe('secret')
    expect(note).toBe('note')
    expect(otp).toBeUndefined()
  })

  it('toggles ssh UI state and clears pending result when disabling ssh', () => {
    const model = new PMEntryCreateModel()

    model.setUseSsh(true)
    model.requestSshGeneration()
    expect(model.showSshGenerator()).toBe(true)
    expect(model.sshGenResult()?.pending).toBe(true)

    model.setUseSsh(false)
    expect(model.showSshGenerator()).toBe(false)
    expect(model.sshGenResult()).toBeNull()
  })

  it('applies Android password save prefill into the create form', () => {
    const model = new PMEntryCreateModel()
    const prefill: AndroidPasswordSavePrefill = {
      token: 'token-1',
      title: 'github.com',
      username: 'alice@example.com',
      password: 'pw-123',
      urls: 'https://github.com/login',
    }

    model.applyPrefill(prefill)

    expect(model.title()).toBe('github.com')
    expect(model.username()).toBe('alice@example.com')
    expect(model.password()).toBe('pw-123')
    expect(model.urls()).toBe('https://github.com/login')
    expect(model.isEditingPassword()).toBe(true)
  })
})
