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

  it('rejects legacy entry-bound SSH secrets on the web path', async () => {
    const rpcDispatch = vi.fn(async () => ({ok: true, result: null}))

    await expect(
      dispatchTauriCatalogCommand({
        command: 'passmanager:secret:save',
        data: {entry_id: 'entry-42', secret_type: 'ssh_private_key:key-1', value: 'PRIVATE'},
        logger,
        rpc: vi.fn(async () => ({}) as never),
        rpcDispatch,
        rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
      }),
    ).rejects.toThrow('unsupported web secret_type')
    expect(rpcDispatch).not.toHaveBeenCalled()
  })

  it('allows root public-key reads but rejects private-key reads from web', async () => {
    const rpcDispatch = vi.fn(async () => ({value: 'ssh-ed25519 PUBLIC'}))
    const base = {
      logger,
      rpc: vi.fn(async () => ({}) as never),
      rpcDispatch,
      rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
    }

    await expect(
      dispatchTauriCatalogCommand({
        ...base,
        command: 'passmanager:ssh:secret:read',
        data: {key_id: 'key-1', secret_type: 'ssh_public_key'},
      }),
    ).resolves.toEqual({ok: true, result: {value: 'ssh-ed25519 PUBLIC'}})
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:ssh:secret:read', {
      key_id: 'key-1',
      secret_type: 'ssh_public_key',
    })

    await expect(
      dispatchTauriCatalogCommand({
        ...base,
        command: 'passmanager:ssh:secret:read',
        data: {key_id: 'key-1', secret_type: 'ssh_private_key'},
      }),
    ).rejects.toThrow('private key access is native-only')
  })
})
