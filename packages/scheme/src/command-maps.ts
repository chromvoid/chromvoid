/**
 * Command maps for RPC routing (TypeScript API)
 *
 * These types define request/response shapes for each command.
 * Used for type-safe RPC handlers and clients.
 *
 * Note: TypeScript API uses camelCase conventions.
 * Rust core uses snake_case — types are separate.
 */

import type {CatalogSyncManifestResponse} from './generated/CatalogSyncManifestResponse'
import type {CredentialCandidate as GeneratedCredentialCandidate} from './generated/CredentialCandidate'
import type {CredentialOneTimeCode as GeneratedCredentialOneTimeCode} from './generated/CredentialOneTimeCode'
import type {CredentialProviderSessionResponse as GeneratedCredentialProviderSessionResponse} from './generated/CredentialProviderSessionResponse'
import type {CredentialProviderStatusResponse as GeneratedCredentialProviderStatusResponse} from './generated/CredentialProviderStatusResponse'
import type {CredentialSecret as GeneratedCredentialSecret} from './generated/CredentialSecret'
import type {PassmanagerGroupSummary as GeneratedPassmanagerGroupSummary} from './generated/PassmanagerGroupSummary'
import type {SyncShardResponse} from './generated/SyncShardResponse'

/** Base route type */
type Route<TRequest, TResponse> = {
  request: TRequest
  response: TResponse
}

/** Catalog list item (TypeScript API format) */
export type CatalogListItem = {
  nodeId: number
  name: string
  isDir: boolean
  size?: number
  mimeType?: string
  createdAt: number
  updatedAt: number
}

/** Catalog list response (TypeScript API format) */
export type CatalogListResponse = {
  currentPath: string
  items: CatalogListItem[]
}

export type ProviderContext = {kind: 'web'; origin: string; domain: string} | {kind: 'app'; app_id: string}

export type CredentialCandidate = GeneratedCredentialCandidate

export type CredentialSecret = GeneratedCredentialSecret

export type CredentialOneTimeCode = GeneratedCredentialOneTimeCode

export type ProviderStatus = GeneratedCredentialProviderStatusResponse

export type CredentialProviderSession = GeneratedCredentialProviderSessionResponse

export type PassmanagerGroupSummary = GeneratedPassmanagerGroupSummary

export type CredentialSecurityAuditEntrySummary = {
  entryId: string
  weakPassword: boolean
  reusedPassword: boolean
  hasTwoFactor: boolean
  strengthScore: 0 | 1 | 2 | 3 | 4 | null
}

export type CredentialSecurityAuditArtifactV1 = {
  version: 1
  algorithmVersion: 1
  revision: string
  generatedAt: number
  entries: Record<string, CredentialSecurityAuditEntrySummary>
  failedEntryIds: string[]
}

export type PassManagerSshKey = {
  id: string
  type: 'ed25519' | 'rsa' | 'ecdsa'
  fingerprint: string
  name?: string
  comment?: string
  sourceEntryId?: string
  createdTs?: number
  updatedTs?: number
}

