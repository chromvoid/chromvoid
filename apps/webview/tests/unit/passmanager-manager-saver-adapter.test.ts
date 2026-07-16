import {describe, expect, it, vi} from 'vitest'

import {ManagerSaverAdapter} from '../../src/core/state/passmanager/manager-saver-adapter'
import type {OTPSecretsGateway, PasswordsRepository} from '@project/passmanager/ports'
import {
  CREDENTIAL_SECURITY_AUDIT_ALGORITHM_VERSION,
  CREDENTIAL_SECURITY_AUDIT_ARTIFACT_VERSION,
  type CredentialSecurityAuditArtifactV1,
} from '@project/passmanager/security-audit'

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
    previewOTP: vi.fn(async () => ({otp: '000000', period: 30, leftSeconds: 30})),
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

describe('ManagerSaverAdapter credential security audit', () => {
  const artifact: CredentialSecurityAuditArtifactV1 = {
    version: CREDENTIAL_SECURITY_AUDIT_ARTIFACT_VERSION,
    algorithmVersion: CREDENTIAL_SECURITY_AUDIT_ALGORITHM_VERSION,
    revision: 'loaded:entry',
    generatedAt: 1,
    entries: {},
    failedEntryIds: [],
  }

  it('forwards optional audit reads and writes to the repository', async () => {
    const repository = createRepository()
    repository.readCredentialSecurityAudit = vi.fn(async () => artifact)
    repository.saveCredentialSecurityAudit = vi.fn(async () => true)
    const adapter = new ManagerSaverAdapter(repository, createOtpSecretsGateway())

    await expect(adapter.readCredentialSecurityAudit()).resolves.toEqual(artifact)
    await expect(adapter.saveCredentialSecurityAudit(artifact)).resolves.toBe(true)
    expect(repository.saveCredentialSecurityAudit).toHaveBeenCalledWith(artifact)
  })
})
