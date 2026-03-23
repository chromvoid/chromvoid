/**
 * RPC helper functions and type definitions
 *
 * Types RpcSuccess and RpcError are generated from Rust.
 * This file provides:
 * - RpcResult union type
 * - Helper functions: success(), error()
 * - Type guards: isSuccess(), isError()
 */
import type {RpcSuccess} from './generated/RpcSuccess'
import type {RpcError} from './generated/RpcError'

/** Union type for RPC result */
export type RpcResult<T> = RpcSuccess<T> | RpcError

/** Creates a successful result */
export const success = <T>(result: T): RpcSuccess<T> => ({ok: true, result})

/** Creates an error result */
export const error = (message: string, code?: string): RpcError => ({
  ok: false,
  error: message,
  code: code ?? null,
})

/** Type guard: checks if result is successful */
export const isSuccess = <T>(r: RpcResult<T>): r is RpcSuccess<T> => r.ok === true

/** Type guard: checks if result is an error */
export const isError = <T>(r: RpcResult<T>): r is RpcError => r.ok === false
