import {describe, expect, it, vi} from 'vitest'
import {atom} from '@reatom/core'

import {CatalogService} from '../../src/core/catalog/catalog'
import type {TransportLike} from '../../src/core/transport/transport'

function createTransport(sendCatalog: TransportLike['sendCatalog']): TransportLike {
  return {
    kind: 'tauri',
    connected: atom(true),
    connecting: atom(false),
    lastError: atom<string | undefined>(undefined),
    connect() {},
    disconnect() {},
    on() {},
    off() {},
    sendCatalog,
    sendPassmanager: async () => undefined,
    uploadFile: async () => undefined,
    downloadFile: async function* () {},
    readSecret: async function* () {},
    writeSecret: async () => undefined,
    eraseSecret: async () => undefined,
    generateOTP: async () => '',
    setOTPSecret: async () => undefined,
    removeOTPSecret: async () => undefined,
  }
}

function page(name: string) {
  return {
    current_path: '/docs',
    version: 1,
    total_count: 1,
    offset: 0,
    limit: 1,
    next_offset: null,
    reload_required: false,
    items: [
      {
        node_id: 10,
        name,
        is_dir: false,
        size: 12,
        mime_type: 'text/plain',
        media_info: null,
        media_inspected_revision: 0,
        created_at: 1,
        updated_at: 2,
      },
    ],
  }
}

describe('CatalogService folder page loading', () => {
  it('deduplicates identical visible range requests into one batch', async () => {
    const sendCatalog = vi.fn(async (command: string, data: Record<string, unknown>) => {
      if (command === 'catalog:folder:batch') {
        expect((data.pages as unknown[])).toHaveLength(1)
        return {ok: true, result: {pages: [page('a.txt')], truncated: false, warnings: []}}
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    const service = new CatalogService(createTransport(sendCatalog))
    const request = {path: '/docs', offset: 0, limit: 1}

    await Promise.all([
      service.ensureFolderRangeLoaded(request),
      service.ensureFolderRangeLoaded(request),
    ])

    expect(sendCatalog).toHaveBeenCalledTimes(1)
    expect(service.catalog.getFolderItems('/docs')[0]?.name).toBe('a.txt')
  })

  it('does not apply a late folder batch after cancellation', async () => {
    let resolveBatch!: (value: unknown) => void
    const batch = new Promise((resolve) => {
      resolveBatch = resolve
    })
    const sendCatalog = vi.fn(async (command: string) => {
      if (command === 'catalog:folder:batch') return batch
      throw new Error(`Unexpected command: ${command}`)
    })
    const service = new CatalogService(createTransport(sendCatalog))
    const promise = service.ensureFolderRangeLoaded({path: '/docs', offset: 0, limit: 1})
    await Promise.resolve()

    service.cancelSync('vault-lock')
    resolveBatch({ok: true, result: {pages: [page('late.txt')], truncated: false, warnings: []}})
    await promise

    expect(service.catalog.getFolderItems('/docs')).toEqual([])
  })
})

