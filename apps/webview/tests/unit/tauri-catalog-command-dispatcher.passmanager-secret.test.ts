import {describe, expect, it, vi} from 'vitest'

import {dispatchTauriCatalogCommand} from '../../src/core/transport/tauri/tauri-catalog-command-dispatcher'

const logger = {
  level: 'info' as const,
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

describe('tauri catalog command dispatcher passmanager secret payloads', () => {
  it('accepts passmanager:secret:save with explicit empty string value', async () => {
    const rpcDispatch = vi.fn(async () => ({ok: true, result: null}))

    const out = await dispatchTauriCatalogCommand({
      command: 'passmanager:secret:save',
      data: {
        entryId: 'entry-42',
        secretType: 'password',
        value: '',
      },
      logger,
      rpc: vi.fn(async () => ({}) as never),
      rpcDispatch,
      rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
    })

    expect(out).toEqual({ok: true, result: {ok: true, result: null}})
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:secret:save', {
      entry_id: 'entry-42',
      secret_type: 'password',
      value: '',
    })
  })

  it('routes passmanager:secret:save with null value to passmanager:secret:delete', async () => {
    const rpcDispatch = vi.fn(async () => ({ok: true, result: null}))

    const out = await dispatchTauriCatalogCommand({
      command: 'passmanager:secret:save',
      data: {
        entry_id: 'entry-42',
        secret_type: 'password',
        value: null,
      },
      logger,
      rpc: vi.fn(async () => ({}) as never),
      rpcDispatch,
      rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
    })

    expect(out).toEqual({ok: true, result: {ok: true, result: null}})
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:secret:delete', {
      entry_id: 'entry-42',
      secret_type: 'password',
    })
  })

  it('rejects passmanager:secret:save when value is missing', async () => {
    const rpcDispatch = vi.fn(async () => ({ok: true, result: null}))

    await expect(
      dispatchTauriCatalogCommand({
        command: 'passmanager:secret:save',
        data: {
          entry_id: 'entry-42',
          secret_type: 'password',
        },
        logger,
        rpc: vi.fn(async () => ({}) as never),
        rpcDispatch,
        rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
      }),
    ).rejects.toThrow('value is required')
  })

  it('rejects passmanager:secret:save when entry_id is missing', async () => {
    const rpcDispatch = vi.fn(async () => ({ok: true, result: null}))

    await expect(
      dispatchTauriCatalogCommand({
        command: 'passmanager:secret:save',
        data: {
          secret_type: 'password',
          value: 'test',
        },
        logger,
        rpc: vi.fn(async () => ({}) as never),
        rpcDispatch,
        rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
      }),
    ).rejects.toThrow('entry_id is required')
  })
})
