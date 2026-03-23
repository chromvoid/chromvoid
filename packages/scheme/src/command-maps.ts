/**
 * Command maps for RPC routing (TypeScript API)
 *
 * These types define request/response shapes for each command.
 * Used for type-safe RPC handlers and clients.
 *
 * Note: TypeScript API uses camelCase conventions.
 * Rust core uses snake_case — types are separate.
 */

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

/** Sync init response */
export type SyncInitResponse = {
  version: number
  nodes: unknown
}

export type ProviderContext = {kind: 'web'; origin: string; domain: string} | {kind: 'app'; app_id: string}

export type CredentialCandidate = {
  credential_id: string
  label: string
  username: string
  domain?: string
  app_id?: string
  match: 'exact' | 'subdomain' | 'etld_plus_one' | 'app'
  last_used_at?: number
}

export type CredentialSecret = {
  credential_id: string
  username: string
  password?: string
  otp?: string
}

export type ProviderStatus = {
  enabled: boolean
  vault_open: boolean
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
  'catalog:prepareUpload': Route<
    {
      parentPath: string
      name: string
      size: number
      mimeType?: string
      chunkSize?: number
    },
    {nodeId: number}
  >
  'catalog:upload': Route<
    {nodeId: number; size: number; name?: string; mimeType?: string; chunkSize?: number},
    void
  >
  'catalog:download': Route<{nodeId: number}, AsyncIterable<Uint8Array>>

  // === Sync ===
  'catalog:syncInit': Route<Record<string, never>, SyncInitResponse>
  'catalog:sync:delta': Route<{fromVersion: number}, {version: number; delta: unknown[]}>
  'catalog:subscribe': Route<Record<string, never>, void>
  'catalog:unsubscribe': Route<Record<string, never>, void>

  // === Secrets ===
  'catalog:secret:read': Route<{nodeId: number}, AsyncIterable<Uint8Array>>
  'catalog:secret:write': Route<{nodeId: number; size: number}, void>
  'catalog:secret:erase': Route<{nodeId: number}, void>

  // === PassManager domain commands (ADR-029) ===
  'passmanager:entry:save': Route<
    {
      entryId?: string
      title: string
      urls?: string[]
      username?: string
      groupPath?: string
      iconRef?: string | null
    },
    {entryId: string}
  >
  'passmanager:entry:read': Route<{entryId: string}, {entry: object}>
  'passmanager:entry:delete': Route<{entryId: string}, void>
  'passmanager:entry:move': Route<{entryId: string; targetGroupPath: string}, void>
  'passmanager:entry:rename': Route<{entryId: string; newTitle: string}, void>
  'passmanager:entry:list': Route<Record<string, never>, {entries: object[]; folders: object[]}>
  'passmanager:secret:save': Route<{entryId: string; secretType: string; value: string | null}, void>

  'passmanager:secret:read': Route<{entryId: string; secretType: string}, {value: string}>
  'passmanager:secret:delete': Route<{entryId: string; secretType: string}, void>
  'passmanager:group:ensure': Route<{path: string}, void>
  'passmanager:group:setMeta': Route<{path: string; iconRef?: string | null}, void>
  'passmanager:group:list': Route<Record<string, never>, {groups: object[]}>
  'passmanager:root:import': Route<
    {
      entries: object[]
      folders: object[]
      foldersMeta?: object[]
      mode?: 'merge' | 'replace' | 'restore'
      reason?: string
      allowDestructive?: boolean
    },
    void
  >
  'passmanager:root:export': Route<Record<string, never>, {root: object}>
  'passmanager:icon:put': Route<
    {contentBase64: string; mimeType?: string | null},
    {iconRef: string; mimeType: string; width: number; height: number; bytes: number}
  >
  'passmanager:icon:get': Route<{iconRef: string}, {iconRef: string; mimeType: string; contentBase64: string}>
  'passmanager:icon:list': Route<
    Record<string, never>,
    {
      icons: Array<{
        iconRef: string
        mimeType: string
        width: number
        height: number
        bytes: number
        createdAt: number
        updatedAt: number
      }>
    }
  >
  'passmanager:icon:gc': Route<Record<string, never>, {deleted: number}>
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
    },
    {otp: string}
  >
  'passmanager:otp:setSecret': Route<
    {
      otpId?: string
      entryId?: string
      label?: string
      secret: string
      encoding?: 'base32' | 'base64' | 'hex'
      algorithm?: string
      digits?: number
      period?: number
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
  'credential_provider:session:open': Route<
    Record<string, never>,
    {provider_session: string; expires_at_ms: number}
  >
  'credential_provider:session:close': Route<{provider_session: string}, null>
  'credential_provider:list': Route<{context: ProviderContext}, {candidates: CredentialCandidate[]}>
  'credential_provider:search': Route<
    {query: string; context?: ProviderContext},
    {candidates: CredentialCandidate[]}
  >
  'credential_provider:getSecret': Route<
    {provider_session: string; credential_id: string; context?: ProviderContext},
    CredentialSecret
  >
  'credential_provider:recordUse': Route<
    {credential_id: string; provider_session?: string; context?: ProviderContext},
    null
  >
}

/** Client event payloads (server → client push messages) */
export type ClientEventPayloadMap = {
  'catalog:changed': {version: number; nodeId: number; action: 'create' | 'update' | 'delete'}
  'catalog:sync': {version: number; delta: unknown[]}
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
