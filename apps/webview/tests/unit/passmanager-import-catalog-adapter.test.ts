import {describe, expect, it, vi} from 'vitest'

import {ImportOrchestrator} from '@chromvoid/password-import'
import type {ImportedEntry} from '@chromvoid/password-import'

import type {CatalogService} from '../../src/core/catalog/catalog'
import {
  buildExistingEntriesByOriginalId,
  createCatalogOperationsAdapter,
} from '../../src/features/passmanager/service/catalog-import-adapter'

function makeEntries(): ImportedEntry[] {
  return [
    {
      id: 'entry-1',
      type: 'login',
      name: 'Mail account',
      username: 'mail@example.com',
      password: 'secret-1',
      folder: 'Чеки',
      urls: [{value: 'https://mail.example.com', match: 'base_domain'}],
    },
    {
      id: 'entry-2',
      type: 'login',
      name: 'Crypto exchange',
      username: 'crypto@example.com',
      password: 'secret-2',
      folder: 'Почта',
      urls: [{value: 'https://exchange.example.com', match: 'base_domain'}],
    },
  ]
}

describe('passmanager import adapter regression', () => {
  it('imports root-level folders without generic catalog:createDir on /.passmanager', async () => {
    const sendCatalog = vi.fn(async (command: string, data: Record<string, unknown>) => {
      switch (command) {
        case 'passmanager:entry:list':
          return {ok: true, result: {entries: [], folders: []}}
        case 'passmanager:group:ensure':
          return {ok: true, result: undefined}
        case 'passmanager:entry:save':
          return {
            ok: true,
            result: {entry_id: typeof data['entry_id'] === 'string' ? data['entry_id'] : crypto.randomUUID()},
          }
        case 'passmanager:secret:save':
        case 'passmanager:otp:setSecret':
        case 'passmanager:secret:delete':
        case 'passmanager:entry:delete':
          return {ok: true, result: undefined}
        default:
          return {ok: true, result: undefined}
      }
    })

    const createDir = vi.fn(async () => {
      throw new Error('ACCESS_DENIED')
    })

    const catalogStub = {
      api: {
        createDir,
        prepareUpload: vi.fn(async () => ({nodeId: 1})),
        upload: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      transport: {sendCatalog},
      secrets: {
        setOTP: vi.fn(async () => undefined),
      },
      catalog: {
        getPath: vi.fn(() => '/'),
        findByPath: vi.fn(() => undefined),
      },
      ensureEntryMeta: vi.fn(async () => undefined),
      getEntryMeta: vi.fn(() => undefined),
    }

    const adapter = createCatalogOperationsAdapter(catalogStub as unknown as CatalogService)
    const orchestrator = new ImportOrchestrator()

    const result = await orchestrator.execute(adapter, makeEntries())

    expect(result.success).toBe(true)
    expect(result.progress.errors).toBe(0)
    expect(createDir).not.toHaveBeenCalled()
    expect(sendCatalog).toHaveBeenCalledWith('passmanager:group:ensure', {path: 'Чеки'})
    expect(sendCatalog).toHaveBeenCalledWith('passmanager:group:ensure', {path: 'Почта'})
  })

  it('uploads icon and sets group metadata via passmanager domain commands', async () => {
    const iconRef = `sha256:${'b'.repeat(64)}`
    const sendCatalog = vi.fn(async (command: string) => {
      if (command === 'passmanager:icon:put') {
        return {ok: true, result: {icon_ref: iconRef}}
      }
      return {ok: true, result: undefined}
    })

    const catalogStub = {
      api: {
        createDir: vi.fn(async () => ({nodeId: 1})),
        prepareUpload: vi.fn(async () => ({nodeId: 1})),
        upload: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      transport: {sendCatalog},
      secrets: {
        setOTP: vi.fn(async () => undefined),
      },
      catalog: {
        getPath: vi.fn(() => '/'),
        findByPath: vi.fn(() => undefined),
      },
      ensureEntryMeta: vi.fn(async () => undefined),
      getEntryMeta: vi.fn(() => undefined),
    }

    const adapter = createCatalogOperationsAdapter(catalogStub as unknown as CatalogService)

    const uploaded = await adapter.putIcon('aGVsbG8=', 'image/png')
    expect(uploaded.iconRef).toBe(iconRef)

    await adapter.setGroupIcon('Work/Finance', iconRef)

    expect(sendCatalog).toHaveBeenCalledWith('passmanager:icon:put', {
      content_base64: 'aGVsbG8=',
      mime_type: 'image/png',
    })
    expect(sendCatalog).toHaveBeenCalledWith('passmanager:group:ensure', {path: 'Work/Finance'})
    expect(sendCatalog).toHaveBeenCalledWith('passmanager:group:setMeta', {
      path: 'Work/Finance',
      icon_ref: iconRef,
    })
  })

  it('passes import_source when saving imported entry metadata', async () => {
    const sendCatalog = vi.fn(async (command: string, data: Record<string, unknown>) => {
      if (command === 'passmanager:entry:save') {
        return {
          ok: true,
          result: {entry_id: String(data['entry_id'] ?? '')},
        }
      }
      return {ok: true, result: undefined}
    })

    const adapter = createCatalogOperationsAdapter({
      transport: {sendCatalog},
      catalog: {
        getPath: vi.fn(() => '/'),
        findByPath: vi.fn(() => undefined),
      },
      ensureEntryMeta: vi.fn(async () => undefined),
      getEntryMeta: vi.fn(() => undefined),
    } as unknown as CatalogService)

    const meta = {
      id: 'keepass-entry-1',
      title: 'Entry 1',
      username: 'alice',
      urls: [],
      otps: [],
      import_source: {
        type: 'keepass',
        original_id: 'keepass-entry-1',
      },
    }
    const bytes = new TextEncoder().encode(JSON.stringify(meta))
    const prep = await adapter.prepareUpload(
      '/GroupA/Entry 1',
      'meta.json',
      bytes.byteLength,
      16000,
      'application/json',
    )
    await adapter.upload(prep.nodeId, bytes.byteLength, bytes)

    expect(sendCatalog).toHaveBeenCalledWith(
      'passmanager:entry:save',
      expect.objectContaining({
        entry_id: 'keepass-entry-1',
        title: 'Entry 1',
        group_path: 'GroupA',
        import_source: {
          type: 'keepass',
          original_id: 'keepass-entry-1',
        },
      }),
    )
  })

  it('maps existing entries by entry id when import_source is missing in meta.json', async () => {
    const catalogStub = {
      catalog: {
        findByPath: vi.fn((path: string) =>
          path === '/.passmanager' ? {nodeId: 1, isDir: true} : undefined,
        ),
        getChildren: vi.fn((path: string) => {
          if (path === '/.passmanager') {
            return [{nodeId: 101, isDir: true, path: '/.passmanager/Entry 1'}]
          }
          if (path === '/.passmanager/Entry 1') {
            return [
              {nodeId: 201, isDir: false, isFile: true, name: 'meta.json'},
              {nodeId: 202, isDir: false, isFile: true, name: '.password'},
            ]
          }
          return []
        }),
      },
      ensureEntryMeta: vi.fn(async () => undefined),
      getEntryMeta: vi.fn((nodeId: number) => {
        if (nodeId !== 101) return undefined
        return {
          id: 'entry-101',
          import_source: {
            original_id: 'keepass-entry-1',
          },
          title: 'Entry 1',
        }
      }),
    }

    const map = await buildExistingEntriesByOriginalId(catalogStub as unknown as CatalogService)
    const existingById = map.get('entry-101')
    const existingByOriginal = map.get('keepass-entry-1')

    expect(existingById).toEqual({
      nodeId: 101,
      path: '/Entry 1',
      childNodeIds: [201, 202],
      entryId: 'entry-101',
    })
    expect(existingByOriginal).toEqual(existingById)
  })

  it('builds existing map from passmanager:entry:list when .passmanager shard is hidden in catalog mirror', async () => {
    const sendCatalog = vi.fn(async (command: string) => {
      if (command === 'passmanager:entry:list') {
        return {
          ok: true,
          result: {
            entries: [
              {
                id: 'entry-201',
                title: 'Entry 201',
                groupPath: '/GroupA',
                import_source: {
                  original_id: 'keepass-entry-201',
                },
              },
            ],
          },
        }
      }
      return {ok: true, result: undefined}
    })

    const catalogStub = {
      transport: {sendCatalog},
      catalog: {
        findByPath: vi.fn(() => undefined),
      },
    }

    const map = await buildExistingEntriesByOriginalId(catalogStub as unknown as CatalogService)
    const byOriginalId = map.get('keepass-entry-201')
    const byEntryId = map.get('entry-201')

    expect(sendCatalog).toHaveBeenCalledWith('passmanager:entry:list', {})
    expect(byOriginalId).toEqual({
      nodeId: 2200000000,
      path: '/GroupA/Entry 201',
      childNodeIds: [],
      entryId: 'entry-201',
    })
    expect(byEntryId).toEqual(byOriginalId)
  })
})
