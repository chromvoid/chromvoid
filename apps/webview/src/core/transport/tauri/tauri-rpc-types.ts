import type {RpcCommandResult} from '@chromvoid/scheme'

export type RpcCmdName = RpcCommandResult['command']
export type {
  RpcCommandData as RpcCmdData,
  RpcCommandResultData as RpcCmdResult,
} from '@chromvoid/scheme'
