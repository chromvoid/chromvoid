import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const testState = vi.hoisted(() => ({
  local: true,
  vaultOpen: true,
  root: null as any,
  navigateToSurface: vi.fn(),
}))

vi.mock('root/core/runtime/runtime-mode.model', () => ({
  runtimeModeModel: {
    localCoreMode: () => testState.local,
  },
}))

vi.mock('root/shared/services/app-context', () => ({
  getAppContext: () => ({
    state: {
      data: () => ({StorageOpened: testState.vaultOpen}),
    },
  }),
}))

vi.mock('root/shared/services/subscribed-signal', () => ({
  subscribeToSignalChanges: () => () => undefined,
}))

vi.mock('root/features/passmanager/models/pm-root.adapter', () => ({
  getPassmanagerRoot: () => testState.root,
  passmanagerRoot: () => testState.root,
}))

vi.mock('root/app/navigation/navigation.model', () => ({
  navigationModel: {
    navigateToSurface: (...args: unknown[]) => testState.navigateToSurface(...args),
  },
}))

import type {Entry} from '@project/passmanager/core'
import type {OTPOptions} from '@project/passmanager/types'

import {
  OtpImportReviewModel,
  type OtpImportNativePort,
  type PendingOtpImportMetadata,
} from '../../src/features/passmanager/components/otp-import-review/otp-import-review.model'
import {
  PMEntryOtpCreateModel,
  type PMEntryOtpDraftPreviewPort,
} from '../../src/features/passmanager/components/card/entry-otp-create/entry-otp-create.model'

const validUri =
  'otpauth://totp/Example:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&digits=6&period=30'

function pendingMetadata(expiresAt = Date.now() + 120_000): PendingOtpImportMetadata {
  return {
    pending_id: 'pending-1',
    origin: 'system_url',
    expires_at_ms: expiresAt,
  }
}

function createNativePort(rawUri = validUri): OtpImportNativePort & {
  pending: ReturnType<typeof vi.fn>
  take: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
} {
  return {
    pending: vi.fn(async () => ({ok: true, result: null})),
    take: vi.fn(async (pendingId: string) => ({
      ok: true,
      result: {...pendingMetadata(), pending_id: pendingId, raw_uri: rawUri},
    })),
    clear: vi.fn(async () => ({ok: true, result: true})),
    onPending: vi.fn(async () => () => undefined),
  }
}

function createOtpDraft(): PMEntryOtpCreateModel {
  const previewPort: PMEntryOtpDraftPreviewPort = {
    previewOTP: vi.fn(async (data) => ({
      otp: data.digits === 8 ? '12345678' : '123456',
      period: data.period ?? 30,
      leftSeconds: 15,
    })),
  }
  return new PMEntryOtpCreateModel(undefined, undefined, previewPort)
}

function createModel(port = createNativePort()): OtpImportReviewModel {
  return new OtpImportReviewModel(port, createOtpDraft(), () => true)
}

function createEntry(label = 'Example') {
  const order: string[] = []
  const existingOtp = {
    id: 'otp-old',
    label,
    remove: vi.fn(async () => {
      order.push('remove-old')
      return true
    }),
  }
  const otps: Array<typeof existingOtp | {id: string; label: string; remove: ReturnType<typeof vi.fn>}> = [
    existingOtp,
  ]
  const entry = {
    id: 'entry-1',
    entryType: 'login',
    title: 'Example',
    username: 'alice@example.com',
    urls: [{value: 'example.com', match: 'base_domain'}],
    data: () => ({title: 'Example'}),
    otps: () => otps,
    addOTP: vi.fn(async (otp: OTPOptions) => {
      order.push('add-new')
      otps.push({id: 'otp-new', label: otp.label ?? '', remove: vi.fn(async () => true)})
      return true
    }),
  } as unknown as Entry
  return {entry, existingOtp, order}
}

