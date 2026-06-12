import type {Logger} from '../../logger'
import type {RpcResult} from '@chromvoid/scheme'
import {isSuccess} from '@chromvoid/scheme'
import {tauriInvoke} from './ipc'

import type {RpcCmdData, RpcCmdName, RpcCmdResult} from './tauri-rpc-types'

type DispatchCatalogCommandInput = {
  command: string
  data: Record<string, unknown>
  logger: Logger
  rpc: <T extends RpcCmdName>(command: T, data: RpcCmdData<T>) => Promise<RpcCmdResult<T>>
  rpcDispatch: (command: string, data: Record<string, unknown>) => Promise<unknown>
  rpcDispatchRaw: (command: string, data: Record<string, unknown>) => Promise<RpcResult<unknown>>
}

function toU64(value: unknown, label: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(value)) {
      throw new Error(`Invalid ${label}: ${String(value)}`)
    }

    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || !/^[0-9]+$/.test(trimmed)) {
      throw new Error(`Invalid ${label}: ${String(value)}`)
    }

    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isSafeInteger(parsed)) {
      throw new Error(`Invalid ${label}: ${String(value)}`)
    }

    return parsed
  }

  if (typeof value === 'bigint') {
    throw new Error(`Invalid ${label}: bigint is not allowed in IPC payloads`)
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid ${label}: ${String(value)}`)
  }

  return parsed
}

export async function dispatchTauriCatalogCommand(input: DispatchCatalogCommandInput): Promise<unknown> {
  const {command, data, logger, rpc, rpcDispatch, rpcDispatchRaw} = input
  const debug = logger.level === 'debug'

  if (command === 'auth') {
    return {ok: true, result: {}} satisfies {ok: true; result: Record<string, never>}
  }

  if (command === 'catalog:subscribe' || command === 'catalog:unsubscribe') {
    const response = await rpcDispatchRaw(command, data)
    if (!isSuccess(response)) return response
    return {ok: true, result: {}} satisfies {ok: true; result: Record<string, never>}
  }

  switch (command) {
    case 'ping': {
      const result = await rpc('ping', {})
      return {ok: true, result}
    }

    case 'pong': {
      const result = await rpc('pong', {})
      return {ok: true, result}
    }

    case 'catalog:list': {
      const path = (data['path'] as string | null | undefined) ?? null
      const include =
        (data['include_hidden'] as boolean | null | undefined) ??
        (data['includeHidden'] as boolean | undefined) ??
        null
      const isPass = typeof path === 'string' && path.startsWith('/.passmanager')

      if (debug && isPass) {
        logger.debug('[dashboard][tauri] catalog:list ->', {path, include_hidden: include})
      }

      let result: RpcCmdResult<'catalog:list'>
      try {
        result = await rpc('catalog:list', {path, include_hidden: include})
      } catch (error) {
        if (debug && isPass) {
          logger.debug('[dashboard][tauri] catalog:list error', {
            path,
            include_hidden: include,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        throw error
      }

      if (debug && isPass) {
        const anyResult = result as {
          current_path?: string
          items?: Array<{name?: string; node_id?: number}>
        }
        const items = Array.isArray(anyResult.items) ? anyResult.items : []
        const preview = items
          .slice(0, 15)
          .map((item) => ({name: String(item?.name ?? ''), node_id: item?.node_id}))
        logger.debug('[dashboard][tauri] catalog:list ok', {
          current_path: anyResult.current_path,
          itemsCount: items.length,
          itemsPreview: preview,
        })
      }

      return {ok: true, result}
    }

    case 'catalog:createDir': {
      const name = String(data['name'] ?? '')
      const parent_path =
        (data['parent_path'] as string | null | undefined) ??
        (data['parentPath'] as string | undefined) ??
        null
      const isPass =
        name === '.passmanager' ||
        (typeof parent_path === 'string' && parent_path.startsWith('/.passmanager'))

      if (debug && isPass) {
        logger.debug('[dashboard][tauri] catalog:createDir ->', {name, parent_path})
      }

      let result: RpcCmdResult<'catalog:createDir'>
      try {
        result = await rpc('catalog:createDir', {name, parent_path})
      } catch (error) {
        if (debug && isPass) {
          logger.debug('[dashboard][tauri] catalog:createDir error', {
            name,
            parent_path,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        throw error
      }

      if (debug && isPass) {
        logger.debug('[dashboard][tauri] catalog:createDir ok', {
          name,
          parent_path,
          node_id: result.node_id,
        })
      }

      return {ok: true, result}
    }

    case 'catalog:rename': {
      const node_id = toU64(data['node_id'] ?? data['nodeId'], 'node_id')
      const new_name = String(data['new_name'] ?? data['newName'] ?? '')
      const result = await rpc('catalog:rename', {node_id, new_name})
      return {ok: true, result}
    }

    case 'catalog:delete': {
      const node_id = toU64(data['node_id'] ?? data['nodeId'], 'node_id')
      if (debug) {
        logger.debug('[dashboard][tauri] catalog:delete ->', {node_id})
      }

      let result: RpcCmdResult<'catalog:delete'>
      try {
        result = await rpc('catalog:delete', {node_id})
      } catch (error) {
        if (debug) {
          logger.debug('[dashboard][tauri] catalog:delete error', {
            node_id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        throw error
      }

      if (debug) {
        logger.debug('[dashboard][tauri] catalog:delete ok', {node_id})
      }

      return {ok: true, result}
    }

    case 'catalog:move': {
      const node_id = toU64(data['node_id'] ?? data['nodeId'], 'node_id')
      const new_parent_path = String(data['new_parent_path'] ?? data['newParentPath'] ?? '')
      const new_name =
        (data['new_name'] as string | null | undefined) ?? (data['newName'] as string | undefined) ?? null
      const result = await rpc('catalog:move', {node_id, new_parent_path, new_name})
      return {ok: true, result}
    }

    case 'catalog:sync:manifest': {
      const result = await rpcDispatch('catalog:sync:manifest', {})
      return {ok: true, result}
    }

    case 'catalog:folder:list': {
      const path = String(data['path'] ?? '/')
      const offset = toU64(data['offset'] ?? 0, 'offset')
      const limitRaw = data['limit']
      const limit = limitRaw === undefined || limitRaw === null ? null : toU64(limitRaw, 'limit')
      const expectedVersionRaw = data['expected_version'] ?? data['expectedVersion']
      const expected_version =
        expectedVersionRaw === undefined || expectedVersionRaw === null
          ? null
          : toU64(expectedVersionRaw, 'expected_version')
      const sort = (data['sort'] as Record<string, unknown> | null | undefined) ?? null
      const filter = (data['filter'] as Record<string, unknown> | null | undefined) ?? null
      const result = await rpcDispatch('catalog:folder:list', {
        path,
        offset,
        limit,
        expected_version,
        sort,
        filter,
      })
      return {ok: true, result}
    }

    case 'catalog:folder:batch': {
      const pages = Array.isArray(data['pages']) ? (data['pages'] as unknown[]) : []
      const result = await rpcDispatch('catalog:folder:batch', {pages})
      return {ok: true, result}
    }

    case 'catalog:notes:list': {
      const result = await rpc('catalog:notes:list', {})
      return {ok: true, result}
    }

    case 'catalog:source:metadata': {
      const node_id = toU64(data['node_id'] ?? data['nodeId'], 'node_id')
      const result = await rpc('catalog:source:metadata', {node_id})
      return {ok: true, result}
    }

    case 'catalog:media:inspect': {
      const node_id = toU64(data['node_id'] ?? data['nodeId'], 'node_id')
      const result = await rpcDispatch('catalog:media:inspect', {node_id})
      return {ok: true, result}
    }

    case 'catalog:secret:erase': {
      const node_id = toU64(data['node_id'] ?? data['nodeId'], 'node_id')
      const result = await rpc('catalog:secret:erase', {node_id})
      return {ok: true, result}
    }

    case 'passmanager:otp:generate': {
      const otp_id_raw = data['otp_id'] ?? data['otpId']
      const otp_id =
        otp_id_raw === undefined || otp_id_raw === null ? null : String(otp_id_raw).trim() || null
      const entry_id_raw = data['entry_id'] ?? data['entryId']
      const entry_id =
        entry_id_raw === undefined || entry_id_raw === null ? null : String(entry_id_raw).trim() || null
      if (otp_id === null && entry_id === null) {
        throw new Error('Invalid passmanager:otp:generate payload: otp_id or entry_id is required')
      }

      const ha = (data['ha'] as string | null | undefined) ?? null
      const period = (data['period'] as number | null | undefined) ?? null
      const digits = (data['digits'] as number | null | undefined) ?? null
      const tsRaw = data['ts'] as unknown
      const ts = tsRaw === undefined || tsRaw === null ? null : toU64(tsRaw, 'ts')
      const result = await rpcDispatch('passmanager:otp:generate', {
        otp_id,
        entry_id,
        ha,
        period,
        digits,
        ts,
      })
      return {ok: true, result}
    }

    case 'passmanager:otp:setSecret': {
      const otp_id_raw = data['otp_id'] ?? data['otpId']
      const otp_id =
        otp_id_raw === undefined || otp_id_raw === null ? null : String(otp_id_raw).trim() || null
      const entry_id_raw = data['entry_id'] ?? data['entryId']
      const entry_id =
        entry_id_raw === undefined || entry_id_raw === null ? null : String(entry_id_raw).trim() || null
      if (otp_id === null && entry_id === null) {
        throw new Error('Invalid passmanager:otp:setSecret payload: otp_id or entry_id is required')
      }

      const labelRaw = data['label']
      const label = labelRaw === undefined || labelRaw === null ? null : String(labelRaw).trim() || null

      const secretRaw = data['secret']
      const secret = secretRaw === undefined || secretRaw === null ? null : String(secretRaw).trim()
      if (!secret) {
        throw new Error('Invalid passmanager:otp:setSecret payload: non-empty secret is required')
      }
      const encoding = (data['encoding'] as string | null | undefined) ?? null
      const algorithm = (data['algorithm'] as string | null | undefined) ?? null
      const digits = (data['digits'] as number | null | undefined) ?? null
      const period = (data['period'] as number | null | undefined) ?? null
      const result = await rpcDispatch('passmanager:otp:setSecret', {
        otp_id,
        entry_id,
        label,
        secret,
        encoding,
        algorithm,
        digits,
        period,
      })
      return {ok: true, result}
    }

    case 'passmanager:otp:removeSecret': {
      const otp_id_raw = data['otp_id'] ?? data['otpId']
      const otp_id =
        otp_id_raw === undefined || otp_id_raw === null ? null : String(otp_id_raw).trim() || null
      const entry_id_raw = data['entry_id'] ?? data['entryId']
      const entry_id =
        entry_id_raw === undefined || entry_id_raw === null ? null : String(entry_id_raw).trim() || null
      if (otp_id === null && entry_id === null) {
        throw new Error('Invalid passmanager:otp:removeSecret payload: otp_id or entry_id is required')
      }

      const labelRaw = data['label']
      const label = labelRaw === undefined || labelRaw === null ? null : String(labelRaw).trim() || null

      const result = await rpcDispatch('passmanager:otp:removeSecret', {
        otp_id,
        entry_id,
        label,
      })
      return {ok: true, result}
    }

    case 'passmanager:otp:renameSecret': {
      const otp_id_raw = data['otp_id'] ?? data['otpId']
      const otp_id =
        otp_id_raw === undefined || otp_id_raw === null ? null : String(otp_id_raw).trim() || null
      const entry_id_raw = data['entry_id'] ?? data['entryId']
      const entry_id =
        entry_id_raw === undefined || entry_id_raw === null ? null : String(entry_id_raw).trim() || null
      if (otp_id === null && entry_id === null) {
        throw new Error('Invalid passmanager:otp:renameSecret payload: otp_id or entry_id is required')
      }

      const previous_label = String(data['previous_label'] ?? data['previousLabel'] ?? '').trim()
      if (!previous_label) {
        throw new Error('Invalid passmanager:otp:renameSecret payload: previous_label is required')
      }

      const next_label = String(data['next_label'] ?? data['nextLabel'] ?? '').trim()
      if (!next_label) {
        throw new Error('Invalid passmanager:otp:renameSecret payload: next_label is required')
      }

      const result = await rpcDispatch('passmanager:otp:renameSecret', {
        otp_id,
        entry_id,
        previous_label,
        next_label,
      })
      return {ok: true, result}
    }

    case 'passmanager:secret:save': {
      const entry_id_raw = data['entry_id'] ?? data['entryId']
      const entry_id =
        entry_id_raw === undefined || entry_id_raw === null ? null : String(entry_id_raw).trim() || null
      if (entry_id === null) {
        throw new Error('Invalid passmanager:secret:save payload: entry_id is required')
      }

      const secret_type_raw = data['secret_type'] ?? data['secretType'] ?? data['type']
      const secret_type =
        secret_type_raw === undefined || secret_type_raw === null
          ? null
          : String(secret_type_raw).trim() || null
      if (secret_type === null) {
        throw new Error('Invalid passmanager:secret:save payload: secret_type is required')
      }

      if (!Object.prototype.hasOwnProperty.call(data, 'value')) {
        throw new Error('Invalid passmanager:secret:save payload: value is required')
      }
      const value_raw = data['value']
      if (value_raw === null) {
        const result = await rpcDispatch('passmanager:secret:delete', {
          entry_id,
          secret_type,
        })
        return {ok: true, result}
      }

      if (typeof value_raw !== 'string') {
        throw new Error(
          'Invalid passmanager:secret:save payload: value must be string; use passmanager:secret:delete for null',
        )
      }

      const result = await rpcDispatch('passmanager:secret:save', {
        entry_id,
        secret_type,
        value: value_raw,
      })
      return {ok: true, result}
    }

    case 'passmanager:ssh:keygen': {
      const entry_id_raw = data['entry_id'] ?? data['entryId']
      const entry_id =
        entry_id_raw === undefined || entry_id_raw === null ? null : String(entry_id_raw).trim() || null
      if (entry_id === null) {
        throw new Error('Invalid passmanager:ssh:keygen payload: entry_id is required')
      }

      const key_type_raw = data['key_type'] ?? data['keyType']
      const key_type =
        key_type_raw === undefined || key_type_raw === null ? null : String(key_type_raw).trim() || null
      if (key_type === null) {
        throw new Error('Invalid passmanager:ssh:keygen payload: key_type is required')
      }

      const comment_raw = data['comment']
      const comment = comment_raw === undefined || comment_raw === null ? '' : String(comment_raw)
      const result = await tauriInvoke<{
        key_id: string
        public_key_openssh: string
        fingerprint: string
        key_type: string
      }>('ssh_keygen', {
        entryId: entry_id,
        keyType: key_type,
        comment,
      })
      return {ok: true, result}
    }

    case 'passmanager:entry:save':
    case 'passmanager:entry:read':
    case 'passmanager:entry:delete':
    case 'passmanager:entry:move':
    case 'passmanager:entry:rename':
    case 'passmanager:entry:list':
    case 'passmanager:secret:read':
    case 'passmanager:secret:delete':
    case 'passmanager:group:ensure':
    case 'passmanager:group:setMeta':
    case 'passmanager:group:list':
    case 'passmanager:group:delete':
    case 'passmanager:icon:put':
    case 'passmanager:icon:get':
    case 'passmanager:icon:list':
    case 'passmanager:icon:setMeta':
    case 'passmanager:icon:gc':
    case 'passmanager:tags:setCatalog':
    case 'passmanager:root:import':
    case 'passmanager:root:export': {
      const result = await rpcDispatch(command, data)
      return {ok: true, result}
    }
  }

  throw new Error(`Unsupported IPC command: ${command}`)
}
