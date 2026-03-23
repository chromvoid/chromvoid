import {describe, expect, it, vi} from 'vitest'

import {CatalogPasswordsRepository, CatalogTransport} from '../../src/core/state/passmanager'

describe('CatalogPasswordsRepository title rename', () => {
  it('updates existing entry meta by entryId without creating duplicate directory', async () => {
    const entryId = 'entry-1'

    const sendCatalog = vi.fn().mockImplementation(async (cmd: string, _payload: Record<string, unknown>) => {
      if (cmd === 'passmanager:entry:save') {
        return {ok: true, result: {entry_id: entryId}}
      }
      return {ok: false, error: `Unexpected command: ${cmd}`}
    })

    const transport = {
      sendCatalog,
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

    const result = await repo.saveEntryMeta({
      id: entryId,
      title: 'New Title',
      urls: [],
      username: '',
      otps: [],
      groupPath: undefined,
    })

    expect(result).toBe(true)


    const saveCalls = sendCatalog.mock.calls.filter((c: unknown[]) => c[0] === 'passmanager:entry:save')
    expect(saveCalls.length).toBe(1)
    expect(saveCalls[0]![1]).toEqual(
      expect.objectContaining({
        entry_id: entryId,
        title: 'New Title',
      }),
    )


    const createDirCalls = sendCatalog.mock.calls.filter((c: unknown[]) => c[0] === 'passmanager:group:ensure')
    expect(createDirCalls.length).toBe(0)


    const renameCalls = sendCatalog.mock.calls.filter((c: unknown[]) => c[0] === 'passmanager:entry:rename')
    expect(renameCalls.length).toBe(0)
  })

  it('renameEntryTitle uses domain passmanager:entry:rename command', async () => {
    const entryId = 'entry-2'

    const sendCatalog = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd === 'passmanager:entry:rename') {
        return {ok: true, result: undefined}
      }
      return {ok: false, error: `Unexpected command: ${cmd}`}
    })

    const transport = {
      sendCatalog,
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

    const result = await repo.renameEntryTitle(entryId, 'Renamed Title')

    expect(result).toBe(true)
    expect(sendCatalog).toHaveBeenCalledWith(
      'passmanager:entry:rename',
      expect.objectContaining({entry_id: entryId, new_title: 'Renamed Title'}),
    )
  })
})
