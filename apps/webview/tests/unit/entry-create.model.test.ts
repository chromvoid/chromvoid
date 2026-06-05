import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('../../src/features/passmanager/service/passmanager-ssh-keygen', () => ({
  passmanagerSshKeygen: vi.fn(),
}))

import {PMEntryCreateModel} from '../../src/features/passmanager/components/card/entry-create/entry-create.model'
import type {AndroidPasswordSavePrefill} from '../../src/features/passmanager/models/android-password-save-prefill'
import {passmanagerSshKeygen} from '../../src/features/passmanager/service/passmanager-ssh-keygen'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

describe('PMEntryCreateModel', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
  })

  afterEach(() => {
    window.passmanager = previousPassmanager
    vi.restoreAllMocks()
  })

  it('returns passmanager_unavailable when global passmanager is missing', async () => {
    window.passmanager = undefined as unknown as typeof window.passmanager
    const model = new PMEntryCreateModel()

    const result = await model.submit()

    expect(result).toEqual({ok: false, reason: 'passmanager_unavailable'})
  })

  it('requires title before submit', async () => {
    const createEntry = vi.fn()
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const model = new PMEntryCreateModel()
    const result = await model.submit()

    expect(result).toEqual({ok: false, reason: 'missing_title', field: 'title'})
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('keeps OTP sheet open while native QR scanner is active', () => {
    const model = new PMEntryCreateModel()

    model.openOtpSheet()
    model.otp.setQrScannerScanning(true)
    model.closeOtpSheet()

    expect(model.otpSheetOpen()).toBe(true)
    expect(model.useOtp()).toBe(false)
  })

  it('keeps invalid login submit clickable and reports field errors without creating an entry', async () => {
    const createEntry = vi.fn()
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const model = new PMEntryCreateModel()
    expect(model.canSubmit()).toBe(false)

    await expect(model.submit()).resolves.toEqual({ok: false, reason: 'missing_title', field: 'title'})
    expect(model.titleError()).not.toBe('')

    model.setTitle('Entry')
    expect(model.titleError()).toBe('')

    await expect(model.submit()).resolves.toEqual({
      ok: false,
      reason: 'missing_login_locator',
      field: 'username',
    })
    expect(model.usernameError()).not.toBe('')

    model.setUsername('alice')
    expect(model.usernameError()).toBe('')

    await expect(model.submit()).resolves.toEqual({ok: false, reason: 'missing_password', field: 'password'})
    expect(model.passwordError()).not.toBe('')
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('creates login entry with separate title, website URL rule, and avatar ref', async () => {
    const createEntry = vi.fn(() => undefined)
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const model = new PMEntryCreateModel()
    model.setTitle('Example login')
    model.setWebsite('example.com')
    model.setUsername('john')
    model.setPassword('secret')
    model.setNote('note')
    model.setIconRef('sha256:icon')

    const result = await model.submit()

    expect(result).toEqual({ok: true})
    expect(createEntry).toHaveBeenCalledTimes(1)

    const [entryData, password, note, otp] = createEntry.mock.calls[0] as [
      {title: string; username: string; urls: Array<{value: string; match: string}>; iconRef?: string; tags?: string[]},
      string,
      string,
      unknown,
    ]

    expect(entryData.title).toBe('Example login')
    expect(entryData.username).toBe('john')
    expect(entryData.urls).toEqual([{value: 'https://example.com', match: 'base_domain'}])
    expect(entryData.iconRef).toBe('sha256:icon')
    expect(entryData.tags).toEqual([])
    expect(password).toBe('secret')
    expect(note).toBe('note')
    expect(otp).toBeUndefined()
  })

  it('preserves Cyrillic note text when creating a login entry', async () => {
    const createEntry = vi.fn(() => undefined)
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const note = 'Привет, заметка №1'
    const model = new PMEntryCreateModel()
    model.setTitle('Russian note login')
    model.setUsername('ivan')
    model.setPassword('secret')
    model.setNote(note)

    await expect(model.submit()).resolves.toEqual({ok: true})

    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({title: 'Russian note login'}),
      'secret',
      note,
      undefined,
    )
  })

  it('resets and normalizes draft tags before creating a login entry', async () => {
    const createEntry = vi.fn(() => undefined)
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const model = new PMEntryCreateModel()
    model.setTags(['  #Work  ', 'work', 'Client   A'])
    expect(model.tags()).toEqual(['Work', 'Client A'])

    model.setTitle('Entry')
    model.setUsername('alice')
    model.setPassword('secret')
    const result = await model.submit()

    expect(result).toEqual({ok: true})
    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['Work', 'Client A'],
      }),
      'secret',
      '',
      undefined,
    )

    model.reset()
    expect(model.tags()).toEqual([])
  })

  it('suggests title from website until the title is manually edited', () => {
    const model = new PMEntryCreateModel()

    model.setWebsite('github.com')
    expect(model.title()).toBe('GitHub')

    model.setTitle('Code host')
    model.setWebsite('example.com')

    expect(model.title()).toBe('Code host')
  })

  it('creates login entry with OTP from QR payload', async () => {
    const createEntry = vi.fn(() => undefined)
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const model = new PMEntryCreateModel()
    model.setTitle('GitHub')
    model.setUsername('alice@example.com')
    model.setPassword('secret')
    model.setUseOtp(true)
    model.otp.applyQrPayload(
      'otpauth://totp/GitHub:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub',
    )

    const result = await model.submit()

    expect(result).toEqual({ok: true})
    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({title: 'GitHub'}),
      'secret',
      '',
      expect.objectContaining({
        secret: 'JBSWY3DPEHPK3PXP',
        label: 'alice@example.com',
        type: 'TOTP',
        digits: 6,
        period: 30,
      }),
    )
  })

  it('creates payment card entries and stores PAN/CVV through typed secret slots', async () => {
    const entry = {
      flushPendingPersistence: vi.fn(async () => {}),
      saveCardPan: vi.fn(async () => true),
      saveCardCvv: vi.fn(async () => true),
    }
    const createEntry = vi.fn(() => entry)
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const model = new PMEntryCreateModel()
    model.setEntryType('payment_card')
    model.setTitle('Team Visa')
    model.setCardholderName('Alice Doe')
    model.setCardNumber('4111 1111 1111 1111')
    model.setCardExpMonth('12')
    model.setCardExpYear('2031')
    model.setCardCvv('123')

    const result = await model.submit()

    expect(result).toEqual({ok: true})
    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: 'payment_card',
        title: 'Team Visa',
        tags: [],
        paymentCard: expect.objectContaining({
          cardholderName: 'Alice Doe',
          expMonth: 12,
          expYear: 2031,
          last4: '1111',
        }),
      }),
      '',
      '',
      undefined,
    )
    expect(entry.flushPendingPersistence).toHaveBeenCalledTimes(1)
    expect(entry.saveCardPan).toHaveBeenCalledWith('4111111111111111')
    expect(entry.saveCardCvv).toHaveBeenCalledWith('123')
  })

  it('waits for new payment card persistence before storing PAN/CVV', async () => {
    const persistence = deferred<void>()
    const entry = {
      flushPendingPersistence: vi.fn(async () => {
        await persistence.promise
      }),
      saveCardPan: vi.fn(async () => true),
      saveCardCvv: vi.fn(async () => true),
    }
    const createEntry = vi.fn(() => entry)
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const model = new PMEntryCreateModel()
    model.setEntryType('payment_card')
    model.setTitle('Team Visa')
    model.setCardholderName('Alice Doe')
    model.setCardNumber('4111 1111 1111 1111')
    model.setCardExpMonth('12')
    model.setCardExpYear('2031')
    model.setCardCvv('123')

    const submit = model.submit()
    await Promise.resolve()
    await Promise.resolve()

    expect(entry.flushPendingPersistence).toHaveBeenCalledTimes(1)
    expect(entry.saveCardPan).not.toHaveBeenCalled()
    expect(entry.saveCardCvv).not.toHaveBeenCalled()

    persistence.resolve()
    await expect(submit).resolves.toEqual({ok: true})

    expect(entry.saveCardPan).toHaveBeenCalledWith('4111111111111111')
    expect(entry.saveCardCvv).toHaveBeenCalledWith('123')
    expect(entry.flushPendingPersistence.mock.invocationCallOrder[0]).toBeLessThan(
      entry.saveCardPan.mock.invocationCallOrder[0],
    )
  })

  it('creates payment card entries with normalized tags', async () => {
    const entry = {
      flushPendingPersistence: vi.fn(async () => {}),
      saveCardPan: vi.fn(async () => true),
      cleanCardCvv: vi.fn(async () => true),
    }
    const createEntry = vi.fn(() => entry)
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const model = new PMEntryCreateModel()
    model.setEntryType('payment_card')
    model.setTitle('Team Visa')
    model.setCardholderName('Alice Doe')
    model.setCardNumber('4111 1111 1111 1111')
    model.setCardExpMonth('12')
    model.setCardExpYear('2031')
    model.setTags(['Finance', 'finance', '  Travel  '])

    const result = await model.submit()

    expect(result).toEqual({ok: true})
    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: 'payment_card',
        tags: ['Finance', 'Travel'],
      }),
      '',
      '',
      undefined,
    )
  })

  it('sets and clears payment-card field errors during submit validation', async () => {
    const createEntry = vi.fn()
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const model = new PMEntryCreateModel()
    model.setEntryType('payment_card')
    model.setTitle('Team Visa')
    expect(model.canSubmit()).toBe(false)

    await expect(model.submit()).resolves.toEqual(
      expect.objectContaining({ok: false, reason: 'invalid_payment_card', field: 'cardholderName'}),
    )
    expect(model.cardholderNameError()).not.toBe('')

    model.setCardholderName('Alice Doe')
    expect(model.cardholderNameError()).toBe('')

    await expect(model.submit()).resolves.toEqual(
      expect.objectContaining({ok: false, reason: 'invalid_payment_card', field: 'cardNumber'}),
    )
    expect(model.cardNumberError()).not.toBe('')

    model.setCardNumber('4111 1111 1111 1111')
    expect(model.cardNumberError()).toBe('')

    await expect(model.submit()).resolves.toEqual(
      expect.objectContaining({ok: false, reason: 'invalid_payment_card', field: 'cardExpMonth'}),
    )
    expect(model.cardExpMonthError()).not.toBe('')

    model.setCardExpMonth('12')
    expect(model.cardExpMonthError()).toBe('')

    await expect(model.submit()).resolves.toEqual(
      expect.objectContaining({ok: false, reason: 'invalid_payment_card', field: 'cardExpYear'}),
    )
    expect(model.cardExpYearError()).not.toBe('')

    model.setCardExpYear('2031')
    expect(model.cardExpYearError()).toBe('')
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('dedupes repeated submit clicks to a single create flow', async () => {
    const createEntry = vi.fn(() => undefined)
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const model = new PMEntryCreateModel()
    model.setTitle('Entry')
    model.setUsername('alice')
    model.setPassword('secret')

    const first = model.submit()
    const second = model.submit()

    await expect(first).resolves.toEqual({ok: true})
    await expect(second).resolves.toEqual({ok: true})
    expect(createEntry).toHaveBeenCalledTimes(1)
  })

  it('dedupes SSH generation when repeated submits race on the same create flow', async () => {
    const persistence = deferred<void>()
    const updateSshKeys = vi.fn(async () => {})
    const entry = {
      id: 'new-entry',
      flushPendingPersistence: vi.fn(async () => {
        await persistence.promise
      }),
      updateSshKeys,
    }
    const createEntry = vi.fn(() => entry)
    vi.mocked(passmanagerSshKeygen).mockResolvedValue({
      key_id: 'ssh-1',
      public_key_openssh: 'ssh-ed25519 AAAA test',
      fingerprint: 'SHA256:test',
      key_type: 'ed25519',
    })
    window.passmanager = {
      createEntry,
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    const model = new PMEntryCreateModel()
    model.setTitle('Entry')
    model.setUsername('alice')
    model.setPassword('secret')
    model.ssh.setName('Entry SSH')
    model.ssh.setComment('alice@Entry')
    model.requestSshGeneration()

    const first = model.submit()
    const second = model.submit()

    expect(createEntry).toHaveBeenCalledTimes(1)
    persistence.resolve()

    await Promise.all([first, second])

    expect(passmanagerSshKeygen).toHaveBeenCalledTimes(1)
    expect(updateSshKeys).toHaveBeenCalledTimes(1)
    expect(updateSshKeys).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'ssh-1',
        type: 'ed25519',
        fingerprint: 'SHA256:test',
        name: 'Entry SSH',
        comment: 'alice@Entry',
      }),
    ])
    expect(model.sshGenResult()).toEqual({
      keyId: 'ssh-1',
      fingerprint: 'SHA256:test',
      publicKey: 'ssh-ed25519 AAAA test',
      keyType: 'ed25519',
      name: 'Entry SSH',
      comment: 'alice@Entry',
      pending: false,
    })
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
