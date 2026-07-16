/**
 * @chromvoid/scheme - Type definitions for ChromVoid system
 *
 * Structure:
 * - Rust Core types (snake_case) — from ./generated/
 * - TypeScript API types (camelCase) — from ./command-maps, ./device-state
 * - Runtime helpers — from ./rpc-helpers
 */

// === Generated from Rust Core (snake_case naming) ===
export type {NodeType} from './generated/NodeType'
export type {ErrorCode} from './generated/ErrorCode'
export type {CatalogNode} from './generated/CatalogNode'
export type {RpcRequest} from './generated/RpcRequest'
export type {RpcSuccess} from './generated/RpcSuccess'
export type {RpcError} from './generated/RpcError'
export type {JsonValue} from './generated/serde_json/JsonValue'

// === RPC Command discriminated unions (from Rust) ===
export type {RpcCommand} from './generated/RpcCommand'
export type {RpcCommandResult} from './generated/RpcCommandResult'

// === RPC Command helpers (TypeScript utilities) ===
export type {RpcCommandName, RpcCommandData, RpcCommandResultData} from './rpc-command-helpers'

// === TypeScript API types (camelCase naming) ===
export type {
  CatalogCommandMap,
  CommandMap,
  ClientEventPayloadMap,
  CommandName,
  CommandRequest,
  CommandFnResult,
  CatalogListItem,
  CatalogListResponse,
  ProviderContext,
  CredentialCandidate,
  CredentialOneTimeCode,
  CredentialProviderSession,
  CredentialSecret,
  CredentialSecurityAuditEntrySummary,
  CredentialSecurityAuditArtifactV1,
  ProviderStatus,
} from './command-maps'
export type {CredentialOtpOption} from './generated/CredentialOtpOption'
export type {CredentialProviderSessionResponse} from './generated/CredentialProviderSessionResponse'
export type {CredentialProviderStatusResponse} from './generated/CredentialProviderStatusResponse'

// === RPC helpers (runtime functions) ===
export {success, error, isSuccess, isError} from './rpc-helpers'
export type {RpcResult} from './rpc-helpers'

// === Device state (from chromvoidfs API) ===
export type {FullChromVoidState} from './device-state'
