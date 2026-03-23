import {describe, expect, it, vi} from 'vitest'

import {CatalogPasswordsRepository, CatalogTransport} from '../../src/core/state/passmanager'

describe('CatalogPasswordsRepository secret reads', () => {
  it('reads password via domain passmanager:secret:read command', async () => {
    const entryId = '998b5ecb-55c1-4fd9-a9bb-39efb8d0785a'

    const transport = {
      sendCatalog: vi.fn().mockImplementation(async (cmd: string, payload: Record<string, unknown>) => {
        if (cmd === 'passmanager:secret:read') {
          if (payload['entry_id'] === entryId && payload['secret_type'] === 'password') {
            return {ok: true, result: {value: 'super-secret'}}
          }
          return {ok: false, error: 'secret_not_found'}
        }
        return {ok: false, error: `Unsupported command: ${cmd}`}
      }),
      passmanager: {},
    }

    const catalog = {
      api: {
        list: vi.fn(),
        createDir: vi.fn(),
        upload: vi.fn(),
        prepareUpload: vi.fn(),
        download: vi.fn(),
        move: vi.fn(),
        rename: vi.fn(),
        delete: vi.fn(),
      },
      transport,
      catalog: {
        getChildren: vi.fn().mockReturnValue([]),
        getNode: vi.fn().mockReturnValue(undefined),
      },
      refresh: vi.fn().mockResolvedValue(undefined),
      queueRefresh: vi.fn(),
      lastError: {set: vi.fn()},
    }

    const catalogTransport = new CatalogTransport(catalog as any)
    const repo = new CatalogPasswordsRepository(catalog as any, catalogTransport)

    const out = await repo.readEntryPassword(entryId)

    expect(out).toBe('super-secret')
    expect(transport.sendCatalog).toHaveBeenCalledWith(
      'passmanager:secret:read',
      expect.objectContaining({entry_id: entryId, secret_type: 'password'}),
    )
  })

  it('reads note via domain passmanager:secret:read command', async () => {
    const entryId = 'note-entry-id'

    const transport = {
      sendCatalog: vi.fn().mockImplementation(async (cmd: string, payload: Record<string, unknown>) => {
        if (cmd === 'passmanager:secret:read') {
          if (payload['entry_id'] === entryId && payload['secret_type'] === 'note') {
            return {ok: true, result: {value: 'secret-note-content'}}
          }
          return {ok: false, error: 'secret_not_found'}
        }
        return {ok: false, error: `Unsupported command: ${cmd}`}
      }),
      passmanager: {},
    }

    const catalog = {
      api: {
        list: vi.fn(),
        createDir: vi.fn(),
        upload: vi.fn(),
        prepareUpload: vi.fn(),
        download: vi.fn(),
        move: vi.fn(),
        rename: vi.fn(),
        delete: vi.fn(),
      },
      transport,
      catalog: {
        getChildren: vi.fn().mockReturnValue([]),
        getNode: vi.fn().mockReturnValue(undefined),
      },
      refresh: vi.fn().mockResolvedValue(undefined),
      queueRefresh: vi.fn(),
      lastError: {set: vi.fn()},
    }

    const catalogTransport = new CatalogTransport(catalog as any)
    const repo = new CatalogPasswordsRepository(catalog as any, catalogTransport)

    const out = await repo.readEntryNote(entryId)

    expect(out).toBe('secret-note-content')
    expect(transport.sendCatalog).toHaveBeenCalledWith(
      'passmanager:secret:read',
      expect.objectContaining({entry_id: entryId, secret_type: 'note'}),
    )
  })

  it('returns undefined when secret not found', async () => {
    const entryId = 'missing-entry-id'

    const transport = {
      sendCatalog: vi.fn().mockImplementation(async () => {
        return {ok: false, error: 'secret_not_found'}
      }),
      passmanager: {},
    }

    const catalog = {
      api: {
        list: vi.fn(),
        createDir: vi.fn(),
        upload: vi.fn(),
        prepareUpload: vi.fn(),
        download: vi.fn(),
        move: vi.fn(),
        rename: vi.fn(),
        delete: vi.fn(),
      },
      transport,
      catalog: {
        getChildren: vi.fn().mockReturnValue([]),
        getNode: vi.fn().mockReturnValue(undefined),
      },
      refresh: vi.fn().mockResolvedValue(undefined),
      queueRefresh: vi.fn(),
      lastError: {set: vi.fn()},
    }

    const catalogTransport = new CatalogTransport(catalog as any)
    const repo = new CatalogPasswordsRepository(catalog as any, catalogTransport)

    const out = await repo.readEntryPassword(entryId)

    expect(out).toBeUndefined()
  })
})
