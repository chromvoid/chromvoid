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
        type: 'TOTP',
        counter: 0,
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
      type: 'TOTP',
      counter: 0,
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
      type: null,
      counter: null,
    })
  })

  it('accepts passmanager:otp:generate with HOTP counter', async () => {
    const rpcDispatch = vi.fn(async () => ({otp: '287082'}))

    const out = await dispatchTauriCatalogCommand({
      command: 'passmanager:otp:generate',
      data: {
        otp_id: 'otp-42',
        type: 'HOTP',
        counter: 1,
      },
      logger,
      rpc: vi.fn(async () => ({}) as never),
      rpcDispatch,
      rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
    })

    expect(out).toEqual({ok: true, result: {otp: '287082'}})
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:otp:generate', {
      otp_id: 'otp-42',
      entry_id: null,
      ha: null,
      period: null,
      digits: null,
      ts: null,
      type: 'HOTP',
      counter: 1,
    })
  })

  it('accepts passmanager:otp:preview with required settings', async () => {
    const rpcDispatch = vi.fn(async () => ({otp: '94287082', period: 30, left_seconds: 1}))

    const out = await dispatchTauriCatalogCommand({
      command: 'passmanager:otp:preview',
      data: {
        secret: '12345678901234567890',
        encoding: 'utf-8',
        algorithm: 'SHA1',
        digits: 8,
        period: 30,
        type: 'TOTP',
        ts: 59,
      },
      logger,
      rpc: vi.fn(async () => ({}) as never),
      rpcDispatch,
      rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
    })

    expect(out).toEqual({ok: true, result: {otp: '94287082', period: 30, left_seconds: 1}})
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:otp:preview', {
      secret: '12345678901234567890',
      encoding: 'utf-8',
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
      type: 'TOTP',
      counter: null,
      ts: 59,
    })
  })

  it('rejects passmanager:otp:preview when secret or settings are missing', async () => {
    await expect(
      dispatchTauriCatalogCommand({
        command: 'passmanager:otp:preview',
        data: {
          secret: ' ',
          encoding: 'base32',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          type: 'TOTP',
        },
        logger,
        rpc: vi.fn(async () => ({}) as never),
        rpcDispatch: vi.fn(async () => ({ok: true, result: null})),
        rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
      }),
    ).rejects.toThrow('non-empty secret is required')

    await expect(
      dispatchTauriCatalogCommand({
        command: 'passmanager:otp:preview',
        data: {
          secret: 'abc',
          encoding: 'base32',
          algorithm: 'SHA1',
          period: 30,
          type: 'TOTP',
        },
        logger,
        rpc: vi.fn(async () => ({}) as never),
        rpcDispatch: vi.fn(async () => ({ok: true, result: null})),
        rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
      }),
    ).rejects.toThrow('digits is required')
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

  it('accepts passmanager:otp:renameSecret with otp_id and label migration keys', async () => {
    const rpcDispatch = vi.fn(async () => ({ok: true, result: null}))

    const out = await dispatchTauriCatalogCommand({
      command: 'passmanager:otp:renameSecret',
      data: {
        otp_id: 'otp-42',
        previous_label: ' Primary ',
        next_label: ' Backup ',
      },
      logger,
      rpc: vi.fn(async () => ({}) as never),
      rpcDispatch,
      rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
    })

    expect(out).toEqual({ok: true, result: {ok: true, result: null}})
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:otp:renameSecret', {
      otp_id: 'otp-42',
      entry_id: null,
      previous_label: 'Primary',
      next_label: 'Backup',
    })
  })

  it('rejects passmanager:otp:renameSecret when otp_id and entry_id are both missing', async () => {
    await expect(
      dispatchTauriCatalogCommand({
        command: 'passmanager:otp:renameSecret',
        data: {
          previous_label: 'Primary',
          next_label: 'Backup',
        },
        logger,
        rpc: vi.fn(async () => ({}) as never),
        rpcDispatch: vi.fn(async () => ({ok: true, result: null})),
        rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
      }),
    ).rejects.toThrow('otp_id or entry_id is required')
  })

  it('rejects passmanager:otp:renameSecret when labels are empty', async () => {
    await expect(
      dispatchTauriCatalogCommand({
        command: 'passmanager:otp:renameSecret',
        data: {
          otp_id: 'otp-42',
          previous_label: '',
          next_label: 'Backup',
        },
        logger,
        rpc: vi.fn(async () => ({}) as never),
        rpcDispatch: vi.fn(async () => ({ok: true, result: null})),
        rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
      }),
    ).rejects.toThrow('previous_label is required')

    await expect(
      dispatchTauriCatalogCommand({
        command: 'passmanager:otp:renameSecret',
        data: {
          otp_id: 'otp-42',
          previous_label: 'Primary',
          next_label: ' ',
        },
        logger,
        rpc: vi.fn(async () => ({}) as never),
        rpcDispatch: vi.fn(async () => ({ok: true, result: null})),
        rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
      }),
    ).rejects.toThrow('next_label is required')
  })
})
