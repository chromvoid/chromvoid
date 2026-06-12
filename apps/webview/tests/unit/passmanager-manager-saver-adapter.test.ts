import {describe, expect, it, vi} from 'vitest'

import {ManagerSaverAdapter} from '../../src/core/state/passmanager/manager-saver-adapter'
import type {OTPSecretsGateway, PasswordsRepository} from '@project/passmanager/ports'

function createRepository(): PasswordsRepository {
  return {
    saveRoot: vi.fn(async () => true),
    readRoot: vi.fn(async () => undefined),
    removeRoot: vi.fn(async () => true),
    readEntrySecret: vi.fn(async () => undefined),
    saveEntrySecret: vi.fn(async () => true),
    removeEntrySecret: vi.fn(async () => true),
    readEntrySshPrivateKey: vi.fn(async () => undefined),
    readEntrySshPublicKey: vi.fn(async () => undefined),
    saveEntrySshPrivateKey: vi.fn(async () => true),
    saveEntrySshPublicKey: vi.fn(async () => true),
    removeEntrySshPrivateKey: vi.fn(async () => true),
    removeEntrySshPublicKey: vi.fn(async () => true),
    saveEntryMeta: vi.fn(async () => true),
    moveEntryToGroup: vi.fn(async () => true),
    removeEntry: vi.fn(async () => true),
  } as unknown as PasswordsRepository
}

function createOtpSecretsGateway(overrides: Partial<OTPSecretsGateway> = {}): OTPSecretsGateway {
  return {
    getOTP: vi.fn(async () => undefined),
    getOTPSeckey: vi.fn(async () => undefined),
    removeOTP: vi.fn(async () => true),
    saveOTP: vi.fn(async () => true),
    ...overrides,
  }
}

describe('ManagerSaverAdapter.renameOTPLabel', () => {
  it('fails different-label migrations when OTP gateway does not support rename', async () => {
    const adapter = new ManagerSaverAdapter(createRepository(), createOtpSecretsGateway())

    await expect(adapter.renameOTPLabel('otp-1', 'Primary', 'Backup')).resolves.toBe(false)
  })

  it('keeps same-label migrations as no-ops when OTP gateway does not support rename', async () => {
    const adapter = new ManagerSaverAdapter(createRepository(), createOtpSecretsGateway())

    await expect(adapter.renameOTPLabel('otp-1', 'Primary', 'Primary')).resolves.toBe(true)
  })
})
