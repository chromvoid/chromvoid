import {expect, it, vi} from 'vitest'
import {dispatchTauriCatalogCommand} from '../../src/core/transport/tauri/tauri-catalog-command-dispatcher'
import {defaultLogger} from '../../src/core/logger'

it('forwards image preparation through Core RPC without rewriting the destination', async () => {
  const data = {folder_path: '/Notes/Photos 100%', file_name: 'Trip.png', mime_type: 'image/png'}
  const prepared = {
    parent_path: '/Notes/Photos 100%',
    name: 'core-image.png',
    mime_type: 'image/png',
    path: '/Notes/Photos 100%/core-image.png',
    markdown: '![Trip](</Notes/Photos%20100%25/core-image.png>)',
  }
  const rpcDispatch = vi.fn(async () => prepared)
  const result = await dispatchTauriCatalogCommand({
    command: 'catalog:attachment:prepare',
    data,
    logger: defaultLogger,
    rpcDispatch,
    rpc: async () => {
      throw new Error('Unexpected alternate RPC')
    },
    rpcDispatchRaw: async () => {
      throw new Error('Unexpected raw RPC')
    },
  })
  expect(rpcDispatch).toHaveBeenCalledExactlyOnceWith('catalog:attachment:prepare', data)
  expect(result).toEqual({ok: true, result: prepared})
})
