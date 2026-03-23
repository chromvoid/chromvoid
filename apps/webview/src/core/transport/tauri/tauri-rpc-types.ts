import type {RpcCommand, RpcCommandResult} from '@chromvoid/scheme'

export type RpcCmdName = RpcCommandResult['command']
export type RpcCmdData<T extends RpcCmdName> = Extract<RpcCommand, {command: T}>['data']
export type RpcCmdResult<T extends RpcCmdName> = Extract<RpcCommandResult, {command: T}>['result']
