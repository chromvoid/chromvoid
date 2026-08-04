import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PMEntryCreateModel} from '../../src/features/passmanager/components/card/entry-create/entry-create.model'
import {configurePMEntryOtpDraftPreviewPort} from '../../src/features/passmanager/components/card/entry-otp-create/entry-otp-create.model'
import type {AndroidPasswordSavePrefill} from '../../src/features/passmanager/models/android-password-save-prefill'
import {dialogService} from '../../src/shared/services/dialog-service'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

function createTestEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-created',
    flushPendingPersistence: vi.fn(async () => {}),
    ...overrides,
  }
}

function createEntryHarness<T extends {id: string}>(entry: T) {
  const createEntry = vi.fn(() => entry)
  const presentCreatedEntry = vi.fn()
  const root = createTestRoot({
    createEntry,
    getEntry: vi.fn((id: string) => (id === entry.id ? entry : undefined)),
    presentCreatedEntry,
  })
  Object.assign(entry, {parent: {root}})
  return {
    createEntry,
    presentCreatedEntry,
    root,
  }
}

function createTestRoot(overrides: Record<string, unknown> = {}): typeof window.passmanager {
  return {
    id: 'root',
    name: 'Vault',
    entriesList: vi.fn(() => []),
    getEntry: vi.fn(() => undefined),
    getGroup: vi.fn(() => undefined),
    setShowElement: vi.fn(),
    presentCreatedEntry: vi.fn(),
    showElement: vi.fn(() => 'createEntry'),
    isReadOnly: vi.fn(() => false),
    ...overrides,
  } as unknown as typeof window.passmanager
}