/** Catalog command map */
export type CatalogCommandMap = {
  // === Navigation ===
  'catalog:list': Route<{path?: string; includeHidden?: boolean}, CatalogListResponse>

  // === CRUD ===
  'catalog:createDir': Route<{name: string; parentPath?: string}, {nodeId: number}>
  'catalog:delete': Route<{nodeId: number}, void>
  'catalog:rename': Route<{nodeId: number; newName: string}, void>
  'catalog:move': Route<{nodeId: number; newParentPath: string; newName?: string}, void>

  // === File transfer ===
  'catalog:upload': Route<
    {
      nodeId?: number
      parentPath?: string
      name?: string
      size: number
      totalSize?: number | null
      offset?: number | null
      mimeType?: string
      chunkSize?: number
      finish?: boolean
    },
    {nodeId: number; uploadedBytes: number}
  >
  'catalog:download': Route<{nodeId: number}, AsyncIterable<Uint8Array>>

  // === Sync ===
  'catalog:sync:manifest': Route<Record<string, never>, CatalogSyncManifestResponse>
  'catalog:sync:shard': Route<{shardId: string; fromVersion: number}, SyncShardResponse>
  'catalog:subscribe': Route<Record<string, never>, void>
  'catalog:unsubscribe': Route<Record<string, never>, void>

  // === Secrets ===
  'catalog:secret:read': Route<{nodeId: number}, AsyncIterable<Uint8Array>>
  'catalog:secret:write': Route<{nodeId: number; size: number}, void>
  'catalog:secret:erase': Route<{nodeId: number}, void>

  // === PassManager domain commands (ADR-029) ===
  'passmanager:entry:create': Route<
    {
      entryId: string
      title: string
      entryType: 'login' | 'payment_card'
      createdTs?: number
      updatedTs?: number
      urls?: unknown[]
      username?: string
      otps?: unknown[]
      paymentCard?: {
        cardholderName: string
        brand?: string
        expMonth: number
        expYear: number
        last4?: string
      }
      groupPath?: string
      iconRef?: string | null
      tags?: string[]
      secrets: {
        password?: string
        note?: string
        cardPan?: string
        cardCvv?: string
      }
    },
    {entryId: string}
  >
  'passmanager:entry:save': Route<
    {
      entryId?: string
      title: string
      entryType?: 'login' | 'payment_card'
      urls?: string[]
      username?: string
      paymentCard?: {
        cardholderName: string
        brand?: string
        expMonth: number
        expYear: number
        last4?: string
      }
      groupPath?: string
      iconRef?: string | null
      tags?: string[]
    },
    {entryId: string}
  >
  'passmanager:entry:read': Route<{entryId: string}, {entry: object}>
  'passmanager:entry:delete': Route<{entryId: string}, void>
  'passmanager:entry:move': Route<{entryId: string; targetGroupPath: string}, void>
  'passmanager:entry:rename': Route<{entryId: string; newTitle: string}, void>
  'passmanager:entry:list': Route<Record<string, never>, {entries: object[]; folders: object[]}>
  'passmanager:secret:save': Route<
    {entryId: string; secretType: 'password' | 'note' | 'card_pan' | 'card_cvv'; value: string | null},
    void
  >
  'passmanager:ssh:keygen': Route<
    {
      keyType: 'ed25519' | 'rsa' | 'ecdsa'
      name?: string
      comment?: string
      sourceEntryId?: string
    },
    {
      keyId: string
      publicKeyOpenssh: string
      fingerprint: string
      keyType: string
    }
  >
  'passmanager:ssh:list': Route<Record<string, never>, {sshKeys: PassManagerSshKey[]}>
  'passmanager:ssh:key:update': Route<{key: PassManagerSshKey}, void>
  'passmanager:ssh:key:delete': Route<{keyId: string}, void>
  'passmanager:ssh:secret:read': Route<
    {keyId: string; secretType: 'ssh_public_key'},
    {value: string}
  >
  'passmanager:secret:read': Route<
    {entryId: string; secretType: 'password' | 'note' | 'card_pan' | 'card_cvv'},
    {value: string}
  >
  'passmanager:secret:delete': Route<
    {entryId: string; secretType: 'password' | 'note' | 'card_pan' | 'card_cvv'},
    void
  >
  'passmanager:group:ensure': Route<{path: string}, void>
  'passmanager:group:setMeta': Route<
    {path: string; iconRef?: string | null; description?: string | null},
    void
  >
  'passmanager:group:list': Route<
    Record<string, never>,
    {groups: PassmanagerGroupSummary[]}
  >
  'passmanager:group:delete': Route<{path: string}, void>
  'passmanager:tags:setCatalog': Route<
    {
      tags: string[]
      tagMeta?: Record<string, {colorId?: string}>
      tag_meta?: Record<string, {colorId?: string; color_id?: string}>
      sshKeys?: PassManagerSshKey[]
    },
    void
  >
  'passmanager:root:import': Route<
    {
      entries: object[]
      folders: object[]
      foldersMeta?: object[]
      tags?: string[]
      tagMeta?: Record<string, {colorId?: string}>
      tag_meta?: Record<string, {colorId?: string; color_id?: string}>
      mode?: 'merge' | 'replace' | 'restore'
      reason?: string
      allowDestructive?: boolean
    },
    void
  >
  'passmanager:root:export': Route<Record<string, never>, {root: object}>
  'passmanager:icon:put': Route<
    {contentBase64: string; mimeType?: string | null; backgroundColor?: string | null},
    {
      iconRef: string
      mimeType: string
      backgroundColor?: string | null
      width: number
      height: number
      bytes: number
    }
  >
  'passmanager:icon:get': Route<
    {iconRef: string},
    {iconRef: string; mimeType: string; backgroundColor?: string | null; contentBase64: string}
  >
  'passmanager:icon:getMany': Route<
    {iconRefs: string[]},
    {
      icons: Array<{
        iconRef: string
        mimeType: string
        backgroundColor?: string | null
        contentBase64: string
      }>
      missingIconRefs: string[]
    }
  >
  'passmanager:icon:list': Route<
    Record<string, never>,
    {
      icons: Array<{
        iconRef: string
        mimeType: string
        backgroundColor?: string | null
        width: number
        height: number
        bytes: number
        createdAt: number
        updatedAt: number
      }>
    }
  >
  'passmanager:icon:setMeta': Route<{iconRef: string; backgroundColor: string | null}, void>
  'passmanager:icon:gc': Route<Record<string, never>, {deleted: number}>
  'passmanager:securityAudit:get': Route<
    Record<string, never>,
    {artifact: CredentialSecurityAuditArtifactV1 | null}
  >
  'passmanager:securityAudit:set': Route<{artifact: CredentialSecurityAuditArtifactV1}, void>
  'passmanager:otp:generate': Route<
    {
      nodeId?: number
      otpId?: string
      entryId?: string
      label?: string
      ha?: string
      period?: number
      digits?: number
      ts?: number
      type?: 'TOTP' | 'HOTP'
      counter?: number
    },
    {otp: string}
  >
  'passmanager:otp:preview': Route<
    {
      secret: string
      encoding: 'base32' | 'base64' | 'base16' | 'utf-8'
      algorithm: string
      digits: number
      period: number
      type: 'TOTP' | 'HOTP'
      counter?: number
      ts?: number
    },
    {otp: string; period: number; left_seconds: number}
  >
  'passmanager:otp:setSecret': Route<
    {
      otpId?: string
      entryId?: string
      label?: string
      secret: string
      encoding?: 'base32' | 'base64' | 'base16' | 'utf-8' | 'hex'
      algorithm?: string
      digits?: number
      period?: number
      type?: 'TOTP' | 'HOTP'
      counter?: number
    },
    void
  >
  'passmanager:otp:removeSecret': Route<
    {
      nodeId?: number
      otpId?: string
      entryId?: string
      label?: string
    },
    void
  >
}

