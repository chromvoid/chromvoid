import {describe, expect, it, vi} from 'vitest'

import {
  CREDENTIAL_SECURITY_AUDIT_ALGORITHM_VERSION,
  CREDENTIAL_SECURITY_AUDIT_ARTIFACT_VERSION,
  type CredentialSecurityAuditArtifactV1,
} from '@project/passmanager/security-audit'

import {CatalogPasswordsRepository} from '../../src/core/state/passmanager/passwords-repository'
import type {PassmanagerTransport} from '../../src/core/state/passmanager/passmanager-transport'

function artifact(revision = 'loaded:entry'): CredentialSecurityAuditArtifactV1 {
  return {
    version: CREDENTIAL_SECURITY_AUDIT_ARTIFACT_VERSION,
    algorithmVersion: CREDENTIAL_SECURITY_AUDIT_ALGORITHM_VERSION,
    revision,
    generatedAt: Date.now(),
    entries: {
      entry: {
        entryId: 'entry',
        weakPassword: true,
        reusedPassword: false,
        hasTwoFactor: false,
        strengthScore: 1,
      },
    },
    failedEntryIds: [],
  }
}

function createRepository(auditArtifact: unknown = artifact()) {
  const transport = {
    exportRoot: vi.fn(async () => ({
      root: {
        version: 3,
        createdTs: 1,
        updatedTs: 2,
        folders: [],
        foldersMeta: [],
        entries: [],
      },
    })),
    getCredentialSecurityAudit: vi.fn(async () => ({artifact: auditArtifact})),
    setCredentialSecurityAudit: vi.fn(async () => undefined),
    listGroups: vi.fn(async () => ({groups: []})),
  } as unknown as PassmanagerTransport
  const catalog = {
    lastError: {set: vi.fn()},
    queueRefresh: vi.fn(),
  }

  return {
    repo: new CatalogPasswordsRepository(catalog as never, transport),
    transport,
  }
}

describe('CatalogPasswordsRepository credential security audit cache', () => {
  it('prefetches a valid audit artifact into the root load payload', async () => {
    const expected = artifact()
    const {repo, transport} = createRepository(expected)

    const root = await repo.readRoot<Record<string, unknown>>()

    expect(transport.exportRoot).toHaveBeenCalledOnce()
    expect(transport.getCredentialSecurityAudit).toHaveBeenCalledOnce()
    expect(root?.['credentialSecurityAudit']).toEqual(expected)
  })

  it('treats an invalid audit artifact as an empty optional cache', async () => {
    const {repo} = createRepository({...artifact(), password: 'must-not-load'})

    const root = await repo.readRoot<Record<string, unknown>>()

    expect(root?.['credentialSecurityAudit']).toBeUndefined()
  })

  it('validates and writes an audit artifact without scheduling a root refresh', async () => {
    const expected = artifact()
    const {repo, transport} = createRepository()

    await expect(repo.saveCredentialSecurityAudit(expected)).resolves.toBe(true)
    expect(transport.setCredentialSecurityAudit).toHaveBeenCalledWith(expected)
  })
})
