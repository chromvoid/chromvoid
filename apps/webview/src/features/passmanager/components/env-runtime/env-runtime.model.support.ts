import type {ModuleAccessState} from 'root/core/modules/module-access.model'
import {moduleAccessModel} from 'root/core/modules/module-access.model'
import {tauriInvoke, tauriListen, type UnlistenFn} from 'root/core/transport/tauri/ipc'
import {dialogService} from 'root/shared/services/dialog-service'

import {envRuntimeI18n as t} from './env-runtime.i18n'
import type {AgentRunMetadata, AgentVariableMapping, RpcResult} from './env-runtime.types'

export const REVEAL_TTL_MS = 30_000
export const OPERATIONAL_REFRESH_MS = 3_000
export const CLOCK_TICK_MS = 1_000
const MAX_LABEL_BYTES = 80
export const MAX_DESCRIPTION_BYTES = 512
const MAX_SECRET_VALUE_BYTES = 65_536
const MAX_PROFILE_VARIABLES = 128
const MAX_ARGS = 128
const MAX_ARG_BYTES = 4_096
const MAX_ARGS_TOTAL_BYTES = 65_536
const MAX_PASSTHROUGH_ENV = 32
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/

type ConfirmOptions = {
  title: string
  message: string
  confirmText: string
  cancelText: string
  confirmVariant?: 'danger' | 'primary'
  variant?: 'warning' | 'danger'
}

export type EnvRuntimeDependencies = {
  rpc<T>(command: string, data: Record<string, unknown>): Promise<T>
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
  listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn>
  confirm(options: ConfirmOptions): Promise<boolean>
  access(): ModuleAccessState | null
  retryAccess(): Promise<void>
  now(): number
}

type RpcDispatchPayload<T> = RpcResult<{command: string; result: T}>

class EnvRuntimeRpcError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
  ) {
    super(message)
    this.name = 'EnvRuntimeRpcError'
  }
}

export const RUN_APPROVAL_TERMINAL_ERROR_CODES = new Set([
  'APPROVAL_CLOSED',
  'APPROVAL_EXPIRED',
  'REVISION_CONFLICT',
  'EXECUTABLE_IDENTITY_MISMATCH',
  'WORKSPACE_MISMATCH',
  'WORKSPACE_UNAVAILABLE',
  'PRESET_NOT_FOUND',
  'PROFILE_NOT_FOUND',
  'VAULT_REQUIRED',
  'AGENT_REVOKED',
])

async function rpcDispatch<T>(command: string, data: Record<string, unknown>): Promise<T> {
  const response = await tauriInvoke<RpcDispatchPayload<T>>('rpc_dispatch', {
    args: {v: 1, command, data},
  })
  if (!response.ok) throw new EnvRuntimeRpcError(response.error, response.code ?? null)
  if (response.result.command !== command) {
    throw new Error(`rpc_dispatch command mismatch: expected ${command}`)
  }
  return response.result.result
}

async function invokeRpc<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const response = await tauriInvoke<RpcResult<T>>(command, args)
  if (!response.ok) throw new EnvRuntimeRpcError(response.error, response.code ?? null)
  return response.result
}

export const defaultDependencies: EnvRuntimeDependencies = {
  rpc: rpcDispatch,
  invoke: invokeRpc,
  listen: tauriListen,
  confirm: (options) => dialogService.showConfirmDialog(options),
  access: () => moduleAccessModel.featureAccess('env-runtime'),
  retryAccess: () => moduleAccessModel.refresh(),
  now: () => Date.now(),
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

export function validateLabel(value: string): string | undefined {
  const label = value.trim()
  if (!label) return t('errorLabelRequired')
  if (byteLength(label) > MAX_LABEL_BYTES) return t('errorLabelTooLong')
  if ([...label].some((character) => /\p{Cc}/u.test(character))) return t('errorLabelControl')
  return undefined
}

export function validateSlug(value: string): string | undefined {
  if (!value) return t('errorSlugRequired')
  if (!SLUG_PATTERN.test(value)) return t('errorSlugFormat')
  return undefined
}

export function validateSecretValue(value: string, required: boolean): string | undefined {
  if (!value && required) return t('errorSecretValueRequired')
  if (!value) return undefined
  if (byteLength(value) > MAX_SECRET_VALUE_BYTES) return t('errorSecretValueTooLong')
  if (value.includes('\0')) return t('errorSecretValueNul')
  return undefined
}

export function variableErrors(variables: readonly AgentVariableMapping[]): Array<{
  name?: string
  secret?: string
}> {
  const seen = new Set<string>()
  return variables.map((variable) => {
    const name = variable.name.trim()
    const error: {name?: string; secret?: string} = {}
    if (!ENV_NAME_PATTERN.test(name)) {
      error.name = t('errorVariableName')
    } else if (seen.has(name)) {
      error.name = t('errorVariableDuplicate')
    } else {
      seen.add(name)
    }
    if (!variable.secret_id) error.secret = t('errorVariableSecret')
    return error
  })
}

export function validateVariables(variables: readonly AgentVariableMapping[]): string | undefined {
  if (variables.length === 0 || variables.length > MAX_PROFILE_VARIABLES) {
    return t('errorVariableRequired')
  }
  const error = variableErrors(variables).find((item) => item.name || item.secret)
  return error?.name ?? error?.secret
}

export function validateAbsolutePath(value: string): string | undefined {
  return value.startsWith('/') ? undefined : t('errorPathRequired')
}

export function argErrors(args: readonly string[]): Array<string | undefined> {
  return args.map((arg) => (byteLength(arg) > MAX_ARG_BYTES ? t('errorArgLength') : undefined))
}

export function validateArgs(args: readonly string[]): string | undefined {
  if (args.length > MAX_ARGS) return t('errorArgsCount')
  const rowError = argErrors(args).find(Boolean)
  if (rowError) return rowError
  return args.reduce((total, arg) => total + byteLength(arg), 0) > MAX_ARGS_TOTAL_BYTES
    ? t('errorArgLength')
    : undefined
}

export function passthroughErrors(values: readonly string[]): Array<string | undefined> {
  const errors = Array<string | undefined>(values.length)
  const seen = new Set<string>()

  values.forEach((value, index) => {
    const name = value.trim()
    if (index >= MAX_PASSTHROUGH_ENV) {
      errors[index] = t('errorPassthroughCount')
    } else if (!ENV_NAME_PATTERN.test(name)) {
      errors[index] = t('errorVariableName')
    } else if (seen.has(name)) {
      errors[index] = t('errorVariableDuplicate')
    }
    seen.add(name)
  })

  return errors
}

export function validatePassthrough(values: readonly string[]): string | undefined {
  return passthroughErrors(values).find(Boolean)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function errorCode(error: unknown): string | null {
  if (error instanceof EnvRuntimeRpcError) return error.code
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as {code?: unknown}).code
    return typeof code === 'string' ? code : null
  }
  return null
}

export function errorMessageWithCode(error: unknown): string {
  const code = errorCode(error)
  const message = errorMessage(error)
  return code ? `${message} (${code})` : message
}

export function isRunActive(run: AgentRunMetadata): boolean {
  return run.status === 'approval_pending' || run.status === 'starting' || run.status === 'running'
}