/** General command map (non-catalog) */
export type CommandMap = {
  ping: Route<Record<string, never>, {pong: boolean}>
  pong: Route<Record<string, never>, null>
  auth: Route<{key: string}, null>
  'credential_provider:status': Route<Record<string, never>, ProviderStatus>
  'credential_provider:session:open': Route<Record<string, never>, CredentialProviderSession>
  'credential_provider:session:close': Route<{provider_session: string}, null>
  'credential_provider:list': Route<{context: ProviderContext}, {candidates: CredentialCandidate[]}>
  'credential_provider:search': Route<
    {query: string; context?: ProviderContext},
    {candidates: CredentialCandidate[]}
  >
  'credential_provider:getSecret': Route<
    {provider_session: string; credential_id: string; otp_id?: string; context?: ProviderContext},
    CredentialSecret
  >
  'credential_provider:getOneTimeCode': Route<
    {provider_session: string; credential_id: string; otp_id: string; context: ProviderContext},
    CredentialOneTimeCode
  >
  'credential_provider:recordUse': Route<
    {credential_id: string; provider_session?: string; context?: ProviderContext},
    null
  >
}

/** Client event payloads (server → client push messages) */
export type ClientEventPayloadMap = {
  'catalog:changed': {version: number; nodeId: number; action: 'create' | 'update' | 'delete'}
  state: {ts: number}
}

/** Command name type */
export type CommandName = keyof CatalogCommandMap | keyof CommandMap

/** Command request type */
export type CommandRequest<T extends CommandName> = T extends keyof CatalogCommandMap
  ? CatalogCommandMap[T]['request']
  : T extends keyof CommandMap
    ? CommandMap[T]['request']
    : never

/** Command response type */
export type CommandFnResult<T extends CommandName> = T extends keyof CatalogCommandMap
  ? CatalogCommandMap[T]['response']
  : T extends keyof CommandMap
    ? CommandMap[T]['response']
    : never
