import type {RpcCommand, RpcCommandResult, RpcResult} from '@chromvoid/scheme'
import {isSuccess} from '@chromvoid/scheme'

export type RpcDispatchArgs = {
  cmd: RpcCommand
}

export type RpcDispatchResponse = RpcResult<RpcCommandResult>

export function unwrapRpc<T>(r: RpcResult<T>): T {
  if (isSuccess(r)) return r.result
  const msg = r.error || 'RPC error'
  const code = r.code ? ` (${r.code})` : ''
  throw new Error(`${msg}${code}`)
}
