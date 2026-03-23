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
  SyncInitResponse,
  ProviderContext,
  CredentialCandidate,
  CredentialSecret,
  ProviderStatus,
} from './command-maps'

// === RPC helpers (runtime functions) ===
export {success, error, isSuccess, isError} from './rpc-helpers'
export type {RpcResult} from './rpc-helpers'

// === Device state (from OrangePI/chromvoidfs API) ===
export type {FullChromVoidState} from './device-state'
