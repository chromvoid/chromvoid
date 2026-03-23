import {describe, expect, it, vi} from 'vitest'

import {dispatchTauriCatalogCommand} from '../../src/core/transport/tauri/tauri-catalog-command-dispatcher'

const logger = {
  level: 'info' as const,
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

describe('tauri catalog command dispatcher passmanager icons payloads', () => {
  const iconRef = `sha256:${'a'.repeat(64)}`

  it('passes through passmanager:icon:put payload to rpcDispatch', async () => {
    const rpcDispatch = vi.fn(async () => ({ok: true, result: {icon_ref: iconRef}}))

    const out = await dispatchTauriCatalogCommand({
      command: 'passmanager:icon:put',
      data: {content_base64: 'abcd', mime_type: 'image/png'},
      logger,
      rpc: vi.fn(async () => ({}) as never),
      rpcDispatch,
      rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
    })

    expect(out).toEqual({ok: true, result: {ok: true, result: {icon_ref: iconRef}}})
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:icon:put', {
      content_base64: 'abcd',
      mime_type: 'image/png',
    })
  })

  it('passes through passmanager:group:setMeta payload to rpcDispatch', async () => {
    const rpcDispatch = vi.fn(async () => ({ok: true, result: null}))

    const out = await dispatchTauriCatalogCommand({
      command: 'passmanager:group:setMeta',
      data: {path: '/Work', icon_ref: iconRef},
      logger,
      rpc: vi.fn(async () => ({}) as never),
      rpcDispatch,
      rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
    })

    expect(out).toEqual({ok: true, result: {ok: true, result: null}})
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:group:setMeta', {
      path: '/Work',
      icon_ref: iconRef,
    })
  })

  it('passes through passmanager:icon:list payload to rpcDispatch', async () => {
    const rpcDispatch = vi.fn(async () => ({ok: true, result: {icons: []}}))

    const out = await dispatchTauriCatalogCommand({
      command: 'passmanager:icon:list',
      data: {},
      logger,
      rpc: vi.fn(async () => ({}) as never),
      rpcDispatch,
      rpcDispatchRaw: vi.fn(async () => ({ok: true, result: null})),
    })

    expect(out).toEqual({ok: true, result: {ok: true, result: {icons: []}}})
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:icon:list', {})
  })
})
