import {describe, expect, it, vi} from 'vitest'

import {dispatchTauriCatalogCommand} from '../../src/core/transport/tauri/tauri-catalog-command-dispatcher'

const logger = {
  level: 'info' as const,
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

describe('tauri catalog command dispatcher passmanager otp payloads', () => {
  it('accepts passmanager:otp:setSecret with entry_id and label (without otp_id)', async () => {
    const rpcDispatch = vi.fn(async () => ({ok: true, result: null}))

    const out = await dispatchTauriCatalogCommand({
      command: 'passmanager:otp:setSecret',
      data: {
        entry_id: 'entry-42',
        label: 'OTP',
        secret: 'JBSWY3DPEHPK3PXP',
        encoding: 'base32',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      },
      logger,
      rpc: vi.fn(async () => ({}) as never),
      rpcDispatch,
      rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
    })

    expect(out).toEqual({ok: true, result: {ok: true, result: null}})
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:otp:setSecret', {
      otp_id: null,
      entry_id: 'entry-42',
      label: 'OTP',
      secret: 'JBSWY3DPEHPK3PXP',
      encoding: 'base32',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    })
  })

  it('accepts passmanager:otp:setSecret without label and sends label=null', async () => {
    const rpcDispatch = vi.fn(async () => ({ok: true, result: null}))

    const out = await dispatchTauriCatalogCommand({
      command: 'passmanager:otp:setSecret',
      data: {
        entry_id: 'entry-43',
        secret: 'JBSWY3DPEHPK3PXP',
      },
      logger,
      rpc: vi.fn(async () => ({}) as never),
      rpcDispatch,
      rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
    })

    expect(out).toEqual({ok: true, result: {ok: true, result: null}})
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:otp:setSecret', {
      otp_id: null,
      entry_id: 'entry-43',
      label: null,
      secret: 'JBSWY3DPEHPK3PXP',
      encoding: null,
      algorithm: null,
      digits: null,
      period: null,
    })
  })

  it('rejects passmanager:otp:setSecret when otp_id and entry_id are both missing', async () => {
    await expect(
      dispatchTauriCatalogCommand({
        command: 'passmanager:otp:setSecret',
        data: {secret: 'abc'},
        logger,
        rpc: vi.fn(async () => ({}) as never),
        rpcDispatch: vi.fn(async () => ({ok: true, result: null})),
        rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
      }),
    ).rejects.toThrow('otp_id or entry_id is required')
  })

  it('rejects passmanager:otp:setSecret when secret is missing', async () => {
    await expect(
      dispatchTauriCatalogCommand({
        command: 'passmanager:otp:setSecret',
        data: {entry_id: 'entry-42'},
        logger,
        rpc: vi.fn(async () => ({}) as never),
        rpcDispatch: vi.fn(async () => ({ok: true, result: null})),
        rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
      }),
    ).rejects.toThrow('non-empty secret is required')
  })

  it('rejects passmanager:otp:setSecret when secret is empty after trim', async () => {
    await expect(
      dispatchTauriCatalogCommand({
        command: 'passmanager:otp:setSecret',
        data: {entry_id: 'entry-42', secret: '   '},
        logger,
        rpc: vi.fn(async () => ({}) as never),
        rpcDispatch: vi.fn(async () => ({ok: true, result: null})),
        rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
      }),
    ).rejects.toThrow('non-empty secret is required')
  })
})