describe('PMEntryCreateModel', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
    configurePMEntryOtpDraftPreviewPort({
      previewOTP: vi.fn(async (data) => ({
        otp: data.digits === 8 ? '12345678' : '123456',
        period: data.period ?? 30,
        leftSeconds: 12,
      })),
    })
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
    window.passmanager = createTestRoot({createEntry})

    const model = new PMEntryCreateModel()
    const result = await model.submit()

    expect(result).toEqual({ok: false, reason: 'missing_title', field: 'title'})
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('keeps the OTP editor open while native QR scanner is active', () => {
    const model = new PMEntryCreateModel()

    model.openDetailsSheet()
    model.openDetailsEditor('otp')
    model.otp.setQrScannerScanning(true)
    model.closeDetailsEditor()

    expect(model.detailsSheetOpen()).toBe(true)
    expect(model.detailsSheetView()).toBe('otp')
    expect(model.useOtp()).toBe(false)
  })

  it('keeps invalid login submit clickable and reports field errors without creating an entry', async () => {
    const createEntry = vi.fn()
    window.passmanager = createTestRoot({createEntry})

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

  it('opens the inline OTP editor without a second alert when submit validation fails', async () => {
    const createEntry = vi.fn()
    const showAlertDialog = vi.spyOn(dialogService, 'showAlertDialog').mockResolvedValue(undefined)
    window.passmanager = createTestRoot({createEntry})

    const model = new PMEntryCreateModel()
    model.setTitle('Entry')
    model.setUsername('alice')
    model.setPassword('secret')
    model.setUseOtp(true)
    model.otp.setSecret('not-valid!')

    await expect(model.submit()).resolves.toEqual(expect.objectContaining({ok: false, reason: 'invalid_otp'}))
    expect(model.detailsSheetOpen()).toBe(true)
    expect(model.detailsSheetView()).toBe('otp')
    expect(model.otp.secretError()).not.toBe('')
    expect(showAlertDialog).not.toHaveBeenCalled()
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('creates login entry with separate title, website URL rule, and avatar ref', async () => {
    const {createEntry, root} = createEntryHarness(createTestEntry())
    window.passmanager = root

    const model = new PMEntryCreateModel()
    model.setTitle('Example login')
    model.websiteEditor.setFirstValue('https://example.com/path,segment')
    model.setUsername('john')
    model.setPassword('secret')
    model.setNote('note')
    model.setIconRef('sha256:icon')

    const result = await model.submit()

    expect(result).toEqual({ok: true})
    expect(createEntry).toHaveBeenCalledTimes(1)

    const [entryData, password, note, otp] = createEntry.mock.calls[0] as [
      {
        title: string
        username: string
        urls: Array<{value: string; match: string}>
        iconRef?: string
        tags?: string[]
      },
      string,
      string,
      unknown,
    ]

    expect(entryData.title).toBe('Example login')
    expect(entryData.username).toBe('john')
    expect(entryData.urls).toEqual([{value: 'https://example.com/path,segment', match: 'base_domain'}])
    expect(entryData.iconRef).toBe('sha256:icon')
    expect(entryData.tags).toEqual([])
    expect(password).toBe('secret')
    expect(note).toBe('note')
    expect(otp).toBeUndefined()
  })

  it('creates separate URL rules from multiline paste without splitting commas', async () => {
    const {createEntry, root} = createEntryHarness(createTestEntry())
    window.passmanager = root

    const model = new PMEntryCreateModel()
    model.setTitle('Multiple websites')
    model.setUsername('john')
    model.setPassword('secret')
    const firstRowId = model.websiteEditor.rows()[0]!.id
    model.websiteEditor.pasteMultiline(firstRowId, 'https://one.example\nhttps://two.example/path,segment')

    await expect(model.submit()).resolves.toEqual({ok: true})
    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        urls: [
          {value: 'https://one.example', match: 'base_domain'},
          {value: 'https://two.example/path,segment', match: 'base_domain'},
        ],
      }),
      'secret',
      '',
      undefined,
    )
  })

  it('blocks persistence and marks only the later duplicate website row', async () => {
    const {createEntry, root} = createEntryHarness(createTestEntry())
    window.passmanager = root

    const model = new PMEntryCreateModel()
    model.setTitle('Duplicate websites')
    model.setUsername('john')
    model.setPassword('secret')
    model.websiteEditor.setFirstValue('example.com')
    const duplicateId = model.websiteEditor.add()
    model.websiteEditor.updateMatch(duplicateId, 'exact')
    model.websiteEditor.updateValue(duplicateId, 'https://example.com')

    await expect(model.submit()).resolves.toEqual({
      ok: false,
      reason: 'invalid_website',
      field: 'urls',
    })
    expect(model.websiteEditor.rowErrors()[duplicateId]).toBe('This website is already added')
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('waits for durable login persistence before reporting success', async () => {
    const persistenceStarted = deferred<void>()
    const persistence = deferred<void>()
    const entry = createTestEntry({
      flushPendingPersistence: vi.fn(() => {
        persistenceStarted.resolve()
        return persistence.promise
      }),
    })
    const {presentCreatedEntry, root} = createEntryHarness(entry)
    window.passmanager = root

    const model = new PMEntryCreateModel()
    model.setTitle('Pending login')
    model.setUsername('alice')
    model.setPassword('secret')

    const submit = model.submit()
    await persistenceStarted.promise

    expect(model.isSubmitting()).toBe(true)
    expect(model.dirty()).toBe(true)
    expect(presentCreatedEntry).not.toHaveBeenCalled()

    persistence.resolve()
    await expect(submit).resolves.toEqual({ok: true})
    expect(model.isSubmitting()).toBe(false)
    expect(model.dirty()).toBe(false)
    expect(presentCreatedEntry).toHaveBeenCalledOnce()
    expect(presentCreatedEntry).toHaveBeenCalledWith(entry)
  })

  it('does not present a committed entry through an obsolete root', async () => {
    const persistence = deferred<void>()
    const entry = createTestEntry({
      flushPendingPersistence: vi.fn(async () => persistence.promise),
    })
    const {presentCreatedEntry, root} = createEntryHarness(entry)
    window.passmanager = root

    const model = new PMEntryCreateModel()
    model.setTitle('Pending login')
    model.setUsername('alice')
    model.setPassword('secret')

    const submit = model.submit()
    await Promise.resolve()
    window.passmanager = createTestRoot()
    persistence.resolve()

    await expect(submit).resolves.toEqual({ok: true})
    expect(presentCreatedEntry).not.toHaveBeenCalled()
  })

  it('reports persistence failure and preserves the login draft', async () => {
    const entry = createTestEntry({
      flushPendingPersistence: vi.fn(async () => {
        throw new Error('saveEntryMeta failed')
      }),
    })
    const {presentCreatedEntry, root} = createEntryHarness(entry)
    window.passmanager = root
    const showAlertDialog = vi.spyOn(dialogService, 'showAlertDialog').mockResolvedValue(undefined)

    const model = new PMEntryCreateModel()
    model.setTitle('Failed login')
    model.setUsername('alice')
    model.setPassword('secret')

    await expect(model.submit()).resolves.toEqual({
      ok: false,
      reason: 'persistence_failed',
      message: 'Save error',
    })

    expect(model.dirty()).toBe(true)
    expect(model.title()).toBe('Failed login')
    expect(model.username()).toBe('alice')
    expect(model.password()).toBe('secret')
    expect(presentCreatedEntry).not.toHaveBeenCalled()
    expect(showAlertDialog).toHaveBeenCalledWith({
      title: 'Save error',
      message: 'Save error',
      variant: 'danger',
    })
  })

  it('treats an optimistic entry missing from the root as rolled back', async () => {
    const entry = createTestEntry()
    const createEntry = vi.fn(() => entry)
    window.passmanager = createTestRoot({
      createEntry,
      getEntry: vi.fn(() => undefined),
    })
    vi.spyOn(dialogService, 'showAlertDialog').mockResolvedValue(undefined)

    const model = new PMEntryCreateModel()
    model.setTitle('Rolled back login')
    model.setUsername('alice')
    model.setPassword('secret')

    await expect(model.submit()).resolves.toEqual({
      ok: false,
      reason: 'persistence_failed',
      message: 'Save error',
    })
    expect(model.dirty()).toBe(true)
  })

  it('preserves Cyrillic note text when creating a login entry', async () => {
    const {createEntry, root} = createEntryHarness(createTestEntry())
    window.passmanager = root

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
    const {createEntry, root} = createEntryHarness(createTestEntry())
    window.passmanager = root

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

    model.websiteEditor.setFirstValue('github.com')
    expect(model.title()).toBe('GitHub')

    model.setTitle('Code host')
    model.websiteEditor.setFirstValue('example.com')

    expect(model.title()).toBe('Code host')
  })

  it('creates login entry with OTP from QR payload', async () => {
    const {createEntry, root} = createEntryHarness(createTestEntry())
    window.passmanager = root

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
      id: 'payment-card-created',
      flushPendingPersistence: vi.fn(async () => {}),
    }
    const {createEntry, presentCreatedEntry, root} = createEntryHarness(entry)
    window.passmanager = root

    const model = new PMEntryCreateModel()
    model.setEntryType('payment_card')
    model.setTitle('Team Visa')
    model.setCardholderName('Alice Doe')
    model.setCardNumber('4111 1111 1111 1111')
    model.setCardExpMonth('12')
    model.setCardExpYear('31')
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
      {
        cardPan: '4111111111111111',
        cardCvv: '123',
      },
    )
    expect(entry.flushPendingPersistence).toHaveBeenCalledTimes(1)
    expect(presentCreatedEntry).toHaveBeenCalledWith(entry)
    expect(entry.flushPendingPersistence.mock.invocationCallOrder[0]).toBeLessThan(
      presentCreatedEntry.mock.invocationCallOrder[0],
    )
  })

  it('waits for atomic payment card persistence before presentation', async () => {
    const persistence = deferred<void>()
    const entry = {
      id: 'payment-card-pending',
      flushPendingPersistence: vi.fn(async () => {
        await persistence.promise
      }),
    }
    const {createEntry, presentCreatedEntry, root} = createEntryHarness(entry)
    window.passmanager = root

    const model = new PMEntryCreateModel()
    model.setEntryType('payment_card')
    model.setTitle('Team Visa')
    model.setCardholderName('Alice Doe')
    model.setCardNumber('4111 1111 1111 1111')
    model.setCardExpMonth('12')
    model.setCardExpYear('31')
    model.setCardCvv('123')

    const submit = model.submit()
    await Promise.resolve()
    await Promise.resolve()

    expect(entry.flushPendingPersistence).toHaveBeenCalledTimes(1)
    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({entryType: 'payment_card'}),
      '',
      '',
      undefined,
      {cardPan: '4111111111111111', cardCvv: '123'},
    )
    expect(presentCreatedEntry).not.toHaveBeenCalled()

    persistence.resolve()
    await expect(submit).resolves.toEqual({ok: true})

    expect(entry.flushPendingPersistence.mock.invocationCallOrder[0]).toBeLessThan(
      presentCreatedEntry.mock.invocationCallOrder[0],
    )
  })

  it('does not present a payment card when atomic persistence fails', async () => {
    const entry = {
      id: 'payment-card-persistence-failed',
      flushPendingPersistence: vi.fn(async () => {
        throw new Error('saveEntryMeta failed')
      }),
    }
    const {createEntry, presentCreatedEntry, root} = createEntryHarness(entry)
    window.passmanager = root
    vi.spyOn(dialogService, 'showAlertDialog').mockResolvedValue(undefined)

    const model = new PMEntryCreateModel()
    model.setEntryType('payment_card')
    model.setTitle('Team Visa')
    model.setCardholderName('Alice Doe')
    model.setCardNumber('4111 1111 1111 1111')
    model.setCardExpMonth('12')
    model.setCardExpYear('31')
    model.setCardCvv('123')

    await expect(model.submit()).resolves.toEqual({
      ok: false,
      reason: 'persistence_failed',
      message: 'Save error',
    })
    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({entryType: 'payment_card'}),
      '',
      '',
      undefined,
      {cardPan: '4111111111111111', cardCvv: '123'},
    )
    expect(model.dirty()).toBe(true)
    expect(presentCreatedEntry).not.toHaveBeenCalled()
  })

  it('creates payment card entries with normalized tags', async () => {
    const entry = {
      id: 'payment-card-tags',
      flushPendingPersistence: vi.fn(async () => {}),
    }
    const {createEntry, root} = createEntryHarness(entry)
    window.passmanager = root

    const model = new PMEntryCreateModel()
    model.setEntryType('payment_card')
    model.setTitle('Team Visa')
    model.setCardholderName('Alice Doe')
    model.setCardNumber('4111 1111 1111 1111')
    model.setCardExpMonth('12')
    model.setCardExpYear('31')
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
      {cardPan: '4111111111111111', cardCvv: undefined},
    )
  })

  it('sets and clears payment-card field errors during submit validation', async () => {
    const createEntry = vi.fn()
    window.passmanager = createTestRoot({createEntry})

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

    model.setCardExpYear('31')
    expect(model.cardExpYearError()).toBe('')
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('rejects four-digit payment-card expiry years', async () => {
    const createEntry = vi.fn()
    window.passmanager = createTestRoot({createEntry})

    const model = new PMEntryCreateModel()
    model.setEntryType('payment_card')
    model.setTitle('Team Visa')
    model.setCardholderName('Alice Doe')
    model.setCardNumber('4111 1111 1111 1111')
    model.setCardExpMonth('12')
    model.setCardExpYear('2031')

    await expect(model.submit()).resolves.toEqual(
      expect.objectContaining({ok: false, reason: 'invalid_payment_card', field: 'cardExpYear'}),
    )

    expect(model.cardExpYearError()).not.toBe('')
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('dedupes repeated submit clicks to a single create flow', async () => {
    const {createEntry, root} = createEntryHarness(createTestEntry())
    window.passmanager = root

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

  it('does not reset or abort once an atomic create is in flight', async () => {
    const persistence = deferred<void>()
    const entry = {
      id: 'payment-card-aborted',
      flushPendingPersistence: vi.fn(async () => {
        await persistence.promise
      }),
    }
    const {presentCreatedEntry, root} = createEntryHarness(entry)
    window.passmanager = root

    const model = new PMEntryCreateModel()
    model.setEntryType('payment_card')
    model.setTitle('Team Visa')
    model.setCardholderName('Alice Doe')
    model.setCardNumber('4111 1111 1111 1111')
    model.setCardExpMonth('12')
    model.setCardExpYear('31')
    model.setCardCvv('123')

    const submit = model.submit()
    await Promise.resolve()
    expect(entry.flushPendingPersistence).toHaveBeenCalledTimes(1)

    expect(model.reset()).toBe(false)
    expect(model.title()).toBe('Team Visa')
    persistence.resolve()

    await expect(submit).resolves.toEqual({ok: true})
    expect(presentCreatedEntry).toHaveBeenCalledWith(entry)
    expect(model.reset()).toBe(true)
    expect(model.title()).toBe('')
  })

  it('blocks discard navigation while an atomic create is in flight', async () => {
    const persistence = deferred<void>()
    const entry = createTestEntry({
      flushPendingPersistence: vi.fn(async () => persistence.promise),
    })
    const {root} = createEntryHarness(entry)
    window.passmanager = root

    const model = new PMEntryCreateModel()
    model.setTitle('Entry')
    model.setUsername('alice')
    model.setPassword('secret')
    const submit = model.submit()
    await Promise.resolve()

    const resume = vi.fn()
    expect(model.requestDiscard(resume)).toBe(true)
    expect(model.discardSheetOpen()).toBe(false)
    expect(resume).not.toHaveBeenCalled()

    persistence.resolve()
    await expect(submit).resolves.toEqual({ok: true})
  })

  it('validates a field after blur and validates the full form after submit', async () => {
    window.passmanager = createTestRoot({createEntry: vi.fn()})
    const model = new PMEntryCreateModel()
    model.reset()

    expect(model.titleError()).toBe('')
    expect(model.usernameError()).toBe('')
    expect(model.passwordError()).toBe('')

    model.markFieldTouched('title')
    expect(model.titleError()).not.toBe('')
    expect(model.usernameError()).toBe('')
    expect(model.passwordError()).toBe('')

    await model.submit()
    expect(model.titleError()).not.toBe('')
    expect(model.usernameError()).not.toBe('')
    expect(model.passwordError()).not.toBe('')

    model.setTitle('Entry')
    expect(model.titleError()).toBe('')
  })

  it('tracks meaningful draft changes without treating hub or editor visibility as dirty', () => {
    window.passmanager = createTestRoot()
    const model = new PMEntryCreateModel()
    model.reset()

    model.openDetailsSheet()
    model.openDetailsEditor('note')
    model.closeDetailsEditor()
    model.closeDetailsSheet()
    model.openLocationSheet()
    model.closeLocationSheet()
    model.openDetailsEditor('otp')
    model.closeDetailsEditor()
    expect(model.dirty()).toBe(false)

    model.setNote('Recovery instructions')
    expect(model.dirty()).toBe(true)
    model.reset()
    model.setEntryType('payment_card')
    expect(model.dirty()).toBe(true)
  })

  it('derives configured details and their count from draft data', () => {
    window.passmanager = createTestRoot()
    const model = new PMEntryCreateModel()
    model.reset()

    expect(model.configuredOptionalDetails()).toEqual([])
    expect(model.configuredOptionalDetailCount()).toBe(0)

    model.setIconRef('stored-icon')
    model.setTags(['Work'])
    model.setUseOtp(true)
    model.setNote('Recovery instructions')

    expect(model.configuredOptionalDetails()).toEqual(['icon', 'tags', 'otp', 'note'])
    expect(model.configuredOptionalDetailCount()).toBe(4)
  })

  it('confirms before removing a populated optional detail and clears it after approval', async () => {
    window.passmanager = createTestRoot()
    const model = new PMEntryCreateModel()
    model.setNote('Recovery instructions')
    const confirm = vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValueOnce(false)

    await expect(model.requestRemoveOptionalDetail('note')).resolves.toBe(false)
    expect(model.note()).toBe('Recovery instructions')
    expect(model.configuredOptionalDetails()).toContain('note')

    confirm.mockResolvedValueOnce(true)
    await expect(model.requestRemoveOptionalDetail('note')).resolves.toBe(true)
    expect(model.note()).toBe('')
    expect(model.configuredOptionalDetails()).not.toContain('note')
  })

  it('preserves hidden branch drafts while restricting payment-card details', () => {
    window.passmanager = createTestRoot()
    const model = new PMEntryCreateModel()
    model.setUsername('alice')
    model.setPassword('secret')
    model.setUseOtp(true)
    model.setNote('Login note')

    model.setEntryType('payment_card')
    expect(model.username()).toBe('alice')
    expect(model.password()).toBe('secret')
    expect(model.note()).toBe('Login note')
    expect(model.supportedOptionalDetails()).toEqual(['icon', 'tags'])
    expect(model.configuredOptionalDetails()).toEqual([])

    model.setEntryType('login')
    expect(model.configuredOptionalDetails()).toEqual(['otp', 'note'])
  })

  it('uses the selected root or group and blocks a stale destination', async () => {
    const group = {id: 'group-work', name: 'Work'}
    const entry = createTestEntry({id: 'group-entry'})
    const createEntry = vi.fn(() => entry)
    const getGroup = vi.fn((id: string) => (id === group.id ? group : undefined))
    const setShowElement = vi.fn()
    window.passmanager = createTestRoot({
      createEntry,
      getEntry: vi.fn((id: string) => (id === entry.id ? entry : undefined)),
      getGroup,
      setShowElement,
    })

    const model = new PMEntryCreateModel()
    model.reset()
    model.setTitle('Entry')
    model.setUsername('alice')
    model.setPassword('secret')
    expect(model.setTargetGroupId(group.id)).toBe(true)
    await expect(model.submit()).resolves.toEqual({ok: true})
    expect(setShowElement).toHaveBeenCalledWith('createEntry', group)

    model.reset()
    model.setTitle('Second')
    model.setUsername('alice')
    model.setPassword('secret')
    expect(model.setTargetGroupId(group.id)).toBe(true)
    getGroup.mockReturnValue(undefined)

    await expect(model.submit()).resolves.toMatchObject({
      ok: false,
      reason: 'invalid_target_group',
      field: 'targetGroup',
    })
    expect(model.locationSheetOpen()).toBe(true)
  })

  it('does not mark the draft dirty when confirming the current root destination', () => {
    window.passmanager = createTestRoot()
    const model = new PMEntryCreateModel()
    model.reset()

    model.openLocationSheet()
    expect(model.confirmPendingTargetGroup()).toBe(true)
    expect(model.dirty()).toBe(false)
  })

  it('removes create-specific SSH state from the model contract', () => {
    const model = new PMEntryCreateModel() as unknown as Record<string, unknown>
    expect('ssh' in model).toBe(false)
    expect('setUseSsh' in model).toBe(false)
    expect('requestSshGeneration' in model).toBe(false)
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
    expect(model.websiteEditor.primaryValue()).toBe('https://github.com/login')
    expect(model.isEditingPassword()).toBe(true)
    expect(model.dirty()).toBe(true)
  })
})