beforeEach(() => {
  testState.local = true
  testState.vaultOpen = true
  testState.root = null
  testState.navigateToSurface.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('OtpImportReviewModel', () => {
  it('does not consume a pending setup link while the vault is locked and clears it at TTL', async () => {
    vi.useFakeTimers()
    testState.vaultOpen = false
    const port = createNativePort()
    const model = createModel(port)
    model.connect()

    model.receivePending(pendingMetadata(Date.now() + 120_000))

    expect(model.phase()).toBe('waiting')
    expect(model.availability()).toBe('vault_required')
    expect(model.visible()).toBe(false)
    expect(port.take).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(120_000)

    expect(port.clear).toHaveBeenCalledWith('pending-1')
    expect(model.pending()).toBeNull()
    expect(model.otpDraft.secret()).toBe('')
  })

  it('consumes a ready link once and creates only an in-memory review draft', async () => {
    testState.root = {isReadOnly: () => false, allEntries: []}
    const port = createNativePort()
    const model = createModel(port)
    model.connect()

    model.receivePending(pendingMetadata())
    await vi.waitFor(() => expect(model.phase()).toBe('review'))

    expect(port.take).toHaveBeenCalledTimes(1)
    expect(model.parseMetadata()).toEqual({issuer: 'Example', account: 'alice@example.com'})
    expect(model.otpDraft.secret()).toBe('JBSWY3DPEHPK3PXP')
    expect(model.targetMode()).toBeNull()

    await model.cancel()
    expect(model.pending()).toBeNull()
    expect(model.otpDraft.secret()).toBe('')
  })

  it('requires an explicit target and explicit duplicate resolution before saving', async () => {
    const {entry, existingOtp, order} = createEntry('alice@example.com')
    testState.root = {
      isReadOnly: () => false,
      allEntries: [entry],
      getEntry: (id: string) => (id === entry.id ? entry : undefined),
      setShowElement: vi.fn(),
    }
    const port = createNativePort()
    const model = createModel(port)
    model.connect()
    model.receivePending(pendingMetadata())
    await vi.waitFor(() => expect(model.phase()).toBe('review'))

    await expect(model.submit()).resolves.toBe(false)
    expect(model.targetError()).not.toBe('')
    expect(entry.addOTP).not.toHaveBeenCalled()

    model.setTargetMode('existing')
    model.setSelectedEntryId(entry.id)
    await expect(model.submit()).resolves.toBe(false)
    expect(model.duplicateError()).not.toBe('')
    expect(entry.addOTP).not.toHaveBeenCalled()

    model.setDuplicateResolution('replace')
    await expect(model.submit()).resolves.toBe(true)

    expect(order).toEqual(['add-new', 'remove-old'])
    expect(existingOtp.remove).toHaveBeenCalledWith(true)
    expect(testState.root.setShowElement).toHaveBeenCalledWith(entry)
    expect(testState.navigateToSurface).toHaveBeenCalledWith('passwords')
    expect(model.pending()).toBeNull()
  })

  it('creates a new login without guessing a website from the issuer', async () => {
    const savedEntry = {id: 'entry-new', flushPendingPersistence: vi.fn(async () => true)}
    const createEntry = vi.fn(() => savedEntry)
    testState.root = {
      isReadOnly: () => false,
      allEntries: [],
      createEntry,
      setShowElement: vi.fn(),
    }
    const model = createModel()
    model.connect()
    model.receivePending(pendingMetadata())
    await vi.waitFor(() => expect(model.phase()).toBe('review'))

    model.setTargetMode('new')
    model.setNewWebsite(',')
    await expect(model.submit()).resolves.toBe(false)
    expect(model.websiteError()).not.toBe('')
    expect(createEntry).not.toHaveBeenCalled()

    model.setNewWebsite('')
    await expect(model.submit()).resolves.toBe(true)

    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: 'login',
        title: 'Example',
        username: 'alice@example.com',
        urls: [],
      }),
      '',
      '',
      expect.objectContaining({secret: 'JBSWY3DPEHPK3PXP', type: 'TOTP'}),
    )
  })
})
