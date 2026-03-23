/**
 * Helper types for RpcCommand and RpcCommandResult
 *
 * These are TypeScript utilities built on top of generated types.
 * Safe to edit — won't be overwritten by ts-rs.
 */
import type {RpcCommand} from './generated/RpcCommand'
import type {RpcCommandResult} from './generated/RpcCommandResult'

/** Extract command names from RpcCommand union */
export type RpcCommandName = RpcCommand['command']

/** Extract data type for a specific command */
export type RpcCommandData<T extends RpcCommandName> = Extract<RpcCommand, {command: T}>['data']

/** Extract result type for a specific command */
export type RpcCommandResultData<T extends RpcCommandResult['command']> = Extract<
  RpcCommandResult,
  {command: T}
>['result']
